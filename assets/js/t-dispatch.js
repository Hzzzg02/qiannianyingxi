/* ==========================================================================
   t-dispatch.js —— 影讯
   一 报道流：九条，可按类别筛，点开读全文
   二 政策年表：六个节点，点年份展开
   三 名录数字 + 省区市标签
   四 数字化的三条路（静态，见 HTML）
   正文直接取 news-data.js 的原文摘编，不二次改写。
   ========================================================================== */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var NEWS = window.NEWS || {};

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escAttr(s) { return esc(s).replace(/"/g, '&quot;'); }

  var list = Object.keys(NEWS).map(function (k) { return NEWS[k]; })
    .sort(function (a, b) { return a.date < b.date ? 1 : -1; });

  /* 正文里只允许这些标签，其余当纯文本 */
  function safeBody(html) {
    return String(html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<(\/?)(h4|p|b|i|br|em|strong)\b[^>]*>/gi, '<$1$2>');
  }

  var box = $('#dxList');
  var filterBox = $('#dxFilter');
  var countEl = $('#dxCount');
  var curCat = '全部';

  function catList() {
    var out = ['全部'];
    list.forEach(function (n) { if (out.indexOf(n.cat) < 0) out.push(n.cat); });
    return out;
  }

  function renderFilter() {
    filterBox.innerHTML = catList().map(function (c, i) {
      var n = c === '全部' ? list.length : list.filter(function (x) { return x.cat === c; }).length;
      return '<button class="ax-chip' + (i === 0 ? ' on' : '') + '" type="button" data-c="' + escAttr(c) + '" style="--c:#9d2c1c"><i></i>' +
        esc(c) + ' <b style="font-weight:400;opacity:.6">' + n + '</b></button>';
    }).join('');
    $$('.ax-chip', filterBox).forEach(function (b) {
      b.addEventListener('click', function () {
        $$('.ax-chip', filterBox).forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        curCat = b.dataset.c;
        render();
      });
    });
  }

  function itemHTML(n) {
    var d = String(n.date || '').split('-');
    return '<article class="dx-item">' +
      '<div class="dx-date"><b>' + esc(d[2] || '') + '</b>' + esc(d[0] + '·' + d[1]) + '</div>' +
      '<div class="dx-main">' +
      '<div class="dx-tags"><span class="tp-tag">' + esc(n.cat) + '</span>' +
      '<span class="tp-tag" style="background:transparent;border-color:rgba(90,62,32,.16);color:rgba(91,74,53,.7)">' + esc(n.source) + '</span></div>' +
      '<h3>' + esc(n.title) + '</h3>' +
      '<p>' + esc(n.lead) + '</p>' +
      '<div class="dx-body"><div class="dx-body-in">' +
      safeBody(n.body) +
      (n.img ? '<figure><img src="' + escAttr(n.img) + '" alt="' + escAttr(n.pic || n.title) + '" loading="lazy">' +
        (n.pic ? '<figcaption>' + esc(n.pic) + '</figcaption>' : '') + '</figure>' : '') +
      '<p class="dx-src">原文：<a href="' + escAttr(n.url) + '" target="_blank" rel="noopener noreferrer">' + esc(n.source) + '</a> · ' + esc(n.date) + '</p>' +
      '</div></div>' +
      '</div>' +
      '<div class="dx-go">展开 →</div>' +
      '</article>';
  }

  function render() {
    var arr = curCat === '全部' ? list : list.filter(function (n) { return n.cat === curCat; });
    countEl.innerHTML = '当前 <b>' + arr.length + '</b> 条 · 共 ' + list.length + ' 条';
    box.innerHTML = arr.map(itemHTML).join('');
    $$('.dx-item', box).forEach(function (it) {
      it.addEventListener('click', function (e) {
        if (e.target.closest('a')) return;
        var on = it.classList.toggle('on');
        $('.dx-go', it).textContent = on ? '收起 ↑' : '展开 →';
      });
    });
  }

  renderFilter();
  render();

  /* ==========================================================
     二 政策年表
     ========================================================== */
  var POLICY = [
    {
      y: '2006', t: '第一批国家级非物质文化遗产名录公布',
      d: '2006 年 5 月 20 日，国务院公布第一批国家级非物质文化遗产名录，皮影戏列在其中，首批 13 项。这一年后来被当作皮影戏「进入名录体系」的起点：项目有了编号，保护有了责任单位。'
    },
    {
      y: '2008', t: '扩展项目公布，皮影戏增列 14 项',
      d: '2008 年 6 月，第一批国家级名录的扩展项目公布，皮影戏由 13 项增至 27 项，涉及 17 个省区市。扩展的数量超过首批，说明各地影戏的差异在申报中被承认了：同样是皮影戏，唱腔不同，保护单位也不同。'
    },
    {
      y: '2011', t: '《中华人民共和国非物质文化遗产法》通过',
      d: '2011 年 2 月 25 日通过，同年 6 月 1 日施行。这是第一次用法律而不是文件来规定非遗的调查、代表性项目名录、传承与传播，以及不履行保护责任的后果。'
    },
    {
      y: '2011', t: '中国皮影戏列入联合国教科文组织名录',
      d: '2011 年 11 月 27 日，在印度尼西亚巴厘岛举行的保护非物质文化遗产政府间委员会第六次会议上，中国皮影戏列入人类非物质文化遗产代表作名录。申报的是「中国皮影戏」一个整体项目，不是一个省。'
    },
    {
      y: '2018', t: '第五批国家级代表性传承人公布',
      d: '2018 年 5 月 8 日，文化和旅游部公布第五批国家级非物质文化遗产代表性项目代表性传承人名单，皮影戏 9 人。传承人有了名字，也有了义务：带徒、传艺、记录。'
    },
    {
      y: '2021', t: '《关于进一步加强非物质文化遗产保护工作的意见》',
      d: '2021 年 8 月，中共中央办公厅、国务院办公厅印发该意见，提出到 2025 年非遗保护传承体系更加健全，到 2035 年全面形成保护传承体系。影戏这类「人在艺在」的项目，此后更强调记录与带徒。'
    }
  ];

  var pol = $('#dxPolicy');
  if (pol) {
    pol.innerHTML = POLICY.map(function (p, i) {
      return '<div class="dx-prow" role="button" tabindex="0" aria-expanded="false">' +
        '<span class="dx-pyear">' + p.y + '</span>' +
        '<span class="dx-pdot"></span>' +
        '<span class="dx-pbody"><h4>' + esc(p.t) + '</h4>' +
        '<span class="dx-pmore"><p>' + esc(p.d) + '</p></span></span>' +
        '</div>';
    }).join('');
    $$('.dx-prow', pol).forEach(function (b) {
      function toggle() {
        var on = b.classList.toggle('on');
        b.setAttribute('aria-expanded', on ? 'true' : 'false');
      }
      b.addEventListener('click', toggle);
      b.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
      });
    });
  }

  /* ==========================================================
     三 省区市标签
     ========================================================== */
  var PROVS = ['河北省', '山西省', '内蒙古自治区', '辽宁省', '黑龙江省', '浙江省',
    '安徽省', '山东省', '河南省', '湖北省', '湖南省', '广东省', '四川省', '云南省',
    '陕西省', '甘肃省', '青海省'];

  var prov = $('#dxProv');
  if (prov) {
    prov.innerHTML = PROVS.map(function (p) { return '<span class="dx-chip-prov">' + esc(p) + '</span>'; }).join('');
  }
})();
