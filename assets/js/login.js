/* ==========================================================================
   登录 / 注册（login.html）
   · 图形验证码来自 /api/captcha（一次性，用掉就换）
   · 邮箱验证码来自 /api/email/code（先过图形码，才发信）
   · 登录 / 注册都走服务端会话，成功后另写一份 localStorage，
     让站内其它页面（个人中心、社区）认出是谁
   ========================================================================== */
(function () {
  'use strict';

  var API = '/api';
  var STORE = 'qnyx.user';
  var cap = { cid: '', img: '', mail: true };
  var cdTimer = null;

  function $(id) { return document.getElementById(id); }

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
    });
  }

  function setMsg(text, kind) {
    var el = $('lgMsg');
    el.textContent = text || '';
    el.className = 'lg-msg' + (kind === 'ok' ? ' is-ok' : '');
  }

  function hint(html) { $('lgHint').innerHTML = html; }

  /* ---------------- 图形验证码 ---------------- */
  function loadCaptcha() {
    var btns = [$('lgCapBtn'), $('rgCapBtn')];
    btns.forEach(function (b) { b.classList.add('is-loading'); });

    return api('/captcha').then(function (j) {
      cap.cid = j.cid;
      cap.img = j.img;
      cap.mail = j.mail !== false;
      ['lgCapImg', 'rgCapImg'].forEach(function (id) {
        var im = $(id);
        if (im) im.src = cap.img;
      });
      $('lgCap').value = '';
      $('rgCap').value = '';
      btns.forEach(function (b) { b.classList.remove('is-loading'); });
      if (!cap.mail) {
        hint('服务端还没配发信。本地演示可用 <b>QN_MAIL_MODE=log</b> 启动，验证码会写进 server/data/mail.log。');
      }
    }).catch(function (e) {
      btns.forEach(function (b) { b.classList.remove('is-loading'); });
      setMsg(e.status === 404 || /ECONNREFUSED|后端没起来/.test(e.message)
        ? '连不上后端：先在项目里跑 node server/server.js，再刷新这一页。'
        : '图形验证码没取到：' + e.message);
    });
  }

  /* ---------------- 页签 ---------------- */
  function tab(which) {
    var isLogin = which === 'login';
    $('tabLogin').classList.toggle('is-on', isLogin);
    $('tabRegister').classList.toggle('is-on', !isLogin);
    $('tabLogin').setAttribute('aria-selected', isLogin ? 'true' : 'false');
    $('tabRegister').setAttribute('aria-selected', isLogin ? 'false' : 'true');
    $('formLogin').classList.toggle('is-hidden', !isLogin);
    $('formRegister').classList.toggle('is-hidden', isLogin);
    /* 注册多两格，卡片高一截；让样式知道现在是哪个页签，好收一收外框留白 */
    document.body.dataset.tab = isLogin ? 'login' : 'register';
    $('lgTitle').textContent = isLogin ? '登录' : '注册';
    $('lgSub').textContent = isLogin
      ? '用邮箱进你的影箱，收藏与帖子都记在这枚印下。'
      : '一个邮箱就够了，名字由邮箱前缀来定，之后可在个人中心改。';
    setMsg('');
    loadCaptcha();
  }

  /* ---------------- 邮箱验证码 ---------------- */
  function startCooldown(sec) {
    var btn = $('lgSend');
    var left = sec;
    clearInterval(cdTimer);
    btn.disabled = true;
    btn.textContent = left + 's 后重发';
    cdTimer = setInterval(function () {
      left--;
      if (left <= 0) {
        clearInterval(cdTimer);
        btn.disabled = false;
        btn.textContent = '重新发送';
      } else {
        btn.textContent = left + 's 后重发';
      }
    }, 1000);
  }

  $('lgSend').addEventListener('click', function () {
    var email = ($('rgEmail').value || '').trim();
    var answer = ($('rgCap').value || '').trim();
    setMsg('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return setMsg('邮箱格式不对。');
    if (!answer) return setMsg('先填右边的图形验证码。');

    var btn = $('lgSend');
    btn.disabled = true;
    btn.textContent = '发送中…';

    api('/email/code', {
      method: 'POST',
      body: { purpose: 'register', email: email, cid: cap.cid, answer: answer }
    }).then(function (j) {
      setMsg('验证码已发出，10 分钟内有效。', 'ok');
      hint(j.dev
        ? '联调模式：这封邮件没真发出去，验证码写在 <b>server/data/mail.log</b>，服务端控制台也能看到。'
        : '已发送到 ' + j.to + '，10 分钟内有效。收不到就看看垃圾邮件。');
      startCooldown(j.cooldown || 60);
    }).catch(function (e) {
      setMsg(e.message);
      btn.disabled = false;
      btn.textContent = '发送';
      /* 图形码是一次性的，试错后必须换一张 */
      if (/图形验证码/.test(e.message)) loadCaptcha();
    });
  });

  /* ---------------- 提交 ---------------- */
  function done(user) {
    try {
      localStorage.setItem(STORE, JSON.stringify({
        name: user.name || user.username || '影友',
        email: user.email || '',
        signature: user.signature || '',
        since: new Date().toISOString().slice(0, 10)
      }));
    } catch (e) { /* 存不进去也不挡跳转 */ }

    var next = new URLSearchParams(location.search).get('next') || 'index.html';
    if (!/^[A-Za-z0-9_.-]+\.html$/.test(next)) next = 'index.html';
    location.replace(next);
  }

  $('formLogin').addEventListener('submit', function (e) {
    e.preventDefault();
    var email = ($('lgEmail').value || '').trim();
    var pwd = $('lgPwd').value || '';
    var answer = ($('lgCap').value || '').trim();
    setMsg('');

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return setMsg('邮箱格式不对。');
    if (pwd.length < 6) return setMsg('密码至少 6 位。');
    if (!answer) return setMsg('图形验证码还没填。');

    var btn = $('formLogin').querySelector('.lg-submit');
    btn.disabled = true;
    btn.textContent = '登录中…';

    api('/login', { method: 'POST', body: { email: email, password: pwd, cid: cap.cid, answer: answer } })
      .then(function (j) { done(j.user); })
      .catch(function (err) {
        setMsg(err.message);
        btn.disabled = false;
        btn.textContent = '登 录';
        if (/图形验证码/.test(err.message)) loadCaptcha();
      });
  });

  $('formRegister').addEventListener('submit', function (e) {
    e.preventDefault();
    var email = ($('rgEmail').value || '').trim();
    var answer = ($('rgCap').value || '').trim();
    var code = ($('rgCode').value || '').trim();
    var pwd = $('rgPwd').value || '';
    setMsg('');

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return setMsg('邮箱格式不对。');
    if (!answer) return setMsg('图形验证码还没填。');
    if (!/^\d{6}$/.test(code)) return setMsg('邮箱验证码是六位数字。');
    if (pwd.length < 6) return setMsg('密码至少 6 位。');

    var btn = $('formRegister').querySelector('.lg-submit');
    btn.disabled = true;
    btn.textContent = '注册中…';

    api('/register', {
      method: 'POST',
      body: { email: email, password: pwd, code: code, cid: cap.cid, answer: answer }
    }).then(function (j) { done(j.user); })
      .catch(function (err) {
        setMsg(err.message);
        btn.disabled = false;
        btn.textContent = '注 册';
        if (/图形验证码/.test(err.message)) loadCaptcha();
      });
  });

  /* ---------------- 杂项 ---------------- */
  $('tabLogin').addEventListener('click', function () { tab('login'); });
  $('tabRegister').addEventListener('click', function () { tab('register'); });
  $('lgCapBtn').addEventListener('click', loadCaptcha);
  $('rgCapBtn').addEventListener('click', loadCaptcha);

  /* 回车在验证码格也能提交 */
  ['lgCap', 'rgCap', 'rgCode'].forEach(function (id) {
    $(id).addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.form.requestSubmit ? this.form.requestSubmit() : this.form.submit();
      }
    });
  });

  /* 入口只拉一次图形码：指定了 tab 就交给 tab() 去拉，免得一次拉两张 */
  var want = new URLSearchParams(location.search).get('tab');
  if (want === 'register') tab('register');
  else loadCaptcha();
})();
