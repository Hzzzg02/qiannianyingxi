/* ==========================================================================
   t-process.js —— 工艺
   一 七道工序：点一道道看，图随工序换
   二 关节与签子：真实工序与馆藏实物图，可切三签／五签
   三 五色：真实彩色头茬图鉴 + 五色规矩
   四 材料图鉴在 HTML 里
   ========================================================================== */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var IMG_VER = '2512d';
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function lib(p) {
    return 'assets/img/lib/' + String(p).replace(/^images\//, '').replace(/\\/g, '/') + '?v=' + IMG_VER;
  }

  /* ==========================================================
     一 七道工序
     ========================================================== */
  var STEPS = [
    {
      n: '制皮', sub: '选皮 · 泡 · 刮 · 绷',
      img: 'assets/img/craft/step1.jpg',
      cap: '工序现场｜刮薄后的皮绷在木架上阴干',
      p: [
        '选皮先看厚薄。牛皮要挑青壮的，皮板厚薄均匀；驴皮要挑薄而透的，太厚刻不动，太薄一折就裂。选好之后泡软、刮里，把肉膜和油脂刮净。',
        '刮好的皮绷在木架上，阴干到半透明。行内说「透光见纹」：举起来对着天，能看见皮的丝缕，又不漏光，这个分寸就是合格线。一张皮要刮三四遍，越刮越薄，也越刮越脆。'
      ],
      chips: ['泡皮', '刮里', '绷架', '阴干', '透光见纹', '刮三四遍'],
      hot: 1,
      warn: '刮过头就废了。薄到透亮好看，可一折就裂，刻的时候整片崩掉，前功尽弃。'
    },
    {
      n: '画稿', sub: '样子 · 过稿 · 描线',
      img: 'assets/img/craft/step2.jpg',
      cap: '工序现场｜照着「样子」描稿',
      p: [
        '每个班子都有几套「样子」，就是代代传下来的谱本：头茬一套、戳子一套、衬景一套。要用的时候把样子覆在皮上，拿针尖沿着线戳一遍，皮下留下密密的小孔。',
        '揭掉样子，用白粉或淡墨把小孔连起来，稿子就到了皮上。这一步叫「过稿」。老师傅不用样子也能画，画了几十年，人物的比例在手上。'
      ],
      chips: ['样子（谱本）', '针尖戳点', '过稿', '白粉描线', '人物比例'],
      warn: '稿子歪一分，刻出来歪十分。过稿时皮要摊平，样子的纸也不能起皱。'
    },
    {
      n: '镂刻', sub: '先里后外 · 先繁后简',
      img: 'assets/img/craft/step3.jpg',
      cap: '工序现场｜镂刻，刀尖不动，皮子往刀口上送',
      p: [
        '镂刻是整件事里最吃功夫的一步。顺序有规矩：先里后外，先繁后简，先难后易。先把眼睛、花纹这些细处刻出来，最后才修外轮廓，这样片子不容易在手上散架。',
        '刀有斜口、平口、圆口几种，各有各的用处。阳刻的线条要一气贯通，中间不能断；阴刻的留白要匀，宽窄一致才好看。一件影人少的几百刀，多的三千刀，刻一件要三五天。'
      ],
      chips: ['斜口刀', '平口刀', '圆口刀', '先里后外', '走刀不断线', '阳刻', '阴刻'],
      hot: 3,
      warn: '断一刀，整件重来。所以刻之前先想清楚走刀路线，宁可慢，不可停。'
    },
    {
      n: '敷彩', sub: '品色兑桐油 · 薄涂多层',
      img: 'assets/img/craft/step4.jpg',
      cap: '工序现场｜敷彩，一层一层薄薄地罩上去',
      p: [
        '旧时用「品色」：品红、品绿、品黄，矿石或染料磨细，兑桐油调开。颜色要薄涂，一层干了再上一层，一块红往往涂三四遍，透光才艳而不浊。',
        '皮子本身是半透明的土黄，这一色不能盖死，要让它透出来。所以影人的颜色永远比戏台的脸谱淡一档，看着不够浓，一亮灯就正好。'
      ],
      chips: ['品红', '品绿', '品黄', '桐油', '薄涂多层', '阴干'],
      warn: '一次涂厚就会花。桐油多了发黏，少了不牢，全靠手感调。'
    },
    {
      n: '熨平', sub: '热熨 · 定形',
      img: 'assets/img/craft/step5.jpg',
      cap: '工序现场｜熨平，敷彩后的片子要压回去',
      p: [
        '敷完彩，皮子会翘、会变形，尤其是薄的地方。要用热熨斗（旧时用烙铁，或者压在热砖底下）把片子熨平。',
        '熨的过程也是让颜色吃进皮里。熨过的片子平整、挺括，装在签子上才不会打卷。'
      ],
      chips: ['热熨', '压平', '定形', '防翘', '吃色'],
      warn: '温度过高会把皮子烫熟，颜色发暗，一件就毁了。'
    },
    {
      n: '缀结', sub: '打孔 · 牛皮线 · 十一处',
      img: 'assets/img/craft/step6.jpg',
      cap: '工序现场｜缀结，把部件连成能动的身子',
      p: [
        '按关节位置打孔，用牛皮线（从边角料上切下的细皮条）把各部件缀在一起。头茬、戳子、两臂、两手、两腿、两脚，缀连处十一处上下。',
        '线的松紧决定动作的灵活程度：太紧转不动，太松会晃。这一步做完，影人就能动了，虽然还没有签子。'
      ],
      chips: ['打孔', '牛皮线', '十一处关节', '松紧适度', '试转'],
      hot: 2,
      warn: '孔打偏了没法改，一改就豁口。所以缀结之前先在背面标点。'
    },
    {
      n: '装签', sub: '主签一根 · 手签两根',
      img: 'assets/img/parts/qiemo.png',
      cap: '影人部件｜切末（道具），装签后才能操耍',
      p: [
        '最后一步装签。竹签取青皮部分，直、轻、有弹性。一根主签撑在胸口，两根手签接在两只手腕上。三根签子配合，才撑得起走路、转身、抬手、打斗这些动作。',
        '签子的粗细要按影人重量配：太粗压手，操一场下来胳膊抬不起来；太细打晃，做不了干净的动作。'
      ],
      chips: ['主签', '左手签', '右手签', '竹青', '绑线', '配重'],
      warn: '签子绑得太靠上，影人会低头；太靠下，站不直。这个位置是老艺人手上的分寸。'
    }
  ];

  var stepsBox = $('#pxSteps');
  var detailBox = $('#pxDetail');
  var curStep = 0;

  if (stepsBox) {
    stepsBox.innerHTML = STEPS.map(function (s, i) {
      return '<button class="px-step' + (i === 0 ? ' on' : '') + '" type="button" data-i="' + i + '">' +
        '<em>0' + (i + 1) + '</em><b>' + esc(s.n) + '</b><span>' + esc(s.sub) + '</span></button>';
    }).join('');
    $$('.px-step', stepsBox).forEach(function (b) {
      b.addEventListener('click', function () { showStep(+b.dataset.i); });
    });
    showStep(0);
  }

  function showStep(i) {
    curStep = i;
    var s = STEPS[i];
    $$('.px-step', stepsBox).forEach(function (b, j) { b.classList.toggle('on', j === i); });
    detailBox.innerHTML =
      '<figure><img src="' + s.img + '" alt="' + esc(s.cap) + '" loading="lazy">' +
      '<figcaption>' + esc(s.cap) + '</figcaption></figure>' +
      '<div class="px-detail-body"><h3>' + esc(s.n) + '</h3>' +
      s.p.map(function (t) { return '<p>' + esc(t) + '</p>'; }).join('') +
      '<div class="px-24">' + s.chips.map(function (c, k) {
        return '<span' + (s.hot && k < s.hot ? ' class="hot"' : '') + '>' + esc(c) + '</span>';
      }).join('') + '</div>' +
      '<div class="px-warn">' + esc(s.warn) + '</div></div>';
  }

  /* ==========================================================
     二 关节与签子（真实工序图 + 馆藏实物图）
     ========================================================== */
  var jointStage = $('#jointStage');
  var jointCopy = $('#jointCopy');

  var JOINTS = [
    { t: '主签（胸口）', p: '撑住整个身子。主签一动，影人才会走、会转、会跪。它是唯一一根直接控制重心的签，绑在胸口偏下的位置，不是正中间。' },
    { t: '左手签（腕）', p: '管左臂。抬、落、抖袖、指人，全靠这一根。武打时左手签常与右手签反着来，一进一退才有对打的意思。' },
    { t: '右手签（腕）', p: '管右臂。拿刀、拿扇、拿马鞭，都在右手。多数戏里右手更忙，所以右手签比左手签略长一点，好发力。' },
    { t: '颈部关节', p: '头茬与戳子相接的地方。这里缀得紧，头就僵；缀得松，头会晃。老艺人在这一步反复试转，转顺了才上签。' },
    { t: '膝关节', p: '影人能不能「跪」全看这里。膝盖一折，身子下沉，幕上就有了坐、跪、跌三个动作的区别。' }
  ];

  if (jointStage && jointCopy) {
    jointStage.innerHTML =
      '<figure class="jfig"><img src="assets/img/craft/step6.jpg" alt="缀结与装签前的部件，左上角可见竹签" loading="lazy">' +
      '<figcaption>工序现场｜缀结装签前的部件，左上角是竹签</figcaption></figure>' +
      '<figure class="jfig"><img src="' + lib('images/jiangsu/jiangsu-11-48288.jpg') + '" alt="馆藏羊皮整身影人：高翠兰" loading="lazy">' +
      '<figcaption>馆藏整身｜高翠兰（羊皮）</figcaption></figure>' +
      '<figure class="jfig"><img src="' + lib('images/anhui/anhui-04-48318.jpg') + '" alt="馆藏整身影人：丑公子" loading="lazy">' +
      '<figcaption>馆藏整身｜丑公子</figcaption></figure>';

    jointCopy.innerHTML =
      '<div class="px-col">' +
      '<h4>十一处关节，三根签子</h4>' +
      '<ul class="joint-list">' + JOINTS.map(function (j) {
        return '<li><b>' + esc(j.t) + '</b><span>' + j.p + '</span></li>';
      }).join('') + '</ul></div>' +
      '<aside class="px-aside">' +
      '<h5>三签还是五签</h5>' +
      '<div class="joint-modes"><button type="button" class="md on" data-m="3">三签</button>' +
      '<button type="button" class="md" data-m="5">五签</button></div>' +
      '<p class="joint-note" id="modeNote">三签是最常见的一种：一根主签、两根手签。够用、上手快，大江南北的班子多用它。</p>' +
      '<h5>怎么试松紧</h5>' +
      '<p class="joint-extra">缀好一件先别装签：拎着头茬轻轻一晃，松紧合适的关节会自己找平，晃两下就停；太紧的别住不动，太松的一直打转。这一下手感对了，再上签。</p>' +
      '</aside>';

    $$('.md', jointCopy).forEach(function (b) {
      b.addEventListener('click', function () {
        $$('.md', jointCopy).forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        $('#modeNote').textContent = b.dataset.m === '5'
          ? '五签：主签、两根手签，再加一根头签与一根腰签。头能点、腰能扭，动作细，操耍的人也得更熟。海宁皮影常见这一类。'
          : '三签是最常见的一种：一根主签、两根手签。够用、上手快，大江南北的班子多用它。';
      });
    });
  }

  /* ==========================================================
     三 五色（真实彩色头茬图鉴）
     ========================================================== */
  var colorStage = $('#colorStage');
  var colorCopy = $('#colorCopy');

  var COLORS = [
    { n: '红', c: '#a8281c', d: '忠、勇。关公、赵匡胤一类角色用红脸，红也是用得最多的一个色。' },
    { n: '黑', c: '#221b14', d: '刚直。包公、张飞用黑；同时担当轮廓线、发色与靴子，用量最大。' },
    { n: '白', c: '#f3ead6', d: '奸诈。曹操一类白脸；也用来做脸底，靠留白透光显出人的神情。' },
    { n: '绿', c: '#2f6b4a', d: '勇猛、草莽。绿林好汉与鬼怪多用；也做甲胄与神将的袍。' },
    { n: '黄', c: '#d9a13c', d: '帝王与神佛的金身。黄难调，涂薄了不起眼，涂厚了不透光，最考手艺。' }
  ];

  var HEADS = [
    { img: 'images/henan/henan-10-8881.jpg', n: '红净', cap: '红脸 · 忠勇' },
    { img: 'images/shaanxi/shaanxi-31-8230.jpg', n: '元帅（黑脸）', cap: '黑脸 · 刚直' },
    { img: 'images/beijing/beijing-07-48966.jpg', n: '花脸大将（白脸）', cap: '白脸 · 奸诈' },
    { img: 'images/henan/henan-14-48468.jpg', n: '正官旦', cap: '旦角 · 头饰红绿黄相间' }
  ];

  if (colorStage && colorCopy) {
    colorCopy.innerHTML =
      '<div class="px-col"><h4>五色规矩</h4>' +
      '<ul class="color-list">' + COLORS.map(function (c) {
        return '<li><i style="background:' + c.c + '"></i><b>' + esc(c.n) + '</b><span>' + esc(c.d) + '</span></li>';
      }).join('') + '</ul></div>' +
      '<aside class="px-aside">' +
      '<figure class="color-photo"><img src="assets/img/craft/step4.jpg" alt="敷彩：毛笔在皮影面部描画上色" loading="lazy">' +
      '<figcaption>敷彩现场｜品色兑桐油，薄涂多层</figcaption></figure>' +
      '<p class="color-extra">皮子本身是半透明的土黄，这一色不能盖死，要让它透出来——所以影人的颜色永远比戏台的脸谱淡一档，看着不够浓，一亮灯就正好。</p>' +
      '</aside>';

    colorStage.innerHTML = '<div class="color-heads">' + HEADS.map(function (h) {
      return '<figure><img src="' + lib(h.img) + '" alt="' + esc(h.n) + '" loading="lazy">' +
        '<figcaption><b>' + esc(h.n) + '</b> · ' + esc(h.cap) + '</figcaption></figure>';
    }).join('') + '</div>';
  }
})();
