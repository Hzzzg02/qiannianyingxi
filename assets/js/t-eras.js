/* ==========================================================================
   t-eras.js —— 影史专题页
   一 时间轴（八期，可点、可拖、可键盘）
   二 四代灯（改幕布亮度与色温）
   三 六部文献（点开看原文与「能证什么」）
   四 三百件藏品的年代剖面（由 LIB_DATA 实时统计）
   ========================================================================== */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var IMG_VER = '2512d';

  function src(p) {
    return 'assets/img/lib/' + String(p).replace(/^images\//, '').replace(/\\/g, '/') + '?v=' + IMG_VER;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ==========================================================
     数据：八期
     blocks 三段固定顺序：记下来的 / 推出来的 / 灯、幕、影人
     evi 只在没有实物留存的期里出现
     ========================================================== */
  var ERAS = [
    {
      seal: '汉', name: '汉', years: '前 2 世纪 — 220', tick: '前2世纪',
      mark: 'assets/img/eras/pat/han.webp',
      short: '方士设帐张灯，为汉武帝现李夫人之形。这条材料记的是一场招魂，不是一台戏，但灯、幕、影三件事第一次写在同一段文字里。',
      keys: ['帷帐张灯', '求像不求演', '无脚本', '一盏豆油灯'],
      blocks: [
        { h: '记下来的', p: '《汉书·外戚传》记李夫人早卒，汉武帝思念不已，方士少翁说能把她的魂请来。当夜张灯烛、设帷帐、陈酒肉，让武帝坐在另一顶帐里遥望，看见一个像李夫人的影子还幄坐而步，却不能近看。' },
        { h: '推出来的', p: '影子依附的是巫术与丧仪，只求像，不论演。没有故事结构，没有角色分工，一场里只有一两个影。影戏这个词此时还不存在，把它当作源头，是后人的追认。' },
        { h: '灯、幕、影人', p: '光源是一盏豆油灯，幕是帷帐，影是真人立在帐后。影清不清楚全看灯焰稳不稳，一盏灯加一个人，就是全部设备。' }
      ],
      evi: [
        { t: '文献', b: '《汉书·外戚传》', s: '现存最早把「张灯、帷帐、人影」写在一起的文字。' },
        { t: '图像', b: '汉画像石里的帷帐人物', s: '山东、河南、四川出土的画像石常见帷帐与人物剪影的组合，但那是刻在石头上的画，不是能操耍的影偶。' },
        { t: '实物', b: '无', s: '皮、纸、绢都留不住两千年。这一期没有任何影偶传世，所有说法都只能落在文字上。' }
      ]
    },
    {
      seal: '唐', name: '唐', years: '618 — 907', tick: '唐',
      mark: 'assets/img/eras/pat/tang.webp',
      short: '唐代文献里「影戏」二字难找。能查到的是寺院俗讲、变文与僧讲的盛况，有学者把这条线接到影戏上，属于推测，不能当定论。',
      keys: ['寺院俗讲', '变文与画', '僧侣辅讲', '记载稀见'],
      blocks: [
        { h: '记下来的', p: '日僧圆仁《入唐求法巡礼行记》记长安诸寺开俗讲，士庶云集；敦煌写卷里留下一批变文底本，讲唱时有画图配合，所谓「一道处，先铺画，后说唱」。' },
        { h: '推出来的', p: '讲唱要图，图要被人看见，于是有人想到用光把图投出来。这条推理链在学界有支持也有反对，反对的理由很直接：唐代没有一条材料直接说「用灯影演故事」。' },
        { h: '灯、幕、影人', p: '灯还是油灯，幕多是寺院壁面或临时帷帐，所谓影人尚未独立成偶，多是僧人手持的影物。影戏在这一期更像一种讲唱的辅助手段，还不是独立的剧种。' }
      ],
      evi: [
        { t: '文献', b: '《入唐求法巡礼行记》', s: '圆仁记会昌年间长安寺院开俗讲，听众填咽寺舍。讲唱之盛，是影戏可能借力的土壤。' },
        { t: '文本', b: '敦煌变文写卷', s: '《降魔变文》《目连变文》一类底本，说明「说」与「画」的配合在唐代已经成熟。' },
        { t: '实物', b: '无', s: '唐代没有影偶或影窗实物出土，这一段的分期只能靠间接材料撑住。' }
      ]
    },
    {
      seal: '宋', name: '宋', years: '960 — 1279', tick: '宋',
      mark: 'assets/img/eras/pat/song.webp',
      short: '汴京瓦舍勾栏里有靠影戏吃饭的职业艺人，临安的艺人立了行会「绘革社」。影戏到宋代才算真正成为「戏」：有话本、有角色规范、有市场。',
      keys: ['瓦舍勾栏', '绘革社', '素纸改羊皮', '公忠正貌', '话本近讲史'],
      blocks: [
        { h: '记下来的', p: '《东京梦华录》记元宵夜里「每一坊巷口无乐棚去处，多设小影戏棚子」，多到可以当作走失小孩的招领处。《都城纪胜》《梦粱录》把影人的做法、话本的来路、角色的脸谱一并写清：素纸雕簇，后改羊皮，用彩色妆饰；话本与讲史书者颇同；公忠者雕以正貌，奸邪者刻以丑形。' },
        { h: '推出来的', p: '有行会，说明有人收徒、有人定价、有人管行规；有「正貌丑形」，说明角色已经类型化。洪迈《夷坚志》里那首咏影戏的诗写得最传神：三尺生绡作戏台，全凭十指逞诙谐。三尺之幕，十指之功，这两句把宋影的规模说尽了。' },
        { h: '灯、幕、影人', p: '油灯一盏，素纸或羊皮影人，幕约三尺。影人开始上色，红绿分明；一个班子三五人，一人操签，一人主唱，其余打鼓敲锣。' }
      ],
      evi: [
        { t: '文献', b: '《东京梦华录》「十六日」', s: '元宵街面多设小影戏棚子，是北宋影戏进入日常街市最直接的一条。' },
        { t: '文献', b: '《都城纪胜》「瓦舍众伎」', s: '素纸雕镞、彩色装皮、话本近讲史、忠奸分貌，南宋影戏的全套规矩都在这几十字里。' },
        { t: '文献', b: '《武林旧事》「社会」', s: '临安诸社中有「绘革社」，下注「影戏」，是影戏艺人立行会的最早记录。' }
      ]
    },
    {
      seal: '元', name: '元', years: '1271 — 1368', tick: '元',
      mark: 'assets/img/eras/pat/yuan.webp',
      short: '波斯史家拉施特在《史集》里写下中国影戏的演法。影戏跟着军队与商路往西走，第一次有了中国以外的旁证；汉文文献里这一期反倒稀少。',
      keys: ['《史集》', '随军演出', '西传旁证', '剧本散佚'],
      blocks: [
        { h: '记下来的', p: '伊利汗国史家拉施特主编《史集》，记中国影戏以灯取影、以人操偶的演法。这条常被用来证明 13 世纪影戏已在蒙古宫廷与军中流行，也被当作影戏西传的旁证。' },
        { h: '推出来的', p: '军队与驿站把艺人带得很远，影戏轻便，一盏灯一块幕就能开台，最适合流动。元代汉文文献里影戏记载反而稀少，可能因为文人把兴趣转向了杂剧。' },
        { h: '灯、幕、影人', p: '油灯，布幕，影人沿宋制。这一期的影戏借杂剧的题材与唱腔过日子，却没有独立的影戏剧本传世。' }
      ],
      evi: [
        { t: '文献', b: '《史集》', s: '拉施特记中国影戏的操演方式，是境外文献对中国影戏最早的一批描述。' },
        { t: '旁证', b: '波斯、阿拉伯细密画中的影戏场面', s: '14 至 16 世纪的细密画里可见灯与幕的组合，常被引作影戏西传的图像旁证。' },
        { t: '实物', b: '无', s: '元代影偶没有可靠实物传世，剧本也一本不存。' }
      ]
    },
    {
      seal: '明', name: '明', years: '1368 — 1644', tick: '明',
      mark: 'assets/img/eras/pat/ming.webp',
      short: '影戏跟着运河与商路散开，声腔各自就着方言长。北京影戏起于正德年间，滦州一带的班社沿漕运线走，戏路和商路几乎重合。',
      keys: ['正德北京', '昆腔入影', '运河码头', '驴皮渐替纸影'],
      blocks: [
        { h: '记下来的', p: '北京皮影戏起于明正德年间，声腔吸收昆曲、京剧与曲艺，这一点在中国非物质文化遗产网的条目里写得很明确。小说《梼杌闲评》写临清艺人在运河码头上演影戏，看客是船工、脚夫与来往客商。' },
        { h: '推出来的', p: '码头是影戏流动的通道。班社沿漕运线走，一条运河把冀东、鲁西、苏北的影戏串起来，方言与曲调在每一站换一次。' },
        { h: '灯、幕、影人', p: '油灯，布幕，驴皮渐替纸影。皮子耐折，能刻细纹，也能上色，影人的脸开始有眉眼。' }
      ],
      evi: [
        { t: '文献', b: '《梼杌闲评》', s: '明末小说写临清码头演影戏，是市井场景里少见的影戏实录。' },
        { t: '条目', b: '中国非物质文化遗产网「北京皮影戏」', s: '记其形成于明正德年间，声腔吸收昆曲、京剧与曲艺。' },
        { t: '实物', b: '无', s: '明代影偶存世极少，多数博物馆的藏品从清代开始。' }
      ]
    },
    {
      seal: '清', name: '清', years: '1644 — 1911', tick: '清',
      mark: 'assets/img/eras/pat/ming.webp',
      obj: '清代',
      short: '影戏的鼎盛期。关中举人李芳桂写出「十大本」，四大影系各自定型，班社进京、进王府、也进庙会。今天能看到的影偶，绝大多数从这一朝开始。',
      keys: ['李芳桂十大本', '四大影系定型', '班社进京', '驴皮', '亮子三尺'],
      blocks: [
        { h: '记下来的', p: '清乾隆年间，关中举人李芳桂作皮影剧本，世称「十大本」，实为十部整本加三出折子戏，共十三个本子：政治爱情戏《白玉钿》《万福莲》《蝴蝶媒》《火焰驹》《清素庵》，公案爱情戏《香莲佩》《春秋配》《十王庙》《紫霞宫》《玉燕钗》，外加生活小戏《古董借妻》《四岔捎书》《玄玄锄谷》。' },
        { h: '推出来的', p: '文人肯为影戏写整本，说明看客要听故事，不只是看热闹。影戏从段子长成戏，文学这一环到清代才补齐。' },
        { h: '灯、幕、影人', p: '油灯一盏，亮子约三尺高五尺宽，一个整身影人通常三十到四十厘米，由头茬、戳子、胳膊、手、腿脚缀连而成，操耍用三根竹签：一根主签撑身子，两根手签管两臂。' }
      ]
    },
    {
      seal: '民', name: '民国', years: '1912 — 1949', tick: '民国',
      mark: 'assets/img/eras/pat/modern.webp',
      obj: '中华民国',
      short: '电影进城，影戏退出城市戏院，转回乡镇庙会与红白事。冀东的影班出关，把滦州影一路带到东北，馆藏里辽宁、河北的那一批影偶就是这么来的。',
      keys: ['电影登场', '戏院改映', '庙会与红白事', '影人出关', '汽灯上台'],
      blocks: [
        { h: '记下来的', p: '通行戏曲史的叙述是：民国以后电影进入城市戏院，影戏在城市失去主场，转向乡镇。这一期影戏的记载多是地方志与班社口述，系统文献反而少。' },
        { h: '推出来的', p: '退回乡镇不等于衰败。庙会、还愿、红白事是稳定的场合，神戏与愿戏的需求撑住了班子；观众变了，剧目也跟着变，历史戏让位给神怪戏与彩头戏。' },
        { h: '灯、幕、影人', p: '汽灯进了戏台，白光比油灯亮得多，幕敢放到六尺，影人也做得更细。这一期的影偶今天最容易见到，馆藏里有十六件出自民国。' }
      ]
    },
    {
      seal: '今', name: '当代', years: '1949 — 今', tick: '今',
      mark: 'assets/img/eras/pat/modern.webp',
      obj: '中华人民共和国',
      short: '1955 年全国木偶皮影戏观摩演出，影戏第一次被当作「艺术」来会演；2006 年进首批国家级名录，2011 年进联合国名录。现在多了一条数字化的路。',
      keys: ['1955 会演', '2006 首批 13 项', '2011 联合国名录', '数字化'],
      blocks: [
        { h: '记下来的', p: '1955 年，文化部举办全国木偶皮影戏观摩演出会，各地班子第一次同台。2006 年 5 月 20 日，皮影戏列入第一批国家级非物质文化遗产名录，首批 13 项；2008 年 6 月扩展 14 项，涉及 17 个省区市。2011 年 11 月 27 日，中国皮影戏列入联合国教科文组织人类非物质文化遗产代表作名录。' },
        { h: '推出来的', p: '从「演戏」变成「非遗」，评价标准也跟着变：过去看票房与口碑，现在看谱系与技艺。传承人制度把师承写成了文件，好处是有人管，难处是文件管不住看客。' },
        { h: '灯、幕、影人', p: '电灯、卤钨灯到 LED，亮度稳定可调，幕可以放到数米，影偶能进剧场；也可以反过来，把影偶放到屏幕前拍成动画。技术这一环，今天不再是限制。' }
      ]
    }
  ];

  /* ==========================================================
     一 时间轴
     ========================================================== */
  var strip = $('#exStrip');
  var dotsBox = $('#exDots');
  var fill = $('#exFill');
  var panel = $('#exPanel');
  var cur = -1;

  function buildDots() {
    if (!dotsBox) return;
    var n = ERAS.length;
    dotsBox.innerHTML = ERAS.map(function (e, i) {
      var left = ((i + 0.5) / n * 100).toFixed(3);
      return '<button class="ex-dot" type="button" role="tab" aria-selected="false" data-i="' + i +
        '" style="left:' + left + '%"><i></i><b>' + esc(e.name) + '</b><span>' + esc(e.tick) + '</span></button>';
    }).join('');
    $$('.ex-dot', dotsBox).forEach(function (b) {
      b.addEventListener('click', function () { select(+b.dataset.i); });
    });
  }

  function pickObjects(eraKey, count) {
    var D = window.LIB_DATA;
    if (!D || !D.items) return [];
    var used = {}, out = [];
    D.items.forEach(function (it) {
      if (it.a !== eraKey || out.length >= count) return;
      var key = it.r || it.p || '';
      if (used[key]) return;
      used[key] = 1;
      out.push(it);
    });
    if (out.length < count) {
      D.items.forEach(function (it) {
        if (it.a === eraKey && out.length < count && out.indexOf(it) < 0) out.push(it);
      });
    }
    return out;
  }

  function renderPanel(i) {
    var e = ERAS[i];
    if (!e || !panel) return;
    var mark = $('#exMark');
    if (mark) mark.src = e.mark;
    $('#exSeal').textContent = e.seal;
    $('#exName').textContent = e.name;
    $('#exYears').textContent = e.years;
    $('#exShort').textContent = e.short;
    $('#exKeys').innerHTML = e.keys.map(function (k) { return '<span>' + esc(k) + '</span>'; }).join('');

    var imgs = $('#exImgs');
    if (e.obj) {
      var objs = pickObjects(e.obj, 3);
      imgs.className = 'ex-imgs';
      imgs.innerHTML = objs.length ? objs.map(function (o) {
        var meta = [o.n, o.p, o.z].filter(Boolean).join(' · ');
        return '<figure><img src="' + src(o.s) + '" alt="' + esc(o.n) + '" loading="lazy" width="' + (o.w || 1000) + '" height="' + (o.h || 1250) + '">' +
          '<figcaption>' + esc(meta) + '</figcaption></figure>';
      }).join('') : '<p class="ex-hint">藏品库暂无这一期的实物。</p>';
    } else {
      imgs.className = 'ex-imgs is-evi';
      imgs.innerHTML = (e.evi || []).map(function (v) {
        return '<div class="ex-evi"><i>' + esc(v.t) + '</i><b>' + esc(v.b) + '</b><span>' + esc(v.s) + '</span></div>';
      }).join('');
    }

    $('#exBlocks').innerHTML = e.blocks.map(function (b) {
      return '<div class="ex-block"><h3>' + esc(b.h) + '</h3><p>' + esc(b.p) + '</p></div>';
    }).join('');
  }

  function select(i) {
    if (i < 0) i = 0;
    if (i > ERAS.length - 1) i = ERAS.length - 1;
    if (i === cur) return;
    cur = i;
    $$('.ex-dot', dotsBox).forEach(function (b) {
      var on = +b.dataset.i === i;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (fill) fill.style.width = ((i + 0.5) / ERAS.length * 100) + '%';
    renderPanel(i);
    if (panel) {
      panel.classList.remove('is-swap');
      void panel.offsetWidth;
      panel.classList.add('is-swap');
    }
  }

  function indexFromX(clientX) {
    var r = dotsBox.getBoundingClientRect();
    if (!r.width) return 0;
    var t = (clientX - r.left) / r.width * ERAS.length - 0.5;
    return Math.max(0, Math.min(ERAS.length - 1, Math.round(t)));
  }

  function bindDrag() {
    if (!strip || !dotsBox) return;
    var down = false;
    function start(e) {
      if (e.target.closest('.ex-dot')) return;
      down = true;
      strip.setPointerCapture && strip.setPointerCapture(e.pointerId);
      select(indexFromX(e.clientX));
    }
    function move(e) {
      if (!down) return;
      var i = indexFromX(e.clientX);
      if (i !== cur) select(i);
    }
    function up() { down = false; }
    strip.addEventListener('pointerdown', start);
    strip.addEventListener('pointermove', move);
    strip.addEventListener('pointerup', up);
    strip.addEventListener('pointercancel', up);
    strip.addEventListener('pointerleave', up);

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      /* 只有时间轴在视野里才接管左右键，不然会跟页面滚动抢 */
      var r = strip.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) return;
      e.preventDefault();
      select(cur + (e.key === 'ArrowRight' ? 1 : -1));
      var b = $('.ex-dot[data-i="' + cur + '"]', dotsBox);
      if (b) b.focus({ preventScroll: true });
    });
  }

  buildDots();
  bindDrag();
  if (dotsBox && ERAS.length) {
    fill.style.width = (0.5 / ERAS.length * 100) + '%';
    select(0);
  }

  /* ==========================================================
     二 四代灯
     ========================================================== */
  var LAMPS = [
    {
      n: '油灯', gen: '第一代', y: '汉 — 宋',
      spec: '一盏豆油灯 · 亮子约三尺高五尺宽',
      lum: .34, warm: '#ffd9a0', vig: .8, flick: true,
      copy: '豆油、棉线灯芯，焰苗两三厘米，风一吹就晃。光弱，影人只能贴着幕走，幕做大了边上就黑，所以旧时亮子一般是三尺高、五尺宽。看客看到的是影子，不是皮子上的刻工，细纹在油灯下根本显不出来。'
    },
    {
      n: '烛灯', gen: '第二代', y: '明清',
      spec: '三五支蜡烛并置 · 亮子渐至四尺高六尺宽',
      lum: .52, warm: '#ffd094', vig: .64, flick: true,
      copy: '蜡烛比油灯稳，也贵。一盏不够亮就并几支，幕能往大里做一档。光稳了，刀工才值得下：清代的影人开始刻万字纹、雪花纹，上红绿两色，脸分忠奸，这些细节都靠一盏稳当的灯才看得见。'
    },
    {
      n: '汽灯', gen: '第三代', y: '民国 — 20 世纪中叶',
      spec: '煤油打气、纱罩发白光 · 幕可再放大',
      lum: .72, warm: '#fff0cc', vig: .48, flick: false,
      copy: '汽灯靠打气把煤油压进纱罩，烧出一团白光，亮得多，也刺眼。民国年间汽灯进了乡镇戏台，班子敢把幕放到六尺，影人从二十厘米做到三十厘米以上。灯一换，影人的尺寸、幕的尺寸、台口的位置都得跟着改。'
    },
    {
      n: '电灯', gen: '第四代', y: '1950 年代 — 今',
      spec: '白炽灯、卤钨灯、LED · 幕可到数米',
      lum: .88, warm: '#fff8e8', vig: .32, flick: false,
      copy: '亮度稳定、色温可调、不闪，这是电灯带来的三件事。幕可以放到数米，影戏进了剧场；也可以反过来，把影偶放到屏幕前拍，让镜头替观众挑角度。技术不再是限制，限制变成了观众还愿不愿意坐下来看完一本戏。'
    }
  ];

  var lampTabs = $('#lampTabs');
  var lampScreen = $('#lampScreen');
  var lampPup = $('#lampPup');
  var lampCur = -1;

  function renderLamp(i) {
    var L = LAMPS[i];
    if (!L || !lampScreen) return;
    lampCur = i;
    $$('button', lampTabs).forEach(function (b, j) { b.classList.toggle('on', j === i); });
    lampScreen.style.setProperty('--lum', L.lum);
    lampScreen.style.setProperty('--warm', L.warm);
    lampScreen.style.setProperty('--vig', L.vig);
    if (lampPup) {
      lampPup.classList.toggle('lamp-flicker', !!L.flick);
      lampPup.style.opacity = L.flick ? '.88' : '.94';
      lampPup.style.filter = L.flick ? 'contrast(1.02) blur(.2px)' : 'contrast(1.12)';
    }
    $('#lampName').textContent = L.n + '（' + L.gen + '）';
    $('#lampSpec').textContent = L.y + ' · ' + L.spec;
    $('#lampCopy').textContent = L.copy;
  }

  if (lampTabs) {
    lampTabs.innerHTML = LAMPS.map(function (L, i) {
      return '<button type="button" role="tab" class="' + (i === 0 ? 'on' : '') + '"><b>' + esc(L.gen) + '</b>' + esc(L.n) + '</button>';
    }).join('');
    $$('button', lampTabs).forEach(function (b, i) {
      b.addEventListener('click', function () { renderLamp(i); });
    });
    renderLamp(0);
  }

  /* ==========================================================
     三 六部文献
     ========================================================== */
  var DOCS = [
    {
      h: '《汉书·外戚传》', by: '东汉 · 班固', era: '前 2 世纪',
      lead: '最早把灯、帷帐、人影写在同一段文字里。常被当作「影戏始于汉」的证据。',
      q: '上思念李夫人不已，方士齐人少翁言能致其神。乃夜张灯烛，设帷帐，陈酒肉，而令上居他帐，遥望见好女如李夫人之貌，还幄坐而步，又不得就视。',
      can: '能证：前 2 世纪已经有「张灯、帷帐、人影」这套观看装置。',
      cant: '证不到：这是招魂的仪式，不是戏。没有故事、没有角色、没有操偶的人。',
      src: '《汉书》卷九十七上'
    },
    {
      h: '《事物纪原》', by: '宋 · 高承', era: '宋',
      lead: '宋人自己给影戏找的源头，把源头追到了李夫人。后来的书多沿此说。',
      q: '故老相承，言影戏之源，出于汉武帝李夫人之亡，齐人少翁言能致其魂，上念夫人无已，乃使致之。少翁夜为方帷，张灯烛，帝坐他帐，自帷中望见之，仿佛夫人像也，盖不得就视之。由是世间有影戏。',
      can: '能证：宋代人普遍相信影戏出自汉代，这个说法在北宋已经成型。',
      cant: '证不到：追述不等于事实。这是宋人的溯源，不是汉代的记录。',
      src: '《事物纪原》「博奕嬉戏」门「影戏」条'
    },
    {
      h: '《东京梦华录》', by: '宋 · 孟元老', era: '北宋末年',
      lead: '元宵夜里的小影戏棚子，多到可以当作走失小孩的招领处。',
      q: '每一坊巷口无乐棚去处，多设小影戏棚子，以防本坊游人小儿相失。',
      can: '能证：北宋汴京的元宵街面上，影戏是常规配置，密度足以承担公共功能。',
      cant: '证不到：演什么、怎么演、几个人操耍，一个字没提。',
      src: '《东京梦华录》卷六「十六日」'
    },
    {
      h: '《都城纪胜》', by: '宋 · 耐得翁', era: '南宋',
      lead: '把影人的做法、话本的来路、角色的脸谱一次写清。',
      q: '凡影戏乃京师人初以素纸雕镞，后用彩色装皮为之，其话本与讲史书者颇同，大抵真假相半，公忠者雕以正貌，奸邪者与之丑貌，盖亦寓褒贬于市俗之眼戏也。',
      can: '能证：南宋影戏有话本、题材近讲史、角色按忠奸分脸，还能由「雕镞」看出制作方式。',
      cant: '证不到：具体剧目、唱腔、班社规模。',
      src: '《都城纪胜》「瓦舍众伎」'
    },
    {
      h: '《梦粱录》', by: '宋 · 吴自牧', era: '南宋',
      lead: '从纸到皮的材质账，还留下三个临安艺人的名字。',
      q: '更有弄影戏者，元汴京初以素纸雕簇，自后人巧工精，以羊皮雕形，用以彩色妆饰，不致损坏。杭城有贾四郎、王升、王闰卿等，熟于摆布，立讲无差。',
      can: '能证：影人由素纸改羊皮，改的理由是纸易损；临安有名字可考的名家。',
      cant: '证不到：制皮、刮薄、上色的具体工序。',
      src: '《梦粱录》卷二十「百戏伎艺」'
    },
    {
      h: '《武林旧事》', by: '宋 · 周密', era: '南宋',
      lead: '影戏艺人立了行会，还另有一种真人在幕后比划的「大影戏」。',
      q: '「绘革社」三字见于卷三「社会」，下注「影戏」二字。同书「元夕」条又记：幽坊静巷好事之家，多设五色琉璃泡灯……或戏于小楼，以人为大影戏，儿童喧呼，终夕不绝。',
      can: '能证：临安影戏艺人结成行会「绘革社」；另有真人模拟影人的「大影戏」在流行。',
      cant: '证不到：行会的规约、人数、入行门槛。',
      src: '《武林旧事》卷三「社会」、卷二「元夕」'
    }
  ];

  var evGrid = $('#evGrid');
  if (evGrid) {
    evGrid.innerHTML = DOCS.map(function (d, i) {
      return '<button class="ev-card" type="button" aria-expanded="false">' +
        '<i>' + esc(d.era) + '</i>' +
        '<h3>' + esc(d.h) + '</h3>' +
        '<p>' + esc(d.lead) + '</p>' +
        '<div class="ev-more"><div class="ev-more-in">' +
        '<q>' + esc(d.q) + '</q>' +
        '<dl><dt>能证什么</dt><dd>' + esc(d.can.replace(/^能证：/, '')) + '</dd>' +
        '<dt>证不到什么</dt><dd>' + esc(d.cant.replace(/^证不到：/, '')) + '</dd>' +
        '<dt>出处</dt><dd>' + esc(d.src) + ' · ' + esc(d.by) + '</dd></dl>' +
        '</div></div></button>';
    }).join('');

    $$('.ev-card', evGrid).forEach(function (card) {
      card.addEventListener('click', function () {
        var on = card.classList.toggle('on');
        card.setAttribute('aria-expanded', on ? 'true' : 'false');
      });
    });
  }

  /* ==========================================================
     四 三百件藏品的年代剖面
     ========================================================== */
  var profile = $('#eraProfile');
  var note = $('#eraProfileNote');

  function countBy(list, fn) {
    var m = {};
    list.forEach(function (x) {
      var k = fn(x);
      if (!k) return;
      m[k] = (m[k] || 0) + 1;
    });
    return m;
  }

  function rows(items, total, zeroLabel) {
    var max = items.reduce(function (a, b) { return Math.max(a, b[1]); }, 1);
    var html = items.map(function (p) {
      var w = p[1] / max * 100;
      var pct = total ? (p[1] / total * 100).toFixed(1) : '0.0';
      return '<div class="ex-size-row' + (p[1] ? '' : ' is-zero') + '">' +
        '<span class="ex-size-name">' + esc(p[0]) + '</span>' +
        '<span class="ex-size-bar"><i style="width:' + (p[1] ? Math.max(w, 2) : 0) + '%"></i></span>' +
        '<span class="ex-size-val">' + p[1] + ' 件 · ' + pct + '%</span></div>';
    }).join('');
    var axis = '<div class="ex-size-axis"><span></span><span><b>0</b><b>' + max + ' 件</b></span><span></span></div>';
    return html + axis;
  }

  function buildProfile() {
    var D = window.LIB_DATA;
    if (!profile || !D || !D.items) return;
    var all = D.items;
    var total = all.length;

    var yr = countBy(all, function (x) { return x.a; });
    var eraRows = [
      ['汉 — 明', (yr['汉'] || 0) + (yr['唐代'] || 0) + (yr['宋代'] || 0) + (yr['元代'] || 0) + (yr['明代'] || 0)],
      ['清代', yr['清代'] || 0],
      ['中华民国', yr['中华民国'] || 0],
      ['中华人民共和国', yr['中华人民共和国'] || 0]
    ];

    var mt = countBy(all, function (x) { return x.m; });
    var mtRows = Object.keys(mt).map(function (k) { return [k, mt[k]]; })
      .sort(function (a, b) { return b[1] - a[1]; }).slice(0, 6);

    var pv = countBy(all, function (x) { return x.p; });
    var pvRows = Object.keys(pv).map(function (k) { return [k, pv[k]]; })
      .sort(function (a, b) { return b[1] - a[1]; }).slice(0, 8);

    var cat = countBy(all, function (x) { return x.c; });
    var catRows = Object.keys(cat).map(function (k) { return [k, cat[k]]; })
      .sort(function (a, b) { return b[1] - a[1]; });

    profile.innerHTML =
      '<h3 class="ex-size-h">按年代<em>共 ' + total + ' 件</em></h3>' + rows(eraRows, total) +
      '<h3 class="ex-size-h">按材质<em>牛皮最多，驴皮反而少</em></h3>' + rows(mtRows, total) +
      '<h3 class="ex-size-h">按省份<em>前八，共 ' + Object.keys(pv).length + ' 个省区市</em></h3>' + rows(pvRows, total) +
      '<h3 class="ex-size-h">按部件<em>一件影人拆开算</em></h3>' + rows(catRows, total);

    if (note) {
      var zhao = countBy(all, function (x) { return x.o; });
      var zhaoN = zhao['赵树同教授捐赠'] || 0;
      note.innerHTML = '<b>汉到明一件都没有，不是没演过，是没留下来。</b>皮、纸、绢都是有机物，怕潮、怕虫、怕折；影偶又长期被当成「鄙事」，不入藏家眼；班社一散，影人多半随戏箱一起处理掉。馆藏 ' + total +
        ' 件里 ' + zhaoN + ' 件来自赵树同教授一人的捐赠，占了近一半，地域覆盖 ' + Object.keys(pv).length +
        ' 个省区市，湖北、陕西、甘肃三省最多。这既是影戏的分布，也是收藏的分布，两者并不完全是一回事。';
    }
  }

  buildProfile();
})();
