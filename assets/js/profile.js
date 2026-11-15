/* ==========================================================================
   个人中心（profile.html）

   页面上没有一条预置内容：
     · 名号、邮箱、入班日期、个性签名 —— 来自 /api/me（服务端 db.json），
       断网时退回 localStorage 里那份副本，并明说「只存在这台机器上」
     · 影窗上的画 —— 读 qnyx.gen.v1，与「影偶制作 · 画过的」是同一处
     · 圈子 / 发的帖 / 回的楼 —— 现算，读 qnyx.comm.v1 与 qnyx.comm.u
   ========================================================================== */
(function () {
  'use strict';

  var API = '/api';
  var UKEY = 'qnyx.user';
  var WKEY = 'qnyx.gen.v1';
  var CKEY = 'qnyx.comm.v1';
  var CUKEY = 'qnyx.comm.u';
  var SIGN_MAX = 24;

  /* 开吧时随手能给的那几句，点了就题上，不当成「已有签名」 */
  var SIGS = [
    '一盏灯，一张皮。',
    '学刻第三年，先学不着急。',
    '台上一句，台下十年灯。',
    '皮子认手，不认嘴。',
    '影在窗上，人在窗后。'
  ];


  var U = null;                 /* 登录态副本（写回 localStorage） */
  var S = { sig: '', online: true, lb: -1 };

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return [].slice.call((r || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function readJSON(k, dflt) {
    try {
      var v = JSON.parse(localStorage.getItem(k) || 'null');
      return v == null ? dflt : v;
    } catch (e) { return dflt; }
  }
  function writeJSON(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
  }

  /* ---------------- 提示条 ---------------- */
  var tTimer = null;
  function toast(msg) {
    var box = $('#pcToast');
    if (!box) return;
    box.textContent = msg;
    box.classList.add('is-on');
    clearTimeout(tTimer);
    tTimer = setTimeout(function () { box.classList.remove('is-on'); }, 2800);
  }

  /* ---------------- 请求 ---------------- */
  function api(path, opt) {
    opt = opt || {};
    var init = { method: opt.method || 'GET', credentials: 'same-origin', cache: 'no-store' };
    if (opt.body !== undefined) {
      init.headers = { 'Content-Type': 'application/json' };
      init.body = JSON.stringify(opt.body);
    }
    return fetch(API + path, init).then(function (r) {
      return r.text().then(function (t) {
        var j;
        try { j = t ? JSON.parse(t) : {}; } catch (e) { j = { ok: false, error: '返回格式异常' }; }
        if (!r.ok || j.ok === false) {
          var err = new Error(j.error || '请求失败（' + r.status + '）');
          err.status = r.status;
          throw err;
        }
        return j;
      });
    }, function () {
      var err = new Error('连不上后端');
      err.offline = true;
      throw err;
    });
  }

  /* ---------------- 小格式化 ---------------- */
  function maskMail(m) {
    if (!m) return '';
    var at = m.indexOf('@');
    if (at < 1) return m;
    return m.slice(0, Math.min(2, at)) + '***' + m.slice(at);
  }
  function fmtDay(ts) {
    var d = new Date(ts);
    return d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日';
  }
  function fmtShort(ts) {
    var d = new Date(ts);
    return (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日';
  }
  function ago(ts) {
    if (!ts) return '—';
    var m = Math.round((Date.now() - ts) / 60000);
    if (m < 1) return '刚刚';
    if (m < 60) return m + ' 分钟前';
    if (m < 1440) return Math.floor(m / 60) + ' 小时前';
    if (m < 43200) return Math.floor(m / 1440) + ' 天前';
    return Math.floor(m / 43200) + ' 个月前';
  }

  /* ==========================================================================
     名帖
     ========================================================================== */
  function paintIdentity() {
    var n = U.name || '影友';
    var seal = $('[data-pc-seal]');
    if (seal) seal.textContent = n.slice(0, 1);
    var nm = $('[data-pc-name]');
    if (nm) nm.textContent = n;
    var hd = $('[data-pc-handle]');
    if (hd) hd.textContent = '@' + n;

    var mail = U.emailMask || maskMail(U.email) || '—';
    $$('[data-pc-mail], [data-pc-mail2]').forEach(function (el) { el.textContent = mail; });

    var since = $('[data-pc-since]');
    if (since) {
      if (U.created) since.textContent = fmtDay(U.created);
      else if (U.since) since.textContent = U.since;
      else since.textContent = '—';
    }
    var nm2 = $('[data-pc-name2]');
    if (nm2) nm2.textContent = n;

    /* 顶栏那枚头像也顺手换掉，免得改完名上下一新一旧 */
    var av = $('[data-user-av]');
    if (av) av.textContent = n.slice(0, 1);
    var tx = $('[data-user-name]');
    if (tx) tx.textContent = n;
  }

  /* ==========================================================================
     个性签名
     ========================================================================== */
  function paintSig() {
    var line = $('[data-sg-line]');
    var paper = $('#sgPaper');
    var quote = $('[data-pc-quote]');
    if (!line) return;

    if (S.sig) {
      line.textContent = S.sig;
      if (paper) paper.classList.add('has-sig');
      if (quote) { quote.textContent = S.sig; quote.classList.remove('is-empty'); }
    } else {
      line.innerHTML = '<span class="sg-empty">还没题签。挑一句，或者自己写。</span>';
      if (paper) paper.classList.remove('has-sig');
      if (quote) { quote.textContent = '还没题签'; quote.classList.add('is-empty'); }
    }

    $$('#sgChips button').forEach(function (b) {
      b.classList.toggle('is-on', b.getAttribute('data-sig') === S.sig);
    });
  }

  function buildChips() {
    var box = $('#sgChips');
    if (!box) return;
    box.innerHTML = SIGS.map(function (s) {
      return '<button type="button" data-sig="' + esc(s) + '">' + esc(s) + '</button>';
    }).join('');
    box.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-sig]');
      if (!b) return;
      closeEditor();                       /* 编辑器开着时点了签语，先收起来，免得留着一份旧草稿 */
      saveSig(b.getAttribute('data-sig'));
    });
  }

  var sigBusy = false;
  function saveSig(v) {
    v = String(v || '').replace(/\s+/g, ' ').trim().slice(0, SIGN_MAX);
    if (v === S.sig) { toast(v ? '已经是这一句了' : '还没题签'); return; }
    if (sigBusy) return;
    sigBusy = true;

    S.sig = v;
    U.signature = v;
    writeJSON(UKEY, U);
    paintSig();

    api('/me', { method: 'PATCH', body: { signature: v } }).then(function (j) {
      S.online = true;
      if (j.user) {
        U.signature = j.user.signature || '';
        S.sig = U.signature;
        writeJSON(UKEY, U);
        paintSig();
      }
      setSigNote(true);
      toast(v ? '题上了' : '题签撤掉了');
    }).catch(function (e) {
      if (e.offline || !e.status) {
        S.online = false;
        setSigNote(false);
        toast('后端没连上，这一句先存在这台机器上');
      } else if (e.status === 401) {
        toast('登录已失效，这一句只留在这台机器上');
      } else {
        toast(e.message || '没存进账号');
      }
    }).then(function () { sigBusy = false; });
  }

  function setSigNote(online) {
    var el = $('#sgNote');
    if (!el) return;
    el.textContent = online
      ? '签在账号上：换台机器登录，还是这一句。点上面任意一句就直接题上，随时能换。'
      : '后端没连上，这会儿题的签只存在这台机器上；等后端起来，再点一次同样的句子就能存进账号。';
  }

  function openEditor() {
    var box = $('#sgEdit');
    var inp = $('#sgInput');
    if (!box || !inp) return;
    box.hidden = false;
    inp.value = S.sig;
    countSig();
    inp.focus();
    inp.setSelectionRange(inp.value.length, inp.value.length);
  }
  function closeEditor() {
    var box = $('#sgEdit');
    if (box) box.hidden = true;
  }
  function countSig() {
    var v = ($('#sgInput').value || '');
    var el = $('#sgCount');
    if (el) el.textContent = v.length + ' / ' + SIGN_MAX;
  }

  function bindSign() {
    var form = $('#sgEdit');
    var wr = $('[data-sg-write]');
    var cc = $('[data-sg-cancel]');
    var go = $('[data-go-sign]');
    var inp = $('#sgInput');

    if (wr) wr.addEventListener('click', function () {
      if (form && !form.hidden) { closeEditor(); return; }
      openEditor();
    });
    if (cc) cc.addEventListener('click', closeEditor);
    if (go) go.addEventListener('click', function () {
      var block = $('#pcSign');
      if (block) block.scrollIntoView({ behavior: 'smooth', block: 'center' });
      openEditor();
    });
    if (inp) {
      inp.addEventListener('input', countSig);
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeEditor();
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          if (form) form.requestSubmit ? form.requestSubmit() : form.submit();
        }
      });
    }
    if (form) form.addEventListener('submit', function (e) {
      e.preventDefault();
      saveSig($('#sgInput').value);
      closeEditor();
    });
  }

  /* ==========================================================================
     我的皮影墙
     ========================================================================== */
  function readWall() {
    var a = readJSON(WKEY, []);
    return Array.isArray(a) ? a : [];
  }
  function writeWall(a) { writeJSON(WKEY, a.slice(0, 18)); }

  function emptyWall() {
    return '<div class="pw-empty">' +
      '<div class="pw-hooks"><span class="pw-hook"></span><span class="pw-hook"></span><span class="pw-hook"></span></div>' +
      '<p class="pw-e-t">影窗还空着</p>' +
      '<p class="pw-e-n">去「影偶制作」挑一路流派、定个行当、写一句话，画出来的影偶就挂到这儿。</p>' +
      '<a class="btn" href="craft.html">去画第一张</a>' +
      '</div>';
  }

  function paintWall() {
    var g = $('#pwGrid');
    if (!g) return;
    var list = readWall();

    var cnt = $('#pwCount');
    if (cnt) cnt.textContent = list.length + ' 张';
    $$('[data-n-wall], [data-c-wall]').forEach(function (el) { el.textContent = list.length; });

    if (!list.length) { g.innerHTML = emptyWall(); return; }

    g.innerHTML = list.map(function (x, i) {
      return '<figure class="pw-i" data-i="' + i + '">' +
        '<span class="pw-peg" aria-hidden="true"></span>' +
        '<button class="pw-x" type="button" data-x="' + i + '" title="从墙上取下">×</button>' +
        '<div class="pw-pic"><img src="' + esc(x.url) + '" alt="' + esc(x.meta || '影偶') + '" loading="lazy"></div>' +
        '<figcaption><b>' + esc(x.meta || '影偶') + '</b>' +
        '<i>' + (x.t ? fmtShort(x.t) : '') + '</i></figcaption>' +
        '</figure>';
    }).join('') +
      /* 末尾留一个空格子，墙上不满三张时也不会缺一角 */
      '<a class="pw-add" href="craft.html">' +
      '<span class="pw-add-plus">＋</span>' +
      '<span class="pw-add-t">再画一张</span>' +
      '<span class="pw-add-n">挂在影窗上</span>' +
      '</a>';

    $$('.pw-i', g).forEach(function (f) {
      var i = +f.getAttribute('data-i');
      var img = $('img', f);
      if (img) img.addEventListener('error', function () {
        f.classList.add('is-bad');
        $('.pw-pic', f).innerHTML = '<span class="pw-bad">这张图找不到了<br>可能清过缓存</span>';
      });
      f.addEventListener('click', function (e) {
        if (e.target.closest('.pw-x')) return;
        openLb(i);
      });
    });

    /* 取下是两步：先按一下变红问一句，再按才真删——省得手滑 */
    $$('.pw-x', g).forEach(function (b) {
      var t = null;
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        var i = +b.getAttribute('data-x');
        if (!b.classList.contains('is-arm')) {
          b.classList.add('is-arm');
          b.textContent = '取下？';
          clearTimeout(t);
          t = setTimeout(function () {
            b.classList.remove('is-arm');
            b.textContent = '×';
          }, 3400);
          return;
        }
        clearTimeout(t);
        removeAt(i);
      });
    });
  }

  function removeAt(i) {
    var a = readWall();
    if (i < 0 || i >= a.length) return;
    a.splice(i, 1);
    writeWall(a);
    paintWall();
    toast('已从影窗上取下（「画过的」里也删掉了）');
  }

  /* ---------- 灯下看 ---------- */
  function openLb(i) {
    var a = readWall();
    var x = a[i];
    if (!x) return;
    S.lb = i;

    var img = $('#pwlImg');
    if (img) { img.src = x.url; img.alt = x.meta || '影偶'; }
    var meta = $('#pwlMeta');
    if (meta) meta.textContent = x.meta || '影偶';
    var when = $('#pwlWhen');
    if (when) when.textContent = x.t ? fmtDay(x.t) : '—';

    var desc = $('#pwlDesc');
    if (desc) {
      desc.textContent = x.desc || '';
      desc.hidden = !x.desc;
    }
    var pr = $('#pwlPrompt');
    if (pr) pr.textContent = x.prompt || '这张没留下那句话。';

    var lb = $('#pwl');
    if (lb) lb.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeLb() {
    var lb = $('#pwl');
    if (lb) lb.hidden = true;
    document.body.style.overflow = '';
    S.lb = -1;
  }

  function bindLb() {
    $$('[data-close]').forEach(function (el) { el.addEventListener('click', closeLb); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && S.lb >= 0) closeLb();
    });

    var dl = $('#pwlDl');
    if (dl) dl.addEventListener('click', function () {
      var a = readWall();
      var x = a[S.lb];
      if (!x) return;
      var link = document.createElement('a');
      link.href = x.url;
      link.download = '影偶-' + String(x.meta || '未命名').replace(/[\\/:*?"<>|\s·]+/g, '-') + '.png';
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast('已存到本地');
    });

    var del = $('#pwlDel');
    if (del) del.addEventListener('click', function () {
      var i = S.lb;
      closeLb();
      removeAt(i);
    });
  }

  /* ==========================================================================
     我在社区
     ========================================================================== */
  function paintComm() {
    var d = readJSON(CKEY, { circles: [] }) || { circles: [] };
    var us = readJSON(CUKEY, {}) || {};
    var me = U.name;
    var circles = [], posts = [], replies = [], nReply = 0;

    (d.circles || []).forEach(function (c) {
      var st = us[c.id] || {};
      if (c.owner === me || st.join) circles.push(c);

      (c.posts || []).forEach(function (t) {
        if (t.author === me) posts.push({ c: c, t: t });
        var mine = (t.floors || []).slice(1).filter(function (f) { return f.u === me; }).length;
        if (mine) { replies.push({ c: c, t: t, n: mine }); nReply += mine; }
      });
    });

    posts.sort(function (a, b) { return (b.t.at || 0) - (a.t.at || 0); });
    replies.sort(function (a, b) { return (b.t.at || 0) - (a.t.at || 0); });
    circles.sort(function (a, b) { return (b.at || 0) - (a.at || 0); });

    setNum('[data-n-post], [data-c-post]', posts.length);
    setNum('[data-n-reply], [data-c-reply]', nReply);
    setNum('[data-n-circle], [data-c-circle]', circles.length);

    var lc = $('#pcCircles');
    if (lc) {
      lc.innerHTML = circles.length ? circles.map(function (c) {
        var n = (c.posts || []).length;
        return '<li><a class="pc-cir" href="community.html#/c/' + esc(c.id) + '">' +
          '<i>' + esc(c.seal || String(c.name || '吧').slice(0, 1)) + '</i>' +
          '<span>' + esc(c.name) + '吧</span></a>' +
          '<span class="pc-sub">' + (c.owner === me ? '你开的' : '你关注的') +
          ' · ' + n + ' 帖' + (c.at ? ' · ' + fmtShort(c.at) : '') + '</span></li>';
      }).join('') : '<li class="pc-none">还没开过吧，也没关注过别人的。</li>';
    }

    var lp = $('#pcPosts');
    if (lp) {
      lp.innerHTML = posts.length ? posts.slice(0, 6).map(function (o) {
        var fl = (o.t.floors || []).length - 1;
        return '<li><a href="community.html#/t/' + esc(o.t.id) + '">' + esc(o.t.title) + '</a>' +
          '<span class="pc-sub">在「' + esc(o.c.name) + '吧」· ' + Math.max(0, fl) + ' 回复 · ' + ago(o.t.at) + '</span></li>';
      }).join('') : '<li class="pc-none">还没发过帖。</li>';
    }

    var note = $('#pcCommNote');
    if (note) note.hidden = !!(circles.length || posts.length || replies.length);

    var lr = $('#pcReplies');
    if (lr) {
      lr.innerHTML = replies.length ? replies.slice(0, 6).map(function (o) {
        return '<li><a href="community.html#/t/' + esc(o.t.id) + '">' + esc(o.t.title) + '</a>' +
          '<span class="pc-sub">在「' + esc(o.c.name) + '吧」· 回过 ' + o.n + ' 楼 · ' + ago(o.t.at) + '</span></li>';
      }).join('') : '<li class="pc-none">还没回过别人的楼。</li>';
    }
  }

  function setNum(sel, n) {
    $$(sel).forEach(function (el) { el.textContent = n; });
  }

  /* ==========================================================================
     账号
     ========================================================================== */
  function bindAcct() {
    /* 改昵称 */
    var rowName = $('#rowName'), formName = $('#formName'), inName = $('#inName');
    var msgName = $('#msgName');

    var openName = function () {
      if (!formName) return;
      formName.hidden = false;
      inName.value = U.name || '';
      if (msgName) { msgName.textContent = ''; msgName.className = 'acct-msg'; }
      inName.focus();
      inName.select();
    };
    var closeName = function () { if (formName) formName.hidden = true; };

    var be = $('[data-name-edit]');
    if (be) be.addEventListener('click', function () {
      if (formName && !formName.hidden) closeName(); else openName();
    });
    var bc = $('[data-name-cancel]');
    if (bc) bc.addEventListener('click', closeName);

    if (formName) formName.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = (inName.value || '').replace(/\s+/g, ' ').trim();
      if (!v) { msgName.textContent = '昵称不能空着'; return; }
      if (v === U.name) { closeName(); return; }
      var btn = formName.querySelector('.btn:not(.ghost)');
      if (btn) { btn.disabled = true; btn.textContent = '存着…'; }
      api('/me', { method: 'PATCH', body: { name: v } }).then(function (j) {
        U.name = (j.user && j.user.name) || v;
        if (j.user) U.emailMask = j.user.emailMask || U.emailMask;
        writeJSON(UKEY, U);
        paintIdentity();
        paintComm();
        closeName();
        toast('名字改了。旧帖上的落款还是当时的名字');
      }).catch(function (err) {
        msgName.textContent = err.offline ? '后端没连上，改不了' : err.message;
      }).then(function () {
        if (btn) { btn.disabled = false; btn.textContent = '存下'; }
      });
    });

    /* 改密码 */
    var formPwd = $('#formPwd'), msgPwd = $('#msgPwd');
    var openPwd = function () {
      if (!formPwd) return;
      formPwd.hidden = false;
      ['inPwdOld', 'inPwdNew', 'inPwdNew2'].forEach(function (id) { $('#' + id).value = ''; });
      if (msgPwd) { msgPwd.textContent = ''; msgPwd.className = 'acct-msg'; }
      $('#inPwdOld').focus();
    };
    var closePwd = function () { if (formPwd) formPwd.hidden = true; };

    var bpe = $('[data-pwd-edit]');
    if (bpe) bpe.addEventListener('click', function () {
      if (formPwd && !formPwd.hidden) closePwd(); else openPwd();
    });
    var bpc = $('[data-pwd-cancel]');
    if (bpc) bpc.addEventListener('click', closePwd);

    if (formPwd) formPwd.addEventListener('submit', function (e) {
      e.preventDefault();
      var o = $('#inPwdOld').value || '';
      var n = $('#inPwdNew').value || '';
      var n2 = $('#inPwdNew2').value || '';
      msgPwd.className = 'acct-msg';
      if (!o) { msgPwd.textContent = '先填原密码'; return; }
      if (n.length < 6) { msgPwd.textContent = '新密码至少 6 位'; return; }
      if (n !== n2) { msgPwd.textContent = '两遍新密码不一样'; return; }

      var btn = formPwd.querySelector('.btn:not(.ghost)');
      if (btn) { btn.disabled = true; btn.textContent = '改着…'; }
      api('/me/password', { method: 'POST', body: { old: o, next: n } }).then(function () {
        msgPwd.className = 'acct-msg is-ok';
        msgPwd.textContent = '改好了，别的机器上的登录已失效';
        setTimeout(closePwd, 1600);
      }).catch(function (err) {
        msgPwd.textContent = err.offline ? '后端没连上，改不了' : err.message;
      }).then(function () {
        if (btn) { btn.disabled = false; btn.textContent = '改掉'; }
      });
    });

    /* 退出 */
    $$('[data-pc-out]').forEach(function (b) {
      b.addEventListener('click', function () {
        b.disabled = true;
        api('/logout', { method: 'POST' }).catch(function () {}).then(function () {
          try { localStorage.removeItem(UKEY); } catch (e) {}
          location.replace('index.html');
        });
      });
    });
  }

  /* ==========================================================================
     启动
     ========================================================================== */
  function boot() {
    U = readJSON(UKEY, null);
    if (!U) return;                       /* site.js 已经把人送去登录页了 */

    buildChips();
    bindSign();
    bindLb();
    bindAcct();

    S.sig = U.signature || '';
    paintIdentity();
    paintSig();
    paintWall();
    paintComm();

    /* 以服务端为准再校一遍：签名、邮箱、注册日期 */
    api('/me').then(function (j) {
      S.online = true;
      setSigNote(true);
      if (!j.user) {
        /* 会话过期了：名帖上的东西还在本机，但改不动 */
        toast('登录已失效，只能看不能改。回登录页再进一次。');
        return;
      }
      var srv = j.user;
      U.name = srv.name || U.name;
      U.email = srv.email || U.email || '';
      U.emailMask = srv.emailMask || '';
      U.created = srv.created || U.created;
      U.signature = srv.signature || '';
      S.sig = U.signature;
      writeJSON(UKEY, U);
      paintIdentity();
      paintSig();
      paintComm();          /* 名字以服务端为准后，社区里认人的口径也跟着变 */
    }).catch(function () {
      S.online = false;
      setSigNote(false);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
