/* ==========================================================================
   站内共用脚本：登录态、导航高亮、未登录拦个人中心、登录表单
   登录态只存在 localStorage，没有后端——这是个演示站
   ========================================================================== */
(function () {
  'use strict';

  var KEY = 'qnyx.user';

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
  }
  function write(u) {
    try { localStorage.setItem(KEY, JSON.stringify(u)); } catch (e) {}
  }

  window.QNYX = {
    user: read,
    login: function (name) {
      write({ name: name, since: new Date().toISOString().slice(0, 10) });
    },
    logout: function () {
      try { localStorage.removeItem(KEY); } catch (e) {}
    }
  };

  var u = read();
  var here = (location.pathname.split('/').pop() || 'index.html');
  var loginHref = 'login.html?next=' + encodeURIComponent('profile.html');

  /* ---------- 导航高亮 ---------- */
  Array.prototype.forEach.call(document.querySelectorAll('.head-nav a'), function (a) {
    var href = a.getAttribute('href');
    if (href === here) a.classList.add('is-on');
  });

  /* ---------- 窄屏导航：把当前页滚进可视区 ---------- */
  (function () {
    var nav = document.querySelector('.head-nav');
    var on = nav && nav.querySelector('a.is-on');
    if (!nav || !on || nav.scrollWidth <= nav.clientWidth) return;
    /* offsetLeft 是相对 offsetParent 的（不是相对 nav），首屏时会把 nav 白白滚出 80 多像素，
       当前项反而看不见。改成拿矩形比：当前项露在外面就不动它 */
    var nr = nav.getBoundingClientRect(), ar = on.getBoundingClientRect(), pad = 10;
    if (ar.left < nr.left + pad) {
      nav.scrollLeft += (ar.left - nr.left) - pad;
    } else if (ar.right > nr.right - pad) {
      nav.scrollLeft += (ar.right - nr.right) + pad;
    }
  })();

  /* ---------- 右上角头像 ---------- */
  var av = document.querySelector('[data-user-av]');
  var nm = document.querySelector('[data-user-name]');
  var hu = document.querySelector('.hu');
  if (av && nm) {
    if (u) {
      av.textContent = (u.name || '影').slice(0, 1);
      nm.textContent = u.name || '无名';
      if (hu) hu.title = '个人中心';
    } else {
      av.textContent = '影';
      nm.textContent = '登录';
      if (hu) hu.setAttribute('href', loginHref);
    }
  }

  /* ---------- 没登录就进不了个人中心 ---------- */
  if (document.body.hasAttribute('data-need-login') && !u) {
    location.replace(loginHref);
    return;
  }

  /* ---------- 个人中心：把登录态填进名帖 ---------- */
  if (document.body.getAttribute('data-page') === 'profile' && u) {
    var name = u.name || '无名';
    var set = function (sel, val) {
      var el = document.querySelector(sel);
      if (el) el.textContent = val;
    };
    set('[data-pf-name]', name);
    set('[data-pf-handle]', '@' + name);
    set('[data-pf-seal]', name.slice(0, 1));
    set('[data-pf-since]', u.since || '—');
    set('[data-pf-login]', name);
  }

  /* ---------- 退出 ---------- */
  var out = document.querySelector('[data-logout]');
  if (out) {
    out.addEventListener('click', function (e) {
      e.preventDefault();
      QNYX.logout();
      location.replace('index.html');
    });
  }

  /* ---------- 登录表单 ---------- */
  var form = document.getElementById('loginForm');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = (document.getElementById('lfName').value || '').replace(/\s+/g, '');
      var pwd = document.getElementById('lfPwd').value || '';
      var err = document.getElementById('lfErr');
      if (!name) {
        err.textContent = '先留个名字，幕布后面好认人。';
        return;
      }
      if (pwd.length < 4) {
        err.textContent = '密码至少四位——演示站，随便写。';
        return;
      }
      QNYX.login(name);
      var next = new URLSearchParams(location.search).get('next') || 'index.html';
      if (!/^[A-Za-z0-9_.-]+\.html$/.test(next)) next = 'index.html';
      location.replace(next);
    });
  }
})();

/* ==========================================================================
   专题页共用：目录高亮（只在有 #tpNav 的页面生效）
   ========================================================================== */
(function () {
  'use strict';
  var nav = document.getElementById('tpNav');
  if (!nav) return;

  var links = [].slice.call(nav.querySelectorAll('a[href^="#"]'));
  var secs = links.map(function (a) { return document.getElementById(a.getAttribute('href').slice(1)); });
  var ticking = false;

  function run() {
    ticking = false;
    var y = window.scrollY + (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hd-h')) || 78) + 120;
    var idx = 0;
    for (var i = 0; i < secs.length; i++) {
      if (secs[i] && secs[i].offsetTop <= y) idx = i;
    }
    for (var j = 0; j < links.length; j++) links[j].classList.toggle('on', j === idx);
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; requestAnimationFrame(run); }
  }, { passive: true });
  window.addEventListener('resize', run);
  run();

  /* 点目录滚动时留出头部与自身高度 */
  links.forEach(function (a) {
    a.addEventListener('click', function (e) {
      var t = document.getElementById(a.getAttribute('href').slice(1));
      if (!t) return;
      e.preventDefault();
      var hd = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--hd-h'), 10) || 78;
      var navH = nav.offsetHeight || 48;
      var top = t.getBoundingClientRect().top + window.scrollY - hd - navH + 1;
      window.scrollTo({ top: top, behavior: 'smooth' });
      history.replaceState(null, '', a.getAttribute('href'));
    });
  });
})();
