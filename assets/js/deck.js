/* ==========================================================
   deck.js —— 整屏翻页引擎（自己实现，不依赖 fullPage.js）
   · 滚轮 / 键盘 / 触摸 / 圆点 / 锚点 五种方式
   · 位移用 translate3d + cubic-bezier
   · 一次手势只翻一屏：滚轮手势内的所有事件（含触控板惯性）
     只在第一下生效，剩下的全部吞掉，避免连翻
   · 锁定由 transitionend 驱动，动画没走完绝不接受新输入
   · 页脚是自适应高度，所以按每屏 offsetTop 计算位移，不假设 100vh
   ========================================================== */
(function () {
  var deck = document.getElementById('deck');
  if (!deck) return;

  var secs = Array.prototype.slice.call(deck.querySelectorAll('.sec'));
  var dots = Array.prototype.slice.call(document.querySelectorAll('.dot-nav button'));

  var SWIPE = 36;             // 滚轮累计到这个量才算一次有效手势
  var GESTURE_IDLE = 160;     // 这么久没有新的滚轮事件 = 这次手势结束了
  var SETTLE = 80;            // 动画结束后再静默一小会儿才收新输入

  var idx = 0;
  var animating = false;
  var animTimer = null;
  var pendingRelayout = false;
  var listeners = [];
  var peekIdx = -1;           // 上一次拉出提示条的那一屏
  var peekTimer = null;

  /* ---------- 尺寸 ---------- */
  function vh() {
    return window.innerHeight || document.documentElement.clientHeight;
  }

  function offsetOf(i) {
    var max = Math.max(0, deck.offsetHeight - vh());
    /* 末屏是自适应高度的页脚，比一屏矮：贴底而不是贴顶，
       否则下面会空出一大片底纹 */
    if (i === secs.length - 1) return Math.round(max);
    return Math.round(Math.min(secs[i].offsetTop, max));
  }

  /* 动画时长从 CSS 直接读，避免两边写死的数值以后走偏 */
  function durMs() {
    var d = parseFloat(window.getComputedStyle(deck).transitionDuration);
    return (isNaN(d) ? 0.95 : d) * 1000;
  }

  /* ---------- 渲染 ---------- */
  function render() {
    deck.style.transform = 'translate3d(0,' + (-offsetOf(idx)) + 'px,0)';

    var body = document.body;
    for (var i = 0; i < secs.length; i++) body.classList.remove('is-viewing-' + i);
    body.classList.add('is-viewing-' + idx);
    body.classList.toggle('past-first', idx > 0);

    dots.forEach(function (b, i) { b.classList.toggle('is-active', i === idx); });

    /* 翻到新的一屏时，把该屏的页码条从圆点后面抽出来停一秒再收回去。
       relayout 会重复调 render，靠 peekIdx 记住上一次，不会反复抽 */
    if (idx !== peekIdx) {
      peekIdx = idx;
      var tip = dots[idx];
      if (tip) {
        tip.classList.add('is-peek');
        window.clearTimeout(peekTimer);
        peekTimer = window.setTimeout(function () {
          tip.classList.remove('is-peek');
        }, 1000);
      }
    }

    if (location.hash !== '#' + secs[idx].dataset.anchor) {
      try { history.replaceState(null, '', '#' + secs[idx].dataset.anchor); } catch (e) {}
    }

    /* 浏览器写 hash 时可能顺手把 body 滚一下，跟 deck 位移叠加就错位了 */
    if (document.body.scrollTop) document.body.scrollTop = 0;

    /* 入场动效放到下一帧，别跟 transform 抢同一帧 */
    if (!rafPending) {
      rafPending = true;
      window.requestAnimationFrame(function () {
        rafPending = false;
        var at = idx;
        listeners.forEach(function (fn) { try { fn(at); } catch (e) {} });
      });
    }
  }
  var rafPending = false;

  /* ---------- 锁 ---------- */
  function lock() {
    animating = true;
    window.clearTimeout(animTimer);
    /* 兜底：万一 transitionend 没来（位移相同、页面被切到后台等），也要解锁 */
    animTimer = window.setTimeout(unlock, durMs() + SETTLE + 260);
  }

  function unlock() {
    if (!animating) return;
    animating = false;
    window.clearTimeout(animTimer);
    if (pendingRelayout) { pendingRelayout = false; relayout(true); }
  }

  deck.addEventListener('transitionend', function (e) {
    if (e.target !== deck || e.propertyName !== 'transform') return;
    window.clearTimeout(animTimer);
    /* 等动画彻底停稳再收输入，否则尾巴上还会吃进一次滚动 */
    animTimer = window.setTimeout(unlock, SETTLE);
  });

  /* ---------- 页码提示条 ---------- */
  /* 圆点是 fixed 的，滚轮翻页时鼠标往往一动不动停在上头，
     :hover 就会一路挂到新的一屏——「都翻走了，那一屏的名字还吊在这儿」。
     所以每次翻页先给导航加 is-quiet 把提示条和放大态压回去，
     等指针真的挪动超过 8px 再把悬停响应放回来。 */
  var dotNav = document.querySelector('.dot-nav');
  var ptr = null;              // 最近一次指针位置
  var hushAt = null;           // 压住悬停时指针所在的位置

  function hushTips() {
    if (!dotNav) return;
    hushAt = ptr;
    dotNav.classList.add('is-quiet');
  }

  window.addEventListener('pointermove', function (e) {
    ptr = { x: e.clientX, y: e.clientY };
    if (!dotNav || !dotNav.classList.contains('is-quiet')) return;
    if (!hushAt ||
        Math.abs(e.clientX - hushAt.x) > 8 ||
        Math.abs(e.clientY - hushAt.y) > 8) {
      dotNav.classList.remove('is-quiet');
    }
  }, { passive: true });

  /* ---------- 翻页 ---------- */
  function go(i, instant) {
    i = Math.max(0, Math.min(secs.length - 1, i));
    if (i === idx) return false;
    if (animating && !instant) return false;      // 动画没走完，一律不收

    hushTips();

    /* 记一下方向：第 2 屏的六色条靠它决定谁往上、谁往下 */
    document.body.dataset.dir = i > idx ? 'down' : 'up';

    idx = i;

    if (instant) {
      deck.style.transition = 'none';
      render();
      void deck.offsetHeight;
      deck.style.transition = '';
      return true;
    }

    lock();
    try {
      render();
    } catch (err) {
      unlock();                                   // render 出错也不能把页面锁死
      throw err;
    }
    return true;
  }

  /* ---------- 滚轮：一次手势只翻一屏 ---------- */
  var acc = 0;
  var gestureUsed = false;      // 本次手势已经翻过页了
  var idleTimer = null;

  function endGestureSoon() {
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(function () {
      acc = 0;
      gestureUsed = false;
    }, GESTURE_IDLE);
  }

  window.addEventListener('wheel', function (e) {
    if (window.innerWidth <= 900) return;         // 窄屏走原生滚动
    /* 影讯详情开着时，滚轮归纸内正文，不要抢：连 preventDefault 都不能做 */
    if (document.body.classList.contains('nw-lock')) return;
    e.preventDefault();

    /* 只要还有事件进来，就说明这次手势没结束 */
    endGestureSoon();

    if (gestureUsed) return;                      // 本次手势已用过，惯性全部吞掉
    if (animating) { gestureUsed = true; return; }

    acc += e.deltaY;
    if (Math.abs(acc) < SWIPE) return;            // 触控板细碎滚动先攒着

    var dir = acc > 0 ? 1 : -1;
    acc = 0;
    gestureUsed = true;                           // 关键：这一手势到此为止
    go(idx + dir);
  }, { passive: false });

  /* ---------- 键盘 ---------- */
  window.addEventListener('keydown', function (e) {
    if (window.innerWidth <= 900) return;
    if (document.body.classList.contains('nw-lock')) return;   // 详情层开着，方向键留给正文
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    var k = e.key;
    var to = null;
    if (k === 'ArrowDown' || k === 'PageDown' || k === ' ') to = idx + 1;
    else if (k === 'ArrowUp' || k === 'PageUp') to = idx - 1;
    else if (k === 'Home') to = 0;
    else if (k === 'End') to = secs.length - 1;
    if (to === null) return;
    e.preventDefault();
    go(to);
  });

  /* ---------- 触摸 ---------- */
  var touchY = 0, touchX = 0, touching = false;

  window.addEventListener('touchstart', function (e) {
    if (window.innerWidth <= 900) return;
    if (document.body.classList.contains('nw-lock')) return;
    touching = true;
    touchY = e.touches[0].clientY;
    touchX = e.touches[0].clientX;
  }, { passive: true });

  window.addEventListener('touchmove', function (e) {
    if (window.innerWidth <= 900) return;
    if (document.body.classList.contains('nw-lock')) return;
    /* 整屏翻页时不要跟原生滚动抢，竖向手势直接接管 */
    if (Math.abs(e.touches[0].clientY - touchY) > 10) e.preventDefault();
  }, { passive: false });

  window.addEventListener('touchend', function (e) {
    if (window.innerWidth <= 900 || !touching) return;
    if (document.body.classList.contains('nw-lock')) return;
    touching = false;
    var dy = touchY - e.changedTouches[0].clientY;
    var dx = touchX - e.changedTouches[0].clientX;
    if (Math.abs(dy) < 48) return;                // 太短不算，避免误触
    if (Math.abs(dx) > Math.abs(dy)) return;      // 斜着划走的忽略
    go(idx + (dy > 0 ? 1 : -1));
  }, { passive: true });

  /* ---------- 圆点 / 锚点 ---------- */
  dots.forEach(function (b) {
    b.addEventListener('click', function () { go(parseInt(b.dataset.go, 10)); });
  });
  document.querySelectorAll('a[href^="#page"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      var name = a.getAttribute('href').slice(1);
      var i = secs.findIndex(function (s) { return s.dataset.anchor === name; });
      if (i >= 0) go(i);
    });
  });
  window.addEventListener('hashchange', function () {
    var i = secs.findIndex(function (s) { return s.dataset.anchor === location.hash.slice(1); });
    if (i >= 0 && i !== idx) go(i);
  });

  /* ---------- 尺寸变化 ---------- */
  /* 只在尺寸真的变了才重算；动画过程中先记下来，等走完再校，
     免得把正在跑的 transition 掐断、停在半路。 */
  var lastW = 0, lastH = 0;

  function relayout(force) {
    var w = window.innerWidth, h = vh();
    if (!force && Math.abs(w - lastW) < 2 && Math.abs(h - lastH) < 2) return;
    lastW = w; lastH = h;

    if (animating && !force) { pendingRelayout = true; return; }

    deck.style.transition = 'none';
    render();
    void deck.offsetHeight;
    deck.style.transition = '';
  }

  /* 窄屏退化成原生滚动，不会走 go()，得靠滚动位置自己判断是否已过首屏，
     导航（以及右侧抽屉）才知道该不该出现。
     宽屏反过来：整屏模式下页面本身不该有滚动量。浏览器有时会照 hash 或
     滚动锚点自己滚一下（带 #page9 打开、页脚从占位变高时最明显），
     那点滚动会跟 deck 的位移叠成两层，整屏错位、底下露出白底，这里一律抹平。 */
  window.addEventListener('scroll', function () {
    if (window.innerWidth > 900) {
      if (document.documentElement.scrollTop || document.body.scrollTop) {
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      }
      return;
    }
    var sy = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
    document.body.classList.toggle('past-first', sy > vh() * 0.5);
  }, { passive: true });

  var rt;
  window.addEventListener('resize', function () {
    window.clearTimeout(rt);
    rt = window.setTimeout(function () { relayout(false); }, 150);
  });
  window.addEventListener('load', function () {
    relayout(true);
    /* 带 #pageN 打开时，浏览器读完 DOM 会照着 hash 再滚一次锚点，
       和 deck 自己的位移叠成两层：整屏会错位，比一屏矮的页脚最明显
       （底下直接露出空白）。整屏模式下把原生滚动清零。 */
    if (window.innerWidth > 900) {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }
  });

  if (window.ResizeObserver) {
    new window.ResizeObserver(function () { relayout(false); }).observe(document.documentElement);
  }

  /* ---------- 初始化：支持直接带 #pageN 打开 ---------- */
  /* 带 hash 打开时浏览器会自己把目标滚进视口，这个原生滚动会和 deck 的
     位移叠加，整屏就错位了：先把 hash 摘掉、滚动归零，再按 idx 自己定位 */
  var hashName = location.hash.slice(1);
  if (hashName) {
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    window.scrollTo(0, 0);
  }

  var start = secs.findIndex(function (s) { return s.dataset.anchor === hashName; });
  /* 「关于」那块原来是独立的第 9 屏（#page9），现在并进第八屏当页脚了。
     老的链接 / 收藏还带着 #page9，落到最后一屏，别一把弹回首页 */
  if (start < 0 && hashName === 'page9') start = secs.length - 1;
  idx = start >= 0 ? start : 0;
  /* 首屏是「开门」不是「翻到」，别自己把页码条抽出来：一进首页就有条
     「皮影工厂」孤零零挂在最上面，看着像卡住了 */
  peekIdx = idx;
  lastW = window.innerWidth;
  lastH = vh();
  relayout(true);
  /* overflow:hidden 的 body 也会被原生锚点滚动推到几百像素，
     window.scrollTo 管不到它，得直接清 scrollTop */
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;

  /* 对外暴露，给 reveal.js / 其它脚本用 */
  window.deck = {
    index: function () { return idx; },
    go: go,
    sections: secs,
    isAnimating: function () { return animating; },
    onChange: function (fn) {
      listeners.push(fn);
      fn(idx);                        // 立刻回调一次，首屏也要有入场
    }
  };
})();
