/* ==========================================================
   deck.js —— 整屏翻页（原生滚动 + scroll-snap 版）

   旧版用 translate3d 平移 deck 并锁定动画：滚轮被劫持、原生滚动条
   被 overflow:hidden 干掉，滑动要等 0.95s 动画走完才吃下一次，卡手。
   现在改成浏览器的原生滚动 + CSS scroll-snap：
     · 浏览器滚动条恢复可用、可拖拽
     · 滚轮 / 触摸完全原生，跟手、带惯性，滚一下吸附到一屏
     · 圆点 / 键盘 / 锚点用 scrollTo 平滑跳转
     · 末屏（页脚）比一屏矮，贴底而不是贴顶
     · 对外接口（onChange / sections / index / go / isAnimating）保持不变，
       其它脚本（reveal / hero / map / parts / plays / slots）无需改动
   ========================================================== */
(function () {
  var deck = document.getElementById('deck');
  if (!deck) return;

  var secs = Array.prototype.slice.call(deck.querySelectorAll('.sec'));
  var dots = Array.prototype.slice.call(document.querySelectorAll('.dot-nav button'));
  var scroller = document.scrollingElement || document.documentElement;

  var NARROW = 900;               // 与 layout.css 的 @media (max-width:900px) 对齐
  var SNAP_TOL = 3;               // 滚动位置离目标这么近就算到位
  var SETTLE_MS = 120;            // 滚动停稳后做最终校正的等待

  var idx = 0;
  var listeners = [];
  var targetIdx = null;           // smooth 跳转的目标屏（滚轮原生滚动时为 null）
  var ticking = false;
  var settleTimer = null;
  var peekIdx = -1;
  var peekTimer = null;

  function vh() {
    return window.innerHeight || document.documentElement.clientHeight;
  }

  /* 目标滚动位置：末屏贴底，其余按每屏 offsetTop */
  function offsetOf(i) {
    var max = Math.max(0, scroller.scrollHeight - vh());
    if (i === secs.length - 1) return max;
    return Math.round(Math.min(secs[i].offsetTop, max));
  }

  /* 由滚动位置反推当前屏 */
  function indexAt(st) {
    var max = Math.max(0, scroller.scrollHeight - vh());
    if (st >= max - 4) return secs.length - 1;
    var best = 0, bd = Infinity;
    for (var i = 0; i < secs.length; i++) {
      var d = Math.abs(secs[i].offsetTop - st);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  /* ---------- 渲染：状态落到 body / 圆点 / hash，并触发回调 ---------- */
  function render() {
    var body = document.body;
    for (var i = 0; i < secs.length; i++) body.classList.remove('is-viewing-' + i);
    body.classList.add('is-viewing-' + idx);
    body.classList.toggle('past-first', idx > 0);

    dots.forEach(function (b, i) { b.classList.toggle('is-active', i === idx); });

    /* 页码提示条：翻到新屏抽出来停一秒再收回 */
    if (idx !== peekIdx) {
      peekIdx = idx;
      var tip = dots[idx];
      if (tip) {
        tip.classList.add('is-peek');
        window.clearTimeout(peekTimer);
        peekTimer = window.setTimeout(function () { tip.classList.remove('is-peek'); }, 1000);
      }
    }

    if (location.hash !== '#' + secs[idx].dataset.anchor) {
      try { history.replaceState(null, '', '#' + secs[idx].dataset.anchor); } catch (e) {}
    }

    listeners.forEach(function (fn) { try { fn(idx); } catch (e) {} });
  }

  function settleTo(ni) {
    targetIdx = null;
    if (ni === idx) return;
    document.body.dataset.dir = ni > idx ? 'down' : 'up';
    idx = ni;
    render();
  }

  /* ---------- 翻页 ---------- */
  function go(i, instant) {
    i = Math.max(0, Math.min(secs.length - 1, i));
    var target = offsetOf(i);

    if (instant) {
      scroller.scrollTo(0, target);
      if (i !== idx) settleTo(i);
      return true;
    }

    if (i === idx) return false;

    targetIdx = i;
    try {
      scroller.scrollTo({ top: target, behavior: 'smooth' });
    } catch (e) {
      scroller.scrollTop = target;
    }
    return true;
  }

  /* ---------- 滚动驱动 ---------- */
  function finalize() {
    if (targetIdx === null) return;
    var st = scroller.scrollTop;
    /* smooth 可能被用户中途打断：到目标就用目标，否则按当前位置校正 */
    if (Math.abs(st - offsetOf(targetIdx)) < SNAP_TOL) settleTo(targetIdx);
    else settleTo(indexAt(st));
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      ticking = false;
      var st = scroller.scrollTop;

      /* 窄屏是原生内容流滚动，不走整屏回调，只更新导航显隐 */
      if (window.innerWidth <= NARROW) {
        document.body.classList.toggle('past-first', st > vh() * 0.5);
        return;
      }

      if (targetIdx !== null) {
        if (Math.abs(st - offsetOf(targetIdx)) < SNAP_TOL) settleTo(targetIdx);
        /* 途中不动，避免跨屏 smooth 跳转时路过中间屏闪烁 */
      } else {
        var ni = indexAt(st);
        if (ni !== idx) settleTo(ni);
      }

      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(finalize, SETTLE_MS);
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });

  /* 用户一滚轮，就放弃进行中的 smooth 跳转目标，交回原生滚动 */
  window.addEventListener('wheel', function () {
    targetIdx = null;
  }, { passive: true });

  /* ---------- 键盘 ---------- */
  window.addEventListener('keydown', function (e) {
    if (window.innerWidth <= NARROW) return;
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
    if (i >= 0 && i !== idx) go(i, true);
  });

  /* ---------- 圆点提示条：翻页时压住悬停，指针挪动再放回 ---------- */
  var dotNav = document.querySelector('.dot-nav');
  var ptr = null;
  var hushAt = null;

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

  /* 圆点 / 键盘跳转前也压一下悬停提示 */
  var _go = go;
  go = function (i, instant) {
    if (!instant) hushTips();
    return _go(i, instant);
  };

  /* ---------- 尺寸变化：保持当前屏对齐 ---------- */
  var rt;
  window.addEventListener('resize', function () {
    window.clearTimeout(rt);
    rt = window.setTimeout(function () { go(idx, true); }, 150);
  });
  window.addEventListener('load', function () {
    /* 图片等资源就位后，页脚高度可能变化，重新对齐当前屏 */
    go(idx, true);
  });
  if (window.ResizeObserver) {
    new window.ResizeObserver(function () { go(idx, true); }).observe(document.documentElement);
  }

  /* ---------- 初始化：支持直接带 #pageN 打开 ---------- */
  var hashName = location.hash.slice(1);
  if (hashName) {
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  }

  var start = secs.findIndex(function (s) { return s.dataset.anchor === hashName; });
  /* 「关于」并进第八屏页脚后，老链接 / 收藏还带 #page9，落到最后一屏 */
  if (start < 0 && hashName === 'page9') start = secs.length - 1;
  idx = start >= 0 ? start : 0;
  peekIdx = idx;
  document.body.dataset.dir = 'down';

  scroller.scrollTo(0, offsetOf(idx));
  render();

  /* 对外接口 */
  window.deck = {
    index: function () { return idx; },
    go: go,
    sections: secs,
    isAnimating: function () { return false; },
    onChange: function (fn) {
      listeners.push(fn);
      fn(idx);
    }
  };
})();
