/* ==========================================================
   slots.js —— 03 屏的竖条波浪

   四十多条竖条铺满整屏，每条内部藏一道横向暗带，暗带随鼠标在条身上
   滑动；相邻条错开相位，连起来就是一道流过整屏的波。鼠标横移推进
   相位、纵移整排跟手。

   条本身是满屏的，整体上下平移会被视口切掉看不见，所以"能看见的
   位移"全做在条的内部（--py），不动条的盒子。

   02 屏已经不是竖条墙了，改成彩色竖条 + 悬片入场，见 layout.css
   的 .panels / .pcard 一节，无需脚本。
   ========================================================== */
(function () {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var AMP = 78;            // 波浪振幅（px）
  var TILT = 26;           // 整排跟手位移（px）
  var WAVE_SPEED = 1.7;    // 鼠标横移推进多少相位
  var EASE = 0.16;         // 跟随速度

  var groups = [];
  document.querySelectorAll('.slots').forEach(function (host) {
    var bars = Array.prototype.slice.call(host.querySelectorAll('.slot-bar'));
    if (!bars.length) return;
    groups.push({
      sec: host.closest('.sec'),
      bars: bars,
      amp: AMP * 0.78,
      cur: new Float32Array(bars.length),
      target: new Float32Array(bars.length)
    });
  });
  if (!groups.length) return;

  /* 调试：?tilt=0.8,-0.5 把指针钉在归一化位置，方便截图定格 */
  var forced = null;
  var m = /[?&]tilt=(-?[\d.]+),(-?[\d.]+)/.exec(location.search);
  if (m) forced = { x: Math.max(-1, Math.min(1, +m[1])), y: Math.max(-1, Math.min(1, +m[2])) };
  if (forced) EASE = 1;

  var pointer = { x: 0, y: 0, live: false };

  function activeGroup() {
    if (!window.deck) return null;
    var cur = window.deck.sections[window.deck.index()];
    for (var i = 0; i < groups.length; i++) {
      if (groups[i].sec === cur) return groups[i];
    }
    return null;
  }

  function liveOn() {
    return document.body.classList.contains('slots-live');
  }

  /* ---------- 目标值 ---------- */
  function aim(g, nx, ny, inside) {
    for (var i = 0; i < g.bars.length; i++) {
      g.target[i] = inside
        ? Math.sin(i * 0.34 + nx * WAVE_SPEED) * g.amp + ny * TILT
        : 0;
    }
  }

  function step(g) {
    for (var i = 0; i < g.bars.length; i++) {
      var d = g.target[i] - g.cur[i];
      if (d === 0) continue;
      if (Math.abs(d) < 0.05) g.cur[i] = g.target[i];
      else g.cur[i] += d * EASE;
      g.bars[i].style.setProperty('--py', g.cur[i].toFixed(2) + 'px');
    }
  }

  function frame() {
    var g = activeGroup();
    if (g) {
      var inside = false, nx = 0, ny = 0;

      if (forced) {
        inside = true; nx = forced.x; ny = forced.y;
      } else if (pointer.live && liveOn()) {
        var r = g.sec.getBoundingClientRect();
        if (pointer.x >= r.left && pointer.x <= r.right &&
            pointer.y >= r.top && pointer.y <= r.bottom) {
          inside = true;
          nx = (pointer.x - r.left) / r.width * 2 - 1;
          ny = (pointer.y - r.top) / r.height * 2 - 1;
        }
      }

      aim(g, nx, ny, inside);
      step(g);
    }
    window.requestAnimationFrame(frame);
  }

  /* ---------- 鼠标一动就亮起来，停手一会儿自动归位 ---------- */
  var liveTimer = null;
  function markLive() {
    if (!document.body.classList.contains('slots-live')) {
      document.body.classList.add('slots-live');
    }
    window.clearTimeout(liveTimer);
    liveTimer = window.setTimeout(function () {
      document.body.classList.remove('slots-live');
    }, 1500);
  }

  window.addEventListener('mousemove', function (e) {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.live = true;
    markLive();
  }, { passive: true });

  window.addEventListener('mouseout', function (e) {
    if (!e.relatedTarget) pointer.live = false;      // 指针离开窗口
  }, { passive: true });

  window.addEventListener('blur', function () { pointer.live = false; });

  /* 调试态：不依赖 rAF，直接落到目标位置，保证截图能看到 */
  if (forced) {
    document.body.classList.add('slots-live');
    var g0 = activeGroup();
    if (g0) {
      aim(g0, forced.x, forced.y, true);
      for (var k = 0; k < g0.bars.length; k++) {
        g0.cur[k] = g0.target[k];
        g0.bars[k].style.setProperty('--py', g0.cur[k].toFixed(2) + 'px');
      }
    }
  }

  window.requestAnimationFrame(frame);
})();
