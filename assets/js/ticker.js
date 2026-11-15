/* ==========================================================
   ticker.js —— 底部热点条
   对应原站底部那条常驻的横向滚动：内容复制一份拼成无缝循环，
   鼠标悬停暂停，右侧按钮可整条收起。
   ========================================================== */
(function () {
  var ticker = document.getElementById('ticker');
  if (!ticker) return;

  var track = ticker.querySelector('.ticker-track');
  if (track) {
    /* 复制一份，动画位移 -50% 时正好接上，视觉无缝 */
    var clone = track.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    /* 把两份拼在同一个 track 里 */
    while (clone.firstChild) track.appendChild(clone.firstChild);
  }

  var btn = document.getElementById('tickerClose');
  if (btn) {
    btn.addEventListener('click', function () {
      ticker.classList.add('is-hidden');
      /* 收起点位之后别再被点到 */
      window.setTimeout(function () { ticker.style.display = 'none'; }, 520);
    });
  }
})();
