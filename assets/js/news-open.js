/* ==========================================================
   news-open.js —— 影讯详情层
   · 点第 4 屏任一资讯，摊开一页纸看全文（文案取自原站影讯板块）
   · 打开时给 body 挂 nw-lock，deck.js 见到它就停手，
     滚轮与方向键只作用于纸内正文，不会带着整屏翻走
   ========================================================== */
(function () {
  'use strict';

  var DATA = window.NEWS || [];
  if (!DATA.length) return;

  var map = {};
  DATA.forEach(function (n) { map[n.id] = n; });

  /* 其余资讯的先后：先未上版面的那四篇，再回头补 */
  var ORDER = ['n2', 'n9', 'n4', 'n5', 'n1', 'n3', 'n6', 'n7', 'n8'];

  var modal = null, sheet = null, scrollEl = null, artEl = null, titleEl = null;
  var lastFocus = null;
  var curId = null;
  var built = false;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ---------------------------------------------------------- 构建外壳 */
  function build() {
    modal = el('div', 'nw-modal');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'nwTitle');
    modal.setAttribute('aria-hidden', 'true');

    sheet = el('div', 'nw-sheet');

    var top = el('div', 'nw-top');
    top.appendChild(el('p', 'nw-top-t')).innerHTML =
      '<b>影讯</b><span id="nwTopCat"></span>';

    var x = el('button', 'nw-x', '×');
    x.type = 'button';
    x.setAttribute('aria-label', '关闭');
    x.addEventListener('click', close);
    top.appendChild(x);

    scrollEl = el('div', 'nw-scroll');
    scrollEl.setAttribute('tabindex', '-1');
    artEl = el('article', 'nw-art');
    scrollEl.appendChild(artEl);

    sheet.appendChild(top);
    sheet.appendChild(scrollEl);
    sheet.appendChild(el('i', 'nw-deco-br'));

    modal.appendChild(sheet);
    document.body.appendChild(modal);

    /* 点纸外关闭；点纸上不关 */
    modal.addEventListener('mousedown', function (e) {
      if (e.target === modal) close();
    });
    /* 触屏也兜一层，免得 only mousedown 在移动端不灵 */
    modal.addEventListener('touchend', function (e) {
      if (e.target === modal) close();
    }, { passive: true });

    built = true;
  }

  /* ---------------------------------------------------------- 填充一篇 */
  function render(id) {
    var n = map[id];
    if (!n) return;
    curId = id;

    var topCat = document.getElementById('nwTopCat');
    if (topCat) topCat.textContent = '· ' + n.cat;

    var html = '';
    html += '<p class="nw-kick"><b>' + esc(n.cat) + '</b><i></i><span>' +
            esc(n.source) + '</span><i></i><span>' + esc(n.date) + '</span></p>';
    html += '<h2 class="nw-h" id="nwTitle">' + esc(n.title) + '</h2>';
    html += '<p class="nw-lead">' + esc(n.lead) + '</p>';
    if (n.img) {
      html += '<figure class="nw-pic"><img src="' + esc(n.img) + '" alt="' +
              esc(n.pic.replace(/^图｜/, '')) + '" loading="lazy" decoding="async">' +
              '<figcaption>' + esc(n.pic) + '</figcaption></figure>';
    }
    html += '<div class="nw-body">' + (n.body || '') + '</div>';
    html += '<p class="nw-src">来源：' + esc(n.source) + '　' + esc(n.date) +
            '　<a href="' + esc(n.url) + '" target="_blank" rel="noopener noreferrer">查看原文 →</a></p>';

    /* 其余影讯 */
    var rest = ORDER.filter(function (k) { return k !== id; }).slice(-4);
    rest = rest.filter(function (k) { return map[k]; });
    if (rest.length) {
      html += '<div class="nw-more"><p class="nw-more-t">其他影讯</p><div class="nw-more-list">';
      rest.forEach(function (k) {
        var o = map[k];
        html += '<button type="button" class="nw-more-item" data-news="' + esc(k) + '">' +
                '<i>' + esc(o.cat) + '</i><span>' + esc(o.title) + '</span>' +
                '<em>' + esc(o.date.replace(/-/g, '.')) + '</em></button>';
      });
      html += '</div></div>';
    }

    artEl.innerHTML = html;
    scrollEl.scrollTop = 0;
  }

  /* ---------------------------------------------------------- 开 / 关 */
  function open(id) {
    if (!map[id]) return;
    if (!built) build();

    lastFocus = document.activeElement;
    render(id);

    modal.classList.add('is-on');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('nw-lock');

    /* 焦点落到正文区：方向键、PageDown、空格都能滚这一页纸，
       而 deck.js 见到 nw-lock 就不再翻屏。
       放到下一帧，等 .is-on 的样式先落地（visibility 还是 hidden 时聚焦会被丢掉） */
    var focusScroll = function () {
      try { scrollEl.focus({ preventScroll: true }); } catch (err) { scrollEl.focus(); }
    };
    window.setTimeout(focusScroll, 30);
  }

  function close() {
    if (!modal || !modal.classList.contains('is-on')) return;
    modal.classList.remove('is-on');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('nw-lock');
    if (lastFocus && lastFocus.focus) {
      lastFocus.focus({ preventScroll: true });
    }
    lastFocus = null;
    curId = null;
  }

  /* ---------------------------------------------------------- 事件 */
  document.addEventListener('keydown', function (e) {
    if (!modal || !modal.classList.contains('is-on')) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    /* 焦点留在纸里：Tab 到头就绕回来 */
    if (e.key === 'Tab') {
      var f = sheet.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }, true);

  /* 「其他影讯」点击切换 */
  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('.nw-more-item') : null;
    if (!b) return;
    var id = b.getAttribute('data-news');
    if (id && map[id]) {
      render(id);
      scrollEl.focus({ preventScroll: true });
    }
  });

  /* 入口：带 data-news 的卡片 / 正文里的任何地方 */
  function bindCards() {
    var cards = document.querySelectorAll('[data-news]');
    Array.prototype.forEach.call(cards, function (card) {
      if (card.classList.contains('nw-more-item')) return;
      if (card.dataset.nwBound) return;
      card.dataset.nwBound = '1';

      var id = card.getAttribute('data-news');
      if (!map[id]) return;

      card.classList.add('nw-open');
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-haspopup', 'dialog');

      /* 末尾挂一个「读全文」，让人知道这张能点开 */
      if (!card.querySelector('.nw-readmore')) {
        card.appendChild(el('span', 'nw-readmore', '读全文'));
      }

      card.addEventListener('click', function (e) {
        /* 卡片里的链接（如果有）照常走；栏头那条「头条 / 速览 / 现场」不算入口 */
        if (e.target.closest && e.target.closest('a[href]')) return;
        if (e.target.closest && e.target.closest('.col-head')) return;
        open(id);
      });

      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open(id);
        }
      });
    });
  }

  bindCards();

  /* 暴露给调试：?news=n3 直接摊开某一篇 */
  var m = /[?&]news=([\w-]+)/.exec(location.search);
  if (m && map[m[1]]) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { open(m[1]); });
    } else {
      open(m[1]);
    }
  }

  window.newsOpen = { open: open, close: close, ids: function () { return curId; } };
})();
