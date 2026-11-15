/* ==========================================================
   eras.js —— 03 屏「影戏两千年」

   上半是一条随时间和鼠标流动的曲线，六枚朝代由上到下均匀钉在
   曲线上，跟着曲线一起起伏；点一枚，下半换成这一朝的说明，
   什么都不点时显示总述。

   曲线本身只是两条正弦叠出来的：一条慢、一条快，相位差着走，
   看起来就不像规则的水波。鼠标横移推进相位，纵移整条抬落，
   和同一屏的竖条墙用的是同一套手感。
   ========================================================== */
(function () {
  'use strict';

  var sec = document.getElementById('page3');
  var data = window.ERA_DATA;
  if (!sec || !data) return;

  var band = sec.querySelector('.era-band');
  var svg = sec.querySelector('.era-curve');
  var line = document.getElementById('eraLine');
  var glow = document.getElementById('eraGlow');
  var host = document.getElementById('eraNodes');
  var figs = Array.prototype.slice.call(
    document.querySelectorAll('#eraFigs img'));
  var copy = document.getElementById('eraCopy');
  if (!band || !svg || !line || !host || !copy) return;

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  /* ?still 与预览截图用：只画一帧，曲线定格，方便比对 */
  var still = /[?&]still/.test(location.search);
  if (still) reduce = true;

  /* 六朝的横坐标：两端各留一成，其余等距 */
  var XS = [0.135, 0.281, 0.427, 0.573, 0.719, 0.865];

  var W = 0, H = 0, CY = 0;
  var nodes = [];
  var current = -1;          // -1 = 总述
  var phase = 0;             // 曲线自身的相位偏移（?era= 可定格）
  /* 指针：鼠标压在哪，曲线就在哪被拽过去，不是整条跟着跑 */
  var ptr = { x: 0, y: 0, tx: 0, ty: 0, has: false, on: 0 };
  var running = false;
  var t0 = 0;
  var raf = 0;

  /* ---------- 建节点 ---------- */
  data.eras.forEach(function (e, i) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'era-node';
    b.setAttribute('aria-label', e.key + '，' + e.years);
    b.innerHTML =
      '<span class="en-dot" aria-hidden="true"></span>' +
      '<span class="en-name">' + e.key + '</span>' +
      '<span class="en-year">' + e.years + '</span>';
    b.addEventListener('click', function () {
      pick(current === i ? -1 : i);
    });
    host.appendChild(b);
    nodes.push(b);
  });

  /* ---------- 量尺寸 ---------- */
  function measure() {
    var r = band.getBoundingClientRect();
    W = r.width;
    H = r.height;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    CY = H * 0.47;
    if (reduce) draw(0);
    else draw(now());
  }

  /* ---------- 曲线 ---------- */
  var ampA = 0, ampB = 0;

  function baseY(x, t) {
    var u = x / (W || 1);
    return CY
      + Math.sin(u * 7.2 + t * 0.50 + phase) * ampA
      + Math.sin(u * 13.3 - t * 0.32 + phase * 0.6) * ampB;
  }

  /* 鼠标附近用一条高斯曲线把线拽向指针，两侧自然衰减回去 */
  function waveY(x, t) {
    var y = baseY(x, t);
    if (ptr.on > 0.002) {
      var d = (x - ptr.x) / (W * 0.088);
      var g = Math.exp(-d * d * 0.5) * ptr.on;
      y += (ptr.y - y) * g * 0.88;
    }
    return y;
  }

  /* 取 72 个采样点，够平滑，也不至于每帧拼太长的字符串 */
  function draw(t) {
    if (!W) return;
    ampA = Math.min(76, W * 0.048);
    ampB = Math.min(25, W * 0.016);

    var N = 72, d = '', i, x, y;
    for (i = 0; i <= N; i++) {
      x = (i / N) * W;
      y = waveY(x, t);
      d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
    }
    line.setAttribute('d', d);
    glow.setAttribute('d', d);

    for (i = 0; i < nodes.length; i++) {
      x = XS[i] * W;
      y = waveY(x, t);
      nodes[i].style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
    }
  }

  function now() {
    return (performance.now() - t0) / 1000;
  }

  function frame() {
    if (!running) return;
    ptr.on += ((ptr.has ? 1 : 0) - ptr.on) * 0.085;
    ptr.x += (ptr.tx - ptr.x) * 0.15;
    ptr.y += (ptr.ty - ptr.y) * 0.15;
    draw(now());
    raf = requestAnimationFrame(frame);
  }

  function play() {
    if (reduce || running || !W) return;
    running = true;
    t0 = performance.now() - t0;      // 接着上次的相位走，不跳
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    ptr.has = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  /* ---------- 指针：曲线跟着鼠标走 ---------- */
  if (!reduce) {
    window.addEventListener('pointermove', function (e) {
      if (!isLive()) return;
      var r = band.getBoundingClientRect();
      var y = e.clientY - r.top;
      /* 高/低两头各留一点余量，别把节点名拽出屏 */
      ptr.ty = Math.max(64, Math.min(H - 76, y));
      ptr.tx = e.clientX;
      if (!ptr.has) { ptr.x = ptr.tx; ptr.y = ptr.ty; }
      ptr.has = true;
      if (!running) play();
    }, { passive: true });

    document.addEventListener('pointerleave', function () { ptr.has = false; });
    window.addEventListener('blur', function () { ptr.has = false; });
  }

  /* ---------- 下半：总述 / 某一朝 ---------- */
  function block(h) {
    var body = h.body.map(function (s) {
      return '<section><h3>' + s.h + '</h3><p>' + s.p + '</p></section>';
    }).join('');
    var keys = h.keys.map(function (k) {
      return '<li>' + k + '</li>';
    }).join('');
    return '' +
      '<div class="ec-left">' +
        '<p class="ec-kicker">' + h.kicker + '</p>' +
        '<h2 class="ec-title">' + h.title +
          (h.sub ? '<i>' + h.sub + '</i>' : '') + '</h2>' +
        '<p class="ec-years">' + h.years + '</p>' +
        (h.lead ? '<p class="ec-lead">' + h.lead + '</p>' : '') +
      '</div>' +
      '<div class="ec-right">' +
        '<div class="ec-body">' + body + '</div>' +
        '<ul class="ec-keys">' + keys + '</ul>' +
      '</div>';
  }

  function view(idx) {
    if (idx < 0) {
      var t = data.total;
      return block({
        kicker: t.kicker,
        title: t.title,
        years: t.years,
        lead: t.lead,
        body: t.body,
        keys: t.keys
      });
    }
    var e = data.eras[idx];
    /* 标题拆成「朝代名 + 一句特征」：朝代名做大字，特征做小字，
       左列只有 380px，整句排下来会挤成两行 */
    var sp = e.title.split('：');
    var name = sp[0] || e.key;
    var sub = sp.length > 1 ? sp[1] : '';
    return block({
      kicker: e.short,
      title: name,
      sub: sub,
      years: e.years,
      lead: '',
      body: e.body,
      keys: e.keys
    });
  }

  var swapTimer = 0;

  function pick(idx) {
    if (idx === current) return;
    current = idx;
    nodes.forEach(function (n, i) { n.classList.toggle('is-on', i === idx); });
    /* 六张分别对应六朝；总述没有专属的一张，用第一张（汉）顶着 */
    var at = idx < 0 ? 0 : idx;
    figs.forEach(function (f, i) { f.classList.toggle('is-on', i === at); });
    host.classList.toggle('has-on', idx >= 0);

    copy.classList.toggle('is-total', idx < 0);
    copy.classList.add('is-fading');
    window.clearTimeout(swapTimer);
    swapTimer = window.setTimeout(function () {
      copy.innerHTML = view(idx);
      copy.classList.remove('is-fading');
    }, 190);
  }

  /* ---------- 进出这一屏时开关动画 ---------- */
  function isLive() {
    return sec.classList.contains('is-in') || document.body.classList.contains('is-viewing-2');
  }

  if (window.MutationObserver) {
    new MutationObserver(function () {
      if (isLive()) play(); else stop();
    }).observe(sec, { attributes: true, attributeFilter: ['class'] });
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop();
    else if (isLive()) play();
  });

  window.addEventListener('resize', measure);

  /* ---------- 起点 ---------- */
  copy.classList.add('is-total');
  copy.innerHTML = view(-1);
  figs.forEach(function (f, i) { f.classList.toggle('is-on', i === 0); });
  measure();

  /* 调试：?era=0.6 定格相位；?era-pick=2 直接选中第 3 朝，方便截图 */
  var m = /[?&]era=(-?[\d.]+)/.exec(location.search);
  if (m) { phase = parseFloat(m[1]); }
  /* ?era-mouse=700,220 把指针钉在那一处，方便截图核对吸附 */
  var mm = /[?&]era-mouse=(-?[\d.]+),(-?[\d.]+)/.exec(location.search);
  if (mm) {
    ptr.tx = ptr.x = parseFloat(mm[1]);
    ptr.ty = ptr.y = parseFloat(mm[2]);
    ptr.has = true;
    ptr.on = 1;
  }
  var p = /[?&]era-pick=(\d)/.exec(location.search);
  if (p) {
    var i = parseInt(p[1], 10);
    if (i >= 0 && i < data.eras.length) {
      current = -2;
      pick(i);
    }
  }

  if (reduce) draw(0);
  if (isLive()) play();
})();
