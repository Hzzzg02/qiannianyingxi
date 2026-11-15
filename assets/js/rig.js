/* ==========================================================================
   千年影戏 · 可动影偶（第二三层）
   --------------------------------------------------------------------------
   第二层「拆」：把生成出来的整只影偶按骨架坐标裁成六片 ——
     头 / 躯干 / 前臂上下段 / 后臂上下段 / 前腿上下段 / 后腿上下段。
     不是 AI 语义分割，是几何裁剪：每片都用 Path2D 画一个裁剪区，
     再从同一张去白底的图上取像素，所以切缝位置完全由骨架点决定。
   第三层「缀」：每片绕自己的关节转，关节之间用父子链累加角度，
     前臂跟着上臂走、小腿跟着大腿走，和皮影的缀结一个道理。
   关节处画一枚小铆钉盖住缝，正好也是皮影的做法。

   骨架点是「人物外框里的相对坐标」（0~1），不是整图百分比 ——
   这样人物在画面里偏左偏右、大一点小一点都能对上。
   ========================================================================== */
(function () {
  'use strict';

  /* ---------------------------------------------------------------- 骨架 */
  /* 按三张实拍生成图量的：纯侧面朝右，前臂向前上举，后臂向后下伸，
     两腿前后分开。改这里就是改模板。 */
  var BONE = {
    neck:      [0.500, 0.274],
    shoulderF: [0.523, 0.417],   /* 朝前那条手臂的肩 */
    shoulderB: [0.160, 0.372],   /* 靠后那条手臂的肩 */
    elbowF:    [0.651, 0.440],
    elbowB:    [0.075, 0.488],
    wristF:    [0.880, 0.430],
    wristB:    [0.120, 0.558],
    hip:       [0.455, 0.548],
    kneeF:     [0.593, 0.821],
    kneeB:     [0.186, 0.857],
    ankleF:    [0.686, 0.952],
    ankleB:    [0.093, 0.964]
  };

  /* 裁剪带宽度（相对图宽）：
     袖子是宽大的喇叭袖、裤腿也粗，带子窄了会把袖口和裤子留在躯干层变成残片；
     手掌、脚掌在腕踝之外，末端要再甩出去一截，否则一动就掉在原地。 */
  var W_UPARM = 0.115;     /* 上臂根部：肩头够用就行，太宽会挖掉腋下的身子 */
  var W_UPARM2 = 0.165;    /* 上臂到肘这一段（宽袖最阔处） */
  var W_FORE  = 0.200;     /* 前臂（喇叭袖口） */
  var W_KNEE  = 0.125;     /* 膝盖处：只兜住小腿本身，别挖到大腿和裙摆 */
  var W_SHIN  = 0.195;     /* 踝处：裤脚和靴子要兜满 */
  var EXT_HAND = 0.080;    /* 腕外再延一截，把手掌兜进来 */
  var EXT_FOOT = 0.060;    /* 踝外再延一截，把靴子兜进来 */

  /* 关节 → 父关节（拖子级时带上父级，拖父级不带子级） */
  var PARENT = {
    foreF: 'elbowF', foreB: 'elbowB', shinF: 'kneeF', shinB: 'kneeB'
  };

  var ctxMap = {};         /* 关节 → 画布上下文键，见 paint() */

  /* ---------------------------------------------------------------- 状态 */
  var S = {
    canvas: null,
    ctx: null,
    img: null,             /* 去白后的 canvas（透明底） */
    W: 0, H: 0,
    box: null,             /* 人物外框 {x,y,w,h} */
    pts: null,             /* 实际像素坐标的骨架点 */
    view: 'rig',
    calib: false,
    drag: null,
    ang: {},               /* 每个关节的角度（弧度） */
    base: {},              /* 初始角度（由骨架点算出，不算 0） */
    anim: null,
    dpr: 1
  };

  /* ------------------------------------------------------------ 工具函数 */

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rad(d) { return d * Math.PI / 180; }

  /* 两点连成的矩形条（p1 → p2），带子两端可以不同宽（袖子就是上窄下阔） */
  function band(p1, p2, w1, w2) {
    var dx = p2[0] - p1[0], dy = p2[1] - p1[1];
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var ux = dx / len, uy = dy / len;
    var nx = -uy, ny = ux;
    var a = w1 / 2, b = (w2 == null ? w1 : w2) / 2;
    return [
      [p1[0] + nx * a, p1[1] + ny * a],
      [p2[0] + nx * b, p2[1] + ny * b],
      [p2[0] - nx * b, p2[1] - ny * b],
      [p1[0] - nx * a, p1[1] - ny * a]
    ];
  }

  /* ---------------------------------------------------------------------
     自动量衣：沿骨线垂直扫描，量出这一处衣料实际有多宽。
     固定宽度是行不通的 —— 袖口是喇叭袖、手腕是细的、裤脚又比小腿粗，
     一个数字套上去，不是留下碎布就是把身子挖出洞。
     --------------------------------------------------------------------- */
  var PIX = null;          /* 去白后整张图的像素缓存，扫描用 */

  function alphaAt(x, y) {
    var ix = Math.round(x), iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= S.W || iy >= S.H) return 0;
    return PIX[(iy * S.W + ix) * 4 + 3];
  }

  /* 向一侧扫，遇到镂空小孔要能跨过去 —— 皮影本身就是镂空的，
     一撞洞就停会把袖子切成碎片；只有连续空白够长才算真的到边。 */
  function scanHalf(x, y, nx, ny, lim) {
    var d = 0, gap = 0, step = 2, MAXGAP = 12;
    while (d < lim) {
      if (alphaAt(x + nx * d, y + ny * d) > 22) { gap = 0; d += step; }
      else {
        gap += step;
        if (gap > MAXGAP) break;
        d += step;
      }
    }
    return Math.max(0, d - gap);
  }

  /* 沿 a→b 生成贴身轮廓多边形；maxW 兜住"扫到旁边躯干"的情况 */
  function limbOutline(a, b, maxW) {
    var dx = b[0] - a[0], dy = b[1] - a[1];
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
    var N = Math.max(3, Math.round(len / 9));
    var lim = maxW / 2;
    var left = [], right = [];
    for (var i = 0; i <= N; i++) {
      var t = i / N;
      var px = a[0] + dx * t, py = a[1] + dy * t;
      var up = scanHalf(px, py, nx, ny, lim);
      var dn = scanHalf(px, py, -nx, -ny, lim);
      /* 外扩 10px：宁可多带一点背景，也不要在袖口、裤脚留碎布 */
      up = Math.max(5, up + 10); dn = Math.max(5, dn + 10);
      left.push([px + nx * up, py + ny * up]);
      right.push([px - nx * dn, py - ny * dn]);
    }
    return left.concat(right.reverse());
  }

  function outlinePath(pts) {
    var p = new Path2D();
    p.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
    p.closePath();
    return p;
  }

  var _shape = null;

  function shapes(p) {
    if (_shape && _shape.p === p) return _shape;
    var maxArm = S.W * 0.30, maxLeg = S.W * 0.30;
    var hf = extend(p.elbowF, p.wristF, EXT_HAND);
    var hb = extend(p.elbowB, p.wristB, EXT_HAND);
    var ff = extend(p.kneeF, p.ankleF, EXT_FOOT);
    var fb = extend(p.kneeB, p.ankleB, EXT_FOOT);
    _shape = {
      p: p,
      upperF: limbOutline(p.shoulderF, p.elbowF, maxArm),
      foreF: limbOutline(p.elbowF, hf, maxArm),
      upperB: limbOutline(p.shoulderB, p.elbowB, maxArm),
      foreB: limbOutline(p.elbowB, hb, maxArm),
      shinF: limbOutline(p.kneeF, ff, maxLeg),
      shinB: limbOutline(p.kneeB, fb, maxLeg)
    };
    return _shape;
  }

  function polyPath(quads, extra, holes) {
    var p = new Path2D();
    (quads || []).forEach(function (q) {
      p.moveTo(q[0][0], q[0][1]);
      for (var i = 1; i < q.length; i++) p.lineTo(q[i][0], q[i][1]);
      p.closePath();
    });
    extra && extra(p);
    return p;
  }

  /* ------------------------------------------------------------ 图片处理 */

  /* 白底转透明：**从四边往里灌**，只去掉与画面边缘连通的白色。
     早先按亮度一刀切的做法把皮影自己的白纱袖也挖空了 ——
     袖子一身的洞，后面按衣料宽度扫描就全是断点，切出来碎成渣。
     灌水法：被墨线围住的白（白脸、白纱、镂空孔）都是「里子」，一律留下。 */
  function keyOut(imgEl) {
    var c = document.createElement('canvas');
    c.width = imgEl.naturalWidth; c.height = imgEl.naturalHeight;
    var g = c.getContext('2d');
    g.drawImage(imgEl, 0, 0);
    var im = g.getImageData(0, 0, c.width, c.height);
    var a = im.data, W = c.width, H = c.height;
    var seen = new Uint8Array(W * H);
    var stack = new Int32Array(W * H);
    var sp = 0;

    function isBg(i) {
      var k = i * 4;
      var r = a[k], gg = a[k + 1], b = a[k + 2];
      var mx = r > gg ? (r > b ? r : b) : (gg > b ? gg : b);
      var mn = r < gg ? (r < b ? r : b) : (gg < b ? gg : b);
      return mx > 226 && (mx - mn) < 24;
    }
    function push(i) { if (!seen[i]) { seen[i] = 1; stack[sp++] = i; } }

    for (var x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
    for (var y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }

    while (sp > 0) {
      var i = stack[--sp];
      if (!isBg(i)) continue;
      a[i * 4 + 3] = 0;
      var cx = i % W, cy = (i - cx) / W;
      if (cx > 0) push(i - 1);
      if (cx < W - 1) push(i + 1);
      if (cy > 0) push(i - W);
      if (cy < H - 1) push(i + W);
    }
    g.putImageData(im, 0, 0);
    return c;
  }

  /* 人物外框：扫 alpha，忽略零星噪点（按行/列计数） */
  function findBox(cv) {
    var g = cv.getContext('2d');
    var w = cv.width, h = cv.height;
    var d = g.getImageData(0, 0, w, h).data;
    var minX = w, maxX = 0, minY = h, maxY = 0;
    var step = 2;
    var colCnt = new Uint32Array(w), rowCnt = new Uint32Array(h);
    for (var y = 0; y < h; y += step) {
      for (var x = 0; x < w; x += step) {
        if (d[(y * w + x) * 4 + 3] > 24) { colCnt[x]++; rowCnt[y]++; }
      }
    }
    var thC = (h / step) * 0.006, thR = (w / step) * 0.006;
    for (var i = 0; i < w; i++) { if (colCnt[i] > thC) { if (i < minX) minX = i; if (i > maxX) maxX = i; } }
    for (var j = 0; j < h; j++) { if (rowCnt[j] > thR) { if (j < minY) minY = j; if (j > maxY) maxY = j; } }
    if (minX >= maxX || minY >= maxY) return { x: 0, y: 0, w: w, h: h };
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  function toPixels(box) {
    var o = {};
    Object.keys(BONE).forEach(function (k) {
      o[k] = [box.x + BONE[k][0] * box.w, box.y + BONE[k][1] * box.h];
    });
    /* 两条腿各自的髋点：腰侧左右分一点，免得转起来打架 */
    o.hipF = [o.hip[0] + box.w * 0.035, o.hip[1] + box.h * 0.005];
    o.hipB = [o.hip[0] - box.w * 0.055, o.hip[1] + box.h * 0.005];
    return o;
  }

  /* ----------------------------------------------------------- 裁剪形状 */

  /* 沿 p1→p2 方向再甩出去 k（相对图宽），用来把手掌、靴子兜进裁剪带 */
  function extend(p1, p2, k) {
    var dx = p2[0] - p1[0], dy = p2[1] - p1[1], len = Math.sqrt(dx * dx + dy * dy) || 1;
    var px = p2[0] + dx / len * k * S.W, py = p2[1] + dy / len * k * S.W;
    return [px, py];
  }

  function clipHead(p) {
    var path = new Path2D();
    path.rect(0, 0, S.W, p.neck[1] + S.H * 0.012);
    return path;
  }

  /* 躯干：整张图挖掉头、两臂、两条小腿 —— 剩下的才是戳子本身（含裙袍） */
  function clipTorso(p) {
    var path = new Path2D();
    path.rect(0, 0, S.W, S.H);
    var sh = shapes(p);
    [sh.upperF, sh.foreF, sh.upperB, sh.foreB, sh.shinF, sh.shinB].forEach(function (poly) {
      path.moveTo(poly[0][0], poly[0][1]);
      for (var i = 1; i < poly.length; i++) path.lineTo(poly[i][0], poly[i][1]);
      path.closePath();
    });
    var hy = p.neck[1] + S.H * 0.012;
    path.moveTo(0, 0); path.lineTo(S.W, 0); path.lineTo(S.W, hy); path.lineTo(0, hy);
    path.closePath();
    return path;
  }

  /* ------------------------------------------------------------- 变换链 */

  var BASE_M = null;

  function mat(px, py, ang) {
    var m = new DOMMatrix();
    m = m.translate(px, py).rotate(ang * 180 / Math.PI).translate(-px, -py);
    return m;
  }

  function chain(list) {
    /* list: [[pivot, angle], ...] 从根到叶 */
    var m = new DOMMatrix(BASE_M);
    list.forEach(function (it) {
      m = m.multiply(mat(it[0][0], it[0][1], it[1]));
    });
    return m;
  }

  function paintPart(path, m) {
    var g = S.ctx;
    g.save();
    g.setTransform(m);
    g.clip(path);
    g.drawImage(S.img, 0, 0);
    g.restore();
  }

  /* 关节铆钉：盖住切缝，也是皮影本来的做法。
     ptDev 是「已经过变换的设备像素坐标」，所以这里必须把变换重置成 1:1 再画，
     半径按 BASE_M 的缩放系数换算，否则点会跑到左上角去。 */
  function rivet2(ptDev, rImg) {
    var g = S.ctx, k = BASE_M.a;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.beginPath();
    g.arc(ptDev[0], ptDev[1], Math.max(2, rImg * k), 0, Math.PI * 2);
    g.fillStyle = 'rgba(58, 40, 22, .82)';
    g.fill();
    g.restore();
  }

  /* ------------------------------------------------------------- 主绘制 */

  function paint() {
    var g = S.ctx;
    if (!g || !S.img) return;
    var p = S.pts, a = S.ang;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, S.canvas.width, S.canvas.height);

    var sh = shapes(p);
    var backArm = [[p.shoulderB, a.shoulderB], [p.elbowB, a.elbowB]];
    var frontArm = [[p.shoulderF, a.shoulderF], [p.elbowF, a.elbowF]];

    /* 小腿在最底 —— 裙摆（躯干层）压在上面，真皮影也是这么挡着的 */
    paintPart(outlinePath(sh.shinB), chain([[p.kneeB, a.kneeB]]));
    paintPart(outlinePath(sh.shinF), chain([[p.kneeF, a.kneeF]]));
    /* 后臂两段 */
    paintPart(outlinePath(sh.upperB), chain([backArm[0]]));
    paintPart(outlinePath(sh.foreB), chain(backArm));
    /* 躯干（含裙袍、刀、腰带） */
    paintPart(clipTorso(p), chain([]));
    /* 前臂两段 */
    paintPart(outlinePath(sh.upperF), chain([frontArm[0]]));
    paintPart(outlinePath(sh.foreF), chain(frontArm));
    /* 头 */
    paintPart(clipHead(p), chain([[p.neck, a.neck]]));

    /* 铆钉：只画在真正会转的关节上，钉住切缝 */
    var r = S.W * 0.011;
    S._riv = [];
    try {
      ['neck', 'shoulderF', 'elbowF', 'shoulderB', 'elbowB', 'kneeF', 'kneeB']
        .forEach(function (k) {
          var mv = jointScreen(k);
          S._riv.push(k + ':' + (mv ? Math.round(mv[0]) + ',' + Math.round(mv[1]) : 'null'));
          if (mv) rivet2(mv, r);
        });
    } catch (err) {
      S._err = String(err && err.message || err);
    }

    if (S.calib) drawHandles();
  }

  /* 关节在变换后的实际位置（用于画铆钉、手柄、命中测试） */
  function jointScreen(k) {
    var p = S.pts, a = S.ang;
    var m;
    switch (k) {
      case 'neck':      m = chain([[p.neck, a.neck]]); break;
      case 'shoulderF': m = chain([[p.shoulderF, a.shoulderF]]); break;
      case 'elbowF':    m = chain([[p.shoulderF, a.shoulderF], [p.elbowF, a.elbowF]]); break;
      case 'wristF':    m = chain([[p.shoulderF, a.shoulderF], [p.elbowF, a.elbowF]]); break;
      case 'shoulderB': m = chain([[p.shoulderB, a.shoulderB]]); break;
      case 'elbowB':    m = chain([[p.shoulderB, a.shoulderB], [p.elbowB, a.elbowB]]); break;
      case 'wristB':    m = chain([[p.shoulderB, a.shoulderB], [p.elbowB, a.elbowB]]); break;
      case 'hipF':      m = chain([[p.hipF, a.hipF]]); break;
      case 'kneeF':     m = chain([[p.hipF, a.hipF], [p.kneeF, a.kneeF]]); break;
      case 'ankleF':    m = chain([[p.hipF, a.hipF], [p.kneeF, a.kneeF]]); break;
      case 'hipB':      m = chain([[p.hipB, a.hipB]]); break;
      case 'kneeB':     m = chain([[p.hipB, a.hipB], [p.kneeB, a.kneeB]]); break;
      case 'ankleB':    m = chain([[p.hipB, a.hipB], [p.kneeB, a.kneeB]]); break;
      default: return null;
    }
    var x = p[k], v = m.transformPoint(new DOMPoint(x[0], x[1]));
    return [v.x, v.y];
  }

  /* 图坐标 → 屏幕坐标 */
  function toScreen(x, y) {
    var v = BASE_M.transformPoint(new DOMPoint(x, y));
    return [v.x / S.dpr, v.y / S.dpr];
  }

  function drawHandles() {
    var g = S.ctx;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    Object.keys(S.pts).forEach(function (k) {
      var s = toScreen(S.pts[k][0], S.pts[k][1]);
      g.beginPath();
      g.arc(s[0] * S.dpr, s[1] * S.dpr, 7 * S.dpr, 0, Math.PI * 2);
      g.fillStyle = 'rgba(168, 31, 28, .85)';
      g.fill();
      g.lineWidth = 2 * S.dpr;
      g.strokeStyle = 'rgba(255, 253, 247, .95)';
      g.stroke();
    });
    g.restore();
  }

  /* --------------------------------------------------------------- 尺寸 */

  function fit() {
    var cv = S.canvas;
    var rect = cv.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var cw = Math.round(rect.width), ch = Math.round(rect.height);
    if (!cw || !ch) return;
    cv.width = Math.round(cw * dpr);
    cv.height = Math.round(ch * dpr);
    S.dpr = dpr;
    var k = Math.min(cw / S.W, ch / S.H) * dpr;
    var ox = (cw * dpr - S.W * k) / 2, oy = (ch * dpr - S.H * k) / 2;
    BASE_M = new DOMMatrix().translate(ox, oy).scale(k);
    paint();
  }

  /* --------------------------------------------------------------- 交互 */

  function hit(x, y) {
    /* x,y 为屏幕像素（未乘 dpr） */
    var best = null, bd = 1e9;
    Object.keys(S.pts).forEach(function (k) {
      var s = toScreen(S.pts[k][0], S.pts[k][1]);
      var d = Math.hypot(s[0] - x, s[1] - y);
      if (d < bd) { bd = d; best = k; }
    });
    return { key: best, dist: bd };
  }

  function angleOf(pivot, sx, sy) {
    var ps = toScreen(pivot[0], pivot[1]);
    return Math.atan2(sy - ps[1], sx - ps[0]);
  }

  function onDown(e) {
    var r = S.canvas.getBoundingClientRect();
    var x = e.clientX - r.left, y = e.clientY - r.top;
    if (S.calib) {
      var h = hit(x, y);
      if (h.key && h.dist < 26) {
        S.drag = { kind: 'calib', key: h.key };
        S.canvas.setPointerCapture(e.pointerId);
        e.preventDefault();
      }
      return;
    }
    /* 拖动摆姿：就近选一个关节，算它到指针的角度差 */
    var ks = ['wristF', 'wristB', 'ankleF', 'ankleB', 'elbowF', 'elbowB',
              'kneeF', 'kneeB', 'neck', 'shoulderF', 'shoulderB'];
    var pick = null, bd = 1e9;
    ks.forEach(function (k) {
      var j = jointScreen(k);
      var s = toScreen(j[0], j[1]);
      var d = Math.hypot(s[0] - x, s[1] - y);
      if (d < bd) { bd = d; pick = k; }
    });
    if (!pick) return;
    var pivotKey = PARENT[pick] || pick;
    var pivot = S.pts[pivotKey];
    S.drag = {
      kind: 'pose', key: pick, pivot: pivot,
      a0: angleOf(pivot, x, y),
      base: S.ang[pick],
      limit: pick === 'neck' ? rad(34) : 0
    };
    stopAnim();
    S.canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function onMove(e) {
    if (!S.drag) return;
    var r = S.canvas.getBoundingClientRect();
    var x = e.clientX - r.left, y = e.clientY - r.top;
    if (S.drag.kind === 'calib') {
      var v = new DOMMatrix(BASE_M).inverse().transformPoint(new DOMPoint(x * S.dpr, y * S.dpr));
      S.pts[S.drag.key] = [clamp(v.x, 0, S.W), clamp(v.y, 0, S.H)];
      /* 骨架动了，裁剪轮廓要重扫 */
      _shape = null;
      paint();
      return;
    }
    var a1 = angleOf(S.drag.pivot, x, y);
    var d = a1 - S.drag.a0;
    /* 归一化到 -180..180 */
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    var want = S.drag.base + d;
    if (S.drag.limit) want = clamp(want, -S.drag.limit, S.drag.limit);
    S.ang[S.drag.key] = want;
    paint();
  }

  function onUp() {
    S.drag = null;
  }

  /* ------------------------------------------------------------- 预设动作 */

  var ACT = {
    stand: { n: '站定', kf: [{ t: 0, a: {} }] },
    shili: { n: '行礼', kf: [
      { t: 0, a: {} },
      { t: 420, a: { neck: 10, shoulderF: -26, elbowF: -16, shoulderB: 8, hipF: -4, kneeF: 4 } },
      { t: 900, a: { neck: 10 } },
      { t: 1500, a: {} }
    ] },
    zoutai: { n: '走台', kf: [
      { t: 0, a: { hipF: 16, kneeF: -8, hipB: -14, shoulderF: -8, shoulderB: 10 } },
      { t: 380, a: { hipF: -12, kneeF: 10, hipB: 14, shoulderF: 6, shoulderB: -8 } },
      { t: 760, a: { hipF: 16, kneeF: -8, hipB: -14, shoulderF: -8, shoulderB: 10 } },
      { t: 1140, a: { hipF: -12, kneeF: 10, hipB: 14, shoulderF: 6, shoulderB: -8 } },
      { t: 1520, a: {} }
    ] },
    kaida: { n: '开打', kf: [
      { t: 0, a: {} },
      { t: 240, a: { neck: -6, shoulderF: -52, elbowF: -30, shoulderB: 26, hipF: -14, kneeF: 12, hipB: 8 } },
      { t: 700, a: { neck: -6, shoulderF: -18, elbowF: 12, shoulderB: 34 } },
      { t: 1100, a: { neck: -6, shoulderF: -58, elbowF: -34, shoulderB: 20 } },
      { t: 1600, a: {} }
    ] },
    zuoyi: { n: '整冠', kf: [
      { t: 0, a: {} },
      { t: 400, a: { shoulderF: -46, elbowF: -34, neck: 6 } },
      { t: 900, a: { shoulderF: -40, elbowF: -46 } },
      { t: 1500, a: {} }
    ] }
  };

  function stopAnim() {
    if (S.anim) { cancelAnimationFrame(S.anim); S.anim = null; }
  }

  function play(name) {
    var act = ACT[name];
    if (!act) return;
    stopAnim();
    var from = {};
    Object.keys(S.ang).forEach(function (k) { from[k] = S.ang[k]; });
    var t0 = performance.now();
    var lastT = 0;
    var total = act.kf[act.kf.length - 1].t;

    function ease(u) { return u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; }

    function step(now) {
      var el = now - t0;
      if (el >= total) {
        /* 收尾回原姿势 */
        Object.keys(S.base).forEach(function (k) { S.ang[k] = S.base[k]; });
        paint(); S.anim = null; return;
      }
      /* 找当前区间 */
      var i = 0;
      while (i < act.kf.length - 1 && act.kf[i + 1].t < el) i++;
      var A = act.kf[i], B = act.kf[i + 1];
      var u = ease(clamp((el - A.t) / Math.max(1, B.t - A.t), 0, 1));
      Object.keys(S.base).forEach(function (k) {
        var av = A.a[k] != null ? rad(A.a[k]) : S.base[k];
        var bv = B.a[k] != null ? rad(B.a[k]) : S.base[k];
        S.ang[k] = av + (bv - av) * u;
      });
      paint();
      S.anim = requestAnimationFrame(step);
    }
    S.anim = requestAnimationFrame(step);
  }

  /* --------------------------------------------------------------- 装配 */

  function mount(canvas, url, done) {
    S.canvas = canvas;
    S.ctx = canvas.getContext('2d');
    var im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = function () {
      S.img = keyOut(im);
      S.W = S.img.width; S.H = S.img.height;
      /* 缓存一份像素，供「按衣料实际宽度裁剪」逐点扫描 */
      var g0 = S.img.getContext('2d');
      PIX = g0.getImageData(0, 0, S.W, S.H).data;
      _shape = null;
      S.box = findBox(S.img);
      S.pts = toPixels(S.box);
      S.ang = {}; S.base = {};
      ['neck', 'shoulderF', 'elbowF', 'shoulderB', 'elbowB',
       'hipF', 'kneeF', 'hipB', 'kneeB'].forEach(function (k) { S.ang[k] = 0; S.base[k] = 0; });
      fit();
      canvas.classList.add('on');
      canvas.addEventListener('pointerdown', onDown);
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerup', onUp);
      canvas.addEventListener('pointercancel', onUp);
      window.addEventListener('resize', fit);
      done && done();
    };
    im.onerror = function () { done && done(new Error('图没载入')); };
    im.src = url;
    return S;
  }

  function setCalib(on) {
    S.calib = !!on;
    S.canvas.classList.toggle('calib', S.calib);
    paint();
  }

  function reset() {
    Object.keys(S.base).forEach(function (k) { S.ang[k] = S.base[k]; });
    stopAnim();
    paint();
  }

  function bonePoints() {
    var o = {};
    Object.keys(S.pts).forEach(function (k) {
      o[k] = [
        (S.pts[k][0] - S.box.x) / S.box.w,
        (S.pts[k][1] - S.box.y) / S.box.h
      ];
    });
    return o;
  }

  window.RIG = {
    mount: mount,
    paint: function () { paint(); },
    fit: fit,
    setCalib: setCalib,
    reset: reset,
    play: play,
    actions: ACT,
    bonePoints: bonePoints,
    jointScreen: jointScreen,
    state: S
  };
})();
