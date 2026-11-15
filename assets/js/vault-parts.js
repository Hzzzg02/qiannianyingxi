/* ==========================================================================
   影藏（collection.html）· 箱中之物：部件转盘
   自动轮播 3.2 秒一次；鼠标在图上停留超过 2.4 秒才暂停（扫过不影响），
   切后台、离开视口时停。
   注意：.part 的定位靠 CSS transform，脚本只换 k0~k5 这个类名，不碰行内样式。
   ========================================================================== */
(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var track = document.getElementById('parts-track');
  if (!track) return;

  var figs = Array.prototype.slice.call(track.querySelectorAll('.part'));
  var n = figs.length;
  if (!n) return;

  var cur = 0;
  var stage = document.getElementById('parts-stage');
  var numEl = document.getElementById('parts-num');
  var nameEl = document.getElementById('parts-name');
  var descEl = document.getElementById('parts-desc');
  var metaEl = document.getElementById('parts-meta');
  var dotsEl = document.getElementById('parts-dots');
  var timer = null;
  var hover = false;
  var hoverTimer = null;
  var visible = false;

  /* 指示点 */
  figs.forEach(function (f, i) {
    var b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', '第 ' + (i + 1) + ' 件：' + (f.getAttribute('data-name') || ''));
    b.addEventListener('click', function () { goTo(i); });
    dotsEl.appendChild(b);
  });
  var dots = Array.prototype.slice.call(dotsEl.children);

  function pad(v) { return (v < 10 ? '0' : '') + v; }

  function paint() {
    figs.forEach(function (f, i) {
      f.className = 'part k' + ((i - cur + n) % n);
    });
    dots.forEach(function (d, i) {
      d.classList.toggle('on', i === cur);
    });

    var f0 = figs[cur];
    numEl.textContent = pad(cur + 1);
    if (nameEl) nameEl.textContent = f0.getAttribute('data-name') || '';
    if (descEl) {
      var text = f0.getAttribute('data-desc') || '';
      if (reduce) {
        descEl.textContent = text;
      } else {
        descEl.style.opacity = '0';
        setTimeout(function () {
          descEl.textContent = text;
          descEl.style.opacity = '1';
        }, 150);
      }
    }
    if (metaEl) {
      var meta = f0.getAttribute('data-meta') || '';
      if (reduce) {
        metaEl.innerHTML = meta.replace(/^([^·]+)/, '<b>$1</b>');
      } else {
        metaEl.style.opacity = '0';
        setTimeout(function () {
          metaEl.innerHTML = meta.replace(/^([^·]+)/, '<b>$1</b>');
          metaEl.style.opacity = '1';
        }, 150);
      }
    }
  }

  function play() {
    clearInterval(timer);
    if (reduce || hover || !visible || document.hidden) return;
    timer = setInterval(function () { goTo(cur + 1); }, 3200);
  }

  function goTo(i) {
    cur = (i + n * 4) % n;
    paint();
    play();
  }

  document.getElementById('parts-next').addEventListener('click', function () { goTo(cur + 1); });
  document.getElementById('parts-prev').addEventListener('click', function () { goTo(cur - 1); });

  /* 悬停不立刻停：先让它继续转，停住 2.4 秒才当作「要看细节」而暂停。
     这样鼠标只是从图上划过时，自动轮换照常走。 */
  stage.addEventListener('mouseenter', function () {
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(function () { hover = true; play(); }, 2400);
  });
  stage.addEventListener('mouseleave', function () {
    clearTimeout(hoverTimer);
    hover = false;
    play();
  });

  /* 触摸左右划 */
  var tx = 0, ty = 0;
  stage.addEventListener('touchstart', function (e) {
    tx = e.touches[0].clientX;
    ty = e.touches[0].clientY;
  }, { passive: true });
  stage.addEventListener('touchend', function (e) {
    var dx = e.changedTouches[0].clientX - tx;
    var dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy)) goTo(cur + (dx < 0 ? 1 : -1));
  }, { passive: true });

  /* 键盘：容器可聚焦，左右键切换 */
  stage.setAttribute('tabindex', '0');
  stage.setAttribute('role', 'group');
  stage.setAttribute('aria-label', '影箱部件，可用左右键切换');
  stage.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') { e.preventDefault(); goTo(cur + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(cur - 1); }
  });

  /* 滚到这一区才开始自动轮播，别在看不见的地方空转 */
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      visible = es[0].isIntersecting;
      play();
    }, { threshold: 0.25 }).observe(stage);
  } else {
    visible = true;
    play();
  }

  document.addEventListener('visibilitychange', play);

  paint();
})();
