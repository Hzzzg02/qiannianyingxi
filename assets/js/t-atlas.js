/* ==========================================================================
   t-atlas.js —— 流派地图专题页
   一 十四路影：按影系筛、点开看细节与实物
   二 两地比对：换任一边，差异行标红
   三 影人尺寸尺：只列有明确数字的九路
   四 传播路线：在真实省界投影上画六条线
   数据来自 schools-data.js（本校既有流派数据），藏品图来自 LIB_DATA。
   ========================================================================== */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var SD = window.SCHOOL_DATA || { systems: [], schools: [] };
  var IMG_VER = '2512d';

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function src(p) {
    return 'assets/img/lib/' + String(p).replace(/^images\//, '').replace(/\\/g, '/') + '?v=' + IMG_VER;
  }
  function sysOf(id) {
    var out = null;
    SD.systems.forEach(function (s) { if (s.id === id) out = s; });
    return out || { id: 'x', name: '未归系', color: '#9d2c1c' };
  }
  function schoolOf(id) {
    var out = null;
    SD.schools.forEach(function (s) { if (s.id === id) out = s; });
    return out;
  }

  /* 藏品图：按省份取；山西/山东/青海/广东四省馆藏图库无藏品条目，
     用中国非遗网（皮影数字博物馆同源）官方代表图补齐 */
  var PROV_IMG = {
    '山西省': { s: 'images/shanxi/shanxi-01.jpg', n: '孝义皮影戏' },
    '山东省': { s: 'images/shandong/shandong-01.jpg', n: '泰山皮影戏' },
    '青海省': { s: 'images/qinghai/qinghai-01.jpg', n: '河湟皮影戏影人' },
    '广东省': { s: 'images/guangdong/guangdong-01.jpg', n: '陆丰皮影戏' }
  };

  function libOf(prov, n) {
    var D = window.LIB_DATA;
    var out = [];
    if (D && D.items) {
      D.items.forEach(function (it) {
        if (it.p !== prov || out.length >= n) return;
        out.push(it);
      });
    }
    if (!out.length && PROV_IMG[prov]) out.push(PROV_IMG[prov]);
    return out;
  }

  /* ==========================================================
     一 卡片墙
     ========================================================== */
  var grid = $('#axGrid');
  var filterBox = $('#axFilter');
  var countEl = $('#axCount');
  var detail = $('#axDetail');
  var curSchool = null;
  var curSys = 'all';

  function cardHTML(s) {
    var sys = sysOf(s.sys);
    var imgs = libOf(s.prov, 1);
    return '<button class="ax-card" type="button" data-id="' + s.id + '" style="--c:' + sys.color + '">' +
      '<span class="ax-sys"><i></i>' + esc(sys.name) + '</span>' +
      '<h3>' + esc(s.name) + '</h3>' +
      '<p class="ax-area">' + esc(s.area) + '</p>' +
      '<p class="ax-tag">' + esc(s.tag) + '</p>' +
      '<div class="ax-facts">' +
      '<span><em>皮</em>' + esc(s.mat) + '</span>' +
      '<span><em>签</em>' + esc(s.rods) + '</span>' +
      '<span><em>腔</em>' + esc(s.voice.split('，')[0]) + '</span>' +
      '</div>' +
      (imgs.length ? '<div class="ax-thumb"><figure><img src="' + src(imgs[0].s) + '" alt="' + esc(imgs[0].n) + '" loading="lazy">' +
        '<figcaption>' + esc(imgs[0].n) + '</figcaption></figure></div>' : '') +
      '</button>';
  }

  function renderGrid() {
    var list = SD.schools.filter(function (s) { return curSys === 'all' || s.sys === curSys; });
    grid.innerHTML = list.map(cardHTML).join('');
    countEl.innerHTML = '当前 <b>' + list.length + '</b> 路 · 共 ' + SD.schools.length + ' 路';
    $$('.ax-card', grid).forEach(function (c) {
      c.addEventListener('click', function () { openSchool(c.dataset.id); });
    });
    if (curSchool && !list.some(function (s) { return s.id === curSchool; })) closeSchool();
  }

  function renderFilter() {
    var html = '<button class="ax-chip on" type="button" data-sys="all"><i style="--c:#9d2c1c"></i>全部十四路</button>';
    html += SD.systems.map(function (s) {
      var n = SD.schools.filter(function (x) { return x.sys === s.id; }).length;
      return '<button class="ax-chip" type="button" data-sys="' + s.id + '" style="--c:' + s.color + '"><i></i>' +
        esc(s.name) + ' <b style="font-weight:400;opacity:.6">' + n + '</b></button>';
    }).join('');
    filterBox.innerHTML = html;
    $$('.ax-chip', filterBox).forEach(function (b) {
      b.addEventListener('click', function () {
        $$('.ax-chip', filterBox).forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        curSys = b.dataset.sys;
        renderGrid();
      });
    });
  }

  function closeSchool() {
    curSchool = null;
    detail.hidden = true;
    $$('.ax-card', grid).forEach(function (c) { c.classList.remove('on'); });
  }

  function openSchool(id) {
    var s = schoolOf(id);
    if (!s) return;
    curSchool = id;
    $$('.ax-card', grid).forEach(function (c) { c.classList.toggle('on', c.dataset.id === id); });
    var sys = sysOf(s.sys);
    var imgs = libOf(s.prov, 3);
    detail.innerHTML =
      '<div class="ax-detail-h"><h3>' + esc(s.name) + '</h3>' +
      '<span>' + esc(s.area) + '</span>' +
      '<span style="--c:' + sys.color + ';color:' + sys.color + '">' + esc(sys.name) + '</span>' +
      '<button type="button" class="ax-close" aria-label="收起">收起 ×</button></div>' +
      '<div class="ax-detail-grid">' +
      '<div><p><b>刻法与形制。</b>' + esc(s.craft) + '</p><p><b>唱与伴奏。</b>' + esc(s.sing) + '</p>' +
      (imgs.length ? '<div class="ax-detail-imgs">' + imgs.map(function (o) {
        return '<figure><img src="' + src(o.s) + '" alt="' + esc(o.n) + '" loading="lazy"><figcaption>' +
          esc([o.n, o.p, o.z].filter(Boolean).join(' · ')) + '</figcaption></figure>';
      }).join('') + '</div>' : '') +
      '</div>' +
      '<div><div class="ax-facts-list">' +
      '<div><em>皮料</em><span>' + esc(s.mat) + '</span></div>' +
      '<div><em>影人</em><span>' + esc(s.size) + '</span></div>' +
      '<div><em>声腔</em><span>' + esc(s.voice) + '</span></div>' +
      '<div><em>签子</em><span>' + esc(s.rods) + '</span></div>' +
      '<div><em>来历</em><span>' + esc(s.fact) + '</span></div>' +
      '</div></div></div>';
    detail.hidden = false;
    $('.ax-close', detail).addEventListener('click', closeSchool);
    /* 详情不在视野里就带过去，已经在看就不动 */
    var hd = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--hd-h'), 10) || 78;
    var nav = $('#tpNav');
    var r = detail.getBoundingClientRect();
    var stick = hd + (nav ? nav.offsetHeight : 48) + 8;
    if (r.top < stick || r.top > window.innerHeight - 120) {
      window.scrollTo({ top: r.top + window.scrollY - stick, behavior: 'smooth' });
    }
  }

  renderFilter();
  renderGrid();

  /* ==========================================================
     二 两地比对
     ========================================================== */
  var cmp = $('#axCmp');
  var cmpNote = $('#axCmpNote');
  var pair = ['hebei', 'shaanxi'];

  var ROWS = [
    { k: '影系', f: function (s) { return sysOf(s.sys).name; } },
    { k: '皮料', f: function (s) { return s.mat; } },
    { k: '影人尺寸', f: function (s) { return String(s.size).replace(/^影人\s*/, ''); } },
    { k: '声腔', f: function (s) { return s.voice; } },
    { k: '操耍签子', f: function (s) { return s.rods; } },
    { k: '分布', f: function (s) { return s.area; } },
    { k: '一句话', f: function (s) { return s.tag; } }
  ];

  function pickHTML(sel, side) {
    return '<select class="ax-pick" data-side="' + side + '" aria-label="选择流派">' +
      SD.schools.map(function (s) {
        return '<option value="' + s.id + '"' + (s.id === sel ? ' selected' : '') + '>' + esc(s.name) + '</option>';
      }).join('') + '</select>';
  }

  function renderCmp() {
    var a = schoolOf(pair[0]) || SD.schools[0];
    var b = schoolOf(pair[1]) || SD.schools[1];
    var same = 0;
    var rows = ROWS.map(function (r) {
      var va = r.f(a), vb = r.f(b);
      var eq = String(va) === String(vb);
      if (eq) same++;
      return '<div class="ax-cmp-row ' + (eq ? 'is-same' : 'is-diff') + '">' +
        '<div class="ax-k">' + esc(r.k) + '</div>' +
        '<div class="ax-v">' + esc(va) + '</div>' +
        '<div class="ax-v">' + esc(vb) + '</div></div>';
    }).join('');

    cmp.innerHTML =
      '<div class="ax-cmp-head"><div>比什么</div>' +
      '<div class="ax-pick-cell">' + pickHTML(a.id, 0) + '</div>' +
      '<div class="ax-pick-cell">' + pickHTML(b.id, 1) + '</div></div>' + rows;

    $$('.ax-pick', cmp).forEach(function (sel) {
      sel.addEventListener('change', function () {
        pair[+sel.dataset.side] = sel.value;
        renderCmp();
      });
    });

    cmpNote.innerHTML = '<span>七项里相同的 <b style="color:#9d2c1c">' + same + '</b> 项，不同的 <b style="color:#9d2c1c">' +
      (ROWS.length - same) + '</b> 项。红底那几行是差别所在。</span>' +
      '<span>要看刻法，回上面点卡片看细节。</span>';
  }
  renderCmp();

  /* ==========================================================
     三 影人尺寸尺
     ========================================================== */
  var RANGES = [
    { id: 'shandong', lo: 20, hi: 25, note: '「古时高不盈尺」' },
    { id: 'hebei', lo: 25, hi: 40, max: 50, note: '高者到 50' },
    { id: 'shaanxi', lo: 28, hi: 32, note: '东路大、西路小' },
    { id: 'gansu', lo: 28, hi: 32, note: '约 30 上下' },
    { id: 'henan', lo: 40, hi: 60, note: '罗山一路' },
    { id: 'hunan', lo: 55, hi: 60, note: '纸影' },
    { id: 'hubei', lo: 60, hi: 70, note: '门神谱' },
    { id: 'sichuan', lo: 60, hi: 80, max: 100, note: '大灯影，个别近 1 米' },
    { id: 'zhejiang', lo: 25, hi: 35, note: '羊皮彩绘，中等' }
  ];

  var ruler = $('#axRuler');
  if (ruler) {
    var top = 100;
    ruler.innerHTML = '<div class="ax-ruler-scale" style="margin-bottom:6px"><span></span>' +
      '<span style="display:flex;justify-content:space-between"><i>0</i><i>25</i><i>50</i><i>75</i><i>100cm</i></span><span></span></div>' +
      RANGES.map(function (r) {
        var s = schoolOf(r.id);
        if (!s) return '';
        var left = r.lo / top * 100, w = (r.hi - r.lo) / top * 100;
        var tick = r.max ? '<i style="left:' + (r.max / top * 100) + '%;width:1px;background:rgba(157,44,28,.7);position:absolute;top:-4px;bottom:-4px"></i>' : '';
        return '<div class="ax-ruler-row">' +
          '<span class="ax-ruler-name">' + esc(s.name.split(' · ')[0]) + '</span>' +
          '<span class="ax-ruler-bar"><i style="left:' + left + '%;width:' + Math.max(w, 1.2) + '%">' + tick + '</i></span>' +
          '<span class="ax-ruler-val">' + r.lo + '–' + r.hi + (r.max ? '（' + r.max + '）' : '') + '</span>' +
          '</div>';
      }).join('');
  }

  /* ==========================================================
     四 传播路线（真实省界投影）
     ========================================================== */
  var MAP = window.CN_MAP;
  var mapBox = $('#axMap');
  var routesBox = $('#axRoutes');
  var routeNote = $('#axRouteNote');
  var NS = 'http://www.w3.org/2000/svg';

  var ROUTES = [
    {
      id: 'guan', name: '出关线', color: '#dc9625', chain: ['hebei', 'liaoning'],
      desc: '清代到民国，冀东的影班沿辽西走廊出关。凌源、喀左一路唱「乐亭口」，掐嗓；再往南到岫岩、盖州，腔调沾上二人转与东北大鼓，变得短促平直。艺人把这件事叫「影人出关」。'
    },
    {
      id: 'west', name: '西行线', color: '#c70a07', chain: ['shaanxi', 'shanxi', 'gansu', 'qinghai'],
      desc: '关中影戏沿渭水往西，一支进陇东的环县、庆阳，一支北上晋南，再往西到河湟。秦腔那套脸谱规矩（黑忠、白奸、红烈、花勇）也就跟着走到了青海。'
    },
    {
      id: 'yunhe', name: '运河线', color: '#8a5a12', chain: ['hebei', 'shandong', 'zhejiang'],
      desc: '济南皮影旧称「兰州布影」，一般认为「兰州」是「滦州」的音误。沿运河南下，北方影人在浙北落了脚；南宋临安「绘革社」的余绪本就在这一带，两下碰头，海宁最后用羊皮、重彩绘，成了自己的样子。'
    },
    {
      id: 'zhongyuan', name: '中原线', color: '#5a9b7f', chain: ['henan', 'hubei'],
      desc: '豫西灵宝一路近关中，豫南桐柏、罗山一路近鄂北。方言与腔调顺着淮河、汉水走，所以罗山的影人能长到六十厘米，跟江汉平原是一个路数。'
    },
    {
      id: 'changjiang', name: '长江线', color: '#2b715d', chain: ['hubei', 'hunan', 'sichuan', 'yunnan'],
      desc: '江汉平原的影班沿江往上游。川北的大灯影做到六十到八十厘米，滇西腾冲的「靠子」皮厚人高，都能看到湖北门神谱那种大影人的影子。'
    },
    {
      id: 'lingnan', name: '岭南线', color: '#8f0503', chain: ['guangdong'],
      desc: '潮州、海陆丰一带的影戏走海路。影人小巧，签子只两三根，唱白字戏，用福佬方言，与北方三签大影人是两套系统。'
    }
  ];

  var LABEL_OFF = {
    hebei: [10, -10], shaanxi: [-12, 16], shanxi: [12, -12], gansu: [-8, -12],
    qinghai: [-14, 6], henan: [-6, 16], hubei: [12, 10], hunan: [-12, 6],
    zhejiang: [12, 4], sichuan: [-16, -6], yunnan: [-12, 8], guangdong: [12, 10],
    liaoning: [10, 4], shandong: [12, 6]
  };

  function project(lng, lat) {
    var D = Math.PI / 180, P = MAP.proj;
    var n = (Math.sin(P.p1 * D) + Math.sin(P.p2 * D)) / 2;
    var C = Math.pow(Math.cos(P.p1 * D), 2) + 2 * n * Math.sin(P.p1 * D);
    var rho0 = Math.sqrt(C - 2 * n * Math.sin(P.lat0 * D)) / n;
    var rho = Math.sqrt(C - 2 * n * Math.sin(lat * D)) / n;
    var th = n * (lng - P.lon0) * D;
    return [rho * Math.sin(th) * P.scale + P.dx, -(rho0 - rho * Math.cos(th)) * P.scale + P.dy];
  }

  function buildMap() {
    if (!mapBox || !MAP) return;
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + MAP.w + ' ' + MAP.h);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', '十四路影分布与六条传播路线示意');

    MAP.paths.forEach(function (p) {
      var el = document.createElementNS(NS, 'path');
      el.setAttribute('d', p.d);
      el.setAttribute('class', 'ax-map-prov');
      svg.appendChild(el);
    });

    /* 路线：相邻两点之间画二次曲线，控制点抬一点，像走陆路 */
    ROUTES.forEach(function (r) {
      for (var i = 0; i < r.chain.length - 1; i++) {
        var A = schoolOf(r.chain[i]), B = schoolOf(r.chain[i + 1]);
        if (!A || !B) continue;
        var a = project(A.pin[0], A.pin[1]), b = project(B.pin[0], B.pin[1]);
        var mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        var dx = b[0] - a[0], dy = b[1] - a[1];
        var cx = mx - dy * .12, cy = my + dx * .12;
        var path = document.createElementNS(NS, 'path');
        path.setAttribute('d', 'M' + a[0].toFixed(1) + ' ' + a[1].toFixed(1) +
          ' Q' + cx.toFixed(1) + ' ' + cy.toFixed(1) + ' ' + b[0].toFixed(1) + ' ' + b[1].toFixed(1));
        path.setAttribute('class', 'ax-route-line');
        path.setAttribute('stroke', r.color);
        path.setAttribute('data-route', r.id);
        svg.appendChild(path);
      }
    });

    /* 节点 */
    SD.schools.forEach(function (s) {
      var p = project(s.pin[0], s.pin[1]);
      var g = document.createElementNS(NS, 'g');
      g.setAttribute('class', 'ax-map-node');
      g.setAttribute('data-node', s.id);
      var c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', p[0].toFixed(1));
      c.setAttribute('cy', p[1].toFixed(1));
      c.setAttribute('r', 3.4);
      c.setAttribute('fill', sysOf(s.sys).color);
      c.setAttribute('stroke', 'rgba(10,8,5,.6)');
      c.setAttribute('stroke-width', '.6');
      c.setAttribute('opacity', '.82');
      g.appendChild(c);
      var t = document.createElementNS(NS, 'text');
      var off = LABEL_OFF[s.id] || [8, -8];
      t.setAttribute('x', (p[0] + off[0]).toFixed(1));
      t.setAttribute('y', (p[1] + off[1]).toFixed(1));
      t.setAttribute('text-anchor', off[0] < 0 ? 'end' : 'start');
      t.textContent = s.name.split(' · ')[0];
      g.appendChild(t);
      svg.appendChild(g);
    });

    mapBox.appendChild(svg);
  }

  function renderRoutes(active) {
    if (!routesBox) return;
    routesBox.innerHTML = ROUTES.map(function (r) {
      return '<button type="button" data-route="' + r.id + '" class="' + (r.id === active ? 'on' : '') + '" style="--c:' + r.color + '">' +
        '<i></i><span><b>' + esc(r.name) + '</b><span>' + r.chain.length + ' 地 · ' +
        r.chain.map(function (id) { var s = schoolOf(id); return s ? s.name.split(' · ')[0] : id; }).join(' → ') +
        '</span></span></button>';
    }).join('');
    $$('button', routesBox).forEach(function (b) {
      b.addEventListener('click', function () { activateRoute(b.dataset.route); });
    });
    activateRoute(active);
  }

  function activateRoute(id) {
    var r = null;
    ROUTES.forEach(function (x) { if (x.id === id) r = x; });
    if (!r) return;
    $$('.ax-route-list button').forEach(function (b) { b.classList.toggle('on', b.dataset.route === id); });
    $$('.ax-route-line').forEach(function (l) {
      var on = l.dataset.route === id;
      l.classList.toggle('on', on);
      l.setAttribute('stroke-opacity', on ? '.95' : '.2');
    });
    $$('.ax-map-node').forEach(function (n) {
      var on = r.chain.indexOf(n.dataset.node) >= 0;
      n.classList.toggle('on', on);
      var dot = n.querySelector('circle');
      if (dot) { dot.setAttribute('r', on ? 4.6 : 3.2); dot.setAttribute('opacity', on ? '1' : '.6'); }
    });
    if (routeNote) routeNote.textContent = r.desc + '（路线为示意，具体班社与艺人流动见各地说法。）';
  }

  buildMap();
  renderRoutes('guan');
})();
