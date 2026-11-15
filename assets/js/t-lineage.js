/* ==========================================================================
   t-lineage.js —— 传承
   一 四个维度：时间 / 流派 / 风格 / 辈分
   二 谱系：四批名录按地域排，点开看名单
   三 五种传承方式
   四 五十人名册
   ========================================================================== */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var NS = 'http://www.w3.org/2000/svg';
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ==========================================================
     一 四个维度
     ========================================================== */
  var VIEWS = [
    { id: 'time', n: '按时间' },
    { id: 'school', n: '按流派' },
    { id: 'style', n: '按风格' },
    { id: 'gen', n: '按辈分' }
  ];

  var TIME = [
    {
      h: '一 · 1949 以前', n: '班社时代',
      items: [
        ['李芳桂', '清乾隆 · 关中'],
        ['黄素志', '明末 · 传说'],
        ['各班社掌签', '不留名']
      ],
      p: '影戏在这一段是「班子」的事：一个村子请戏，班子挑担子来，唱一夜，天亮挑走。掌签的、说戏的、司鼓的，多数人一辈子没留下名字。能查到名字的，几乎都是文人（写剧本的）或者被写进小说的传说人物。《梼杌闲评》里那位在临清码头演影戏的侯一娘，算是难得的一个。'
    },
    {
      h: '二 · 1949 — 2005', n: '剧团与汇演',
      items: [
        ['1955 全国会演', '文化部主办'],
        ['各地皮影剧团', '省、地两级'],
        ['影卷整理', '油印、抄本']
      ],
      p: '这一段的关键词是「组织起来」。1955 年文化部办全国木偶皮影戏观摩演出会，各地班子第一次同台；随后不少地方成立专业剧团，演员有了编制，影卷被整理油印，唱腔被记谱。好处是留下来了，代价是「庙会里那种演法」被剧场的演法替掉了。'
    },
    {
      h: '三 · 2006 至今', n: '名录与传承人',
      items: [
        ['2006 · 首批 13 项', '国家级名录'],
        ['2008–2018 · 四批', '50 位传承人'],
        ['2011 · 联合国名录', '中国皮影戏'],
        ['2018 后', '记录与带徒']
      ],
      p: '名录带来的不只是荣誉，还有义务：传承人要带徒、要记录、要参加展演。这一段的传人，多半同时是演员、老师、讲解员与短视频作者。手艺还是那套手艺，但要对付的场面比前两代多得多。'
    }
  ];

  var SCHOOL = [
    {
      h: '滦州影系', n: '冀东与东北',
      items: [
        ['唐山 · 乐亭', '驴皮 · 掐嗓'], ['昌黎', '驴皮'], ['冀南 · 邯郸', '牛皮'],
        ['复州 · 瓦房店', '驴皮'], ['凌源 · 喀左', '驴皮'], ['望奎', '驴皮'], ['北京', '驴皮']
      ],
      p: '滦州一路是今天影人最多、传播最广的一支。清代沿滦河与渤海湾走，民初出关进了东北，一路唱「乐亭口」。它的影人做得大（25–40 厘米，高的到 50），一个武生能占掉半幅幕布；唱法用掐嗓，声音高低自己控。'
    },
    {
      h: '秦晋影系', n: '陕甘晋青豫',
      items: [
        ['华县 · 华州', '碗碗腔'], ['华阴', '老腔'], ['孝义', '皮腔'],
        ['环县 · 庆阳', '道情'], ['通渭', '影子腔'], ['湟中 · 河湟', '平弦'], ['罗山 · 桐柏', '豫南调']
      ],
      p: '这一系横跨四省，靠渭水与黄河的通道连起来。关中一路最讲究刀工，「推皮走刀」的说法就从这儿来；陇东一路头大身小、手臂过膝；河湟一路的影人「头大、腰细、袖宽」。同一系里，四地的影人摆在一起，比例全不一样。'
    },
    {
      h: '江南 · 岭南 · 西南', n: '另一套系统',
      items: [
        ['海宁', '羊皮 · 重彩绘'], ['陆丰 · 潮州', '牛皮 · 白字曲'],
        ['云梦 · 江汉', '门神谱'], ['长沙 · 湘潭', '纸影'], ['成都 · 川北', '大灯影'], ['腾冲 · 易门', '靠子']
      ],
      p: '南方这几路跟北方不是一套：海宁用羊皮、少雕镂、重彩绘；长沙用纸壳，影人高到六十厘米；四川的大灯影做到八十厘米，个别近一米；腾冲的「靠子」皮厚人高，签子以单臂为主。影人越大，刻工越经不起近看，所以南方靠彩绘，北方靠刀工。'
    }
  ];

  var STYLE = [
    {
      h: '刻工一路', n: '看刀，不看色',
      items: [['华县', '推皮走刀'], ['唐山', '刀法细密'], ['凌源', '先繁后简'], ['孝义', '刀法犀利']],
      p: '这一路的本事全在刀上：阳刻线条一气贯通，阴刻留白宽窄一致。颜色只是辅助，靠皮子透光显出层次。影人通常不大（25–40 厘米），因为只有小，细密的刀工才经得起看。'
    },
    {
      h: '彩绘一路', n: '看色，刀从简',
      items: [['海宁', '羊皮重彩'], ['长沙', '纸影彩绘'], ['陆丰', '彩绘'], ['川北', '大影彩绘']],
      p: '这一路反过来：影人做得大，刀工从简，靠色块与线条撑住。海宁皮影用羊皮，少雕镂、重彩绘，脸谱近乎平涂；长沙纸影干脆用纸壳，画上去就完事。远看更热闹，近看细节少。'
    },
    {
      h: '说唱一路', n: '腔比影子重',
      items: [['环县', '一字一唱'], ['华阴', '拉坡帮腔'], ['泰山', '一人十不闲'], ['江汉', '筒子腔']],
      p: '这一路的重心不在影人，在嗓子和乐器。环县道情一字一唱，似说似唱；华阴老腔一人唱众人帮腔，声腔刚直；泰山皮影更极端，一个人脚踩锣鼓、口里唱、双手操签，叫「十不闲」。听这一路的戏，闭着眼也能听完。'
    }
  ];

  var GENS = [
    { no: '第一代', t: '清末民初 · 19 世纪末 — 1930 年代', p: '班社时代的掌签与说戏。走村串巷，一台戏换一斗粮。绝大多数人不留名，手艺靠口传与「样子」（谱本）。', w: 34 },
    { no: '第二代', t: '1930 — 1950 年代', p: '赶上会演与建团。第一次进剧场、第一次被记录、第一次拿工资。他们把庙会的演法改成了舞台的演法。', w: 52 },
    { no: '第三代', t: '1960 — 1980 年代', p: '最难的一代。运动来了班子散，很多人改行去工厂、去务农。手艺断在不少人手上，也有人在夜里偷偷练。', w: 44 },
    { no: '第四代', t: '1990 — 2010 年代', p: '进名录、被认定。有了名分，也有了义务：带徒、记录、展演。这一代开始学着面对镜头与记者。', w: 78 },
    { no: '第五代', t: '2010 年代 — 今', p: '进校园、做短视频、学设计。会刻也会拍，会唱也会剪。手艺没变，观众变了，找观众的方式也变了。', w: 94 }
  ];

  var dimBox = $('#lxDims');
  var views = { time: $('#vTime'), school: $('#vSchool'), style: $('#vStyle'), gen: $('#vGen') };

  function colsHTML(arr) {
    return '<div class="lx-cols">' + arr.map(function (c) {
      return '<div class="lx-col"><div class="lx-col-h"><h4>' + esc(c.h) + '</h4><span>' + esc(c.n) + '</span></div>' +
        '<div class="lx-names">' + c.items.map(function (it) {
          return '<span>' + esc(it[0]) + (it[1] ? '<i>' + esc(it[1]) + '</i>' : '') + '</span>';
        }).join('') + '</div>' +
        '<p style="margin:14px 0 0;font-size:12px;line-height:1.95;color:rgba(74,58,39,.8);text-align:justify">' + esc(c.p) + '</p>' +
        '</div>';
    }).join('') + '</div>';
  }

  function renderViews() {
    views.time.innerHTML = colsHTML(TIME);
    views.school.innerHTML = colsHTML(SCHOOL);
    views.style.innerHTML = colsHTML(STYLE);

    views.gen.innerHTML = '<div class="lx-ladder">' + GENS.map(function (g) {
      return '<div class="lx-gen"><div class="lx-gen-no">' + esc(g.no) + '</div>' +
        '<div class="lx-gen-body"><h4>' + esc(g.t) + '</h4><p>' + esc(g.p) + '</p>' +
        '<div class="lx-gen-bar"><i style="width:' + g.w + '%"></i></div></div></div>';
    }).join('') + '</div>' +
      '<p class="tp-note">横条表示「留下记录的程度」：第一代几乎只在方志与口述里出现，第五代从学艺第一天就有人拍。这不是人数，也不是水平。</p>';
  }

  function pick(id) {
    $$('.ax-chip', dimBox).forEach(function (b) { b.classList.toggle('on', b.dataset.v === id); });
    Object.keys(views).forEach(function (k) { views[k].hidden = k !== id; });
  }

  if (dimBox) {
    dimBox.innerHTML = VIEWS.map(function (v, i) {
      return '<button class="ax-chip' + (i === 0 ? ' on' : '') + '" type="button" data-v="' + v.id + '" style="--c:#9d2c1c"><i></i>' + v.n + '</button>';
    }).join('');
    $$('.ax-chip', dimBox).forEach(function (b) {
      b.addEventListener('click', function () { pick(b.dataset.v); });
    });
    renderViews();
    pick('time');
  }

  /* ==========================================================
     二 谱系：四批名录
     ========================================================== */
  var BATCHES = [
    {
      y: '2008', t: '第二批', groups: [
        { n: '唐山', p: '河北省', sys: '滦州影系', names: ['丁振耀', '齐永衡'] },
        { n: '冀南', p: '河北省', sys: '滦州影系', names: ['傅希贤', '申国瑞'] },
        { n: '孝义', p: '山西省', sys: '秦晋影系', names: ['梁全民', '李世伟'] },
        { n: '复州', p: '辽宁省', sys: '滦州影系', names: ['宋国超', '孙德深'] },
        { n: '海宁', p: '浙江省', sys: '杭州影系', names: ['徐二男'] },
        { n: '江汉平原', p: '湖北省', sys: '川鄂滇影系', names: ['汤先成', '刘年华'] },
        { n: '陆丰', p: '广东省', sys: '潮州影系', names: ['蔡锦镇', '彭忠'] },
        { n: '华县', p: '陕西省', sys: '秦晋影系', names: ['刘华', '魏金全', '潘京乐'] },
        { n: '华阴', p: '陕西省', sys: '秦晋影系', names: ['王振中', '张喜民'] },
        { n: '弦板腔', p: '陕西省', sys: '秦晋影系', names: ['李育亭', '丁碧霞'] },
        { n: '环县', p: '甘肃省', sys: '秦晋影系', names: ['史呈林', '高清旺'] },
        { n: '凌源', p: '辽宁省', sys: '滦州影系', names: ['徐积山', '刘景春'] }
      ]
    },
    {
      y: '2009', t: '第三批', groups: [
        { n: '唐山', p: '河北省', sys: '滦州影系', names: ['刘佳文'] },
        { n: '冀南', p: '河北省', sys: '滦州影系', names: ['李修山'] },
        { n: '海宁', p: '浙江省', sys: '杭州影系', names: ['王钱松', '张坤荣', '沈圣标'] },
        { n: '望奎', p: '黑龙江省', sys: '滦州影系', names: ['谷宝珍'] },
        { n: '泰山', p: '山东省', sys: '山东影系', names: ['范正安'] },
        { n: '济南', p: '山东省', sys: '山东影系', names: ['李兴时'] },
        { n: '罗山', p: '河南省', sys: '秦晋影系', names: ['陈光辉'] }
      ]
    },
    {
      y: '2013', t: '第四批', groups: [
        { n: '昌黎', p: '河北省', sys: '滦州影系', names: ['张向东'] },
        { n: '龙江', p: '黑龙江省', sys: '滦州影系', names: ['薛兆平'] },
        { n: '云梦', p: '湖北省', sys: '川鄂滇影系', names: ['秦礼刚'] },
        { n: '湖南', p: '湖南省', sys: '湘赣影系', names: ['李桂香'] },
        { n: '四川', p: '四川省', sys: '川鄂滇影系', names: ['王彪'] },
        { n: '腾冲', p: '云南省', sys: '川鄂滇影系', names: ['刘永周'] },
        { n: '华县', p: '陕西省', sys: '秦晋影系', names: ['汪天稳'] },
        { n: '河湟', p: '青海省', sys: '秦晋影系', names: ['靳生昌'] }
      ]
    },
    {
      y: '2018', t: '第五批', groups: [
        { n: '北京', p: '北京市', sys: '滦州影系', names: ['路宝刚'] },
        { n: '唐山', p: '河北省', sys: '滦州影系', names: ['彭佐臣'] },
        { n: '乐亭', p: '河北省', sys: '滦州影系', names: ['梁素芝'] },
        { n: '巴林左旗', p: '内蒙古自治区', sys: '滦州影系', names: ['李国华'] },
        { n: '岫岩', p: '辽宁省', sys: '滦州影系', names: ['吕正业'] },
        { n: '盖州', p: '辽宁省', sys: '滦州影系', names: ['林世敏'] },
        { n: '四川', p: '四川省', sys: '川鄂滇影系', names: ['王访'] },
        { n: '通渭', p: '甘肃省', sys: '秦晋影系', names: ['刘满仓'] },
        { n: '河湟', p: '青海省', sys: '秦晋影系', names: ['周邦辉'] }
      ]
    }
  ];

  /* 能查到公开照片的传承人（照片来自公开报道，见页尾说明） */
  var PHOTOS = {
    '范正安': 'assets/img/people/fan.jpg',
    '宋国超': 'assets/img/people/song.jpg',
    '汪天稳': 'assets/img/people/wang.jpg',
    '魏金全': 'assets/img/people/wei.jpg',
    '张向东': 'assets/img/people/zhang.jpg'
  };

  var treeBox = $('#lxTree');
  var side = $('#lxSide');

  function drawTree() {
    if (!treeBox) return;
    var maxG = 0;
    BATCHES.forEach(function (b) { maxG = Math.max(maxG, b.groups.length); });
    /* 窄屏排两列（两批一行），宽屏四批一排 */
    var narrow = window.innerWidth < 780;
    var cols = narrow ? 2 : BATCHES.length;
    var colW = narrow ? 150 : 168, gapX = 12, top = 54, boxH = 28, gapY = 8;
    var rowH = top + maxG * (boxH + gapY) + 22;
    var rows = Math.ceil(BATCHES.length / cols);
    var width = cols * (colW + gapX) + 20;
    var height = rows * rowH;

    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);

    BATCHES.forEach(function (b, ci) {
      var x = 10 + (ci % cols) * (colW + gapX);
      var oy = Math.floor(ci / cols) * rowH;
      var total = b.groups.reduce(function (a, g) { return a + g.names.length; }, 0);

      var ht = document.createElementNS(NS, 'text');
      ht.setAttribute('x', x);
      ht.setAttribute('y', oy + 22);
      ht.setAttribute('font-family', '"Songti SC","SimSun",serif');
      ht.setAttribute('font-size', '13');
      ht.setAttribute('fill', '#9d2c1c');
      ht.setAttribute('letter-spacing', '.08em');
      ht.textContent = b.y + ' · ' + b.t;
      svg.appendChild(ht);

      var st = document.createElementNS(NS, 'text');
      st.setAttribute('x', x);
      st.setAttribute('y', oy + 40);
      st.setAttribute('font-family', '"Songti SC","SimSun",serif');
      st.setAttribute('font-size', '10');
      st.setAttribute('fill', 'rgba(91,74,53,.62)');
      st.textContent = b.groups.length + ' 地 · ' + total + ' 人';
      svg.appendChild(st);

      b.groups.forEach(function (g, gi) {
        var y = oy + top + gi * (boxH + gapY);
        var grp = document.createElementNS(NS, 'g');
        grp.setAttribute('class', 'lx-p');
        grp.setAttribute('data-b', ci);
        grp.setAttribute('data-g', gi);
        grp.style.cursor = 'pointer';

        var rect = document.createElementNS(NS, 'rect');
        rect.setAttribute('x', x);
        rect.setAttribute('y', y);
        rect.setAttribute('width', colW);
        rect.setAttribute('height', boxH);
        rect.setAttribute('rx', '2');
        rect.setAttribute('fill', 'rgba(255,255,255,.7)');
        rect.setAttribute('stroke', 'rgba(90,62,32,.24)');
        grp.appendChild(rect);

        var t1 = document.createElementNS(NS, 'text');
        t1.setAttribute('x', x + 10);
        t1.setAttribute('y', y + 18);
        t1.setAttribute('font-family', '"Songti SC","SimSun",serif');
        t1.setAttribute('font-size', '11.5');
        t1.setAttribute('fill', '#3b2d1d');
        t1.textContent = g.n;
        grp.appendChild(t1);

        var t2 = document.createElementNS(NS, 'text');
        t2.setAttribute('class', 'lx-p-sub');
        t2.setAttribute('x', x + colW - 10);
        t2.setAttribute('y', y + 18);
        t2.setAttribute('text-anchor', 'end');
        t2.setAttribute('font-family', '"Songti SC","SimSun",serif');
        t2.setAttribute('font-size', '9.5');
        t2.setAttribute('fill', 'rgba(157,44,28,.8)');
        t2.textContent = g.names.length + ' 人';
        grp.appendChild(t2);

        grp.addEventListener('click', function () { showGroup(ci, gi); });
        svg.appendChild(grp);
      });
    });

    treeBox.innerHTML = '';
    treeBox.appendChild(svg);
  }

  var cur = [0, 0];
  function showGroup(ci, gi) {
    cur = [ci, gi];
    var b = BATCHES[ci], g = b.groups[gi];
    $$('.lx-p', treeBox).forEach(function (n) {
      n.classList.toggle('on', +n.dataset.b === ci && +n.dataset.g === gi);
    });
    var photos = g.names.filter(function (n) { return PHOTOS[n]; }).map(function (n) {
      return '<figure><img src="' + PHOTOS[n] + '" alt="' + esc(n) + '" loading="lazy"><figcaption>' + esc(n) + '</figcaption></figure>';
    }).join('');
    side.innerHTML =
      '<h4>' + esc(g.n) + '</h4>' +
      '<p class="lx-side-meta">' + esc(b.y + ' ' + b.t) + ' · ' + esc(g.p) + ' · ' + esc(g.sys) + '</p>' +
      (photos ? '<div class="lx-side-photos">' + photos + '</div>' : '') +
      '<p>' + esc(g.names.join('、')) + '</p>' +
      '<div class="lx-chain">这一格是 <b>' + g.names.length + ' 位</b>国家级代表性传承人，' +
      (g.names.length > 1 ? '同一地往往同时认定掌签、说唱、雕刻几个方向的人。' : '这一地只认定了一位，通常是最具代表性的那一位。') +
      '所在流派见「流派地图」一页。</div>';
  }

  drawTree();
  if (side) showGroup(0, 0);
  var rt;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () { drawTree(); showGroup(cur[0], cur[1]); }, 220);
  });

  /* ==========================================================
     三 五种方式
     ========================================================== */
  var WAYS = [
    { n: '师徒制', s: '最正式的一种', p: '磕头、立字、住师父家，学三年出师。传的是全套：刻、操、唱、打。今天仍是主流，但「住师父家」已经很少了。' },
    { n: '家族世传', s: '血缘加手艺', p: '父传子、叔传侄。孩子从会走路就泡在戏箱边上，不用专门教。影戏班里父子档、兄弟档极多，也是它最难被外人替代的原因。' },
    { n: '剧团科班', s: '1950 年代以后', p: '进团当学员，按行当分角色，有老师、有课程、有工资。传得规范，也传得「只剩台上那一段」。' },
    { n: '学校课程', s: '2000 年代以后', p: '非遗进校园、进高校课堂。传的是知识与体验：知道皮影是怎么回事、会刻一个小件、会演一小段。深度有限，覆盖面最大。' },
    { n: '数字记录', s: '正在发生', p: '高清建档、工序录像、AI 生成、短视频。传的是数据与传播力。它留得住「形」与「法」，留不住手感，但让下一批看客有了入口。' }
  ];

  var waysBox = $('#lxWays');
  if (waysBox) {
    waysBox.innerHTML = WAYS.map(function (w) {
      return '<div class="lx-way"><b>' + esc(w.n) + '</b><span>' + esc(w.s) + '</span><p>' + esc(w.p) + '</p></div>';
    }).join('');
  }

  /* ==========================================================
     四 名册
     ========================================================== */
  var roster = $('#lxRoster');
  if (roster) {
    var html = '';
    BATCHES.forEach(function (b) {
      b.groups.forEach(function (g) {
        g.names.forEach(function (n) {
          html += '<div class="lx-person' + (PHOTOS[n] ? ' has-photo' : '') + '">' +
            (PHOTOS[n] ? '<img src="' + PHOTOS[n] + '" alt="' + esc(n) + '" loading="lazy">' : '') +
            '<b>' + esc(n) + '</b><span>' + esc(g.n + ' · ' + g.p) + '</span>' +
            '<em>' + esc(b.y + ' ' + b.t) + '</em></div>';
        });
      });
    });
    roster.innerHTML = html;
  }
})();
