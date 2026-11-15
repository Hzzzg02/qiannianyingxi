/* ==========================================================
   map.js —— 05 流派地图
   · 用 CN_MAP 的省面画一张示意图，14 处流派各钉一颗点
   · 点省或点点 → 右栏换成那一处的介绍（造型 / 唱腔 / 考据）
   · 数据来自 SCHOOL_DATA（十四个地区、七大影系）
   ========================================================== */
(function () {
  var SD = window.SCHOOL_DATA;
  var MAP = window.CN_MAP;
  var svg = document.getElementById('cnMap');
  if (!SD || !MAP || !svg) return;

  var NS = 'http://www.w3.org/2000/svg';
  var provG = document.getElementById('cnProv');
  var pinG = document.getElementById('cnPins');
  var panel = document.getElementById('mapPanel');
  var inset = document.getElementById('cnInset');
  var legend = document.getElementById('cnLegend');

  var current = null;                       // 当前选中的流派 id

  /* ---------------- 投影：与生成地图时同一套 Albers 参数 ---------------- */
  var D = Math.PI / 180;
  var xy = (function () {
    var P = MAP.proj;
    var n = (Math.sin(P.p1 * D) + Math.sin(P.p2 * D)) / 2;
    var C = Math.pow(Math.cos(P.p1 * D), 2) + 2 * n * Math.sin(P.p1 * D);
    var rho0 = Math.sqrt(C - 2 * n * Math.sin(P.lat0 * D)) / n;
    return function (lng, lat) {
      var rho = Math.sqrt(C - 2 * n * Math.sin(lat * D)) / n;
      var th = n * (lng - P.lon0) * D;
      return [
        rho * Math.sin(th) * P.scale + P.dx,
        -(rho0 - rho * Math.cos(th)) * P.scale + P.dy
      ];
    };
  })();

  function sysOf(id) {
    var out = null;
    SD.systems.forEach(function (s) { if (s.id === id) out = s; });
    return out || { name: '', color: '#a8321f' };
  }
  function find(id) {
    var out = null;
    SD.schools.forEach(function (s) { if (s.id === id) out = s; });
    return out;
  }
  function svgEl(tag, attrs) {
    var el = document.createElementNS(NS, tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }
  function esc(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ======================================================================
     视野（相机）与聚焦高亮
     · 整张图就是一支镜头：改 viewBox 就是推拉，选中哪一省就把它挪到正中
     · 点和字反着缩（scale(1/z)），放大后仍然只有这么大，不至于糊成一团
     · 选中那一省的轮廓单独描一道浅蓝，虚线沿边走，外面再裹一层会呼吸的光
     ====================================================================== */
  var BASE = { x: 0, y: 0, w: 768.6, h: 648.3 };
  var cam = baseCam();
  var camRaf = 0;
  var currentFocus = null;

  var plate = svg.parentNode;
  var focusG = document.getElementById('cnFocus');
  var focusGlow = focusG ? svgEl('path', { class: 'cn-focus-glow' }) : null;
  var focusLine = focusG ? svgEl('path', { class: 'cn-focus-line' }) : null;
  if (focusG) {
    focusG.appendChild(focusGlow);
    focusG.appendChild(focusLine);
  }

  function baseCam() { return { x: BASE.x, y: BASE.y, w: BASE.w, h: BASE.h }; }

  /* 画布当前的长宽比：视野必须按这个比例取，省界才会落在框的正中 */
  function mapAspect() {
    var r = svg.getBoundingClientRect();
    return (r.width > 0 && r.height > 0) ? r.width / r.height : BASE.w / BASE.h;
  }
  function zoom() { return BASE.w / cam.w; }

  function applyCam() {
    svg.setAttribute('viewBox',
      cam.x.toFixed(2) + ' ' + cam.y.toFixed(2) + ' ' + cam.w.toFixed(2) + ' ' + cam.h.toFixed(2));

    var z = zoom();
    var iz = 1 / z;
    svg.style.setProperty('--iz', iz.toFixed(4));

    /* 省界的线宽按屏幕算，放大后不会变成一圈粗边 */
    provG.setAttribute('stroke-width', (1.1 / z).toFixed(2));

    /* 点和地名反着缩，永远保持原大小 */
    if (pinEls) {
      var s = 'scale(' + iz.toFixed(4) + ')';
      Object.keys(pinEls).forEach(function (k) {
        var p = pinEls[k];
        p.g.setAttribute('transform',
          'translate(' + p.x + ' ' + p.y + ') ' + s + ' translate(' + (-p.x) + ' ' + (-p.y) + ')');
      });
    }

    if (currentFocus && focusLine) {
      focusLine.setAttribute('stroke-width', (2.2 / z).toFixed(2));
      focusLine.setAttribute('stroke-dasharray', (7 / z).toFixed(2) + ' ' + (11 / z).toFixed(2));
      focusGlow.setAttribute('stroke-width', (5.4 / z).toFixed(2));
    }
  }

  /* 选中那一省的视野：长宽都按画布比例取，中心就是这一省的中心 */
  function viewOf(name) {
    var el = provEls[name];
    if (!el || !el.getBBox) return baseCam();
    var bb = el.getBBox();
    var A = mapAspect();
    var fill = 0.52;                 // 这一省占视野的一半多一点
    var w = Math.max(bb.width, bb.height * A) / fill;
    var minW = BASE.w * 0.24;        // 小省别放到失真
    if (w < minW) w = minW;
    if (w > BASE.w) w = BASE.w;
    var h = w / A;
    if (h > BASE.h) { h = BASE.h; w = h * A; }
    return {
      x: bb.x + bb.width / 2 - w / 2,
      y: bb.y + bb.height / 2 - h / 2,
      w: w, h: h
    };
  }

  var camTimer = 0;
  function landOn(to) {
    if (camRaf) { cancelAnimationFrame(camRaf); camRaf = 0; }
    clearTimeout(camTimer);
    cam = to;
    applyCam();
  }

  function goCam(to, instant) {
    if (instant) { landOn(to); return; }

    if (camRaf) { cancelAnimationFrame(camRaf); camRaf = 0; }
    clearTimeout(camTimer);

    var from = { x: cam.x, y: cam.y, w: cam.w, h: cam.h };
    var dur = 780;
    var t0 = 0;
    function step(ts) {
      if (!t0) t0 = ts;
      var t = Math.min(1, (ts - t0) / dur);
      var e = 1 - Math.pow(1 - t, 3);        // 起手快、收尾慢
      cam.x = from.x + (to.x - from.x) * e;
      cam.y = from.y + (to.y - from.y) * e;
      cam.w = from.w + (to.w - from.w) * e;
      cam.h = from.h + (to.h - from.h) * e;
      applyCam();
      if (t < 1) camRaf = requestAnimationFrame(step);
      else { camRaf = 0; cam = to; applyCam(); }
    }
    camRaf = requestAnimationFrame(step);

    /* 兜底：标签页在后台、或者某些环境不给 rAF，画面就一直停在半路。
       到点还没落位就直接归位，宁可少一段动画，也不能让地图卡住 */
    camTimer = setTimeout(function () {
      if (camRaf) landOn(to);
    }, dur + 240);
  }

  /* 虚线沿轮廓走：每帧挪一点 dashoffset，速度按屏幕像素算 */
  var dashRaf = 0, dashOff = 0, dashPrev = 0;
  function dashStep(ts) {
    if (!currentFocus || !focusLine) { dashRaf = 0; dashPrev = 0; return; }
    if (!dashPrev) dashPrev = ts;
    var dt = Math.min(80, ts - dashPrev);
    dashPrev = ts;
    var z = zoom();
    var P = 18 / z;                        // 一个虚线的周期（用户单位）
    dashOff = (dashOff - (dt / 1000) * 34 / z) % P;
    focusLine.setAttribute('stroke-dashoffset', dashOff.toFixed(2));
    dashRaf = requestAnimationFrame(dashStep);
  }
  function startDash() {
    if (!dashRaf && currentFocus) { dashPrev = 0; dashRaf = requestAnimationFrame(dashStep); }
  }

  function setFocus(name) {
    if (!focusG) return;
    var el = name ? provEls[name] : null;
    if (!el) {
      currentFocus = null;
      focusG.classList.remove('is-on');
      if (plate) plate.classList.remove('is-focus');
      return;
    }
    currentFocus = name;
    var d = el.getAttribute('d');
    focusLine.setAttribute('d', d);
    focusGlow.setAttribute('d', d);
    focusG.classList.add('is-on');
    if (plate) plate.classList.add('is-focus');
    applyCam();          // 描边粗细、虚线先按当前视野算一遍
    startDash();
  }

  /* ---------------- 省面 ---------------- */
  var provEls = {};
  MAP.paths.forEach(function (p) {
    var el = svgEl('path', { d: p.d, class: 'cn-prov' });
    el.dataset.prov = p.n;
    provG.appendChild(el);
    provEls[p.n] = el;
  });

  /* ---------------- 标记 ---------------- */
  var pinEls = {};
  var labelOffset = {
    hebei:     [13, 4],
    liaoning:  [0, -15],
    shandong:  [13, -1],
    shanxi:    [0, -15],
    shaanxi:   [-13, 12],
    henan:     [13, 3],
    hubei:     [13, 6],
    hunan:     [-13, 3],
    zhejiang:  [0, -15],
    gansu:     [0, -15],
    qinghai:   [-13, 2],
    sichuan:   [0, 17],
    yunnan:    [-13, 2],
    guangdong: [13, 2]
  };
  function anchorOf(dx) {
    return dx > 4 ? 'start' : dx < -4 ? 'end' : 'middle';
  }

  SD.schools.forEach(function (s) {
    var p = xy(s.pin[0], s.pin[1]);
    var sys = sysOf(s.sys);
    var off = labelOffset[s.id] || [0, -12];

    var g = svgEl('g', { class: 'cn-pin', 'data-id': s.id, tabindex: '0', role: 'button' });
    g.setAttribute('aria-label', s.name + ' 皮影');
    g.appendChild(svgEl('circle', { class: 'cn-pin-halo', cx: p[0], cy: p[1], r: 8.4, stroke: sys.color }));
    g.appendChild(svgEl('circle', { class: 'cn-pin-core', cx: p[0], cy: p[1], r: 4.2, fill: sys.color }));

    var t = svgEl('text', {
      class: 'cn-lab',
      x: p[0] + off[0],
      y: p[1] + off[1] + (off[1] < 0 ? -2 : 4),
      'text-anchor': anchorOf(off[0]),
      'font-size': 12.5
    });
    t.textContent = s.label;
    g.appendChild(t);

    pinG.appendChild(g);
    pinEls[s.id] = { g: g, text: t, x: p[0], y: p[1] };

    g.addEventListener('click', function (e) { e.stopPropagation(); select(s.id); });
    g.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(s.id); }
    });
  });

  /* 有流派的省可点，其余点了给一句提示 */
  SD.schools.forEach(function (s) {
    var el = provEls[s.prov];
    if (!el) return;
    el.classList.add('is-has');
    el.addEventListener('click', function () { select(s.id); });
  });

  /* ---------------- 南海诸岛插图 ---------------- */
  if (MAP.nanhai && MAP.nanhai.d) {
    var ns = svgEl('svg', { viewBox: '0 0 ' + MAP.nanhai.w + ' ' + MAP.nanhai.h });
    ns.appendChild(svgEl('path', { d: MAP.nanhai.d }));
    inset.appendChild(ns);
    var lab = document.createElement('i');
    lab.textContent = '南海诸岛';
    inset.appendChild(lab);
  }

  /* ---------------- 图例 ---------------- */
  (function () {
    SD.systems.forEach(function (s) {
      var span = document.createElement('span');
      span.className = 'cn-lg';
      span.innerHTML = '<i style="background:' + s.color + '"></i>' + esc(s.name);
      legend.appendChild(span);
    });
    var other = document.createElement('span');
    other.className = 'cn-lg cn-lg--other';
    other.innerHTML = '<i></i>其余地区';
    legend.appendChild(other);
  })();

  /* ---------------- 右栏：未选中 ---------------- */
  function renderIntro() {
    var counts = {};
    SD.schools.forEach(function (s) { counts[s.sys] = (counts[s.sys] || 0) + 1; });

    var list = '';
    SD.systems.forEach(function (s) {
      var names = SD.schools.filter(function (x) { return x.sys === s.id; })
        .map(function (x) { return x.label; }).join('、');
      list += '<li><i style="background:' + s.color + '"></i>' +
        '<b>' + esc(s.name) + '</b>' +
        '<span>' + esc(names) + '</span></li>';
    });

    panel.innerHTML =
      '<div class="mp-intro">' +
        '<p class="mp-kick">影从何处来</p>' +
        '<h3 class="mp-h">十四个地区，七大影系</h3>' +
        '<p class="mp-lead">按江玉祥的分法，这些流派归作七大影系。同一个影系里的几处，往往共用一套刻法和一副嗓子——影偶的尺寸、皮质、唱腔，隔着几百里地对得上。</p>' +
        '<ul class="mp-syslist">' + list + '</ul>' +
        '<p class="mp-hint">点红点或省份，地图推近到那一处</p>' +
      '</div>';
  }

  /* ---------------- 右栏：某处流派 ---------------- */
  function renderDetail(s) {
    var sys = sysOf(s.sys);
    var idx = SD.schools.indexOf(s);

    panel.innerHTML =
      '<div class="mp-detail">' +
        '<div class="mp-top">' +
          '<span class="mp-sys" style="--c:' + sys.color + '">' + esc(sys.name) + '</span>' +
          '<button class="mp-close" type="button">回到全国</button>' +
        '</div>' +
        '<h3 class="mp-h">' + esc(s.name) + '</h3>' +
        '<p class="mp-area">' + esc(s.area) + '　·　' + esc(s.prov) + '</p>' +
        '<p class="mp-quote">' + esc(s.tag) + '</p>' +
        '<dl class="mp-meta">' +
          '<div><dt>材质</dt><dd>' + esc(s.mat) + '</dd></div>' +
          '<div><dt>操纵杆</dt><dd>' + esc(s.rods) + '</dd></div>' +
          '<div><dt>影偶尺寸</dt><dd>' + esc(s.size) + '</dd></div>' +
          '<div><dt>唱腔</dt><dd>' + esc(s.voice) + '</dd></div>' +
        '</dl>' +
        '<div class="mp-scroll">' +
          '<h4>造型</h4><p>' + esc(s.craft) + '</p>' +
          '<h4>唱与伴奏</h4><p>' + esc(s.sing) + '</p>' +
          '<p class="mp-fact"><b>考据</b>' + esc(s.fact) + '</p>' +
        '</div>' +
        '<div class="mp-foot">' +
          '<button class="mp-arrow" type="button" data-nav="-1" aria-label="上一处">‹</button>' +
          '<span class="mp-count">' + (idx + 1) + ' / ' + SD.schools.length + '</span>' +
          '<button class="mp-arrow" type="button" data-nav="1" aria-label="下一处">›</button>' +
        '</div>' +
      '</div>';

    panel.querySelector('.mp-close').addEventListener('click', reset);

    /* 正文放不下时，底部渐隐一道，提示还能往下读 */
    var sc = panel.querySelector('.mp-scroll');
    var markScroll = function () {
      if (!sc) return;
      var more = sc.scrollHeight - sc.scrollTop - sc.clientHeight > 4;
      sc.classList.toggle('is-more', more);
    };
    markScroll();
    if (sc) sc.addEventListener('scroll', markScroll);
    Array.prototype.forEach.call(panel.querySelectorAll('[data-nav]'), function (b) {
      b.addEventListener('click', function () {
        var n = SD.schools.length;
        select(SD.schools[(idx + Number(b.dataset.nav) + n) % n].id);
      });
    });
  }

  /* ---------------- 选中 / 复位 ---------------- */
  function clearMarks() {
    Object.keys(pinEls).forEach(function (k) {
      pinEls[k].g.classList.remove('is-on');
      pinEls[k].text.classList.remove('is-on');
    });
    Object.keys(provEls).forEach(function (n) { provEls[n].classList.remove('is-on'); });
  }

  function select(id, instant) {
    var s = find(id);
    if (!s) return;
    current = id;
    clearMarks();
    if (pinEls[id]) {
      pinEls[id].g.classList.add('is-on');
      pinEls[id].text.classList.add('is-on');
    }
    if (provEls[s.prov]) provEls[s.prov].classList.add('is-on');
    setFocus(s.prov);
    renderDetail(s);
    panel.classList.add('is-detail');
    goCam(viewOf(s.prov), instant);
  }

  function reset(instant) {
    current = null;
    clearMarks();
    setFocus(null);
    renderIntro();
    panel.classList.remove('is-detail');
    goCam(baseCam(), instant === true);
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && current) reset();
  });

  /* 换窗口大小时视野得重算：viewBox 是按画布比例取的，比例一变就不居中了 */
  var rzTimer;
  window.addEventListener('resize', function () {
    clearTimeout(rzTimer);
    rzTimer = setTimeout(function () {
      var s = current ? find(current) : null;
      goCam(s ? viewOf(s.prov) : baseCam(), true);
    }, 140);
  });

  applyCam();
  reset(true);

  /* 翻到别的屏就把镜头推回全国：右栏也一并换回「七大影系」那张总表，
     下次进来还是全国视角，不用先按一次「回到全国」 */
  if (window.deck && window.deck.onChange) {
    var secEl = svg.closest ? svg.closest('.sec') : null;
    var secIdx = secEl ? window.deck.sections.indexOf(secEl) : -1;
    window.deck.onChange(function (i) {
      if (i !== secIdx && current) reset(true);
    });
  }

  /* 调试：?mz=hebei 直接落到某一省，方便出定影图 */
  var mz = (location.search.match(/[?&]mz=([a-z]+)/) || [])[1];
  if (mz) select(mz, true);
})();
