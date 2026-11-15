/* ==========================================================
   reveal.js —— 竖条生成 + 逐屏进场编排
   对应原站的做法：把一屏切成 N 条竖块，一半从下、一半从上，
   用弹性缓动错位飞入；离开本屏时复位，下次进来重播。

   触发方式：订阅 deck 的翻页回调，不用定时轮询；
   加类之前先强制回流一次，保证 transition 能从初始态起步。
   ========================================================== */
(function () {
  if (!window.deck) return;
  var secs = window.deck.sections;

  /* ---------- 1. 生成竖条 ---------- */
  document.querySelectorAll('[data-slots]').forEach(function (host) {
    var n = parseInt(host.dataset.slots, 10) || 24;
    var frag = document.createDocumentFragment();
    for (var i = 0; i < n; i++) {
      var slot = document.createElement('div');
      slot.className = 'slot';
      /* 宽度随机一点，才不像排栅栏；用 flex-grow 让总宽自动铺满 */
      slot.style.flexGrow = (0.6 + Math.random() * 0.9).toFixed(2);

      var bar = document.createElement('div');
      bar.className = 'slot-bar';
      /* 奇偶交替上下，延迟按序号递增 */
      bar.style.setProperty('--from', i % 2 ? '-100%' : '100%');
      bar.style.setProperty('--d', (i * 0.016).toFixed(3) + 's');
      /* 明暗也跟着变化，避免整片死板 */
      bar.style.opacity = (0.45 + (i % 5) * 0.12).toFixed(2);

      slot.appendChild(bar);
      frag.appendChild(slot);
    }
    host.appendChild(frag);
  });

  /* ---------- 2. 通用进场元素的延迟（同屏内依次错开） ---------- */
  secs.forEach(function (sec) {
    Array.prototype.forEach.call(sec.querySelectorAll('[data-rv]'), function (el, i) {
      if (!el.style.getPropertyValue('--rv-d')) {
        el.style.setProperty('--rv-d', (0.12 + i * 0.12).toFixed(2) + 's');
      }
    });
  });

  /* ---------- 3. 窄屏：原生滚动不走 deck，得自己把这个屏的 is-in 落下去 ----------
     否则 is-in 永远不来，凡是以它为条件的进场元素都停在 opacity:0，整屏空白 */
  var narrow = window.matchMedia('(max-width: 900px)');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) en.target.classList.add('is-in');
      });
    }, { threshold: .22 });

    var watchNarrow = function () {
      secs.forEach(function (s) {
        if (narrow.matches) io.observe(s);
        else io.unobserve(s);
      });
    };
    watchNarrow();
    if (narrow.addEventListener) narrow.addEventListener('change', watchNarrow);
  } else if (narrow.matches) {
    /* 兜底：连 IntersectionObserver 都没有，就直接全给终态 */
    secs.forEach(function (s) { s.classList.add('is-in'); });
  }

  /* ---------- 4. 翻到哪屏，就给哪屏加入场类 ---------- */
  window.deck.onChange(function (index) {
    var last = secs.length - 1;
    /* 末屏是矮一截的页脚，视口上半还露着前一屏的下半张：
       那一屏得留在入场终态，否则翻过来只有空底色（直接从 #page9 打开也补上） */
    var keepPrev = index === last ? index - 1 : -1;
    secs.forEach(function (sec, k) {
      if (k === keepPrev) {
        sec.classList.add('is-in');
        return;
      }
      sec.classList.remove('is-in');
      if (k !== index) return;
      void sec.offsetWidth;            // 强制回流：先把初始态算出来
      sec.classList.add('is-in');
    });
  });
})();
