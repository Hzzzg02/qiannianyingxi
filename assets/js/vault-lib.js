/* ==========================================================================
   影藏（collection.html）· 藏品影像录
   三级筛选：类别 → 地域 → 行当/细类，点开任一张即见该件著录弹层。
   数据来自 assets/data/library-data.js（window.LIB_DATA）。
   ========================================================================== */
(function () {
  'use strict';
  var D = window.LIB_DATA;
  var grid = document.getElementById('lib-grid');
  if (!D || !grid) return;

  // 标题与计数一律由数据决定，避免和实际帧数脱节
  var tcnEl = document.getElementById('lib-total-cn');
  if (tcnEl) tcnEl.textContent = D.total_cn || D.total;

  var catsEl = document.getElementById('lib-cats');
  var provEl = document.getElementById('lib-prov');
  var numEl  = document.getElementById('lib-num');

  var lb      = document.getElementById('lb');
  var lbImg   = document.getElementById('lb-img');
  var lbPic   = document.getElementById('lb-pic');
  var lbTag   = document.getElementById('lb-tag');
  var lbKick  = document.getElementById('lb-kick');
  var lbName  = document.getElementById('lb-name');
  var lbDesc  = document.getElementById('lb-desc');
  var lbMeta  = document.getElementById('lb-meta');
  var lbLinks = document.getElementById('lb-links');
  var lbIdx   = document.getElementById('lb-idx');
  var lbInfo  = document.getElementById('lb-info');
  var lbNote  = document.getElementById('lb-note');
  var lbX     = document.getElementById('lb-x');
  var subEl   = document.getElementById('lib-sub');

  var st = { c: 'all', p: 'all', s: 'all' };
  var view = [], at = 0, lastCard = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m];
    });
  }
  function pad(v) { return (v < 10 ? '0' : '') + v; }
  /* 藏品图版本号：同名校验覆盖后，用版本号强制浏览器丢弃 30 天 immutable 缓存 */
  var IMG_VER = '2512d';
  function src(p) { return 'assets/img/lib/' + String(p).replace(/^images\//, '').replace(/\\/g, '/') + '?v=' + IMG_VER; }

  /* ---------- 一级：类别 ---------- */
  var ch = '<button class="chip' + (st.c === 'all' ? ' on' : '') + '" data-c="all" type="button">全部<i>' + D.total + '</i></button>';
  D.cats.forEach(function (c) {
    ch += '<button class="chip" data-c="' + esc(c.k) + '" type="button" title="' + esc(c.d) + '">' +
          esc(c.lb) + '<i>' + c.n + '</i></button>';
  });
  catsEl.innerHTML = ch;
  var catBtns = Array.prototype.slice.call(catsEl.querySelectorAll('.chip'));

  catsEl.addEventListener('click', function (e) {
    var b = e.target.closest('.chip');
    if (!b) return;
    st.c = b.getAttribute('data-c');
    st.p = 'all'; st.s = 'all';
    syncCats(); renderProv(); renderSub(); render();
  });
  function syncCats() {
    catBtns.forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-c') === st.c); });
  }

  /* ---------- 二级：地域 ---------- */
  function renderProv() {
    var cnt = {}, total = 0;
    D.items.forEach(function (it) {
      if (st.c !== 'all' && it.c !== st.c) return;
      cnt[it.p] = (cnt[it.p] || 0) + 1; total++;
    });
    if (st.p !== 'all' && !cnt[st.p]) st.p = 'all';

    var h = '<span>地域</span><button class="chip sm' + (st.p === 'all' ? ' on' : '') +
            '" data-p="all" type="button">不限<i>' + total + '</i></button>';
    D.provs.forEach(function (pv) {
      var p = pv[0], n = cnt[p];
      if (!n) return;
      h += '<button class="chip sm' + (st.p === p ? ' on' : '') + '" data-p="' + esc(p) +
           '" type="button">' + esc(p.replace(/省$|市$/, '')) + '<i>' + n + '</i></button>';
    });
    provEl.innerHTML = h;
  }
  provEl.addEventListener('click', function (e) {
    var b = e.target.closest('.chip');
    if (!b) return;
    st.p = b.getAttribute('data-p');
    renderProv(); renderSub(); render();
  });

  /* ---------- 三级：行当 / 细类 ---------- */
  function renderSub() {
    var rows = st.c !== 'all' && D.subs[st.c] ? D.subs[st.c] : null;
    if (!rows || rows.length < 2) {
      subEl.hidden = true; subEl.innerHTML = ''; st.s = 'all';
      return;
    }
    var names = rows.map(function (r) { return r[0]; });
    if (st.s !== 'all' && names.indexOf(st.s) < 0) st.s = 'all';

    var cnt = {}, total = 0;
    D.items.forEach(function (it) {
      if (it.c !== st.c) return;
      if (st.p !== 'all' && it.p !== st.p) return;
      cnt[it.sk] = (cnt[it.sk] || 0) + 1; total++;
    });

    var h = '<span>行当</span><button class="chip sm' + (st.s === 'all' ? ' on' : '') +
            '" data-s="all" type="button">不限<i>' + total + '</i></button>';
    rows.forEach(function (r) {
      var n = cnt[r[0]] || 0;
      if (!n) return;
      var label = r[0].split(' · ').slice(1).join('·') || r[0];
      h += '<button class="chip sm' + (st.s === r[0] ? ' on' : '') + '" data-s="' + esc(r[0]) +
           '" type="button" title="' + esc(D.notes[r[0]] || '') + '">' + esc(label) +
           '<i>' + n + '</i></button>';
    });
    subEl.innerHTML = h;
    subEl.hidden = false;
  }
  subEl.addEventListener('click', function (e) {
    var b = e.target.closest('.chip');
    if (!b) return;
    st.s = b.getAttribute('data-s');
    renderSub(); render();
  });

  /* ---------- 列表 ---------- */
  function render() {
    view = D.items.filter(function (it) {
      return (st.c === 'all' || it.c === st.c) &&
             (st.p === 'all' || it.p === st.p) &&
             (st.s === 'all' || it.sk === st.s);
    });
    numEl.textContent = view.length;

    if (!view.length) {
      grid.innerHTML = '<p class="lib-empty">这一类暂无馆藏实物图。</p>';
      return;
    }

    var out = '';
    for (var i = 0; i < view.length; i++) {
      var it = view[i];
      var sub = it.c + ' · ' + (it.a || '年代未著录');
      out += '<button class="lc" type="button" data-k="' + i + '" aria-label="' +
             esc(it.n + '，' + it.cf + '，打开著录') + '">' +
             '<span class="lc-pic"><img src="' + esc(src(it.s)) + '" width="' + (it.w || 3) +
             '" height="' + (it.h || 4) + '" alt="' +
             esc(it.n + '，' + (it.a || '') + '，' + (it.r || '')) + '" loading="lazy" decoding="async"></span>' +
             '<span class="lc-txt"><b>' + esc(it.n) + '</b><i>' + esc(sub) + '</i></span>' +
             '</button>';
    }
    grid.innerHTML = out;
  }

  /* ---------- 弹层 ---------- */
  function open(k) {
    var it = view[k];
    if (!it) return;
    at = k;

    lbImg.src = src(it.s);
    lbImg.alt = it.n + '，' + (it.a || '') + '，' + (it.r || '');
    lbTag.textContent = it.i ? 'No. ' + it.i : '';
    lbKick.textContent = it.cf;
    lbName.textContent = it.n;
    lbNote.textContent = D.notes[it.sk] || '';
    lbDesc.textContent = it.d || '馆方此件未附说明。';

    var rows = it.c === '影卷'
      ? [['类别', it.cf], ['年代', it.a], ['地域', it.r], ['抄写', it.o], ['藏地', '中国美术学院民艺博物馆'], ['馆藏号', it.i]]
      : [['类别', it.cf], ['年代', it.a], ['地域', it.r], ['尺寸', it.z], ['材质', it.m], ['完残', it.k], ['来源', it.o], ['馆藏记录', it.i]];

    var m = '';
    rows.forEach(function (r) {
      if (!r[1]) return;
      m += '<dt>' + r[0] + '</dt><dd>' + esc(r[1]) + '</dd>';
    });
    lbMeta.innerHTML = m;

    var lk = '';
    if (it.u) lk += '<a href="' + esc(it.u) + '" target="_blank" rel="noopener">' + esc(it.ut || '馆藏记录') + ' ↗</a>';
    if (it.u2) lk += '<a href="' + esc(it.u2) + '" target="_blank" rel="noopener">' + esc(it.u2t || '原始大图') + ' ↗</a>';
    lbLinks.innerHTML = lk;

    lbIdx.textContent = pad(k + 1) + ' / ' + pad(view.length);
    lbInfo.scrollTop = 0;
    lb.hidden = false;
    document.body.classList.add('lb-open');
    document.getElementById('lb-panel').focus({ preventScroll: true });
  }

  function close() {
    lb.hidden = true;
    document.body.classList.remove('lb-open');
    if (lastCard) { lastCard.focus({ preventScroll: true }); lastCard = null; }
  }

  function step(d) {
    if (lb.hidden || !view.length) return;
    open((at + d + view.length) % view.length);
  }

  grid.addEventListener('click', function (e) {
    var card = e.target.closest('.lc');
    if (!card) return;
    lastCard = card;
    open(+card.getAttribute('data-k'));
  });

  lbX.addEventListener('click', close);
  lb.addEventListener('click', function (e) {
    if (e.target.hasAttribute('data-close')) close();
  });
  document.getElementById('lb-prev').addEventListener('click', function () { step(-1); });
  document.getElementById('lb-next').addEventListener('click', function () { step(1); });

  document.addEventListener('keydown', function (e) {
    if (lb.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    else if (e.key === 'Tab') {
      var f = lb.querySelectorAll('button, a[href]');
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  var tx = 0, ty = 0;
  lbPic.addEventListener('touchstart', function (e) { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
  lbPic.addEventListener('touchend', function (e) {
    var dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dx) > 46 && Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? 1 : -1);
  }, { passive: true });

  renderProv();
  renderSub();
  render();
})();
