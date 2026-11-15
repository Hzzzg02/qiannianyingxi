/* ==========================================================
   inherit.js —— 06 传承：五位国家级代表性传承人
   · 右栏一条竖线串着五个名字，人名下面一句短语
   · 指到谁（或点谁）→ 左边整张照片自下而上擦入换人
   · 没换人时，进本屏也会走一次「揭开 + 光扫」的出场
   · 资料取自「千年影戏」传承页与中国非遗网，出处在末尾
   ========================================================== */
(function () {
  var PEOPLE = [
    {
      name: '范正安',
      word: '十不闲',
      idx: '01 / 05',
      place: '山东泰安 · 泰山皮影戏',
      photo: 'assets/img/people/fan.jpg',
      alt: '范正安在泰山皮影剧场演出，一人操偶兼踩打乐器',
      cap: '山东泰安 · 泰山皮影戏　摄影 朱峥 / 新华社',
      src: '出处：中国非遗网 · 光明网',
      life: '1945 年生 · 泰山皮影第六代传人',
      bio: [
        '八岁在泰安街头看刘玉峰的「影挑子」入了迷，十三岁拜师，在县曲艺队学了八年。白天给师傅扫地提水，夜里在幕布后练手；山东琴书、西河大鼓、落子、渔鼓、快书，都是那几年顺手学的，后来全化进了皮影腔里。',
        '「十不闲」是他五十多岁时改出来的：鼓、锣、钹这些打击乐挪到脚下的踏板联动装置上，两只手腾出来只管影人。脑里想着词儿，口中唱着曲儿，手里舞着人儿，脚下踩着锤儿——一个人就是一台戏。1965 年他入伍当文艺兵，复员后进食品公司，夜里关起门照样挂灯开戏；九十年代中期退休，才把床底下压了几十年的驴皮影人搬出来。',
        '2008 年前后办起泰山皮影艺术研究院和弄影轩小剧场，把课开进泰安六十多所学校。2010 年赴巴黎，在联合国教科文组织总部演了一场。2015 年，《泰山石敢当为民除害保平安》获第十二届山花奖。收徒近百人，最小的第八代传人十岁就拿过全国金奖。'
      ]
    },
    {
      name: '张坤荣',
      word: '唱做一身',
      idx: '02 / 05',
      place: '浙江海宁 · 海宁皮影戏',
      photo: 'assets/img/people/zhang.jpg',
      alt: '张坤荣的手正在为一枚头茬上色',
      cap: '浙江海宁 · 海宁皮影戏　摄影 隋先凯 / 新华社',
      src: '出处：中国非遗网 · 央广网',
      life: '1940 年生 · 海宁皮影戏国家级代表性传承人',
      bio: [
        '海宁周王庙镇人。1954 年拜「阿州班」班主魏柏荣为师——师傅十九岁唱红乡邻，人称「十九红」。1958 年考进浙江省皮影剧团，师傅们凌晨四点进剧场喝茶，学徒在边上练手上功夫。他两年半出师，1963 年接过大梁，主演兼导演。',
        '六十年代那批改革有他一份：上下手操纵改成六七人同台，一个影偶可由两人合操；真假嗓改男女分档；灯光添了火镜、水镜、风雨云镜和闪电。1959 到 1966 年，团里为 70 多个国家的代表团演过专场，陈毅看过两回，还到后台学着操偶。',
        '1969 年剧团解散，他回海宁做文化、信访工作，2000 年退休。2004 年被老同事请回艺术团，改写《火焰山》《闹龙宫》，排《鸡斗》《龟与鹤》。《鸡斗》2006 年获浙江省曲艺杂技节个人表演金奖，被文化部列为保留剧目；2012 年成都国际木偶艺术节，《火焰山》获最佳传承奖。'
      ]
    },
    {
      name: '宋国超',
      word: '一人成班',
      idx: '03 / 05',
      place: '辽宁瓦房店 · 复州皮影戏',
      photo: 'assets/img/people/song.jpg',
      alt: '宋国超在义和班的屋子里整理挂起的影偶',
      cap: '辽宁瓦房店 · 复州皮影戏　摄影 张春雷 / 新华社',
      src: '出处：中国非遗网 · 新华社',
      life: '1950 年生 · 复州皮影戏国家级代表性传承人',
      bio: [
        '瓦房店得利寺镇花红沟人。祖上宋德新师从皮影艺人孙万禄，后来立了「义和班」，到他是第四代。1960 年跟着父亲宋喜云学戏，12 岁随班登台，二十几岁独挑大梁。',
        '复州皮影是明万历年间由陕西戍边的士兵带过来的，四百多年，唱的是本地话，演的是本地事。编剧、导演、操影、刻影、司鼓、演唱，他一个人全能顶上，乡里说他「一人成班」。',
        '八九十年代戏不景气，他一边种地一边撑着班子，走村串屯地演。2008 年列入第二批国家级非遗代表性传承人名单，是复州皮影唯一的一位。2014 年 9 月起在得利寺镇中心小学开课，徒弟陈雪月、吴亚南、邓淑华、宋国君、宋娜，散在瓦房店各处。'
      ]
    },
    {
      name: '魏金全',
      word: '单人开台',
      idx: '04 / 05',
      place: '陕西渭南 · 华县皮影戏',
      photo: 'assets/img/people/wei.jpg',
      alt: '魏金全在亮着的幕布后独自操纵影偶',
      cap: '陕西渭南 · 华县皮影戏　摄影 群众新闻网',
      src: '出处：中国非遗网 · 群众新闻网',
      life: '1964 年生 · 华县皮影戏国家级代表性传承人',
      bio: [
        '华县东阳乡魏家塬人，家里几代唱皮影。父亲魏振业是光华皮影社社长，唱碗碗腔的「前声」。1981 年高中毕业进社，拜签手吝茂吉学挑签，又跟潘京乐、赵振才学前声，2004 年再拜郝炳黎。签手、前声、后槽、雕刻，四门都拿得起来。',
        '二十多年里主演《下河东》《金碗钏》《全家福》，也自己刻影偶，作品卖到德国、日本、法国。2001 年赴柏林参加亚太文化周，法国一家剧团的负责人看完戏追到华县拜师，此后他三次赴法交流，前后教过十来个洋学生，分文不收。',
        '2008 年列入第二批国家级非遗代表性传承人名单。这十年他把课开进陕西师范大学的皮影剧社，教过的学生过千；戏班还是那个五人班子，前声、签手、上档、下档、后槽，一样不少。'
      ]
    },
    {
      name: '汪天稳',
      word: '推皮走刀',
      idx: '05 / 05',
      place: '陕西渭南 · 华县影偶雕刻',
      photo: 'assets/img/people/wang.jpg',
      fz: 1.16,
      fy: '7%',
      alt: '汪天稳伏在案上以推皮走刀之法雕刻影偶',
      cap: '陕西渭南 · 华县皮影戏　摄影 中国工艺美术馆',
      src: '出处：中国非遗网 · 中国工艺美术馆',
      life: '1950 年生 · 华县皮影雕刻 · 中国工艺美术大师',
      bio: [
        '华州陈家堡村人。1961 年初冬，四样礼、三叩首，11 岁的他拜在皮影雕刻大师李占文门下，是关门弟子。',
        '「推皮走刀」是华县的路数：右手持刀钉在枣木板上不动，左手推着牛皮走线。为练这股手劲，师傅先在他左臂下捆两块砖，后来又加到四块，二十多斤。制皮、雕镂、敷色、缀钉，二十四道工序他一道不缺。',
        '1982 年为日本国立民俗博物馆刻《孙悟空大闹天宫》全套；《樊梨花刀劈杨藩》获轻工部旅游产品优秀设计一等奖；替中国美术馆、上海博物馆整理鉴定馆藏明清皮影数千件，行里叫他「活的皮影博物馆」。',
        '皮影界唯一的国家级工艺美术大师，人称「天下第一刀」。与中央美院合作《九重天》《刑天》《蚩尤》，也刻过世界最大的牛皮雕刻画《清明上河图》。女儿汪海燕接了他的刀。'
      ]
    }
  ];

  var fig = document.querySelector('.inh-photo');
  var thread = document.getElementById('inhThread');
  var imgCur = document.getElementById('inhImg');
  var imgPrev = document.getElementById('inhPrev');
  var rail = document.querySelector('.inh-rail');
  var elName = document.getElementById('inhName');
  var elWord = document.getElementById('inhWord');
  var elIdx = document.getElementById('inhIdx');
  var elCap = document.getElementById('inhCap');
  var elSrc = document.getElementById('inhSrc');
  var stage = document.getElementById('inhStage');
  var detail = document.getElementById('inhDetail');
  var indBody = document.getElementById('indBody');
  var indLife = document.getElementById('indLife');
  var indText = document.getElementById('indText');
  var btnBack = document.getElementById('indBack');
  var nodes = Array.prototype.slice.call(document.querySelectorAll('.inh-node'));
  if (!fig || !thread || !imgCur || !nodes.length) return;

  /* 先把五张图都取回来，换人时不会空一下 */
  PEOPLE.forEach(function (p) { var i = new Image(); i.src = p.photo; });

  var cur = -1;
  var turnTimer = null;

  function fillText(i) {
    var p = PEOPLE[i];
    /* 取景：默认原样，个别人（圆盘会把头顶裁掉）单独给缩放与下移 */
    fig.style.setProperty('--fz', p.fz || 1);
    fig.style.setProperty('--fy', p.fy || '0%');
    fig.style.setProperty('--fx', p.fx || '0%');
    elName.textContent = p.name;
    elWord.textContent = p.word;
    elIdx.textContent = p.idx;
    elCap.textContent = p.cap;
    elSrc.textContent = p.src;

  }

  /* 点名字：介绍盖到名单那块地方上，正文从头顶开始 */
  function renderBio(i) {
    var p = PEOPLE[i];
    if (!stage || !detail) return;
    stage.classList.add('is-reading');
    indLife.textContent = p.life || '';
    indText.innerHTML = (p.bio || []).map(function (t) { return '<p>' + t + '</p>'; }).join('');
    if (indBody) indBody.scrollTop = 0;
    detail.classList.remove('is-swap');
    void detail.offsetWidth;            /* 强制回流：同一个人再点也能重播 */
    detail.classList.add('is-swap');
    window.setTimeout(fadeHint, 0);
    /* 覆盖层刚变成 visible，等一帧再落焦点，否则会被丢掉 */
    window.setTimeout(function () {
      if (btnBack) btnBack.focus({ preventScroll: true });
    }, 40);
  }

  /* 返回：名单回到原位，焦点也还给刚才那个人 */
  function closeBio() {
    if (!stage || !stage.classList.contains('is-reading')) return;
    stage.classList.remove('is-reading');
    var n = nodes[cur];
    /* 名单刚从 visibility:hidden 回来，同帧 focus 会被丢掉，等一帧再还焦点 */
    if (n) window.setTimeout(function () { n.focus({ preventScroll: true }); }, 40);
  }

  if (btnBack) btnBack.addEventListener('click', closeBio);
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!stage || !stage.classList.contains('is-reading')) return;
    e.preventDefault();
    closeBio();
  });

  /* 竖线只从第一个点拉到最后一个点；走线再从线头染到当前那个点 */
  function dotY(k) {
    var node = nodes[k];
    var dot = node && node.querySelector('.in-dot');
    if (!dot) return 0;
    return node.offsetTop + dot.offsetTop + dot.offsetHeight / 2;
  }

  /* 下面的字没露完，就在正文底边做一道渐隐，提示还能往下滚 */
  function fadeHint() {
    if (!indBody) return;
    var rest = indBody.scrollHeight - indBody.clientHeight - indBody.scrollTop;
    indBody.classList.toggle('is-long', rest > 4);
  }
  if (indBody) indBody.addEventListener('scroll', fadeHint, { passive: true });

  function moveRail() {
    if (cur < 0) return;
    var first = dotY(0);
    var last = dotY(nodes.length - 1);
    var y = dotY(cur);

    thread.style.setProperty('--lt', first + 'px');
    thread.style.setProperty('--lb', (thread.offsetHeight - last) + 'px');

    if (!rail) return;
    rail.style.top = first + 'px';
    rail.style.height = Math.max(0, y - first) + 'px';
  }

  /* 换图：旧图垫底，新图自下而上擦出来 */
  function turn(i) {
    var p = PEOPLE[i];
    var old = imgCur.getAttribute('src');
    if (old === p.photo) return;

    imgPrev.src = old;
    imgCur.src = p.photo;
    imgCur.alt = p.alt;

    window.clearTimeout(turnTimer);
    fig.classList.remove('is-turn');
    void fig.offsetWidth;              /* 强制回流：同一套动画才能重播 */
    fig.classList.add('is-turn');
    turnTimer = window.setTimeout(function () {
      fig.classList.remove('is-turn');
    }, 800);
  }

  function select(i, instant, fromUser) {
    var same = (i === cur);
    if (same && !fromUser) return;
    cur = i;

    nodes.forEach(function (n, k) {
      n.classList.toggle('is-on', k === i);
      n.setAttribute('aria-selected', k === i ? 'true' : 'false');
    });

    if (!same) {
      fillText(i);
      if (instant) {
        imgCur.src = PEOPLE[i].photo;
        imgCur.alt = PEOPLE[i].alt;
      } else {
        turn(i);
      }
    }
    if (fromUser) renderBio(i);
    moveRail();
  }

  /* 鼠标扫过名字就换照片、换姓名与题记（原来那套跟手的换图保留）；
     只有「点」才展开生平。正在看生平时名单是藏着的，扫不到也不用管。 */
  nodes.forEach(function (n) {
    var i = Number(n.dataset.i);
    n.addEventListener('pointerenter', function () { select(i, false); });
    n.addEventListener('focus', function () { select(i, false); });
    n.addEventListener('click', function () { select(i, false, true); });
  });

  select(0, true);

  /* 字号随视口走，点的高度会变，走线跟着重算 */
  window.addEventListener('resize', function () { moveRail(); fadeHint(); });
  window.setTimeout(function () { moveRail(); fadeHint(); }, 260);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { moveRail(); fadeHint(); });
  }
})();
