/* ==========================================================
   plays.js —— 07 经典剧目
   · 四出戏排成一张戏单，点一出 → 右栏换它的折子、唱词与试听
   · 「听一段」放的是真录音：每出戏只取一段高潮唱段（23~36 秒），
     四句唱词按各自真实起唱点（marks）逐句点亮，不再均分
   · 录音都是各剧种/院团的公开演出，出处写在栏底；没有音频时退回静默按拍
   ========================================================== */
(function () {
  var PLAYS = [
    {
      n: '五峰会',
      tags: ['武生', '旦', '全本大戏'],
      min: 45,
      brief: '杨家将故事，戏单上盖着「全本」的印。杨延德、杨桂英一武一旦，武场靠旗开打、文场念白压阵，一台戏行当齐全。',
      acts: ['金沙滩', '五台会'],
      lyrics: ['金沙滩前风卷旗', '五台山上钟声急', '一门忠烈存肝胆', '留得青史照西陲'],
      audio: {
        src: 'assets/audio/plays/wufeng.m4a?v=2',
        at: 0, clip: 32,
        marks: [0, 8, 17, 24],
        src_text: '唐山皮影《五峰会》选段　曲艺大剧院（网络音频）'
      }
    },
    {
      n: '镇冤塔',
      tags: ['净', '生', '忠烈传奇'],
      min: 40,
      brief: '包拯断案、陈世美负心，戏单上印着「报仇雪恨」。净角脸谱黑里透威，一嗓锁住全场，是考验净角的看家戏。',
      acts: ['铡美', '镇冤'],
      lyrics: ['乌纱一顶压清廉', '铁面无私对苍天', '塔下冤魂终得雪', '包公明镜照人间'],
      audio: {
        /* 已从完整选段裁成 36 秒的唱腔爆发段，独立文件从 0 秒起播 */
        src: 'assets/audio/plays/zhenyuan.m4a?v=2',
        at: 0, clip: 36,
        marks: [3.7, 10, 15, 22],
        src_text: '唐山皮影《镇冤塔》选段　曲艺大剧院（网络音频）'
      }
    },
    {
      n: '白蛇传',
      tags: ['旦', '生', '江南常见'],
      min: 40,
      brief: '白素贞与许仙，戏单上印着「痴情无价」。游湖一折几乎没有打斗，全靠念白与身段的细处，海宁一路演得最柔。',
      acts: ['游湖', '盗草', '断桥'],
      lyrics: ['西湖三月雨如烟', '借伞还伞两相牵', '端阳一盏雄黄酒', '千年道行化云烟'],
      audio: {
        src: 'assets/audio/plays/baishe.m4a?v=2',
        at: 0, clip: 23,
        marks: [2.3, 6, 9.9, 14],
        src_text: '皮影戏《白蛇传》　海宁皮影艺术团（2025 越韵中国年·越剧春晚）'
      }
    },
    {
      n: '西游记',
      tags: ['武生', '净', '神怪', '打的戏'],
      min: 35,
      brief: '孙悟空、唐三藏一路西行，戏单上印着「打上凌霄」。金箍棒、筋斗云全在操纵杆上，变景换头茬，最热闹的满台跑戏。',
      acts: ['三打白骨精', '火焰山'],
      lyrics: ['云头一转化人形', '火眼金睛识妖气', '金箍棒起鬼神惊', '一路西天取真经'],
      audio: {
        src: 'assets/audio/plays/xiyou.m4a?v=2',
        at: 0, clip: 36,
        marks: [0.25, 6.65, 18.95, 32.95],
        src_text: '唐山皮影戏《孙悟空三借芭蕉扇》　赵卫东 等（2022 元宵戏曲晚会）'
      }
    }
  ];

  var list = document.getElementById('psList');
  var lyShow = document.getElementById('lyShow');
  var lyLines = document.getElementById('lyLines');
  var lyActs = document.getElementById('lyActs');
  var lyMin = document.getElementById('lyMin');
  var lySrc = document.getElementById('lySrc');
  var lyPlay = document.getElementById('lyPlay');
  var lyPlayTxt = document.getElementById('lyPlayTxt');
  var lyFill = document.getElementById('lyFill');
  var lyTime = document.getElementById('lyTime');
  var audio = document.getElementById('lyAudio');
  if (!list || !lyLines) return;

  var STEP = 1400;                 // 无音频时的静默按拍
  var timer = null;                // 静默按拍的 interval
  var raf = null;                  // 有声时的逐帧刷新
  var cur = 0;
  var playing = false;
  var srcLoaded = '';

  function esc(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function fmt(s) {
    s = Math.max(0, Math.round(s));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  /* ---------- 戏单 ---------- */
  PLAYS.forEach(function (p, i) {
    var li = document.createElement('li');
    li.className = 'ps-row';
    li.dataset.i = i;
    li.innerHTML =
      '<span class="ps-no">' + String(i + 1).padStart(2, '0') + '</span>' +
      '<div class="ps-main">' +
        '<h3>' + esc(p.n) + '</h3>' +
        '<p>' + esc(p.brief) + '</p>' +
        '<div class="ps-tags">' + p.tags.map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') + '</div>' +
      '</div>' +
      '<span class="ps-min">' + p.min + '<b>分钟</b></span>';
    li.addEventListener('click', function () { select(i); });
    list.appendChild(li);
  });

  /* ---------- 画面 ---------- */
  function paint(i) {
    var lines = lyLines.children;
    for (var k = 0; k < lines.length; k++) lines[k].classList.toggle('is-on', k === i);
  }

  function setBar(ratio, sec) {
    lyFill.style.width = Math.max(0, Math.min(1, ratio)) * 100 + '%';
    if (sec !== undefined) lyTime.textContent = fmt(sec);
  }

  function markIdle() {
    playing = false;
    lyPlay.classList.remove('is-on');
    lyPlayTxt.textContent = PLAYS[cur].audio ? '听一段' : '按拍走';
  }

  function stopAll(resetBar) {
    if (timer) { window.clearInterval(timer); timer = null; }
    if (raf) { window.cancelAnimationFrame(raf); raf = null; }
    if (audio && !audio.paused) audio.pause();
    markIdle();
    if (resetBar) { setBar(0, 0); paint(0); }
  }

  /* 没有音频 / 放不出来：退回原来的静默按拍 */
  function silentBeat() {
    var lines = lyLines.children;
    var n = lines.length;
    var i = 0;
    playing = true;
    lyPlay.classList.add('is-on');
    lyPlayTxt.textContent = '停';
    paint(0);
    setBar(0, 0);
    timer = window.setInterval(function () {
      i++;
      if (i >= n) { stopAll(true); return; }
      paint(i);
      setBar(i / (n - 1), 0);
    }, STEP);
  }

  /* ---------- 有声：按每句唱词的真实起唱点推四句 ---------- */
  function tick() {
    raf = null;
    var a = PLAYS[cur].audio;
    if (!playing || !a) return;
    var t = audio.currentTime - a.at;
    if (!isFinite(t)) t = 0;
    if (t >= a.clip) { stopAll(true); return; }
    setBar(t / a.clip, t);
    /* 按 marks（每句唱词的起唱时间点）点亮，而不是 clip/4 均分；
       起唱点之前是过门/前奏，不点亮任何句（idx=-1） */
    var marks = a.marks || [];
    var idx = -1;
    for (var m = 0; m < marks.length; m++) {
      if (t >= marks[m]) idx = m;
    }
    paint(idx);
    raf = window.requestAnimationFrame(tick);
  }

  function beginAudio() {
    var a = PLAYS[cur].audio;
    if (!a) { silentBeat(); return; }

    /* 换了曲目就别信 readyState：刚改完 src 它还会短暂沿用上一首的值，
       这时候写 currentTime 会被直接忽略，结果从头播、跳不到唱段起点 */
    var swapped = srcLoaded !== a.src;
    if (swapped) {
      srcLoaded = a.src;
      audio.src = a.src;
    }

    var start = function () {
      var go = function () {
        /* 有些文件在 metadata 刚到时还跳不动，等 play() 落实后再校正一次起点 */
        if (Math.abs(audio.currentTime - a.at) > 1.5) {
          try { audio.currentTime = a.at; } catch (e) {}
        }
        playing = true;
        lyPlay.classList.add('is-on');
        lyPlayTxt.textContent = '停';
        paint(0);
        setBar(0, 0);
        if (raf) window.cancelAnimationFrame(raf);
        raf = window.requestAnimationFrame(tick);
      };
      try { audio.currentTime = a.at; } catch (e) {}
      var p;
      try { p = audio.play(); } catch (e) { go(); return; }
      /* play() 在现代浏览器一律返回 Promise：以前写成 if (p && p.catch) {…; return}
         等于成功也直接 return，声音照响、按钮和进度条却一直停在「载入」 */
      if (p && typeof p.then === 'function') {
        p.then(go, function () { markIdle(); silentBeat(); });
      } else {
        go();
      }
    };

    if (!swapped && audio.readyState >= 1) start();
    else {
      lyPlayTxt.textContent = '载入';
      var once = function () {
        audio.removeEventListener('loadedmetadata', once);
        start();
      };
      audio.addEventListener('loadedmetadata', once);
      audio.load();
    }
  }

  audio.addEventListener('error', function () {
    if (playing || lyPlayTxt.textContent === '载入') { stopAll(true); silentBeat(); }
  });

  /* ---------- 选戏 ---------- */
  function select(i) {
    cur = i;
    stopAll(false);
    var p = PLAYS[i];

    Array.prototype.forEach.call(list.children, function (li, k) {
      li.classList.toggle('is-on', k === i);
    });

    lyShow.textContent = p.n;
    lyActs.textContent = '折子 ' + p.acts.join(' / ');
    lyMin.textContent = p.audio ? '试听 ' + p.audio.clip + ' 秒' : '无录音';
    lySrc.textContent = p.audio ? '录音：' + p.audio.src_text : '';
    lyPlayTxt.textContent = p.audio ? '听一段' : '按拍走';
    setBar(0, 0);

    lyLines.innerHTML = p.lyrics.map(function (l) {
      return '<p class="ly-line">' + esc(l) + '</p>';
    }).join('');
    paint(0);
  }

  lyPlay.addEventListener('click', function () {
    if (playing || timer) { stopAll(true); return; }
    beginAudio();
  });

  /* 翻到别的屏就把声音收掉 */
  if (window.deck) {
    var sec = document.getElementById('page7');
    var order = window.deck.sections || [];
    var myIndex = Array.prototype.indexOf.call(order, sec);
    if (myIndex >= 0) {
      window.deck.onChange(function (i) {
        if (i !== myIndex && (playing || timer)) stopAll(true);
      });
    }
  }

  select(0);
})();
