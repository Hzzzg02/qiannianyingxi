/* ==========================================================================
   影偶创作 · 生图
   --------------------------------------------------------------------------
   这个页面只做一件事：把「流派 + 行当 + 架子 + 一句话」送去画一张影偶。
   不拼关节、不上幕布、不切件——画出来的就是一张画，归属用户自己。

   分类表不在前端写死：启动时从 /api/studio/catalog 取，
   因为提示词是在服务端拼的，前端必须用同一份 id，否则选了什么就画什么就断了。
   ========================================================================== */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var st = {
    school: 'tangshan',
    role: 'sheng',
    sub: 'xiaosheng',
    pose: 'liangxiang',
    busy: false,
    last: null            /* 最近一张：{ url, meta, desc, prompt } */
  };

  var CAT = null;
  var KEY = 'qnyx.gen.v1';

  /* 取不到资料库时的最小兜底：只有 id 和名字，说明在服务端补全 */
  var FALLBACK = {
    base: '检索资料库中的皮影形象，根据用户提供的提示词来生成个性化皮影。',
    schools: [
      { k: 'tangshan', n: '唐山皮影' }, { k: 'huaxian', n: '陕西华县皮影' },
      { k: 'huanxian', n: '甘肃环县道情皮影' }, { k: 'taishan', n: '山东泰山皮影' },
      { k: 'lufeng', n: '广东陆丰皮影' }, { k: 'chengdu', n: '四川成都灯影' }
    ],
    roles: [
      { k: 'sheng', n: '生', subs: [{ k: 'xiaosheng', n: '小生' }, { k: 'wusheng', n: '武生' }, { k: 'laosheng', n: '老生' }] },
      { k: 'dan', n: '旦', subs: [{ k: 'qingyi', n: '青衣' }, { k: 'huadan', n: '花旦' }, { k: 'daomadan', n: '刀马旦' }] },
      { k: 'jing', n: '净', subs: [{ k: 'hualian', n: '花脸' }, { k: 'wujiang', n: '武将' }, { k: 'laohu', n: '悍将' }] },
      { k: 'chou', n: '丑', subs: [{ k: 'wen', n: '文丑' }, { k: 'wu', n: '武丑' }, { k: 'laodan', n: '丑旦' }] },
      { k: 'shen', n: '神', subs: [{ k: 'xian', n: '神仙' }, { k: 'yao', n: '妖精' }, { k: 'gui', n: '鬼怪' }] },
      { k: 'wang', n: '王', subs: [{ k: 'diwang', n: '帝王' }, { k: 'jiangxiang', n: '将相' }, { k: 'fanwang', n: '番王' }] }
    ],
    poses: [
      { k: 'liangxiang', n: '亮相' }, { k: 'jingli', n: '静立' }, { k: 'jixing', n: '疾走' },
      { k: 'kaida', n: '开打' }, { k: 'shili', n: '施礼' }, { k: 'huimou', n: '回眸' }
    ]
  };

  var IDEAS = [
    '守边的老兵，风雪里抱着刀，鬓角结霜',
    '月下梳妆的新妇，鬓边一支素银钗',
    '走江湖的卖艺人，肩上蹲一只小猴',
    '巡海的龙女，手托一颗夜明珠',
    '进京赶考的书生，背一只旧书箱',
    '酒楼里倒酒的小二，肩上搭着白巾',
    '披甲的女将，横刀立马，翎子在风里',
    '驾云的老道，拂尘斜搭在臂上',
    '登基的新君，冕旒垂珠，手按玉带',
    '番邦来的使臣，翻毛皮帽，抱一只弯刀',
    '庙会上的媒婆，鬓边一朵大红花',
    '山里的妖精，兽面人身，指爪尖利'
  ];

  /* ------------------------------------------------------------------ 分类 */

  function find(arr, k) {
    for (var i = 0; i < (arr || []).length; i++) if (arr[i].k === k) return arr[i];
    return null;
  }

  function chips(box, list, cur, onPick) {
    if (!box) return;
    box.innerHTML = list.map(function (o) {
      return '<button type="button" class="chip' + (o.k === cur ? ' on' : '') +
        '" data-k="' + o.k + '">' + esc(o.n) + '</button>';
    }).join('');
    Array.prototype.forEach.call(box.querySelectorAll('.chip'), function (b) {
      b.addEventListener('click', function () { onPick(b.getAttribute('data-k')); });
    });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function row(k, v) {
    return '<div class="gb-row"><span class="gb-k">' + k + '</span><span>' + esc(v) + '</span></div>';
  }

  function roleOf(k) { return find(CAT.roles, k) || CAT.roles[0]; }

  function renderChips() {
    chips($('c-school'), CAT.schools, st.school, function (k) {
      st.school = k;
      renderChips();
      markGong();
    });

    chips($('c-role'), CAT.roles, st.role, function (k) {
      st.role = k;
      var r = roleOf(k);
      st.sub = (r.subs && r.subs[0]) ? r.subs[0].k : '';
      renderChips();
      markGong();
    });

    var r = roleOf(st.role);
    chips($('c-sub'), r.subs || [], st.sub, function (k) { st.sub = k; renderChips(); });
    if (r.subs && !find(r.subs, st.sub)) st.sub = r.subs[0].k;

    chips($('c-pose'), CAT.poses, st.pose, function (k) { st.pose = k; renderChips(); });

    var s = find(CAT.schools, st.school);
    if (s && $('s-note')) {
      var rows = [];
      if (s.mat) rows.push(row('皮料', s.mat));
      if (s.craft) rows.push(row('刻法', s.craft));
      if (s.color) rows.push(row('配色', s.color));
      $('s-note').innerHTML = rows.length ? rows.join('')
        : '皮料、刀法、配色都跟着流派走，选哪一路，画出来就是哪一路的样子。';
    }
    var sub = r.subs ? find(r.subs, st.sub) : null;
    if ($('r-note')) {
      $('r-note').textContent = sub && sub.d ? (r.n + '行 · ' + sub.n + '：' + sub.d) : '先分大门，再挑细行。';
    }
  }

  function markGong() {
    Array.prototype.forEach.call(document.querySelectorAll('.gk'), function (c) {
      c.classList.toggle('on', c.getAttribute('data-k') === st.school);
    });
  }

  function renderGong() {
    var box = $('gk-grid');
    if (!box) return;
    box.innerHTML = CAT.schools.map(function (s) {
      return '<article class="gk" data-k="' + s.k + '">' +
        '<div class="gk-t"><h3>' + esc(s.n) + '</h3><span class="gk-area">' + esc(s.area || '') + '</span></div>' +
        (s.mat ? '<div class="gk-row"><span>皮料</span><b>' + esc(s.mat) + '</b></div>' : '') +
        (s.craft ? '<div class="gk-row"><span>刻法</span><b>' + esc(s.craft) + '</b></div>' : '') +
        (s.color ? '<div class="gk-row"><span>配色</span><b>' + esc(s.color) + '</b></div>' : '') +
        (s.note ? '<p class="gk-note">' + esc(s.note) + '</p>' : '') +
        '</article>';
    }).join('');
    Array.prototype.forEach.call(box.querySelectorAll('.gk'), function (c) {
      c.setAttribute('role', 'button');
      c.setAttribute('tabindex', '0');
      c.addEventListener('click', function () {
        st.school = c.getAttribute('data-k');
        renderChips();
        markGong();
        jumpToSchool();
      });
      c.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault();
          c.click();
        }
      });
    });
    markGong();
  }

  /* 点图鉴里的某一路，回到上面的「壹 · 选流派」，不要一路滚到页顶。
     固定头会挡住目标，所以减去它的高度再留 18px 呼吸。 */
  function jumpToSchool() {
    var note = $('s-note');
    var step = note && note.closest ? note.closest('.gb-step') : null;
    var target = step || $('c-school');
    if (!target) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    var head = document.querySelector('.site-head');
    var gap = (head ? head.offsetHeight : 0) + 18;
    var top = target.getBoundingClientRect().top + window.pageYOffset - gap;
    window.scrollTo({ top: top < 0 ? 0 : top, behavior: 'smooth' });
  }

  /* ------------------------------------------------------------------ 画心 */

  var LOAD_TXT = ['正在检索资料库', '正在按流派落形', '正在刻这一只'];

  function showLoad() {
    $('gw-idle').hidden = true;
    $('gw-img').hidden = true;
    $('gw-seal').hidden = true;
    $('gw-load').hidden = false;
    $('gw-acts').hidden = true;
    var i = 0;
    $('gw-load-t').textContent = LOAD_TXT[0];
    clearInterval(showLoad.timer);
    showLoad.timer = setInterval(function () {
      i = (i + 1) % LOAD_TXT.length;
      $('gw-load-t').textContent = LOAD_TXT[i];
    }, 5000);
  }

  function metaText() {
    var s = find(CAT.schools, st.school);
    var r = roleOf(st.role);
    var sub = r.subs ? find(r.subs, st.sub) : null;
    var p = find(CAT.poses, st.pose);
    return [s ? s.n : '', r.n + (sub ? '·' + sub.n : ''), p ? p.n : '']
      .filter(Boolean).join(' · ');
  }

  function showResult(o) {
    clearInterval(showLoad.timer);
    var img = $('gw-img');
    $('gw-load').hidden = true;
    $('gw-idle').hidden = true;
    img.hidden = false;
    img.style.visibility = '';
    img.onerror = function () {
      img.hidden = true;
      $('gw-idle').hidden = false;
      $('gw-idle-t').textContent = '这张没取回来';
      $('gw-idle-n').textContent = '图生成好了但没下到本地，再画一张试试。';
    };
    img.src = o.url;
    $('gw-seal').hidden = false;
    $('gw-acts').hidden = false;
    $('gw-meta').textContent = o.meta || metaText();
    $('gw-desc').textContent = o.desc || '';
    if (o.prompt) $('p-full').textContent = o.prompt;
    st.last = o;
    mountRig(o);
  }

  /* --------------------------------------------------------- 可动影偶 */

  var rigReady = false;

  function setView(v) {
    var img = $('gw-img'), cv = $('gw-rig');
    if (!cv || !rigReady) { img.hidden = false; return; }
    if (v === 'rig') {
      cv.hidden = false;
      img.style.visibility = 'hidden';
      if (window.RIG) RIG.fit();
    } else {
      cv.hidden = true;
      img.style.visibility = '';
    }
    Array.prototype.forEach.call(document.querySelectorAll('#rig-seg button'), function (b) {
      b.classList.toggle('on', b.getAttribute('data-view') === v);
    });
  }

  function resetRig() {
    rigReady = false;
    var cv = $('gw-rig'), cal = $('rig-cal');
    if (cv) { cv.hidden = true; cv.classList.remove('calib'); }
    if ($('rig-bar')) $('rig-bar').hidden = true;
    if ($('rig-hint')) $('rig-hint').hidden = true;
    if (cal) { cal.classList.remove('on'); cal.textContent = '校准关节'; }
    var img = $('gw-img');
    if (img) img.style.visibility = '';
  }

  function mountRig(o) {
    var cv = $('gw-rig');
    if (!window.RIG || !cv) return;
    resetRig();
    $('rig-bar').hidden = false;
    $('rig-hint').hidden = false;
    window.RIG.mount(cv, o.url, function (err) {
      if (err) { resetRig(); return; }
      rigReady = true;
      setView('rig');
    });
  }

  function setBusy(on) {
    st.busy = on;
    var b = $('gw-go');
    b.disabled = on;
    b.textContent = on ? '正在刻' : '落 笔';
  }

  /* ------------------------------------------------------------------ 出图 */

  function generate() {
    if (st.busy) return;
    var want = ($('gw-want').value || '').trim();
    setBusy(true);
    showLoad();
    resetRig();
    $('gw-tip').classList.remove('warn');
    $('gw-tip').textContent = '一张约 15–30 秒，画的时候可以走开一下。';

    fetch('/api/studio/gen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: want, school: st.school, role: st.role, sub: st.sub, pose: st.pose, rig: true })
    })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j.ok || !j.url) throw new Error((j && (j.error || j.message)) || '这一张没画成');
        var o = {
          url: j.url,
          meta: metaText(),
          desc: j.desc || '',
          prompt: j.prompt || '',
          wm: !!j.wm,
          t: Date.now()
        };
        showResult(o);
        pushWall(o);
        if (j.wm) {
          $('gw-tip').classList.add('warn');
          $('gw-tip').textContent = j.warn || '这张用的是免费档，右下角带水印。';
        } else {
          $('gw-tip').textContent = '画好了。同一句话再画一次，出来的还是另一只。';
        }
        if (window.SHELL) SHELL.toast('画好了');
      })
      .catch(function (e) {
        clearInterval(showLoad.timer);
        $('gw-load').hidden = true;
        $('gw-idle').hidden = false;
        $('gw-idle-t').textContent = '这一笔没成';
        $('gw-idle-n').textContent = e.message || '网络没通，再试一次。';
        $('gw-tip').classList.add('warn');
        $('gw-tip').textContent = e.message || '';
      })
      .then(function () { setBusy(false); });
  }

  /* ------------------------------------------------------------------ 画过的 */

  function readWall() {
    try {
      var a = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }

  function writeWall(a) {
    try { localStorage.setItem(KEY, JSON.stringify(a.slice(0, 18))); } catch (e) { /* 满了就算了 */ }
  }

  function pushWall(o) {
    var a = readWall().filter(function (x) { return x.url !== o.url; });
    a.unshift({ url: o.url, meta: o.meta, desc: o.desc, prompt: o.prompt, t: o.t });
    writeWall(a);
    renderWall();
  }

  function renderWall() {
    var box = $('gwall');
    if (!box) return;
    var a = readWall();
    if (!a.length) {
      box.innerHTML = '<p class="gwall-empty">还空着。上面画第一张，它就挂在这儿。</p>';
      return;
    }
    box.innerHTML = a.map(function (x, i) {
      return '<figure class="gwi" data-i="' + i + '">' +
        '<img src="' + esc(x.url) + '" alt="" loading="lazy">' +
        '<figcaption class="gwi-t">' + esc(x.meta || '影偶') + '</figcaption>' +
        '<button class="gwi-d" type="button" data-del="' + i + '" title="删掉">×</button>' +
        '</figure>';
    }).join('');

    Array.prototype.forEach.call(box.querySelectorAll('.gwi'), function (f) {
      f.addEventListener('click', function (e) {
        if (e.target.hasAttribute('data-del')) return;
        var x = readWall()[+f.getAttribute('data-i')];
        if (!x) return;
        showResult(x);
        if (x.desc) $('gw-desc').textContent = x.desc;
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });

    Array.prototype.forEach.call(box.querySelectorAll('.gwi-d'), function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        var a2 = readWall();
        a2.splice(+b.getAttribute('data-del'), 1);
        writeWall(a2);
        renderWall();
      });
    });
  }

  /* ------------------------------------------------------------------ 动作 */

  function download() {
    if (!st.last) return;
    var a = document.createElement('a');
    var name = (st.last.meta || '影偶').replace(/[\\/:*?"<>|\s·]+/g, '-');
    a.href = st.last.url;
    a.download = '影偶-' + name + '.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    if (window.SHELL) SHELL.toast('已存到本地');
  }

  function copyPrompt() {
    var t = (st.last && st.last.prompt) || $('p-full').textContent;
    if (!t || /还没画过/.test(t)) {
      if (window.SHELL) SHELL.toast('先画一张，才有提示词可复制');
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(function () {
        if (window.SHELL) SHELL.toast('提示词已复制');
      }, function () { if (window.SHELL) SHELL.toast('浏览器不让写剪贴板'); });
    } else if (window.SHELL) {
      SHELL.toast('这个浏览器不支持直接复制');
    }
  }

  /* ------------------------------------------------------------------ 启动 */

  function boot(cat) {
    CAT = cat || FALLBACK;
    if ($('p-base') && CAT.base) $('p-base').textContent = CAT.base;
    renderChips();
    renderGong();
    renderWall();
  }

  document.addEventListener('DOMContentLoaded', function () {
    var ta = $('gw-want');
    var cnt = $('gw-count');

    ta.addEventListener('input', function () {
      cnt.textContent = ta.value.length + ' / 120';
    });

    $('gw-dice').addEventListener('click', function () {
      var pick = IDEAS[Math.floor(Math.random() * IDEAS.length)];
      ta.value = pick;
      ta.dispatchEvent(new Event('input'));
      ta.focus();
    });

    $('gw-go').addEventListener('click', generate);
    $('gw-again').addEventListener('click', generate);
    $('gw-dl').addEventListener('click', download);
    $('gw-copy').addEventListener('click', copyPrompt);
    $('gw-edit').addEventListener('click', function () {
      if (st.last && st.last.desc) {
        ta.value = st.last.desc;
        ta.dispatchEvent(new Event('input'));
      }
      ta.focus();
      ta.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });

    $('gw-clear').addEventListener('click', function () {
      if (!readWall().length) return;
      if (!window.confirm('把这张纸上的记录清空？图还在服务器上，只是不再列在这里。')) return;
      writeWall([]);
      renderWall();
    });

    /* 可动影偶：视图切换 / 现成动作 / 关节校准 */
    var seg = $('rig-seg');
    if (seg) seg.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-view]') : null;
      if (b) setView(b.getAttribute('data-view'));
    });

    var acts = $('rig-acts');
    if (acts) acts.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-act]') : null;
      if (!b || !rigReady || !window.RIG) return;
      setView('rig');
      RIG.play(b.getAttribute('data-act'));
    });

    var cal = $('rig-cal');
    if (cal) cal.addEventListener('click', function () {
      if (!rigReady || !window.RIG) return;
      var on = !cal.classList.contains('on');
      cal.classList.toggle('on', on);
      cal.textContent = on ? '校准中 · 点这里结束' : '校准关节';
      RIG.setCalib(on);
    });

    /* 回车直接落笔，Shift+回车换行 */
    ta.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        generate();
      }
    });

    /* 先渲染兜底，再等真的资料库到了覆盖掉：页面不会空等 */
    boot(null);

    fetch('/api/studio/catalog')
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.ok && j.schools && j.schools.length) {
          CAT = j;
          if (j.base) $('p-base').textContent = j.base;
          renderChips();
          renderGong();
          markGong();
        }
      })
      .catch(function () { /* 用兜底那套，服务端照样认 id */ });
  });
})();
