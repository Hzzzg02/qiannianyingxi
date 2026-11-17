/* ==========================================================================
   戏影社区：广场 / 吧 / 帖子

   这里没有预置的吧，也没有预置的帖子和人数。吧由访问者自己开，帖子自己发，
   全部落在本机 localStorage 里（键 qnyx.comm.v1）。所以页面上出现的每一个
   数字都是从真实存在的帖子与楼层数出来的：帖子数 = 帖子条数，回复数 =
   楼层数减一，赞 = 各楼点赞之和，连签天数 = 真的点过几次签到。

   路由：
     #/            广场（全部吧）
     #/c/<吧id>    某个吧的帖子列表
     #/t/<帖id>    帖子楼层
   ========================================================================== */
(function () {
  'use strict';

  var T = window.QN_COMM || {};
  var ZONES = T.zones || [];
  var TCATS = T.tcats || [];
  var TAGS = T.tags || [];
  var SUGS = T.sugs || [];

  var ZN = {}, TN = {};
  ZONES.forEach(function (z) { ZN[z.id] = z.n; });
  TCATS.forEach(function (c) { TN[c.id] = c.n; });

  var KEY = 'qnyx.comm.v1';
  var UKEY = 'qnyx.comm.u';
  var PAGE = 8;

  var DB = { circles: [] };
  var US = {};
  var S = { zone: 'all', q: '', cat: 'all', kind: 'all', sort: 'last', page: 1, bq: '' };
  var liked = {};            /* '吧id:帖id:楼号' → true */
  var onlyOp = false;
  var curC = null, curT = null;

  /* ---------------- 小工具 ---------------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function ago(ms) {
    var m = Math.round(ms / 60000);
    if (m < 1) return '刚刚';
    if (m < 60) return m + ' 分钟前';
    if (m < 1440) return Math.floor(m / 60) + ' 小时前';
    if (m < 43200) return Math.floor(m / 1440) + ' 天前';
    return Math.floor(m / 43200) + ' 个月前';
  }
  function agoTs(ts) { return ts ? ago(Date.now() - ts) : '—'; }
  function fmtDay(ts) {
    var d = new Date(ts);
    return (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日';
  }
  function fmtDate(ts) {
    var d = new Date(ts);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  var toastTimer = null;
  function toast(msg) {
    var box = $('#ctoast');
    if (!box) return;
    box.textContent = msg;
    box.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { box.classList.remove('is-on'); }, 2600);
  }

  function myName() {
    if (ME) return ME;
    var u = (window.QNYX && window.QNYX.user) ? window.QNYX.user() : null;
    return (u && u.name) ? u.name : '';
  }
  function loginHint() { return '<a href="login.html?next=community.html">先登录</a>'; }
  function uid(prefix) { return prefix + Date.now().toString(36) + Math.floor(Math.random() * 90 + 10); }

  /* ---------------- 存取 ----------------
     数据在服务器（/api/comm），不再放本机。
     一次把整棵「吧 → 帖 → 楼」拉下来放 DB 里，渲染逻辑照旧；
     写操作单条提交，成功后再拉一遍，免得本地和服务器各有各的说法。
     只有关注与签到还留在本机——那是个人偏好，不共享。 */
  var API = '/api/comm';
  var ME = '';

  function api(method, path, body) {
    var opt = {
      method: method,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }
    };
    if (body) opt.body = JSON.stringify(body);
    return fetch(API + path, opt).then(function (r) {
      return r.json().catch(function () { return { ok: false, error: '服务器返回的不是 JSON' }; })
        .then(function (j) {
          if (!r.ok || !j || j.ok === false) {
            throw new Error((j && (j.error || j.message)) || ('请求失败 ' + r.status));
          }
          return j;
        });
    });
  }

  function pull() {
    return fetch(API, { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || j.ok === false) throw new Error((j && j.error) || '读不到社区数据');
        DB.circles = j.circles || [];
        ME = j.me ? j.me.name : '';
        /* 服务端的登录态（cookie）才是准的，把名字同步回本地，
           免得出现「社区里能发帖、导航却显示未登录」 */
        if (ME && window.QNYX && window.QNYX.login) {
          var cur = window.QNYX.user ? window.QNYX.user() : null;
          if (!cur || cur.name !== ME) {
            window.QNYX.login(ME);
            var tx = document.querySelector('.hu-tx');
            var av = document.querySelector('.hu-av');
            if (tx) tx.textContent = ME;
            if (av) av.textContent = ME.slice(0, 1);
          }
        }
        /* 服务端给每一楼带了「我赞过没有」，转成本地那张表，楼层渲染就不用改 */
        liked = {};
        DB.circles.forEach(function (c) {
          (c.posts || []).forEach(function (t) {
            (t.floors || []).forEach(function (f, i) {
              if (f.liked) liked[c.id + ':' + t.id + ':' + i] = true;
            });
          });
        });
        return DB;
      });
  }

  function save() { /* 写操作都走接口了，留个空实现防止漏改处报错 */ }
  function saveU() {
    try { localStorage.setItem(UKEY, JSON.stringify(US)); } catch (e) {}
  }
  function loadU() {
    try { US = JSON.parse(localStorage.getItem(UKEY) || '{}') || {}; } catch (e) { US = {}; }
  }
  function usOf(cid) {
    if (!US[cid]) US[cid] = { join: false, check: '', days: 0 };
    return US[cid];
  }
  function findCircle(id) {
    for (var i = 0; i < DB.circles.length; i++) if (DB.circles[i].id === id) return DB.circles[i];
    return null;
  }
  function findThread(tid) {
    for (var i = 0; i < DB.circles.length; i++) {
      var ps = DB.circles[i].posts || [];
      for (var j = 0; j < ps.length; j++) if (ps[j].id === tid) return { c: DB.circles[i], t: ps[j] };
    }
    return null;
  }

  /* ---------------- 删除：都要点两下 ----------------
     第一下只把按钮换成「再点一下」，四秒内不点就退回原样。
     删除是不可逆的（本机存储没有回收站），所以不弹系统 confirm，
     而是把确认做在按钮上，看得见自己点的是哪一条。 */
  function armed(btn, backLabel, armedLabel) {
    if (!btn) return true;
    if (btn.dataset.armed) return true;
    btn.dataset.armed = '1';
    btn.classList.add('is-armed');
    btn.textContent = armedLabel || '再点一下，删了就找不回来';
    setTimeout(function () {
      if (!btn.isConnected) return;
      delete btn.dataset.armed;
      btn.classList.remove('is-armed');
      btn.textContent = backLabel;
    }, 4000);
    return false;
  }

  function dropPost(c, tid) { /* 已改为走 DELETE 接口，保留空壳以防旧调用 */ }

  /* ---------------- 由楼层算出来的数 ---------------- */
  function stat(c) {
    var ps = c.posts || [], replies = 0, last = 0;
    ps.forEach(function (t) {
      replies += Math.max(0, t.floors.length - 1);
      t.floors.forEach(function (f) { if (f.at > last) last = f.at; });
    });
    return { posts: ps.length, replies: replies, last: last || c.at };
  }
  function tstat(t) {
    var like = 0;
    t.floors.forEach(function (f) { like += (f.like || 0); });
    return { reply: Math.max(0, t.floors.length - 1), like: like, open: t.floors[0].at };
  }

  /* ==========================================================================
     一、广场
     ========================================================================== */
  function cardHTML(c) {
    var st = stat(c);
    return '<a class="ccard" href="#/c/' + c.id + '">' +
      '<span class="cc-seal">' + esc(c.seal) + '</span>' +
      '<div class="cc-body">' +
        '<div class="cc-top"><h3 class="cc-name">' + esc(c.name) + '吧</h3>' +
          (c.mine ? '<span class="cc-role is-owner">吧主</span>'
            : (c.joined ? '<span class="cc-role">成员</span>' : '')) +
          '<span class="cc-zone">' + esc(ZN[c.zone] || '未分区') + '</span></div>' +
        '<p class="cc-desc">' + esc(c.desc || '还没写简介') + '</p>' +
        '<div class="cc-meta">' +
          '<span>吧主 · ' + esc(c.owner) + '</span>' +
          '<span>' + (c.members || 1) + ' 成员</span>' +
          (st.posts
            ? '<span>' + st.posts + ' 帖</span><span>' + st.replies + ' 回复</span><span>' +
              agoTs(st.last) + '有动静</span>'
            : '<span>还没有帖子</span>') +
        '</div>' +
      '</div>' +
      '<i class="cc-go">›</i>' +
    '</a>';
  }

  function emptyHTML() {
    /* 一个吧都没有的时候，光说「你自己开」太干；把几个题目摆出来给人点，
       点了只是把名字填进表单，不是假装这些吧已经有了 */
    var chips = SUGS.map(function (s, i) {
      return '<button type="button" data-sug="' + i + '">' + esc(s.n) + '</button>';
    }).join('');
    return '<div class="cempty">' +
      '<span class="ce-mark">吧</span>' +
      '<h3>台上还没摆桌子</h3>' +
      '<p>和贴吧一样，吧是人开出来的，不是发下来的。你起个名、挑个分区，你就是吧主——规矩你写，第一帖你发。' +
      '开完之后它会一直留在这一页，下次来还在。</p>' +
      '<button class="ce-btn" type="button" data-newcircle>＋ 开第一个吧</button>' +
      '<div class="ce-sugs"><span>想不好名字，从这几个里挑一个也行</span>' + chips + '</div>' +
    '</div>';
  }

  function renderSquare() {
    var counts = {};
    DB.circles.forEach(function (c) { counts[c.zone] = (counts[c.zone] || 0) + 1; });

    /* 数字只在真有东西时才写：一排 0 看着像坏了的占位 */
    var zh = '<a href="#" data-zone="all" class="' + (S.zone === 'all' ? 'on' : '') + '">全部' +
      (DB.circles.length ? '<b>' + DB.circles.length + '</b>' : '') + '</a>';
    ZONES.forEach(function (z) {
      zh += '<a href="#" data-zone="' + z.id + '" class="' + (S.zone === z.id ? 'on' : '') + '">' +
        esc(z.n) + (counts[z.id] ? '<b>' + counts[z.id] + '</b>' : '') + '</a>';
    });
    $('#sqZones').innerHTML = zh;

    var sorted = DB.circles.slice().sort(function (a, b) { return stat(b).last - stat(a).last; });
    var q = S.q.toLowerCase();
    var hit = sorted.filter(function (c) {
      if (S.zone !== 'all' && c.zone !== S.zone) return false;
      if (q && (c.name + ' ' + (c.desc || '') + ' ' + (ZN[c.zone] || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });

    /* 全部吧都加入了的时候（比如刚开完第一个），两张表会一模一样，
       那就别把同一批卡片排两遍；等有一个没加入的，这一段才出来 */
    var mine = sorted.filter(function (c) { return c.joined || c.mine; });
    var mineSec = $('#secMine');
    if (mine.length && mine.length < sorted.length) {
      mineSec.hidden = false;
      $('#mineList').innerHTML = mine.map(cardHTML).join('');
    } else {
      mineSec.hidden = true;
    }

    var allBox = $('#allList');
    if (!DB.circles.length) {
      allBox.className = 'cgrid is-empty';
      allBox.innerHTML = emptyHTML();
    } else {
      allBox.className = 'cgrid';
      allBox.innerHTML = hit.length
        ? hit.map(cardHTML).join('')
        : '<p class="barempty">没有这样的吧。换个词，或者自己开一个。</p>';
    }

    $('#allCount').textContent = DB.circles.length ? '共 ' + DB.circles.length + ' 个' : '';
    $('#mineCount').textContent = mine.length ? mine.length + ' 个' : '';
    paintNewest();
  }

  /* 侧栏「最近开张」：新开的排前面，没有就不显这块 */
  function paintNewest() {
    var sec = $('#secNew'), box = $('#newList');
    if (!sec || !box) return;
    var list = DB.circles.slice().sort(function (a, b) { return b.at - a.at; }).slice(0, 5);
    if (!list.length) { sec.hidden = true; return; }
    sec.hidden = false;
    box.innerHTML = list.map(function (c) {
      return '<a href="#/c/' + c.id + '">' + esc(c.name) + '吧<i>' + esc(ZN[c.zone] || '未分区') +
        ' · ' + esc(c.owner) + ' 开于 ' + fmtDay(c.at) + '</i></a>';
    }).join('');
  }

  /* ==========================================================================
     二、某个吧
     ========================================================================== */
  function paintBarHead(c) {
    var u = usOf(c.id);
    var st = stat(c);
    var me = myName();
    var isOwner = c.mine != null ? !!c.mine : !!(me && me === c.owner);

    $('#bhSeal').textContent = c.seal;
    $('#barCrumb').textContent = c.name + '吧';
    $('#bhName').innerHTML = esc(c.name) + '吧<small>' + esc(ZN[c.zone] || '未分区') +
      ' · 吧主 ' + esc(c.owner) + '</small>';
    $('#bhSay').textContent = c.desc || '这个吧还没写简介。';
    $('#bhNums').innerHTML =
      '<span><b>' + (c.members || 1) + '</b>成员</span>' +
      '<span><b>' + st.posts + '</b>帖子</span>' +
      '<span><b>' + st.replies + '</b>回复</span>' +
      '<span>建于 ' + fmtDay(c.at) + '</span>';

    /* 吧主不用加入，成员才需要 */
    var f = $('#bhFollow');
    f.classList.toggle('is-on', isOwner || !!c.joined);
    f.textContent = isOwner ? '你是吧主' : (c.joined ? '已加入' : '+ 加入本吧');
    f.disabled = isOwner;

    var done = u.check === today();
    var ck = $('#bhCheck');
    ck.classList.toggle('is-on', done);
    ck.textContent = done ? '今日已签到' : '签到';

    var lv = 1 + Math.floor(u.days / 5);
    $('#bhLv').textContent = 'LV.' + lv;
    $('#bhLvBar').style.width = (u.days ? ((u.days % 5) / 5) * 100 : 0).toFixed(0) + '%';
    $('#bhLvTx').textContent = u.days
      ? '已连签 ' + u.days + ' 天' + (done ? '' : '，今天还没签')
      : '还没签过到，签一天算一天';

    /* 吧主才有「改吧的信息」和「删吧」两个入口 */
    var ed = $('#bhEdit');
    if (ed) ed.hidden = !isOwner;

    var del = $('#bhDel');
    if (del) {
      del.hidden = !isOwner;
      if (isOwner) {
        delete del.dataset.armed;
        del.classList.remove('is-armed');
        del.textContent = '删掉这个吧';
      }
    }
  }

  function renderBarCats(c) {
    var counts = {};
    (c.posts || []).forEach(function (t) { counts[t.cat] = (counts[t.cat] || 0) + 1; });
    var all = (c.posts || []).length;
    var html = '<a href="#" data-cat="all" class="' + (S.cat === 'all' ? 'on' : '') + '">全部' +
      (all ? '<b>' + all + '</b>' : '') + '</a>';
    TCATS.forEach(function (t) {
      html += '<a href="#" data-cat="' + t.id + '" class="' + (S.cat === t.id ? 'on' : '') + '">' +
        esc(t.n) + (counts[t.id] ? '<b>' + counts[t.id] + '</b>' : '') + '</a>';
    });
    $('#barcat').innerHTML = html;
  }

  function rowHTML(c, t) {
    var st = tstat(t);
    var body0 = (t.floors[0].tx || []).join(' ');
    var ex = body0.length > 58 ? body0.slice(0, 58) + '…' : body0;
    var tags = (t.tags && t.tags.length)
      ? '<span class="br-tags">' + t.tags.map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('') + '</span>'
      : '';
    var lastF = t.floors[t.floors.length - 1];
    var mine = t.author === myName();
    return '<div class="brow-wrap' + (mine ? ' is-own' : '') + '">' +
      '<a class="brow' + (mine ? ' is-mine' : '') + '" href="#/t/' + t.id + '">' +
        '<div class="br-count"><b>' + st.reply + '</b><i>回复</i>' +
          (st.like ? '<u>' + st.like + '</u><i>赞</i>' : '') + '</div>' +
        '<div class="br-main">' +
          '<h3 class="br-title"><span class="br-cat">【' + esc(TN[t.cat] || '其他') + '】</span>' + esc(t.title) + '</h3>' +
          '<p class="br-ex">' + esc(ex) + '</p>' +
          '<div class="br-meta">' +
            '<span class="br-av">' + esc(t.author.slice(0, 1)) + '</span>' +
            '<span>' + esc(t.author) + '</span>' +
            '<span>' + agoTs(t.floors[0].at) + '</span>' + tags +
          '</div>' +
        '</div>' +
        '<div class="br-last"><b><i>' + esc(lastF.u.slice(0, 1)) + '</i>' + esc(lastF.u) + '</b>' +
          '<span>' + agoTs(lastF.at) + '</span></div>' +
      '</a>' +
      (mine ? '<button class="br-del" type="button" data-delpost="' + t.id + '" title="删掉这帖">删</button>' : '') +
    '</div>';
  }

  function renderBarList(c) {
    var list = $('#barlist');
    var pager = $('#bpager');

    if (!(c.posts || []).length) {
      list.innerHTML = '<div class="cempty in-list">' +
        '<span class="ce-mark">' + esc(c.seal) + '</span>' +
        '<h3>这个吧还空着</h3>' +
        '<p>第一帖由你发。写清你在做什么、做到哪一步、卡在哪儿——后面进来的人才接得上话。</p>' +
        '<button class="ce-btn" type="button" data-newpost>发第一帖</button>' +
      '</div>';
      pager.innerHTML = '';
      return;
    }

    var q = S.bq.toLowerCase();
    var pool = (c.posts || []).filter(function (t) {
      if (S.cat !== 'all' && t.cat !== S.cat) return false;
      if (S.kind === 'mine' && t.author !== myName()) return false;
      if (S.kind === 'reply' && t.floors.length < 2) return false;
      if (q) {
        var hay = (t.title + ' ' + (t.tags || []).join(' ') + ' ' + t.floors[0].tx.join(' ')).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });

    pool.sort(function (a, b) {
      if (S.sort === 'new') return b.floors[0].at - a.floors[0].at;
      if (S.sort === 'hot') return (b.floors.length - a.floors.length) || (b.floors[b.floors.length - 1].at - a.floors[a.floors.length - 1].at);
      return b.floors[b.floors.length - 1].at - a.floors[a.floors.length - 1].at;
    });

    var pages = Math.max(1, Math.ceil(pool.length / PAGE));
    if (S.page > pages) S.page = pages;
    var slice = pool.slice((S.page - 1) * PAGE, S.page * PAGE);

    list.innerHTML = slice.length
      ? slice.map(function (t) { return rowHTML(c, t); }).join('')
      : '<p class="barempty">这里没有符合条件的帖子。</p>';

    if (pool.length <= PAGE) { pager.innerHTML = ''; return; }
    var html = '<button data-pg="' + (S.page - 1) + '"' + (S.page === 1 ? ' disabled' : '') + '>上一页</button>';
    for (var i = 1; i <= pages; i++) {
      html += '<button data-pg="' + i + '" class="' + (i === S.page ? ' on' : '') + '">' + i + '</button>';
    }
    html += '<button data-pg="' + (S.page + 1) + '"' + (S.page === pages ? ' disabled' : '') + '>下一页</button>';
    html += '<span>共 ' + pool.length + ' 帖</span>';
    pager.innerHTML = html;
  }

  function renderBarAside(c) {
    var st = stat(c);
    var me = myName();
    var minePost = 0, mineFloor = 0;
    (c.posts || []).forEach(function (t) {
      if (t.author === me) minePost++;
      t.floors.forEach(function (f, i) { if (i > 0 && f.u === me) mineFloor++; });
    });
    var u = usOf(c.id);

    $('#barAside').innerHTML =
      '<div class="side-card"><h3>吧名片</h3>' +
        '<div class="folks barlord"><div class="folk"><i>' + esc(c.seal) + '</i>' +
          '<b>' + esc(c.name) + '吧</b><span>吧主 · ' + esc(c.owner) + '</span></div></div>' +
        '<p class="sc-tight" style="margin-top:12px">建于 ' + fmtDay(c.at) + '，现有 ' +
          (c.members || 1) + ' 位成员、' + st.posts + ' 帖、' +
          st.replies + ' 条回复。' + (me && me === c.owner ? '你是这个吧的吧主。' : '') + '</p>' +
        /* 吧是访客自己开的，开错了（名字打错、开重了）就得能收回去 */
        (me && me === c.owner
          ? '<button class="sc-del" type="button" data-del="1">删掉这个吧</button>'
          : '') +
      '</div>' +
      '<div class="side-card"><h3>吧里规矩</h3>' +
        '<ul class="rule-list">' +
          '<li>帖要写实：什么皮、多厚、哪一刀卡住，说清楚。</li>' +
          '<li>一帖最多挂三个标签，方便别人按类翻。</li>' +
          '<li>引别人的图与唱本，把人名与来处写上。</li>' +
          '<li>只谈戏与手艺，别处的事不在这里说。</li>' +
        '</ul>' +
      '</div>' +
      '<div class="side-card"><h3>我的足迹</h3>' +
        '<p class="sc-tight">' + (me
          ? (minePost || mineFloor
            ? '在这个吧发过 ' + minePost + ' 帖，回过 ' + mineFloor + ' 楼。'
            : '还没在这个吧说过话。') + (u.days ? '已签 ' + u.days + ' 天。' : '')
          : '还没登录。' + loginHint() + '，足迹就会记在这里。') + '</p>' +
      '</div>';
  }

  function showBar(c) {
    curC = c;
    curT = null;
    S.cat = 'all'; S.kind = 'all'; S.page = 1; S.bq = '';
    var qEl = $('#barQ');
    if (qEl) qEl.value = '';
    [].slice.call($('#btTabs').children).forEach(function (b, i) { b.classList.toggle('on', i === 0); });

    document.body.classList.remove('is-square', 'is-reading');
    document.body.classList.add('is-bar');

    paintBarHead(c);
    renderBarCats(c);
    renderBarList(c);
    renderBarAside(c);
    document.title = c.name + '吧 · 戏影社区';
    window.scrollTo(0, 0);
  }

  function repaintBar() {
    if (!curC) return;
    paintBarHead(curC);
    renderBarCats(curC);
    renderBarList(curC);
    renderBarAside(curC);
  }

  /* ==========================================================================
     三、帖子楼层
     ========================================================================== */
  function floorHTML(c, t, f, i, counts) {
    var isOp = i === 0;
    var isOwner = f.u === c.owner;
    var key = c.id + ':' + t.id + ':' + i;
    var on = liked[key];
    return '<section class="floor' + (isOp ? ' is-op' : '') + '">' +
      '<div class="fl-side">' +
        '<span class="fl-av">' + esc(f.u.slice(0, 1)) + '</span>' +
        '<b class="fl-name">' + esc(f.u) + '</b>' +
        (isOp ? '<span class="fl-tag">楼主</span>' : (isOwner ? '<span class="fl-tag">吧主</span>' : '')) +
        '<span class="fl-lv">本吧 ' + (counts[f.u] || 0) + ' 楼</span>' +
      '</div>' +
      '<div class="fl-body">' +
        '<div class="fl-meta"><span class="no">' + (isOp ? '主楼' : (i + 1) + ' 楼') + '</span>' +
          '<span>' + fmtDate(f.at) + '</span></div>' +
        '<div class="fl-tx">' + f.tx.map(function (x) { return '<p>' + esc(x) + '</p>'; }).join('') + '</div>' +
        '<div class="fl-acts">' +
          '<button data-like="' + i + '" class="' + (on ? 'on' : '') + '">赞 ' + (f.like || 0) + '</button>' +
          '<button data-reply="' + i + '">回复</button>' +
          '<span class="fl-time">' + agoTs(f.at) + '</span>' +
        '</div>' +
      '</div>' +
    '</section>';
  }

  function renderThread() {
    var c = curC, t = curT;
    if (!c || !t) return;
    var st = tstat(t);
    var counts = {};
    t.floors.forEach(function (f) { counts[f.u] = (counts[f.u] || 0) + 1; });
    var me = myName();

    var html =
      '<div class="tw-crumb"><a href="#/">戏影社区</a><i>›</i>' +
        '<a href="#/c/' + c.id + '">' + esc(c.name) + '吧</a><i>›</i>' +
        '<span>' + esc(TN[t.cat] || '其他') + '</span></div>' +
      '<h1 class="tw-h1">' + esc(t.title) + '</h1>' +
      '<div class="tw-sub">' +
        '<span>' + esc(t.author) + '</span>' +
        '<span>' + fmtDate(st.open) + '</span>' +
        '<span>回复 ' + st.reply + '</span>' +
        '<span>' + (st.like ? '赞 ' + st.like : '') + '</span>' +
        '<span>标签：' + esc((t.tags || []).join(' · ') || '无') + '</span>' +
        (st.reply ? '<button class="tw-onlyop' + (onlyOp ? ' on' : '') + '" id="twOnlyOp" type="button">只看楼主</button>' : '') +
        /* 帖主本人和吧主都能删；放进 tw-sub 是因为这里所有人在同一行，删与不删一眼能分辨 */
        (me && (me === t.author || me === c.owner)
          ? '<button class="tw-del" id="twDel" type="button" data-delpost="' + t.id + '">删掉这帖</button>'
          : '') +
      '</div>' +
      t.floors.map(function (f, i) { return { f: f, i: i }; })
        .filter(function (x) { return !onlyOp || x.i === 0; })
        .map(function (x) { return floorHTML(c, t, x.f, x.i, counts); }).join('') +
      '<div class="tw-reply">' +
        '<h3>跟一句</h3>' +
        '<textarea id="twInput" placeholder="说点具体的：做到哪一步、用的什么料、试过什么法子。"></textarea>' +
        '<div class="tw-rfoot">' +
          '<p id="twWho">' + (me ? '以「' + esc(me) + '」的身份回复' : '回复之前请' + loginHint() + '。') + '</p>' +
          '<button class="tw-send" id="twSend" type="button">发表回复</button>' +
        '</div>' +
      '</div>';

    $('#tvMain').innerHTML = html;

    /* 同一吧的其他帖 */
    var rel = (c.posts || []).filter(function (x) { return x.id !== t.id; })
      .sort(function (a, b) { return b.floors[b.floors.length - 1].at - a.floors[a.floors.length - 1].at; })
      .slice(0, 4);
    $('#tvAside').innerHTML =
      '<div class="side-card"><h3>' + esc(c.name) + '吧</h3>' +
        '<p class="sc-tight">' + esc(c.desc || '还没写简介') + '</p>' +
        '<div class="side-links" style="margin-top:10px"><a href="#/c/' + c.id + '">回到吧里<i>' + stat(c).posts + ' 帖</i></a></div>' +
      '</div>' +
      (rel.length
        ? '<div class="side-card"><h3>这个吧的别的帖</h3><div class="side-links">' +
            rel.map(function (x) {
              return '<a href="#/t/' + x.id + '">' + esc(x.title) +
                '<i>回复 ' + Math.max(0, x.floors.length - 1) + ' · ' + agoTs(x.floors[x.floors.length - 1].at) + '</i></a>';
            }).join('') + '</div></div>'
        : '') +
      '<div class="side-card"><h3>回帖须知</h3>' +
        '<p class="tw-side-note">对事不对人。说清自己做到哪一步、试过什么，比一句「同问」有用。引别人的图与唱本，把人名与来处写上。</p>' +
      '</div>';
  }

  function showThread(c, t) {
    curC = c;
    curT = t;
    onlyOp = false;
    document.body.classList.remove('is-square', 'is-bar');
    document.body.classList.add('is-reading');
    renderThread();
    document.title = t.title + ' · ' + c.name + '吧';
    window.scrollTo(0, 0);
  }

  /* ---------------- 路由 ---------------- */
  function showSquare() {
    curC = null; curT = null;
    document.body.classList.remove('is-bar', 'is-reading');
    document.body.classList.add('is-square');
    renderSquare();
    document.title = '戏影社区 · 千年影戏';
  }

  function route() {
    var h = location.hash || '';
    var mt = h.match(/^#\/t\/([A-Za-z0-9_-]+)$/);
    if (mt) {
      var f = findThread(mt[1]);
      if (f) { showThread(f.c, f.t); return; }
    }
    var mc = h.match(/^#\/c\/([A-Za-z0-9_-]+)$/);
    if (mc) {
      var c = findCircle(mc[1]);
      if (c) { showBar(c); return; }
      toast('没有这个吧，可能被删了');
    }
    showSquare();
  }

  /* ==========================================================================
     四、事件
     ========================================================================== */
  function bindSquare() {
    $('#sqZones').addEventListener('click', function (e) {
      var a = e.target.closest('a[data-zone]');
      if (!a) return;
      e.preventDefault();
      S.zone = a.getAttribute('data-zone');
      renderSquare();
    });

    var form = $('#sqSearch');
    var input = $('#sqQ');
    var timer = null;
    function apply() {
      var q = input.value.trim();
      if (q === S.q) return;
      S.q = q;
      renderSquare();
    }
    form.addEventListener('submit', function (e) { e.preventDefault(); apply(); });
    input.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(apply, 220);
    });

    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-newcircle]');
      if (b) { openKModal(); return; }
      var s = e.target.closest('[data-sug]');
      if (s) { openKModal(SUGS[parseInt(s.getAttribute('data-sug'), 10)]); }
    });
  }

  function bindBar() {
    $('#barcat').addEventListener('click', function (e) {
      var a = e.target.closest('a[data-cat]');
      if (!a) return;
      e.preventDefault();
      S.cat = a.getAttribute('data-cat');
      S.page = 1;
      if (!curC) return;
      renderBarCats(curC);
      renderBarList(curC);
    });

    var tabs = $('#btTabs');
    tabs.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-kind]');
      if (!b) return;
      S.kind = b.getAttribute('data-kind');
      S.page = 1;
      [].slice.call(tabs.children).forEach(function (x) { x.classList.toggle('on', x === b); });
      if (curC) renderBarList(curC);
    });

    $('#barSort').addEventListener('change', function (e) {
      S.sort = e.target.value;
      S.page = 1;
      if (curC) renderBarList(curC);
    });

    var form = $('#barSearch');
    var input = $('#barQ');
    var timer = null;
    function apply() {
      var q = input.value.trim();
      if (q === S.bq) return;
      S.bq = q;
      S.page = 1;
      if (curC) renderBarList(curC);
    }
    form.addEventListener('submit', function (e) { e.preventDefault(); apply(); });
    input.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(apply, 220);
    });

    $('#bpager').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-pg]');
      if (!b || b.disabled || !curC) return;
      S.page = parseInt(b.getAttribute('data-pg'), 10) || 1;
      renderBarList(curC);
      var top = $('#barlist').getBoundingClientRect().top + window.pageYOffset - 100;
      window.scrollTo(0, Math.max(0, top));
    });

    $('#bhFollow').addEventListener('click', function () {
      if (!curC) return;
      if (!myName()) { toast('先登录再加入吧'); return; }
      if (curC.mine) { toast('这个吧是你开的，你已经是吧主了'); return; }
      var cid = curC.id;
      api('POST', '/circles/' + cid + '/join')
        .then(function (d) { return pull().then(function () { return d; }); })
        .then(function (d) {
          var c2 = findCircle(cid);
          if (c2) {
            curC = c2;
            paintBarHead(c2);
            renderBarAside(c2);
          }
          renderSquare();
          toast(d.joined
            ? '已加入「' + (c2 ? c2.name : '') + '吧」，在广场的「我的圈子」里能找到'
            : '已退出这个吧，吧还留在广场');
        })
        .catch(function (e) { toast(e.message); });
    });

    $('#bhCheck').addEventListener('click', function () {
      if (!curC) return;
      var u = usOf(curC.id);
      if (u.check === today()) { toast('今天已经签过了，明天再来'); return; }
      u.check = today();
      u.days = (u.days || 0) + 1;
      saveU();
      paintBarHead(curC);
      renderBarAside(curC);
      toast('签到成功，已连签 ' + u.days + ' 天');
    });

    $('#barlist').addEventListener('click', function (e) {
      if (e.target.closest('[data-newpost]')) { e.preventDefault(); openModal(); return; }

      var d = e.target.closest('[data-delpost]');
      if (d && curC) {
        e.preventDefault();
        if (!armed(d, '删', '再点一下')) return;
        var tid = d.getAttribute('data-delpost');
        var tt = (curC.posts || []).filter(function (x) { return x.id === tid; })[0];
        var cid = curC.id;
        api('DELETE', '/posts/' + tid)
          .then(function () {
            return pull().then(function () {
              var c2 = findCircle(cid);
              if (c2) {
                curC = c2;
                repaintBar();
              } else {
                showSquare();
              }
              toast(tt ? '「' + tt.title + '」已经删掉' : '帖子已经删掉');
            });
          })
          .catch(function (e2) { toast(e2.message); });
      }
    });

    /* 删吧：点第一次只是问一句，点第二次才真删，免得手滑 */
    function askDeleteBar(btn) {
      if (!btn || !curC) return;
      if (!armed(btn, '删掉这个吧', '再点一下：吧和帖子一起删')) return;
      var id = curC.id;
      api('DELETE', '/circles/' + id)
        .then(function () {
          delete US[id];
          saveU();
          curC = null;
          history.pushState(null, '', location.pathname + location.search);
          return pull().then(function () {
            showSquare();
            toast('吧已经删掉了');
          });
        })
        .catch(function (e) { toast(e.message); });
    }

    $('#barAside').addEventListener('click', function (e) {
      var b = e.target.closest('[data-del]');
      if (b) askDeleteBar(b);
    });

    var bhDel = $('#bhDel');
    if (bhDel) bhDel.addEventListener('click', function () { askDeleteBar(bhDel); });

    var bhEdit = $('#bhEdit');
    if (bhEdit) bhEdit.addEventListener('click', function () { openEModal(curC); });
  }

  function bindThread() {
    var tv = $('#tview');
    tv.addEventListener('click', function (e) {
      var c = curC, t = curT;
      if (!c || !t) return;

      if (e.target.closest('#twOnlyOp')) {
        onlyOp = !onlyOp;
        renderThread();
        return;
      }

      var del = e.target.closest('[data-delpost]');
      if (del) {
        if (!armed(del, '删掉这帖', '再点一下删掉')) return;
        var gone = t.title;
        var cid = c.id;
        api('DELETE', '/posts/' + del.getAttribute('data-delpost'))
          .then(function () {
            curT = null;
            onlyOp = false;
            history.pushState(null, '', '#/c/' + cid);
            return pull().then(function () {
              var c2 = findCircle(cid);
              if (c2) showBar(c2); else showSquare();
              toast('「' + gone + '」和它下面的回复一起删掉了');
            });
          })
          .catch(function (e2) { toast(e2.message); });
        return;
      }

      var like = e.target.closest('button[data-like]');
      if (like) {
        var i = parseInt(like.getAttribute('data-like'), 10);
        var key = c.id + ':' + t.id + ':' + i;
        var f = t.floors[i];
        api('POST', '/posts/' + t.id + '/like', { floor: i })
          .then(function (d) {
            f.like = d.like;
            if (d.liked) liked[key] = true; else delete liked[key];
            like.classList.toggle('on', !!d.liked);
            like.textContent = '赞 ' + d.like;
          })
          .catch(function (e2) { toast(e2.message); });
        return;
      }

      var rp = e.target.closest('button[data-reply]');
      if (rp) {
        var j = parseInt(rp.getAttribute('data-reply'), 10);
        var box = $('#twInput');
        if (!box) return;
        var who = t.floors[j].u;
        box.value = '回 ' + who + '：';
        box.focus();
        box.setSelectionRange(box.value.length, box.value.length);
        return;
      }

      if (e.target.closest('#twSend')) {
        var txt = ($('#twInput').value || '').trim();
        if (!txt) { toast('写两句再发'); return; }
        if (!myName()) { toast('回复之前请先登录'); return; }
        api('POST', '/posts/' + t.id + '/replies', { body: txt })
          .then(function (d) {
            onlyOp = false;
            return pull().then(function () {
              var hit = findThread(t.id);
              if (!hit) { toast('这帖已经不在了'); showSquare(); return; }
              curC = hit.c;
              curT = hit.t;
              $('#twInput').value = '';
              renderThread();
              paintBarHead(curC);
              renderBarCats(curC);
              renderBarList(curC);
              renderBarAside(curC);
              toast('回帖已发，占第 ' + d.total + ' 楼');
              window.scrollTo(0, document.body.scrollHeight);
            });
          })
          .catch(function (e2) { toast(e2.message); });
      }
    });
  }

  /* ==========================================================================
     五、开吧 / 发帖
     ========================================================================== */
  function openKModal(sug) {
    var me = myName();
    $('#kmWho').innerHTML = me
      ? '以「' + esc(me) + '」的名字开吧，你就是吧主'
      : '开吧要留个名，' + loginHint() + '之后再开。';

    var zhtml = '';
    ZONES.forEach(function (z) {
      var on = sug ? z.id === sug.z : z === ZONES[0];
      zhtml += '<button type="button" data-z="' + z.id + '" class="' + (on ? 'on' : '') + '">' + esc(z.n) + '</button>';
    });
    $('#kfZones').innerHTML = zhtml;

    $('#kfName').value = sug ? sug.n : '';
    $('#kfDesc').value = sug ? sug.d : '';
    $('#kfSeal').value = sug ? sug.n.slice(0, 1) : '';

    var m = $('#kmodal');
    m.classList.add('is-on');
    m.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    setTimeout(function () { $('#kfName').focus(); }, 120);
  }
  function closeKModal() {
    $('#kmodal').classList.remove('is-on');
    $('#kmodal').setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function createCircle() {
    var me = myName();
    if (!me) { toast('开吧之前请先登录'); return; }

    var name = ($('#kfName').value || '').trim().replace(/吧$/, '');
    var seal = ($('#kfSeal').value || '').trim();
    var desc = ($('#kfDesc').value || '').trim();
    var zb = $('#kfZones').querySelector('button.on');
    var zone = zb ? zb.getAttribute('data-z') : ZONES[0].id;

    if (name.length < 2) { toast('吧名至少两个字'); $('#kfName').focus(); return; }
    if (name.length > 12) { toast('吧名最多十二个字'); $('#kfName').focus(); return; }

    /* 重名由服务端判，本机那份列表可能是几分钟前的 */
    api('POST', '/circles', { name: name, seal: seal, zone: zone, desc: desc })
      .then(function (d) {
        US[d.id] = { join: true, check: '', days: 0 };
        saveU();
        closeKModal();
        $('#kfName').value = '';
        $('#kfDesc').value = '';
        $('#kfSeal').value = '';
        return pull().then(function () {
          renderSquare();
          location.hash = '#/c/' + d.id;
          toast('「' + name + '吧」开好了，第一帖归你');
        });
      })
      .catch(function (e) { toast(e.message); });
  }

  /* ---------------- 吧主改吧的信息 ---------------- */
  function openEModal(c) {
    var me = myName();
    if (!c) return;
    var isOwner = c.mine != null ? !!c.mine : !!(me && me === c.owner);
    if (!isOwner) { toast('只有吧主能改这个吧的信息'); return; }

    $('#emWho').innerHTML = '以吧主「' + esc(me || c.owner) + '」的身份修改，保存后广场和吧里一起变。';

    var zhtml = '';
    ZONES.forEach(function (z) {
      zhtml += '<button type="button" data-z="' + z.id + '" class="' +
        (z.id === c.zone ? 'on' : '') + '">' + esc(z.n) + '</button>';
    });
    $('#efZones').innerHTML = zhtml;

    $('#efName').value = c.name;
    $('#efSeal').value = c.seal || '';
    $('#efDesc').value = c.desc || '';

    var m = $('#emodal');
    m.classList.add('is-on');
    m.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    setTimeout(function () { $('#efName').focus(); }, 120);
  }
  function closeEModal() {
    var m = $('#emodal');
    if (!m) return;
    m.classList.remove('is-on');
    m.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function saveCircleInfo() {
    if (!curC) return;
    var name = ($('#efName').value || '').trim().replace(/吧$/, '');
    var seal = ($('#efSeal').value || '').trim();
    var desc = ($('#efDesc').value || '').trim();
    var zb = $('#efZones').querySelector('button.on');
    var zone = zb ? zb.getAttribute('data-z') : curC.zone;

    if (name.length < 2) { toast('吧名至少两个字'); $('#efName').focus(); return; }
    if (name.length > 12) { toast('吧名最多十二个字'); $('#efName').focus(); return; }

    var cid = curC.id;
    api('PATCH', '/circles/' + cid, { name: name, seal: seal, zone: zone, desc: desc })
      .then(function () { return pull(); })
      .then(function () {
        closeEModal();
        var c2 = findCircle(cid);
        if (c2) showBar(c2);
        renderSquare();
        toast('「' + name + '吧」的信息改好了');
      })
      .catch(function (e) { toast(e.message); });
  }

  function openModal() {
    var me = myName();
    $('#cmWho').innerHTML = me
      ? (curC ? '以「' + esc(me) + '」的名义发在「' + esc(curC.name) + '吧」' : '以「' + esc(me) + '」的名义发帖')
      : '还没登录，' + loginHint() + '才能发帖。';
    var m = $('#cmodal');
    m.classList.add('is-on');
    m.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    setTimeout(function () { $('#cfTitle').focus(); }, 120);
  }
  function closeModal() {
    $('#cmodal').classList.remove('is-on');
    $('#cmodal').setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function publish() {
    var me = myName();
    if (!me) { toast('发帖之前请先登录'); return; }
    if (!curC) { toast('先挑一个吧'); return; }

    var title = ($('#cfTitle').value || '').trim();
    var body = ($('#cfBody').value || '').trim();
    if (title.length < 4) { toast('标题至少四个字'); $('#cfTitle').focus(); return; }
    if (body.length < 10) { toast('正文太短，写具体一点'); $('#cfBody').focus(); return; }

    var cb = $('#cfCats').querySelector('button.on');
    var tags = [].slice.call($('#cfTags').querySelectorAll('button.on')).map(function (b) { return b.textContent.trim(); });
    var cat = cb ? cb.getAttribute('data-c') : TCATS[0].id;
    var cid = curC.id;

    api('POST', '/circles/' + cid + '/posts', { title: title, cat: cat, tags: tags, body: body })
      .then(function () {
        $('#cfTitle').value = '';
        $('#cfBody').value = '';
        [].slice.call($('#cfTags').querySelectorAll('button.on')).forEach(function (b) { b.classList.remove('on'); });
        closeModal();

        S.cat = 'all'; S.kind = 'all'; S.page = 1; S.bq = '';
        $('#barQ').value = '';
        [].slice.call($('#btTabs').children).forEach(function (b, i) { b.classList.toggle('on', i === 0); });

        return pull().then(function () {
          var c2 = findCircle(cid);
          if (c2) curC = c2;
          repaintBar();
          toast('帖子发好了，就在这个吧的顶上');
          window.scrollTo(0, $('#barlist').getBoundingClientRect().top + window.pageYOffset - 110);
        });
      })
      .catch(function (e) { toast(e.message); });
  }

  function bindModals() {
    $('#btnNewCircle').addEventListener('click', function () { openKModal(); });
    $('#kmX').addEventListener('click', closeKModal);
    $('#kmBg').addEventListener('click', closeKModal);
    $('#kmPub').addEventListener('click', createCircle);
    $('#kfZones').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-z]');
      if (!b) return;
      [].slice.call(this.children).forEach(function (x) { x.classList.toggle('on', x === b); });
    });
    /* 吧名里带「吧」的人不少，去掉尾字，顺带把印章字跟上 */
    $('#kfName').addEventListener('input', function () {
      var v = this.value.replace(/吧$/, '');
      if (v !== this.value) this.value = v;
      var s = $('#kfSeal');
      if (!s.dataset.touched) s.value = v.slice(0, 1);
    });
    $('#kfSeal').addEventListener('input', function () { this.dataset.touched = this.value ? '1' : ''; });
    $('#kfName').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('#kfDesc').focus(); });

    $('#btnNew').addEventListener('click', openModal);
    $('#cmX').addEventListener('click', closeModal);
    $('#cmBg').addEventListener('click', closeModal);
    $('#cfCats').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-c]');
      if (!b) return;
      [].slice.call(this.children).forEach(function (x) { x.classList.toggle('on', x === b); });
    });
    $('#cfTags').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-t]');
      if (!b) return;
      if (b.classList.contains('on')) { b.classList.remove('on'); return; }
      if (this.querySelectorAll('button.on').length >= 3) { toast('一帖最多挂三个标签'); return; }
      b.classList.add('on');
    });
    $('#cmPub').addEventListener('click', publish);

    /* 改吧信息弹层 */
    $('#emX').addEventListener('click', closeEModal);
    $('#emBg').addEventListener('click', closeEModal);
    $('#emPub').addEventListener('click', saveCircleInfo);
    $('#efZones').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-z]');
      if (!b) return;
      [].slice.call(this.children).forEach(function (x) { x.classList.toggle('on', x === b); });
    });
    $('#efName').addEventListener('input', function () {
      var v = this.value.replace(/吧$/, '');
      if (v !== this.value) this.value = v;
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if ($('#cmodal').classList.contains('is-on')) closeModal();
      if ($('#kmodal').classList.contains('is-on')) closeKModal();
      if ($('#emodal') && $('#emodal').classList.contains('is-on')) closeEModal();
    });
  }

  /* ---------------- 启动 ----------------
     先把服务器上的数据拉下来再渲染；拉不到就给个空台子并说一声，
     不要让页面停在「加载中」那种既不空也不满的状态。 */
  bindSquare();
  bindBar();
  bindThread();
  bindModals();
  window.addEventListener('hashchange', route);
  window.addEventListener('popstate', route);

  loadU();
  pull()
    .then(function () { route(); })
    .catch(function (e) {
      DB.circles = [];
      route();
      toast('没连上社区服务：' + e.message);
    });
})();
