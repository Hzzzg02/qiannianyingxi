/* 戏箱适配：
   1) 右栏高度跟左栏画框对齐，两栏下沿平齐，底下不留空
   2) 选项组改成横滑后，右侧还有没滑到的内容时给一道渐隐
   3) 鼠标滚轮在选项组上直接横着滚，不用按住 shift */
(function () {
  'use strict';

  var heart = document.querySelector('.gw-heart');
  var box = document.querySelector('.gw-box');
  var gbBody = document.getElementById('gb-body');
  if (!heart || !box) return;

  function wide() { return window.innerWidth > 900; }

  /* 左栏是 sticky 的，高度就是画框 + 下面那行说明 */
  function syncH() {
    if (!wide()) { box.style.height = ''; markBody(); return; }
    var h = Math.round(heart.getBoundingClientRect().height);
    if (h > 200) box.style.height = h + 'px';
    markBody();
  }

  function markChips() {
    var list = document.querySelectorAll('.gb-chips');
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      var over = c.scrollWidth - c.clientWidth;
      c.classList.toggle('is-more', wide() && over > 4 && c.scrollLeft < over - 4);
    }
  }

  /* 戏箱内容没露完时，滚动区下沿压一道渐隐 */
  function markBody() {
    if (!gbBody) return;
    var over = gbBody.scrollHeight - gbBody.clientHeight;
    gbBody.classList.toggle('is-more', wide() && over > 8 && gbBody.scrollTop < over - 8);
  }

  function bindChips() {
    var list = document.querySelectorAll('.gb-chips');
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.getAttribute('data-gwfit') === '1') continue;
      c.setAttribute('data-gwfit', '1');
      c.addEventListener('scroll', markChips, { passive: true });
      c.addEventListener('wheel', function (e) {
        if (!wide()) return;
        if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
        if (this.scrollWidth <= this.clientWidth) return;
        this.scrollLeft += e.deltaY;
        e.preventDefault();
      }, { passive: false });
    }
    markChips();
  }

  window.addEventListener('resize', function () { syncH(); markChips(); markBody(); });
  if (gbBody) gbBody.addEventListener('scroll', markBody, { passive: true });
  window.addEventListener('load', function () { syncH(); bindChips(); });

  if (window.ResizeObserver) {
    try { new ResizeObserver(syncH).observe(heart); } catch (err) {}
  }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { syncH(); markChips(); });
  }

  /* 选项是脚本渲染的，容器一变就重新挂事件 */
  if (window.MutationObserver) {
    var mo = new MutationObserver(function () { bindChips(); syncH(); markBody(); });
    ['c-school', 'c-role', 'c-sub', 'c-pose'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) mo.observe(el, { childList: true });
    });
  }


  /* 戏箱矮的时候输入框会被切掉一截，点它就把滚动区推到能看全的位置 */
  var want = document.getElementById('gw-want');
  if (want && gbBody) {
    want.addEventListener('focus', function () {
      setTimeout(function () {
        var over = gbBody.scrollHeight - gbBody.clientHeight;
        if (over <= 8) return;
        var r = want.getBoundingClientRect(), br = gbBody.getBoundingClientRect();
        var gap = br.bottom - 8 - r.bottom;
        if (gap < 0) gbBody.scrollTop = Math.min(over, gbBody.scrollTop - gap);
      }, 140);
    });
  }

  syncH();
  bindChips();
  markBody();
  setTimeout(function () { syncH(); markChips(); markBody(); }, 600);
})();
