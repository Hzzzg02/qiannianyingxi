/* ==========================================================================
   影窗问答 · chat.js
   --------------------------------------------------------------------------
   两件事：
   1) 把问题发给后端 /api/assistant（皮影工程里那套 DeepSeek 代理，Key 在服务端）
   2) 后端不通时（本地静态预览就是这种情况），用内置的皮影知识底回答，
      保证这一页单独打开也能把话接上，不是个空壳。

   消息渲染支持两种标记：**加粗**，以及行首 "- " 的列表。
   ========================================================================== */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var stream = $('chStream');
  var main = $('chMain');
  var box = $('chBox');
  var input = $('chInput');
  var goBtn = $('chGo');
  var sugs = $('chSugs');
  var newBtn = $('chNew');
  if (!stream) return;

  var API = '/api/assistant';
  var TIMEOUT = 8000;
  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  /* ?fast / ?still：不打字，直接出全文，便于截图核对版式 */
  var FAST = REDUCED || /[?&](fast|still)/.test(location.search);

  var OPENING = '灯已经点上了。皮影的事都能问：怎么刻、怎么唱、南北差在哪。问明白了，还能让它照着你的话画一只。';
  var SUGS = ['皮影制作有几道工序？', '影偶为什么能动？', '各地影人差在哪？', '这个网站怎么逛？'];

  var HISTORY = [];        // 只留发给模型的上下文
  var STORE = 'yingxi.chat.v1';   // 存档在 sessionStorage：换页不丢，关掉标签页就清空
  var LOG = [];                   // 完整对话，用来把界面还原回来
  var busy = false;
  var typing = null;       // 正在打字的任务，点一下可以跳过

  /* ======================================================================
     一、皮影知识底
     每条：k 命中词、a 回答、r 追问
     ====================================================================== */
  var KB = [
    {
      k: ['工序', '制作', '怎么做', '流程', '步骤', '几道', '六道', '做一只', '做成', '怎么造'],
      a: '做一只影偶要走六道：**选皮、描样、雕刻、上色、缀结、整平**。\n' +
         '- **选皮**：牛皮厚实、驴皮薄透，刮到半透明，对着灯看要匀，不能有血筋和砂眼。\n' +
         '- **描样**：按行当定稿，头茬和身子分开画，纸样翻到皮上，用针沿线扎孔定位。\n' +
         '- **雕刻**：顺丝下刀，先刻大形再走细纹。衣纹、甲片、云子花全靠镂空，一刀断丝整张皮就废了。\n' +
         '- **上色**：矿物色先浅后深，红绿黄黑为主，色要透光才不脏。\n' +
         '- **缀结**：头、身、手、腿分件做，用铆钉或皮绳连起来。\n' +
         '- **整平**：压平定型，让它立在幕上不卷边。\n' +
         '一把刻刀走完全程的很少，一套戏的刀通常十几把，刻花、刻线、扎孔各用各的。',
      r: ['刻皮为什么要顺丝？', '上色用什么颜料？', '影偶一般多大？']
    },
    {
      k: ['什么皮', '皮料', '牛皮', '驴皮', '羊皮', '选皮', '刮皮', '材料', '用什么做'],
      a: '主流是**牛皮**和**驴皮**。\n' +
         '- 北方（唐山、滦州一带）多用**驴皮**：皮薄、透光好，刻细密花纹不吃力，所以北派的镂空花活最盛。\n' +
         '- 秦晋、华县一带多用**牛皮**：皮厚、挺括、耐操，影偶做得大，撑得住整场武戏。\n' +
         '- 早年也有羊皮和纸糊的，透光发闷、不经用，现在基本见不到了。\n' +
         '一张皮要刮到半透明，对着灯看不见血筋、砂眼才算合格。太厚不透光，太薄上色会洇。',
      r: ['驴皮和牛皮做出来差在哪？', '为什么北方影人刻得细？']
    },
    {
      k: ['流派', '各地', '区别', '南北', '影系', '唐山', '华县', '环县', '泰山', '陆丰', '成都', '哪一路', '不同', '差别'],
      a: '通行分**七大影系**：秦晋、滦州、山东、杭州、川鄂滇、湘赣、潮州，细到县一级能分出十四个地区。\n' +
         '南北的差别，根子在**一盏灯**：\n' +
         '- **光源**：北方旧时用油灯，光弱而暖，影偶得做大、刻得粗，远了才看得清轮廓；南方后来用汽灯、电灯，光强了，影偶就能做小、镂得细。\n' +
         '- **唱腔**：跟着方言走。北方高亢，一句能拖过半个场子；南方婉转，字少腔多，海宁一带有「一字三叹」的说法。\n' +
         '- **影窗**：北方窗窄而高，适合竖构图的大影偶；南方窗宽，小影偶在里头腾挪，才演得出水战、火阵这种满台跑的戏。\n' +
         '这三条互为因果，不是谁先进谁落后。换一盏灯，整套造型语言都得重做。',
      r: ['唐山皮影有什么特点？', '陕西皮影和别处差在哪？']
    },
    {
      k: ['行当', '生旦净丑', '角色', '门行当', '什么角', '扮谁', '脸谱'],
      a: '六大门：**生、旦、净、丑、神、王**，往下再分细行，一共十八门。\n' +
         '- **生**：小生、武生、老生，书生、将官、老臣。\n' +
         '- **旦**：青衣、花旦、刀马旦，端庄、活泼、能打。\n' +
         '- **净**：花脸、武将、悍将，脸谱最花，一眼认得出。\n' +
         '- **丑**：文丑、武丑、丑旦，诙谐角色，动作幅度最大。\n' +
         '- **神**：神仙、妖精、鬼怪，靠头茬和翎子区分。\n' +
         '- **王**：帝王、将相、番王，冠戴最重，影偶也最大。\n' +
         '行当决定冠戴、脸谱和手里拿的东西。换戏常常只换头茬，身子接着用。',
      r: ['头茬是什么？', '净角的脸为什么最花？']
    },
    {
      k: ['操纵', '怎么动', '能动', '关节', '签子', '三根杆', '主杆', '表演', '手上功夫'],
      a: '靠**三根竹杆**和几处**关节**。\n' +
         '- **三根杆**：一根主杆别在脖子上，管整个身子起落转身；两根手杆接在两只手上，管抬手、翻袖、开打。所以影戏的武打靠手腕的巧劲，不靠腿。\n' +
         '- **关节**：颈、肩、肘、胯、膝各一颗铆钉或皮绳。有这几处，影偶才能卧、能跪、能翻身、能甩袖。\n' +
         '- **贴幕**：人躲在亮子后面，影偶贴着幕走。贴得越平影子越实，离幕一寸轮廓就虚一圈。老艺人说「贴幕如贴纸」。\n' +
         '熟练的班子三个人就能撑起一台戏：一个主签，两个下手，外加锣鼓和唱。',
      r: ['三个人怎么演一台戏？', '武打场面怎么演？']
    },
    {
      k: ['剧目', '什么戏', '演什么', '白蛇', '西游', '五峰会', '镇冤塔', '戏目', '本子', '唱词', '连台'],
      a: '影戏的箱底戏翻来覆去就那几本，但一本能连演十天。\n' +
         '- **《五峰会》**：历史袍带戏，行当最全，武将开打最多，最考班子功力。\n' +
         '- **《镇冤塔》**：公案戏，唱工最重，苦情段落全靠嗓子撑。\n' +
         '- **《白蛇传》**：水漫金山一段最出彩，满台水族腾挪，南方宽幕才施展开。\n' +
         '- **《西游记》**：神怪戏，变形场面多，最讨孩子喜欢。\n' +
         '一本戏通常分几十折，一晚上演三五折。唱词多是七字句、十字句，跟着锣鼓点走，一板一眼卡得很死。',
      r: ['影戏的唱腔有几种？', '为什么一本戏能演十天？']
    },
    {
      k: ['影箱', '六器', '头茬', '戳子', '砌末', '衬景', '坐骑', '部件', '拆开', '装箱'],
      a: '影偶是**拆开装箱**的，一只人偶由好几件组成，靠皮绳和竹杆连起来。影箱里最常见的六件：\n' +
         '- **头茬**：一颗头定行当，单独装箱，换戏只换头。\n' +
         '- **戳子**：只有身子和衣裳，配不同头茬演不同角色。\n' +
         '- **连头身段**：头身连刻的整身偶，做工最重。\n' +
         '- **坐骑**：马、牛、麒麟，武将出场必备。\n' +
         '- **砌末**：桌椅、城楼、兵器这类小道具。\n' +
         '- **衬景**：山石、树木、云片，撑起整个场面。\n' +
         '一套完整的影箱通常在**六十到一百二十件**之间，大班子能有几百件。',
      r: ['头茬和戳子怎么配？', '一套影箱大概多少件？']
    },
    {
      k: ['历史', '起源', '汉代', '多少年', '两千年', '从哪来', '什么时候', '发展', '年代'],
      a: '两千年，一条不太直的路。\n' +
         '- **汉代**：方士设帐、灯下现影，是影戏最早的影子。这一段有传说成分，学界说法不完全一致。\n' +
         '- **唐五代**：寺院俗讲用光影讲经，影偶开始有故事。\n' +
         '- **宋**：瓦舍勾栏里的正经行当，《东京梦华录》里已经写着「影戏」的名目。\n' +
         '- **元明**：随商路南下，各地唱腔分野。\n' +
         '- **清**：最盛，王府有影箱，村口有影台，一本戏能连演整月。\n' +
         '- **近现代**：电影进来后影戏退到乡野，2006 年列入第一批国家级非遗名录。',
      r: ['宋代影戏有多热闹？', '皮影什么时候成了非遗？']
    },
    {
      k: ['传承', '非遗', '保护', '传承人', '学校', '进校园', '还在演吗', '濒危', '后继'],
      a: '影戏现在的处境一句话说：**箱子还在，人少了**。\n' +
         '- **非遗**：2006 年第一批进国家级名录，2011 年联合国教科文组织把中国皮影戏列入人类非遗代表作名录。\n' +
         '- **进校园**：多数传承人的主要工作量在课堂，一学期带几十个孩子刻皮、认行当。\n' +
         '- **拜师**：老班子仍收徒，一般三年出师，先学刻后学签。\n' +
         '- **数字化**：把老影偶、影卷、唱腔录音整批采集存档。这行最大的风险是「人走箱空」，东西留下来，后人还能照着做。\n' +
         '真正的难处不在刻，在**唱和签**：一整套台上功夫，得跟着班子跑场子才学得会。',
      r: ['为什么学唱比学刻难？', '数字存档都存了什么？']
    },
    {
      k: ['网站', '怎么逛', '板块', '哪几页', '导航', '能做什么', '怎么用', '这个站', '功能'],
      a: '这个站一共八屏，翻页往下走：\n' +
         '- **一屏 · AI 皮影工厂**：就是你现在待的地方，问事、画影偶。\n' +
         '- **二屏 · 影藏**：馆藏实物，影箱六器和三百帧藏品影像。\n' +
         '- **三屏 · 历史发展**：年代尺、流派地图、南北对比。\n' +
         '- **四屏 · 影讯**：演出消息、资讯、票友的帖子。\n' +
         '- **五屏 · 地图**：十四个地区，点开看这一省的造型、唱腔和藏品。\n' +
         '- **六屏 · 经典剧目**：四本箱底戏，能跟着唱词走一遍。\n' +
         '- **七屏 · 传承**：传承人的路怎么走。\n' +
         '- **八屏 · 工序**：六道工序拆开看，配刀具匹配。\n' +
         '想直接上手，回首页那个框里说一句「守边的老兵，风雪里抱着刀」，它就会照着画一只。',
      r: ['创作台怎么用？', '影藏里的东西是真的馆藏吗？']
    },
    {
      k: ['画一只', '生成', '创作台', '提示词', '能不能画', '画影偶', 'ai画', '画一个'],
      a: '能。流程是**选流派 → 定行当 → 说一句 → 摆个架子 → 落笔**。\n' +
         '- **流派**决定皮料、刀法、配色，选哪一路，画出来就是哪一路的样子。\n' +
         '- **行当**决定冠戴、脸谱和手里的东西。\n' +
         '- **说一句**是关键，越具体越像。「守边的老兵，风雪里抱着刀，鬓角结霜」就比「一个将军」好得多，写出处境、动作、细节。\n' +
         '- **架子**是姿态：亮相、静立、疾走、开打、施礼、回眸。\n' +
         '出来的是一张**单件、全身、白底**的影偶图，不带操纵杆。约 15 到 30 秒一张，同一句话每次画出来都不一样。',
      r: ['提示词怎么写才准？', '生成的影偶能下载吗？']
    },
    {
      k: ['唱腔', '唱', '音乐', '乐器', '碗碗腔', '道情', '伴奏', '锣鼓', '嗓子', '调子'],
      a: '唱腔跟着方言走，一路一个调。\n' +
         '- **碗碗腔**（陕西）：铜碗击节，调子婉转，一字三折，最出名的一枝。\n' +
         '- **道情**（甘肃环县）：渔鼓简板打底，腔尾拖长，带点说唱味。\n' +
         '- **滦州调**（唐山）：板式硬、垛句多，掐嗓唱法极有辨识度。\n' +
         '- **川剧灯影**：五腔共和，锣鼓打得热闹，火戏最多。\n' +
         '伴奏通常就三件：**锣、鼓、板**，讲究的班子加唢呐、二胡、月琴。一个班子三个人能演：一人主签、一人下手、一人包唱带打锣鼓。',
      r: ['一个班子最少几个人？', '碗碗腔为什么叫碗碗？']
    },
    {
      k: ['多大', '尺寸', '高度', '厘米', '大小', '多长'],
      a: '常见 **30 到 40 厘米**，各地不同：\n' +
         '- 北方油灯时代，影偶做到 40 厘米以上，远了才看得清。\n' +
         '- 南方电灯时代就小下来，25 到 30 厘米，好在宽幕上腾挪。\n' +
         '- 大件武将能到 50 厘米，坐骑和砌末按比例放大。\n' +
         '判断标准不是尺寸，是**贴幕后影子清不清楚**。',
      r: ['北方为什么做大的？', '贴幕有什么讲究？']
    },
    {
      k: ['亮子', '光源', '油灯', '电灯', '幕布', '影子'],
      a: '幕叫**亮子**，灯是影戏的命。\n' +
         '- 早年用油灯，光弱而暖，烟大，一场下来亮子上都是灰。\n' +
         '- 后来汽灯、电灯进来，光强了，影偶才能做小、刻得细。\n' +
         '- 现在的舞台多用 LED 背光，色温偏暖，仿的还是油灯那口光。\n' +
         '贴幕是硬功夫：影偶离亮子一寸，影子就虚一圈。所以老艺人说「贴幕如贴纸」。',
      r: ['亮子用什么材料做？', '光源怎么影响造型？']
    },
    {
      k: ['是什么', '介绍', '简介', '讲讲', '说说', '皮影戏是'],
      a: '**皮影戏**是拿兽皮刻成影偶、在灯前贴幕、隔着亮子演给人看的戏。\n' +
         '它一门手艺带着三样本事：**刻**（造型）、**签**（操纵）、**唱**（声腔）。\n' +
         '- 影偶拆开装箱，头、身、手、腿各成一件，靠关节连起来，所以能卧能跪能翻能打。\n' +
         '- 一台戏三个人就能演：一人主签、一人下手、一人包唱带打锣鼓。\n' +
         '- 七个影系散在南北，皮料、刀法、唱腔各不相同，差别根子在一盏灯。\n' +
         '2006 年列入第一批国家级非物质文化遗产，2011 年进入人类非遗代表作名录。',
      r: ['皮影制作有几道工序？', '南北影人差在哪？']
    }
  ];

  var FALLBACK = '这个我一时答不上来。皮影的事可以往这几个方向问：\n' +
    '- **怎么做**：六道工序、皮料、刻刀、上色\n' +
    '- **怎么分**：七大影系、南北差别、行当、影箱\n' +
    '- **怎么演**：三根杆、亮子、唱腔、剧目\n' +
    '- **这个站**：八屏都有什么、创作台怎么用\n' +
    '换个说法再问一次，或者点下面这几个。';

  var FALLBACK_R = ['皮影制作有几道工序？', '影偶为什么能动？', '各地影人差在哪？'];

  /* ======================================================================
     二、渲染工具
     ====================================================================== */
  function el(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  }

  function scrollDown() {
    main.scrollTop = main.scrollHeight;
  }

  /* "**粗**" → 片段数组 */
  function splitBold(s) {
    var parts = String(s).split('**');
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      if (!parts[i]) continue;
      out.push({ b: i % 2 === 1, t: parts[i] });
    }
    return out;
  }

  /* 纯文本 → 块（p / li），只认 **加粗** 和行首 "- " */
  function parse(text) {
    var out = [];
    String(text || '').split('\n').forEach(function (line) {
      var t = line.replace(/\r$/, '').trim();
      if (!t) return;
      var m = t.match(/^[-•*·]\s+(.*)$/);
      if (m) out.push({ tag: 'li', segs: splitBold(m[1]) });
      else out.push({ tag: 'p', segs: splitBold(t) });
    });
    return out;
  }

  /* 逐字打出：先把结构建好，再把字符一个个塞进去。
     instant = true 时直接出全文（还原历史记录用，不放一遍打字动画） */
  function typeInto(host, blocks, done, instant) {
    var queue = [];
    var frag = document.createDocumentFragment();
    var ul = null;

    blocks.forEach(function (b) {
      var node;
      if (b.tag === 'li') {
        if (!ul) { ul = el('ul'); frag.appendChild(ul); }
        node = el('li');
        ul.appendChild(node);
      } else {
        ul = null;
        node = el('p');
        frag.appendChild(node);
      }
      b.segs.forEach(function (s) {
        var sp = el(s.b ? 'b' : 'span');
        node.appendChild(sp);
        Array.prototype.forEach.call(s.t, function (ch) { queue.push([sp, ch]); });
      });
    });

    host.appendChild(frag);

    if (FAST || instant || !queue.length) {
      queue.forEach(function (q) { q[0].textContent += q[1]; });
      done && done();
      return;
    }

    var caret = el('i', 'caret');
    host.appendChild(caret);

    var total = queue.length;
    var cps = total > 380 ? 96 : total > 190 ? 74 : 46;   // 字/秒
    var i = 0;
    var acc = 0;
    var last = 0;
    var finished = false;

    function finish() {
      if (finished) return;
      finished = true;
      for (; i < total; i++) queue[i][0].textContent += queue[i][1];
      caret.remove();
      typing = null;
      scrollDown();
      done && done();
    }

    function tick(now) {
      if (finished) return;
      if (!last) last = now;
      acc += ((now - last) / 1000) * cps;
      last = now;
      var n = Math.floor(acc);
      acc -= n;
      for (var k = 0; k < n && i < total; k++, i++) {
        queue[i][0].textContent += queue[i][1];
      }
      if (i % 6 === 0) scrollDown();
      if (i < total) requestAnimationFrame(tick);
      else finish();
    }

    typing = { finish: finish };
    requestAnimationFrame(tick);
  }

  /* ======================================================================
     三、消息
     ====================================================================== */
  function addMe(text) {
    stream.classList.remove('is-first');
    var m = el('div', 'msg msg-me');
    m.appendChild(el('div', 'msg-body', text));
    stream.appendChild(m);
    scrollDown();
  }

  function addBot(blocks, more, instant) {
    var m = el('div', 'msg msg-bot');
    m.appendChild(el('span', 'msg-ava', '影'));

    var body = el('div', 'msg-body');
    body.appendChild(el('div', 'msg-who', '说戏人'));

    var txt = el('div', 'msg-txt');
    body.appendChild(txt);
    m.appendChild(body);
    stream.appendChild(m);
    scrollDown();

    typeInto(txt, blocks, function () {
      /* 追问要挂在正文里，不能挂到 .msg 上：
         .msg 是 flex 容器，直接挂上去会被拉伸成一整条 */
      if (more && more.length) addMore(body, more);
      scrollDown();
    }, instant);
    return m;
  }

  function addMore(host, list) {
    var box = el('div', 'msg-more');
    list.forEach(function (q) {
      var b = el('button', null, q);
      b.type = 'button';
      b.addEventListener('click', function () { send(q); });
      box.appendChild(b);
    });
    host.appendChild(box);
  }

  function addLoading() {
    var m = el('div', 'msg msg-bot');
    m.appendChild(el('span', 'msg-ava', '影'));
    var body = el('div', 'msg-body');
    var dots = el('span', 'msg-dots');
    dots.appendChild(el('i'));
    dots.appendChild(el('i'));
    dots.appendChild(el('i'));
    body.appendChild(dots);
    m.appendChild(body);
    stream.appendChild(m);
    scrollDown();
    return m;
  }

  /* ======================================================================
     四、回答来源
     ====================================================================== */
  function localAnswer(q) {
    var s = String(q).replace(/\s/g, '');
    var best = null;
    var bestScore = 0;

    KB.forEach(function (t) {
      var sc = 0;
      t.k.forEach(function (k) {
        /* 只认两字以上的词；命中一个两字词就算够（+1 是给它的兜底分） */
        if (k.length >= 2 && s.indexOf(k) > -1) sc += k.length + 1;
      });
      if (sc > bestScore) { bestScore = sc; best = t; }
    });

    if (best && bestScore >= 3) return { text: best.a, more: best.r };
    return { text: FALLBACK, more: FALLBACK_R };
  }

  function askServer(q) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, TIMEOUT);

    return fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: q, history: HISTORY.slice(-10) }),
      signal: ctrl.signal
    }).then(function (r) {
      if (!r.ok) throw new Error('bad status ' + r.status);
      return r.json();
    }).then(function (j) {
      if (!j || typeof j.reply !== 'string' || !j.reply.trim()) throw new Error('empty');
      return j.reply.trim();
    }).finally(function () {
      clearTimeout(timer);
    });
  }

  /* ======================================================================
     五、发问
     ====================================================================== */
  function send(q) {
    q = String(q || '').trim();
    if (!q || busy) return;

    busy = true;
    goBtn.disabled = true;

    if (typing) typing.finish();       // 上一句还在打就直接补完

    addMe(q);
    HISTORY.push({ role: 'user', content: q });
    LOG.push({ role: 'user', text: q });
    saveLog();

    if (sugs) sugs.hidden = true;
    clearInput();

    var load = addLoading();
    var t0 = Date.now();

    askServer(q)
      .then(function (reply) {
        return { text: reply, more: [] };
      })
      .catch(function () {
        return localAnswer(q);
      })
      .then(function (res) {
        /* 太快出结果会让加载动画闪一下，补到 420ms 再出 */
        var wait = Math.max(0, 420 - (Date.now() - t0));
        setTimeout(function () {
          load.remove();
          addBot(parse(res.text), res.more);
          HISTORY.push({ role: 'assistant', content: res.text });
          if (HISTORY.length > 20) HISTORY = HISTORY.slice(-20);
          LOG.push({ role: 'assistant', text: res.text, more: res.more || [] });
          saveLog();
          busy = false;
          goBtn.disabled = false;
          input.focus({ preventScroll: true });
        }, wait);
      });
  }

  /* ======================================================================
     六、输入框
     ====================================================================== */
  function autoGrow() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 132) + 'px';
  }

  function clearInput() {
    input.value = '';
    autoGrow();
  }

  var composing = false;
  input.addEventListener('compositionstart', function () { composing = true; });
  input.addEventListener('compositionend', function () { composing = false; });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey && !composing) {
      e.preventDefault();
      send(input.value);
    }
  });
  input.addEventListener('input', autoGrow);

  box.addEventListener('submit', function (e) {
    e.preventDefault();
    send(input.value);
  });

  /* 打字过程中点一下对话区，跳过逐字 */
  main.addEventListener('click', function () {
    if (typing) typing.finish();
  });

  /* ======================================================================
     七、启动
     ====================================================================== */
  /* 整个会话存档：sessionStorage 只活在这个标签页里，
     换页、刷新都还在，关掉标签页自动清空 —— 正好是"逛站期间记着、关了就重来" */
  function saveLog() {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(LOG.slice(-40)));
    } catch (e) { /* 无痕模式或写满，忽略 */ }
  }

  function loadLog() {
    var list = null;
    try {
      var raw = sessionStorage.getItem(STORE);
      if (raw) list = JSON.parse(raw);
    } catch (e) { list = null; }
    if (!list || !list.length) return null;

    list = list.filter(function (t) {
      return t && (t.role === 'user' || t.role === 'assistant') && typeof t.text === 'string';
    });
    if (!list.length) return null;

    /* 最后一句是提问却没有回答（上一页关在半路），这条就不还原了 */
    if (list[list.length - 1].role === 'user') list.pop();
    return list.length ? list : null;
  }

  function restore(list) {
    stream.classList.remove('is-first');
    if (sugs) { sugs.innerHTML = ''; sugs.hidden = true; }

    LOG = list.slice();
    HISTORY = list.slice(-20).map(function (t) {
      return { role: t.role, content: t.text };
    });

    list.forEach(function (t) {
      if (t.role === 'user') addMe(t.text);
      else addBot(parse(t.text), t.more || [], true);   // 历史记录直接出全文，不再逐字
    });
    scrollDown();
  }

  function reset() {
    stream.innerHTML = '';
    stream.classList.add('is-first');
    LOG = [];
    HISTORY = [];
    busy = false;
    typing = null;
    goBtn.disabled = false;

    if (sugs) {
      sugs.innerHTML = '';
      SUGS.forEach(function (q) {
        var b = el('button', null, q);
        b.type = 'button';
        b.addEventListener('click', function () { send(q); });
        sugs.appendChild(b);
      });
      sugs.hidden = false;
    }

    addBot(parse(OPENING), []);
    LOG.push({ role: 'assistant', text: OPENING, more: [] });
    saveLog();
  }

  newBtn.addEventListener('click', function () {
    try { sessionStorage.removeItem(STORE); } catch (e) {}
    reset();
    if (history.replaceState) history.replaceState(null, '', location.pathname);
    input.focus({ preventScroll: true });
  });

  var saved = loadLog();
  if (saved) restore(saved);
  else reset();
  autoGrow();

  /* 从首屏带问题过来，直接接着问 */
  var q0 = (new URLSearchParams(location.search).get('q') || '').trim();
  if (q0) {
    setTimeout(function () { send(q0); }, 560);
  } else {
    input.focus({ preventScroll: true });
  }
})();
