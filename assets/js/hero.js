/* ==========================================================
   hero.js —— 首屏背景轮换
   · 六张实拍按 6.8s 一张横切淡入，淡 1.5s，和 CSS 里的 transition 对上
   · 只在第一屏转：翻走就停，翻回来接着转（键盘/滚轮都一样）
   · 页面切到后台也停，回来再起
   · ?still / 系统「减少动态效果」：只停在第一张，不转
   ========================================================== */
(function () {
  var bg = document.querySelector('.hero-bg');
  if (!bg) return;

  var slides = Array.prototype.slice.call(bg.querySelectorAll('.hero-slide'));
  if (slides.length < 2) return;

  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var STILL = /[?&](still|static)/.test(location.search);
  var DUR = 6800;

  var idx = 0;
  var timer = null;

  function show(i, instant) {
    i = (i % slides.length + slides.length) % slides.length;
    if (i === idx && !instant) return;
    slides[idx].classList.remove('is-on');
    slides[i].classList.add('is-on');
    idx = i;
  }

  function tick() {
    if (document.hidden) return;
    if (!document.body.classList.contains('is-viewing-0')) return;
    show(idx + 1);
  }

  function start() {
    if (timer || REDUCED || STILL) return;
    timer = setInterval(tick, DUR);
  }

  function stop() {
    clearInterval(timer);
    timer = null;
  }

  /* 第一张立刻显示，不等定时器 */
  show(0, true);

  if (REDUCED || STILL) return;

  if (window.deck && window.deck.onChange) {
    window.deck.onChange(function (i) {
      if (i === 0) start();
      else stop();
    });
  } else {
    start();
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop();
    else if (document.body.classList.contains('is-viewing-0')) start();
  });

  /* 给调试和截图用：heroSlides.show(3) */
  window.heroSlides = { show: show, next: tick, stop: stop, start: start, count: slides.length };
})();
