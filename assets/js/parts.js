/* ==========================================================
   parts.js —— 第 2 屏「影箱六件」的点开
   · 点卡片：卡片连名字往一头滑走，宣纸方块载着著录从另一头进来
   · 同时只开一张；再点一次、点空白、翻走这一屏，都收起来
   ========================================================== */
(function () {
  var sec = document.getElementById('page2');
  if (!sec) return;

  var cards = Array.prototype.slice.call(sec.querySelectorAll('.pcard'));

  /* 收起时临时挂 is-closing：靠它把"回位"也压到 0.62s、不带走位延迟，
     跟纸片退场同一拍。等动画走完再摘。 */
  function closeCard(c) {
    if (!c.classList.contains('is-open')) return;
    c.classList.add('is-closing');
    c.classList.remove('is-open');
    if (c.parentNode) c.parentNode.classList.remove('is-open');
    window.setTimeout(function () { c.classList.remove('is-closing'); }, 680);
    document.body.classList.remove('has-paper-first');
  }

  function closeAll() { cards.forEach(closeCard); }

  cards.forEach(function (card) {
    card.addEventListener('click', function (e) {
      e.stopPropagation();
      var wasOpen = card.classList.contains('is-open');
      closeAll();
      if (wasOpen) return;
      card.classList.add('is-open');
      if (card.parentNode) card.parentNode.classList.add('is-open');
      /* 第一件的纸片会铺到左侧页码点底下，这时候圆点要翻深色 */
      document.body.classList.toggle('has-paper-first', card === cards[0]);
    });
  });

  /* 点已经展开的那张纸、或点别处，都收起来 */
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('.pcard')) return;
    closeAll();
  });

  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeAll();
  });

  /* 翻到别的屏就收起来，免得下次回来还开着 */
  if (window.deck) {
    window.deck.onChange(function (i) { if (i !== 1) closeAll(); });
  }
})();
