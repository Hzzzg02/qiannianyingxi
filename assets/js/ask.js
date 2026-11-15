/* ==========================================================
   ask.js —— 首屏问答框（就地接 AI）
   ------------------------------------------------------------------
   以前这里只负责把问题甩给对话页；现在直接在首屏调 /api/assistant，
   答案摊在输入框下面打字出来，看完想接着聊再进对话页。
   三件事：
     1) 发问 → POST /api/assistant → 打字机输出 → 支持 **加粗** / "- " 列表
     2) 服务没通（本地静态预览、后端在忙）→ 不装死，给一句实话 + 对话页入口
     3) 点一下答案可以跳过打字；空问题抖一下，Esc 收起
   无 JS 时表单 action=chat.html 仍然能用。
   ========================================================== */
(function () {
  'use strict';

  var form = document.getElementById('askForm');
  var input = document.getElementById('askQ');
  var wrap = document.querySelector('.ask-wrap');
  if (!form || !input) return;

  var live = document.getElementById('askLive');
  var qEl = document.getElementById('askLiveQ');
  var aEl = document.getElementById('askLiveA');
  var moreEl = document.getElementById('askLiveMore');
  var closeEl = document.getElementById('askLiveClose');

  var API = '/api/assistant';
  var TIMEOUT = 20000;                 // 首屏比对话页多给几秒，模型偶尔慢
  var FAST = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var CHAT = 'chat.html';

  var HISTORY = [];                    // 只留上下文，不进 sessionStorage
  var busy = false;
  var typing = null;                   // 正在打字的任务
  var shown = false;

  /* ---------------- 文本 ---------------- */
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* 后端回的是纯文本 + 两种轻标记：**加粗**、行首 "- " 的条目 */
  function fmt(text) {
    var out = [];
    String(text).split(/\r?\n/).forEach(function (raw) {
      var line = raw.replace(/\s+$/, '');
      if (!line.trim()) return;
      var li = /^\s*[-·•]\s+/.test(line);
      var body = esc(li ? line.replace(/^\s*[-·•]\s+/, '') : line)
        .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
      out.push('<p' + (li ? ' class="is-li"' : '') + '>' + body + '</p>');
    });
    return out.join('') || '<p>' + esc(text) + '</p>';
  }

  /* ---------------- 打字机 ---------------- */
  function endTyping() {
    if (!typing) return;
    var text = typing.text;
    window.clearTimeout(typing.timer);
    typing = null;
    aEl.innerHTML = fmt(text);
  }

  function tick() {
    if (!typing) return;
    var t = typing;
    t.i = Math.min(t.text.length, t.i + t.step);
    t.el.textContent = t.text.slice(0, t.i);
    if (t.i < t.text.length) t.timer = window.setTimeout(tick, 16);
    else endTyping();
  }

  function typeOut(text) {
    if (FAST || text.length > 1200) { aEl.innerHTML = fmt(text); return; }
    aEl.innerHTML = '<div class="ask-live-text" id="askTyping"></div>';
    var el = document.getElementById('askTyping');
    typing = { el: el, text: text, i: 0, step: Math.max(1, Math.round(text.length / 200)), timer: 0 };
    tick();
  }

  /* ---------------- 面板 ---------------- */
  function open(q) {
    qEl.textContent = q;
    moreEl.href = CHAT + '?q=' + encodeURIComponent(q);
    live.hidden = false;
    if (wrap) wrap.classList.add('has-answer');
    /* 下一帧再上过渡，否则 display 刚从 none 变回来会直接跳到位 */
    window.requestAnimationFrame(function () {
      live.classList.add('is-on');
      /* 窄屏是原生滚动，答案撑高之后要把它带进视口，别让它卡在屏幕外 */
      if (window.innerWidth <= 900) {
        window.setTimeout(function () {
          live.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }, 260);
      }
    });
    shown = true;
  }

  function close() {
    endTyping();
    live.classList.remove('is-on');
    live.hidden = true;
    if (wrap) wrap.classList.remove('has-answer');
    shown = false;
    HISTORY = [];
    input.focus({ preventScroll: true });
  }

  function waiting() {
    aEl.innerHTML = '<p class="ask-live-wait"><i></i>说戏人正在翻灯…</p>';
  }

  function fail() {
    aEl.innerHTML = '<p class="ask-live-err">说戏人这一会儿没接上话（服务在忙，或者本地预览没连后端）。'
      + '换一句再问，或者<a href="' + CHAT + '?q=' + encodeURIComponent(qEl.textContent || '皮影的皮子是怎么选的？')
      + '">进影窗问答</a>接着说。</p>';
  }

  /* ---------------- 提问 ---------------- */
  function ask(q) {
    if (busy) return;
    busy = true;
    input.value = '';
    open(q);
    waiting();

    var ctrl = new AbortController();
    var timer = window.setTimeout(function () { ctrl.abort(); }, TIMEOUT);

    fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: q, history: HISTORY.slice(-6) }),
      signal: ctrl.signal
    }).then(function (r) {
      if (!r.ok) throw new Error('bad status ' + r.status);
      return r.json();
    }).then(function (j) {
      var text = j && typeof j.reply === 'string' ? j.reply.trim() : '';
      if (!text) throw new Error('empty');
      HISTORY.push({ role: 'user', content: q }, { role: 'assistant', content: text });
      if (HISTORY.length > 10) HISTORY = HISTORY.slice(-10);
      typeOut(text);
    }).catch(function () {
      fail();
    }).then(function () {
      window.clearTimeout(timer);
      busy = false;
    });
  }

  /* ---------------- 交互 ---------------- */
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var q = input.value.trim();
    if (!q) {
      form.classList.remove('is-shake');
      void form.offsetWidth;
      form.classList.add('is-shake');
      input.focus();
      return;
    }
    ask(q);
  });

  input.addEventListener('input', function () {
    form.classList.remove('is-shake');
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && shown) close();
  });

  /* 下面几个问法：点一下就地发问，不再跳页 */
  Array.prototype.forEach.call(document.querySelectorAll('.ask-chips button'), function (b) {
    b.addEventListener('click', function () {
      var q = b.getAttribute('data-q');
      if (q) ask(q);
    });
  });

  /* 打字中点一下答案 → 直接出全文 */
  aEl.addEventListener('click', function () {
    if (typing) endTyping();
  });

  if (closeEl) closeEl.addEventListener('click', close);

  /* 进这一屏就聚焦，进来就能打字；但别在触屏上弹键盘 */
  if (window.matchMedia('(hover: hover) and (min-width: 901px)').matches) {
    window.setTimeout(function () {
      if (document.body.classList.contains('nw-lock')) return;   // 影讯详情开着，别抢焦点
      if (busy || shown) return;
      input.focus({ preventScroll: true });
    }, 900);
  }
})();
