/* ==========================================================================
   千年影戏 · 影箱服务
   零依赖：仅用 Node 内置模块。账号、会话、影偶数据存 JSON 文件（原子写）。
   只处理 /api/*，静态文件仍由 nginx 直出。
   ========================================================================== */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const tls = require('tls');
const https = require('https');

const PORT = process.env.PORT || 3100;
const DATA_DIR = process.env.QN_DATA || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const UP_DIR = process.env.QN_UPLOAD || path.join(__dirname, '..', 'uploads', 'ai');
const SESSION_DAYS = 30;
const MAX_PUPPETS = 200;
const MAX_BODY = 32 * 1024;

/* 配置文件查找顺序：项目内 config/ 优先，找不到再落到系统的 /etc/qnyx/
   生产环境的密钥都放在 /etc/qnyx/，以前这里只认项目目录，导致线上读不到 Key */
function cfgPath(name) {
  const local = path.join(__dirname, 'config', name);
  if (fs.existsSync(local)) return local;
  return path.join('/etc/qnyx', name);
}

/* 论坛 */
const MAX_POSTS = 100;          /* 单账号帖子上限 */
const MAX_PAGE = 10;            /* 列表每页条数 */
const MAX_TAGS = 3;             /* 一帖最多挂几个标签 */
const LEN_TITLE = 60;
const LEN_BODY = 3000;
const LEN_REPLY = 800;
const RE_TAG = /^[\u4e00-\u9fa5A-Za-z0-9·]{2,8}$/;

/* ---------------- 存储 ---------------- */
function emptyDB() {
  return {
    users: [],
    sessions: [],
    puppets: [],
    forum: { posts: [], seeded: false },
    seq: { user: 1, puppet: 1, post: 1, reply: 1 }
  };
}

let db;
function load() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(DB_FILE)) {
      db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      db.users = db.users || [];
      db.sessions = db.sessions || [];
      db.puppets = db.puppets || [];
      db.forum = db.forum || { posts: [], seeded: false };
      db.forum.posts = db.forum.posts || [];
      /* 社区：吧 → 帖 → 楼。形状和前端 community.js 用的一致，
         多存 ownerId / authorId / uid，好按账号判权限（昵称会重名） */
      db.circles = db.circles || [];
      db.seq = db.seq || { user: 1, puppet: 1, post: 1, reply: 1 };
      db.seq.post = db.seq.post || 1;
      db.seq.reply = db.seq.reply || 1;
    } else {
      db = emptyDB();
      save();
    }
  } catch (e) {
    console.error('[db] 读取失败，改用空库:', e.message);
    db = emptyDB();
  }
}

let writing = false;
function save() {
  /* 原子写：先落临时文件再 rename，避免断电时留下半截 JSON */
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db), 'utf8');
  fs.renameSync(tmp, DB_FILE);
  writing = false;
}

/* ---------------- 口令 ---------------- */
function hashPassword(pw, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(pw, s, 64).toString('hex');
  return { salt: s, hash: h };
}
function verifyPassword(pw, salt, hash) {
  const h = crypto.scryptSync(pw, salt, 64).toString('hex');
  const a = Buffer.from(h, 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ---------------- 会话 ---------------- */
function newToken() {
  return crypto.randomBytes(32).toString('base64url');
}
function sessionOf(req) {
  const raw = req.headers.cookie || '';
  const m = raw.match(/(?:^|;\s*)qn_sid=([^;]+)/);
  if (!m) return null;
  const token = m[1];
  const now = Date.now();
  const s = db.sessions.find((x) => x.token === token);
  if (!s) return null;
  if (s.exp < now) return null;
  return s;
}
function userOf(req) {
  const s = sessionOf(req);
  if (!s) return null;
  return db.users.find((u) => u.id === s.uid) || null;
}
function purgeSessions() {
  const now = Date.now();
  const before = db.sessions.length;
  db.sessions = db.sessions.filter((s) => s.exp > now);
  return before !== db.sessions.length;
}

/* ---------------- 限流（按 IP）---------------- */
const hits = new Map();
function rateLimit(ip, key, limit, windowMs) {
  const k = ip + '|' + key;
  const now = Date.now();
  let rec = hits.get(k);
  if (!rec || now - rec.t > windowMs) {
    rec = { n: 0, t: now };
    hits.set(k, rec);
  }
  rec.n++;
  return rec.n <= limit;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of hits) if (now - v.t > 600000) hits.delete(k);
}, 300000).unref();

/* ---------------- HTTP 工具 ---------------- */
const CORS_ORIGIN = process.env.QN_ORIGIN || '';

function send(res, code, obj, headers) {
  const body = JSON.stringify(obj);
  res.writeHead(code, Object.assign(
    {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    },
    headers || {}
  ));
  res.end(body);
}
function fail(res, code, msg) {
  send(res, code, { ok: false, error: msg });
}
function ok(res, obj, headers) {
  send(res, 200, Object.assign({ ok: true }, obj || {}), headers);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (e) {
        reject(new Error('bad json'));
      }
    });
    req.on('error', reject);
  });
}

function clientIP(req) {
  const f = req.headers['x-forwarded-for'];
  if (f) return String(f).split(',')[0].trim();
  return (req.socket.remoteAddress || '0.0.0.0').replace(/^::ffff:/, '');
}

function setCookie(token, maxAge) {
  return (
    'qn_sid=' + token + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + maxAge
  );
}

/* ---------------- 校验 ---------------- */
const RE_USER = /^[\u4e00-\u9fa5A-Za-z0-9_]{3,20}$/;

function cleanUsername(v) {
  return typeof v === 'string' ? v.trim() : '';
}
function cleanTitle(v) {
  const t = typeof v === 'string' ? v.trim() : '';
  return t.slice(0, 40);
}
/* 昵称：1–20 字，去掉换行等控制字符 */
function cleanName(v) {
  const t = typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim() : '';
  return t.slice(0, 20);
}
/* 个性签名：一句话，和正文一样压掉换行，24 字以内 */
const MAX_SIGN = 24;
function cleanSign(v) {
  const t = typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim() : '';
  return t.slice(0, MAX_SIGN);
}
function userView(u) {
  return {
    name: u.name,
    username: u.username,
    email: u.email || null,
    emailMask: maskMail(u.email),
    signature: u.signature || '',
    created: u.created
  };
}
/* 邮箱打码：个人中心里只露前两位与域名，别人瞄一眼看不出全址 */
function maskMail(m) {
  if (!m) return '';
  const at = m.indexOf('@');
  if (at < 1) return m;
  const name = m.slice(0, at);
  const head = name.slice(0, Math.min(2, name.length));
  return head + '***' + m.slice(at);
}

/* 影偶配置只认这几个键，避免塞进任意大对象 */
const CHAR_KEYS = ['guan', 'wusheng', 'dan', 'chou', 'shen'];
const POSE_KEYS = ['stand', 'fight', 'bow'];
const COLOR_KEYS = ['red', 'jade', 'ochre', 'ink'];
const MODE_KEYS = ['color', 'line'];
const ANGLE_KEYS = ['shoulder', 'elbow', 'shoulder2', 'elbow2', 'hip', 'knee', 'hip2', 'knee2', 'head'];

function num(v, min, max, dflt) {
  const n = Number(v);
  if (!isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}

function cleanConfig(src) {
  const c = src && typeof src === 'object' ? src : {};
  const pick = (v, list, dflt) => (list.indexOf(v) >= 0 ? v : dflt);
  const base = {};
  const b = c.base && typeof c.base === 'object' ? c.base : {};
  ANGLE_KEYS.forEach((k) => {
    base[k] = num(b[k], -180, 180, 0);
  });
  return {
    char: pick(c.char, CHAR_KEYS, 'guan'),
    pose: pick(c.pose, POSE_KEYS, 'stand'),
    color: pick(c.color, COLOR_KEYS, 'red'),
    mode: pick(c.mode, MODE_KEYS, 'color'),
    base: base,
    light: num(c.light, 0, 100, 62),
    temp: num(c.temp, 0, 100, 50),
    size: num(c.size, 0.4, 2.5, 1)
  };
}

function puppetView(p) {
  return {
    id: p.id,
    title: p.title,
    config: p.config,
    share: p.share || null,
    created: p.created,
    updated: p.updated
  };
}

/* ==========================================================================
   论坛：帖 / 回复 / 标签 / 统计
   全部落在同一个 db.json 里（forum.posts），不引数据库。
   帖子结构：
     { id, uid, by, title, body, tags[], puppet|null, likes[uid], likes0,
       replies[{id,uid,by,body,created}], created, updated, seed }
   - by 写死当时的昵称，改昵称不会把旧帖的作者一起改掉
   - likes0 只给站方的起头帖垫一个基数，真实点赞仍按 uid 记
   ========================================================================== */
function cleanText(v, max) {
  let s = typeof v === 'string' ? v : '';
  s = s.replace(/\r\n?/g, '\n');
  s = s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (s.length > max) s = s.slice(0, max);
  return s;
}

function cleanTags(src) {
  const arr = Array.isArray(src) ? src : [];
  const out = [];
  arr.forEach((t) => {
    const s = String(t || '').replace(/\s+/g, '').trim();
    if (!RE_TAG.test(s)) return;
    if (out.indexOf(s) >= 0) return;
    if (out.length >= MAX_TAGS) return;
    out.push(s);
  });
  return out;
}

function postBrief(p) {
  return {
    id: p.id,
    title: p.title,
    excerpt: String(p.body || '').replace(/\s+/g, ' ').slice(0, 160),
    tags: p.tags || [],
    by: p.by,
    uid: p.uid,
    created: p.created,
    updated: p.updated || p.created,
    likes: (p.likes || []).length + (p.likes0 || 0),
    replies: (p.replies || []).length,
    puppet: p.puppet ? { title: p.puppet.title, config: p.puppet.config } : null,
    seed: !!p.seed
  };
}

function postFull(p, uid) {
  const v = postBrief(p);
  v.body = p.body;
  v.liked = uid ? (p.likes || []).indexOf(uid) >= 0 : false;
  v.mine = uid ? p.uid === uid : false;
  return v;
}

function forumStats() {
  const posts = db.forum.posts;
  const dayStart = new Date().setHours(0, 0, 0, 0);
  const who = {};
  let replies = 0, onWall = 0, today = 0;
  posts.forEach((p) => {
    const rs = p.replies || [];
    replies += rs.length;
    if (p.puppet) onWall++;
    if (p.created >= dayStart) today++;
    who[p.by || '佚名'] = 1;
    rs.forEach((r) => {
      if (r.created >= dayStart) today++;
      who[r.by || '佚名'] = 1;
    });
  });
  return {
    posts: posts.length,
    replies: replies,
    members: Object.keys(who).length,
    users: db.users.length,
    today: today,
    puppets: onWall
  };
}

function forumTags() {
  const m = new Map();
  db.forum.posts.forEach((p) => {
    (p.tags || []).forEach((t) => m.set(t, (m.get(t) || 0) + 1));
  });
  return Array.from(m.entries())
    .map((e) => ({ tag: e[0], n: e[1] }))
    .sort((a, b) => b.n - a.n || (a.tag < b.tag ? -1 : 1));
}

/* 热度：赞与回复为主，时间做衰减，别让老帖永远压在新帖上 */
function hotScore(p) {
  const likes = (p.likes || []).length + (p.likes0 || 0);
  const hours = Math.max(0, (Date.now() - (p.updated || p.created)) / 3600000);
  return likes * 3 + (p.replies || []).length * 2 - hours / 48;
}

/* 空论坛放六条起头帖：都是站方代拟（seed=1），回复点赞仍按真实记录走 */
function seedForum() {
  if (db.forum.seeded && db.forum.posts.length) return;
  if (db.forum.posts.length) return;
  const H = 3600000;
  const now = Date.now();
  const mk = (o) => {
    const id = db.seq.post++;
    const rec = {
      id: id,
      uid: 0,
      by: o.by,
      title: o.title,
      body: o.body,
      tags: o.tags,
      puppet: o.puppet || null,
      likes: [],
      likes0: o.likes0 || 0,
      replies: (o.replies || []).map((r) => ({
        id: db.seq.reply++,
        uid: 0,
        by: r[0],
        body: r[2],
        created: now - r[1] * H
      })),
      created: now - o.ago * H,
      updated: now - o.ago * H,
      seed: true
    };
    return rec;
  };

  const posts = [
    mk({
      by: '学徒小周', ago: 3.2, likes0: 7,
      title: '头一次刻皮，厚薄总是不匀，求个笨办法',
      tags: ['技法求教', '雕镂'],
      body:
        '照着「溯源」里的工序列下来，选皮、制皮都还算顺，一到雕镂就不行了：刻刀走到拐弯处，薄的地方直接透光，厚的地方又推不动。\n' +
        '手上还剩半张驴皮，不敢下手了。想问各位，是先拿废料把刀口磨顺，还是先把皮再刮一遍？',
      replies: [
        ['老杆子', 2.8, '刀不快，手就重。先把刻刀在细石上顺二十下，能让指甲盖发白的才算快。皮要潮不要湿，湿了会毛边，摸着凉手、按下去有指印正好。'],
        ['阿柚', 2.2, '我也卡过这一步。后来改成先刻轮廓、再抠内里的镂空，拐弯处留一刀宽的余地，最后回刀修，废料就少了。'],
        ['灯下客', 1.5, '半张皮别急着上整活，先切三条两指宽的皮条练走刀，手不抖了再动大件。']
      ]
    }),
    mk({
      by: '灯下客', ago: 26, likes0: 5,
      title: '石青上了三遍还是发灰，问题出在哪',
      tags: ['上色', '技法求教'],
      body:
        '按古法调的石青，胶用的是牛皮胶，薄刷三遍，晾干以后还是发灰，对着灯看尤其明显。\n' +
        '是不是胶重了？还是颜料本身目数不够细？有没有人用别的胶试过。',
      replies: [
        ['阿柚', 24, '胶重会闷色。我的是颜料一成、胶水两成半，兑到能拉丝就停，宁可薄刷多遍。'],
        ['老杆子', 20, '也可能是底子没封住，皮里的油反上来把颜色吃了。上色前先用淡胶水封一遍底试试。']
      ]
    }),
    mk({
      by: '阿柚', ago: 14, likes0: 12,
      title: '新做的旦角晒一晒：发髻这一路最难',
      tags: ['影箱晒图', '上色'],
      puppet: { title: '青绿旦角', config: cleanConfig({ char: 'dan', pose: 'bow', color: 'jade', mode: 'color' }) },
      body:
        '在创作台上试了十几版，最后落在「旦角 · 施礼 · 青绿」这一只。发髻的弧线改了四回，宽一点显笨，窄一点又撑不起头面。\n' +
        '靠旗没上。旦角靠手腕出戏，杆子也少一根，练起来轻一些。',
      replies: [
        ['学徒小周', 13, '这个青绿配得好看，我那只一上青绿就发闷。'],
        ['阿柚', 12.5, '我拿它试过镂空线稿，线条更清楚，但真上幕布还是敷彩有味道。'],
        ['灯下客', 9, '发髻那一路可以先「剪影」定外形，再抠内里的卷，稳一些。'],
        ['老杆子', 4, '杆子少一根，手腕的活就全落在自己身上了，慢慢练。']
      ]
    }),
    mk({
      by: '老杆子', ago: 58, likes0: 9,
      title: '三根杆怎么练才不打架',
      tags: ['操纵', '技法求教'],
      body:
        '主杆管走位，手杆管挥臂，脚杆管迈步。道理都懂，一上手三根杆就互相绊，影人在幕上抖得像抽风。\n' +
        '有没有练手顺的笨办法？只在周末有空，一天能挤出两小时。',
      replies: [
        ['半台人', 52, '先只拿主杆，把一只影人走满一台，走顺了再加第二根。急着三根一起上，谁也练不出来。'],
        ['老杆子', 50, '试了，走位是稳了，一加手杆又乱。看来还是得慢。']
      ]
    }),
    mk({
      by: '王老师', ago: 110, likes0: 6,
      title: '带四年级社团课，用「影藏」当课件',
      tags: ['演出见闻', '新手报到'],
      body:
        '学校社团课一节课四十分钟，讲完影箱里的部件只剩一半时间，孩子们最爱上色那一步。\n' +
        '把「影藏」里那六件部件投到屏幕上做板书，比讲十遍结构都直观：头茬、身子、砌末，一件件拆开看。',
      replies: [
        ['灯下客', 100, '可以把「角色剧目」里的生旦净末印成卡片，让孩子自己配戏，一节课刚好用完。']
      ]
    }),
    mk({
      by: '半台人', ago: 146, likes0: 4,
      title: '求一段两分钟以内的武打戏',
      tags: ['剧本', '演出见闻'],
      body:
        '社区演出，中间要垫一段短的。想要两人对打、有锣鼓点、两分钟收得住的。\n' +
        '有没有现成的本子可以改？我这边只有一双手、两根杆。',
      replies: [
        ['老杆子', 140, '《武松打虎》里挑「三扑」那一段，一人一虎，两根杆就够，收在虎倒地。'],
        ['半台人', 132, '这个好，我去找唱本对一下锣鼓点。']
      ]
    })
  ];

  db.forum.posts = posts;
  db.forum.seeded = true;
  save();
  console.log('[forum] 起头帖 ' + posts.length + ' 条');
}

/* ==========================================================================
   发信：SMTP 隐式 TLS（465），AUTH LOGIN。
   仍然是零依赖 —— 只说协议，不引 nodemailer。
   配置在 /etc/qnyx/mail.json：
     { "host": "smtp.qq.com", "port": 465, "user": "xxx@qq.com",
       "pass": "授权码", "from": "xxx@qq.com", "name": "千年影戏" }
   本地联调时可以 QN_MAIL_MODE=log，验证码只打进日志，不外发。
   ========================================================================== */
function mailConfig() {
  if (process.env.QN_MAIL_MODE === 'log') return { mode: 'log' };
  const f = process.env.QN_MAIL_CONFIG || cfgPath('mail.json');
  try {
    if (!fs.existsSync(f)) return null;
    const c = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (!c || !c.host || !c.user || !c.pass) return null;
    c.port = Number(c.port) || 465;
    c.from = c.from || c.user;
    return c;
  } catch (e) {
    console.error('[mail] 配置读不出来:', e.message);
    return null;
  }
}


/* ==========================================================================
   大模型（皮影助手）：代理 DeepSeek 的 /chat/completions。
   仍然零依赖 —— 用内置 https 模块，不开 SDK。
   配置优先级：环境变量 QN_DEEPSEEK_KEY > /etc/qnyx/deepseek.json
     { "key": "sk-...", "model": "deepseek-chat", "baseURL": "https://api.deepseek.com" }
   本地联调 QN_DEEPSEEK_MODE=mock：不真调模型，回一句占位，用来验前后端链路。
   ========================================================================== */
/* ==========================================================================
   AI 点戏：把一句描述翻成一套零件 id
   只挑件、不画图，所以输出可以严格枚举、可以校验、可以兜底。
   ========================================================================== */
/* 真实皮影部件：头茬 8 种、戳子 6 种，AI 只做「挑哪一个」 */
const LIT_ENUM = {
  head: { kui: 1, sheng: 1, dan: 1, chou: 1, xian: 1, fan: 1, lao: 1, nvjiang: 1 },
  body: { armor: 1, sheng: 1, dan: 1, chou: 1, long: 1, zhan: 1 }
};

const CAST_SYSTEM = [
  '你是皮影戏班里的「派戏人」。戏班的真皮影是分开做的两件：头茬（头）、戳子（身段），',
  '你用竹签把一件头茬插到一件戳子的领口上，就缀结成一位影人。现在用户说一句话，你挑这两件。',
  '',
  'head 头茬（8 种）：',
  '  kui     武将帅盔（将军、武圣、霸王、持兵器的战将）',
  '  sheng   小生方巾（书生、公子、官人、青年男子）',
  '  dan     旦角发髻（女子、旦角、仙女、夫人、小姐）',
  '  chou    丑角小帽（丑角、店小二、媒婆、滑稽角色）',
  '  xian    神仙莲花冠（神仙、道士、佛、妖精鬼怪）',
  '  fan     番王皮帽（外番、胡人、蛮王、异族首领）',
  '  lao     老生员外（老者、老汉、员外、白须长者、老臣）',
  '  nvjiang 女将凤翅盔（女将、女侠、巾帼、刀马旦）',
  '',
  'body 戳子（6 种）：',
  '  armor 武将靠甲（披甲扎靠、持兵器、上阵）',
  '  sheng 文生褶子（长袍、官服、文士、老者）',
  '  dan   旦角裙袄（裙袄、水袖、女子身形）',
  '  chou  丑角短打（短衣便服、杂役、市井人物）',
  '  long  帝王龙袍（皇帝、王爷、君主）',
  '  zhan  女将战裙（巾帼戎装、女将上阵）',
  '',
  '规矩：只能从上面挑 id，绝不自造、绝不解释、绝不写代码块。',
  '搭配要对得上：武将配靠甲，女子配裙袄，书生配褶子，丑角配短打，帝王配龙袍，女将配战裙，',
  '老者配褶子，神仙配褶子，番王配靠甲。',
  '描述里提到兵器、披甲、打仗，body 就选 armor；提到皇帝、龙袍、登基，body 选 long。',
  '',
  '只输出一个 JSON：{"head":"kui","body":"armor","why":"二十字以内说清为什么这么配"}'
].join('\n');

function castParse(raw) {
  const s = String(raw || '').replace(/```json/gi, '').replace(/```/g, '');
  const i = s.indexOf('{');
  const j = s.lastIndexOf('}');
  if (i < 0 || j <= i) return null;
  let o;
  try { o = JSON.parse(s.slice(i, j + 1)); } catch (e) { return null; }
  if (!o || typeof o !== 'object') return null;

  const head = typeof o.head === 'string' && LIT_ENUM.head[o.head.trim().toLowerCase()] ? o.head.trim().toLowerCase() : 'kui';
  const body = typeof o.body === 'string' && LIT_ENUM.body[o.body.trim().toLowerCase()] ? o.body.trim().toLowerCase() : 'armor';

  const why = typeof o.why === 'string' ? o.why.trim().slice(0, 40) : '';
  return { pick: { head: head, body: body }, why: why };
}

function llmConfig() {
  if (process.env.QN_DEEPSEEK_MODE === 'mock') return { mode: 'mock' };
  let c = null;
  const f = process.env.QN_DEEPSEEK_CONFIG || cfgPath('deepseek.json');
  try {
    if (fs.existsSync(f)) c = JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch (e) {
    console.error('[llm] 配置读不出来:', e.message);
  }
  const key = process.env.QN_DEEPSEEK_KEY || (c && c.key);
  if (!key) return null;
  return {
    key: key,
    model: (c && c.model) || process.env.QN_DEEPSEEK_MODEL || 'deepseek-chat',
    baseURL: (c && c.baseURL) || 'https://api.deepseek.com'
  };
}

/* 助手人设 + 站内核心事实，尽量让模型不跑偏、不编造 */
const ASST_SYSTEM = [
  '你是「千年影戏」皮影戏数字体验站里的皮影助手，一位懂皮影的老说戏人，语气亲切、口语化、简洁。',
  '只回答与皮影戏相关的问题：工艺、流派、唱腔、行当、剧目、历史、非遗、皮料、影人尺寸等。',
  '严格依据站内资料作答，绝不编造；不确定或站里没有的，直接说「这个我不清楚」，并建议去看站内对应页面。',
  '',
  '站内核心事实（务必一致）：',
  '· 工序：页面按六道讲——选皮、描样、雕刻、上色、缀结、整平；文献通行八道——选皮、制皮、画稿、过稿、镂刻、敷彩、发汗熨平、缀结合成。一件影偶少则上千刀，繁复的三千多刀；关节要刻骨缝、留筋。',
  '· 皮料：冀东用驴皮（故称驴皮影）、陇东环县用牛皮、浙江海宁用羊皮走「绘革」一路、湖南长沙是纸影（约60cm）。',
  '· 影人尺寸：唐山25–40cm（高至50cm）、山东约25cm、河南罗山40–60cm、四川大灯影60–80cm、湖北门神谱约70cm。',
  '· 流派：按江玉祥分七大影系——秦晋、滦州、山东、杭州、川鄂滇、湘赣、潮州。',
  '· 行当：生旦净丑四路，靠头茬分家。三根签子——文场胸上一根、两手各一根；武场胸前那根改在后肩。「三根杆定乾坤」。',
  '· 唱腔：关中碗碗腔、华阴老腔、冀东乐亭影调、陇东道情、晋南皮腔、川剧高腔；清代后期冀东改用「掐嗓」。',
  '· 非遗：2006年列入第一批国家级非物质文化遗产名录，2011年「中国皮影戏」入选联合国教科文组织人类非物质文化遗产代表作名录。',
  '· 国家级代表性传承人：范正安（泰山皮影，一人「十不闲」）、张坤荣（海宁，绘革一路）、宋国超（复州皮影）。',
  '· 源流：汉武帝思念李夫人设帐张灯是观念源头（传说）；宋代瓦舍勾栏出现职业艺人、行会「绘革社」，影戏成行当；元代向西传；明清随移民商路分流各地。',
  '',
  '回答尽量短，能一两句说清就不列点；信息多时用短句分条。'
].join('\n');

function llmChat(cfg, messages) {
  return new Promise((resolve, reject) => {
    let body;
    try {
      body = JSON.stringify({
        model: cfg.model,
        messages: messages,
        stream: false,
        temperature: 0.7,
        max_tokens: 800
      });
    } catch (e) { return reject(e); }

    let u;
    try { u = new URL(cfg.baseURL + '/chat/completions'); }
    catch (e) { return reject(new Error('baseURL 不对')); }

    const req = https.request({
      host: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + cfg.key,
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (d) => {
        buf += d;
        if (buf.length > 4 * 1024 * 1024) { req.destroy(); reject(new Error('模型响应过大')); }
      });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          let msg = '大模型返回 ' + res.statusCode;
          try {
            const j = JSON.parse(buf);
            if (j.error && j.error.message) msg += '：' + j.error.message;
          } catch (e) { /* ignore */ }
          return reject(new Error(msg));
        }
        try {
          const j = JSON.parse(buf);
          const m = j.choices && j.choices[0] && j.choices[0].message;
          const text = m && m.content ? String(m.content).trim() : '';
          if (!text) return reject(new Error('大模型没返回内容'));
          resolve(text);
        } catch (e) {
          reject(new Error('解析大模型响应失败'));
        }
      });
    });
    req.on('error', (e) => reject(e));
    req.setTimeout(30000, () => req.destroy(new Error('大模型超时')));
    req.end(body);
  });
}


/* ==========================================================================
   智谱 CogView（免费文生图）：给影偶创作页画一张静态图。
   配置：环境变量 QN_ZHIPU_KEY > /etc/qnyx/zhipu.json
     { "key": "xxx.yyy", "model": "cogview-3-flash" }
   本地联调 QN_ZHIPU_MODE=mock：不真画，只验前后端链路。
   ========================================================================== */

/* ---------------------------------------------------------------------------
   底层人偶规格（底层提示词）——不管用户写什么，都先把这一段喂给模型。
   目的不是画一张"好看的皮影插画"，而是画一个"能被切开、能上关节的人偶"。
   下面每一条都对着切分算法的一个前提：
     · 四肢与躯干之间留空隙 → 手臂才切得下来
     · 全身完整不被裁切     → 头和脚才不缺
     · 白底无阴影           → 二值化才不带脏点
   可在 /etc/qnyx/zhipu.json 用 spec 字段整段覆盖。
   --------------------------------------------------------------------------- */
var PUPPET_SPEC = [
  '中国传统皮影戏非遗工艺的皮影人偶，平面剪影，纯艺术创作。',
  '这是一张给关节人偶用的零件图，不是插画：二维平面的剪纸剪影，不是立体模型、不是塑料人偶、不是三维渲染。',
  '造型扁平、正面、左右对称、结构分明，全图只画一个人。',
  '画面里只有一个完整的人偶，从头顶到双脚全部在画面内，四周留白，任何部位都不被裁切。',
  '姿态：完全正面站立，脸朝镜头，身体竖直居中，头身比约一比六。',
  '上半身从左到右依次是左臂、躯干、右臂，这三段之间各留一道清楚的白色缝隙；',
  '双臂向外斜张约三十度，肘部略弯，手不贴住躯干，腋下透出白色空隙；',
  '下半身从腰往下分成左右两条腿，两条腿之间留一道清楚的白色缝隙，一直通到脚踝；',
  '两脚分别踩地，左右分开，脚与脚之间是白色背景。',
  '头部与颈部之间、颈部与躯干之间界线清楚，颈子细而分明。',
  '肩、肘、胯、膝各有一颗小铆钉，标出可以转动的关节。',
  '质感：纯黑或深褐色的皮革剪影，边缘是刻刀刀口，',
  '衣纹、甲片、飘带用镂空花纹刻出，透出细密的孔洞，关节处透一点暖光。',
  '安静端庄的戏曲亮相姿态，气氛典雅。',
  '只要人偶本体：不画操纵杆、不画支架、不画底座横杆、不画手持的长棍，人偶自己独立站立。',
  '背景：纯白色，干净均匀，不要幕布、不要场景、不要地面、不要投影、不要道具、不要文字、不要边框、不要水印。'
].join('');

function puppetSpec(c) {
  return (c && typeof c.spec === 'string' && c.spec.trim()) ? c.spec.trim() : PUPPET_SPEC;
}

function zgConfig() {
  if (process.env.QN_ZHIPU_MODE === 'mock') return { mode: 'mock' };
  let c = null;
  const f = process.env.QN_ZHIPU_CONFIG || cfgPath('zhipu.json');
  try {
    if (fs.existsSync(f)) c = JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch (e) {
    console.error('[zhipu] 配置读不出来:', e.message);
  }
  const key = process.env.QN_ZHIPU_KEY || (c && c.key);
  if (!key) return null;
  return {
    key: key,
    model: (c && c.model) || process.env.QN_ZHIPU_MODEL || 'cogview-3-flash',
    baseURL: (c && c.baseURL) || 'https://open.bigmodel.cn/api/paas/v4',
    spec: (c && c.spec) || ''
  };
}

function zgPaint(cfg, prompt, opt) {
  return new Promise((resolve, reject) => {
    const o = opt || {};
    const payload = { model: o.model || cfg.model, prompt: prompt, size: o.size || '864x1152' };
    if (o.watermark === false) payload.watermark = false;
    const body = JSON.stringify(payload);
    let u;
    try { u = new URL(cfg.baseURL + '/images/generations'); }
    catch (e) { return reject(new Error('baseURL 不对')); }

    const req = https.request({
      host: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + cfg.key,
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (d) => {
        buf += d;
        if (buf.length > 2 * 1024 * 1024) { req.destroy(); reject(new Error('绘画响应过大')); }
      });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          let msg = '绘画服务返回 ' + res.statusCode;
          try {
            const j = JSON.parse(buf);
            if (j.error && j.error.message) msg += '：' + j.error.message;
          } catch (e) { /* ignore */ }
          return reject(new Error(msg));
        }
        try {
          const j = JSON.parse(buf);
          const url = j.data && j.data[0] && j.data[0].url;
          if (!url) return reject(new Error('没拿到图片地址'));
          resolve(url);
        } catch (e) {
          reject(new Error('解析绘画响应失败'));
        }
      });
    });
    req.on('error', (e) => reject(e));
    req.setTimeout(120000, () => req.destroy(new Error('绘画超时')));
    req.end(body);
  });
}

/* ==========================================================================
   皮影资料库（流派 · 行当 · 姿态）与「生图」链路
   --------------------------------------------------------------------------
   底层固定提示词只有一句：

     检索资料库中的皮影形象，根据用户提供的提示词来生成个性化皮影。

   这句话不是口号，它规定了三条执行顺序，代码就按这三条走：
     1. 先检索 —— 用户选的流派 / 行当 / 姿态，都要先在下面这张表里命中一条；
        表里没有的 id 一律退回默认，模型永远拿不到用户随手编的字符串。
     2. 再落形 —— 命中的条目本身就是一段「能进提示词的形」：皮料、刀法、配色、
        冠戴、身段，不是写给人看的解说词。
     3. 后生成 —— 单件、全身、白底、无杆，这是交付物规格，与用户说什么无关。
   ========================================================================== */
const LIT_BASE = '检索资料库中的皮影形象，根据用户提供的提示词来生成个性化皮影。';

const LIT_SCHOOLS = {
  tangshan: {
    n: '唐山皮影', area: '河北唐山 · 乐亭',
    mat: '驴皮，薄而透，背光时呈琥珀色',
    craft: '刀口细如发丝，通天鼻、细眉细眼、下颌尖，旦角多用六分脸，人物清秀俊逸',
    color: '红绿黑三色清丽，敷彩薄，透光见纹',
    note: '生旦净丑俱全，尤擅文戏，唱腔带乐亭大鼓的味'
  },
  huaxian: {
    n: '陕西华县皮影', area: '陕西渭南 · 华州',
    mat: '牛皮，厚实，边缘留着雪花刻纹',
    craft: '造型夸张洗练，头大身短，额部饱满，八眉八眼，净角脸谱狰狞有威，甲片与翎羽高度几何化',
    color: '大红大绿，色块大而整，黑线压边，对比强烈',
    note: '碗碗腔皮影，武戏与神话戏见长'
  },
  huanxian: {
    n: '甘肃环县道情皮影', area: '甘肃庆阳 · 环县',
    mat: '牛皮，皮色沉',
    craft: '造型古朴粗犷，线条刚直少回锋，衣纹用短直线排刻，人物敦厚',
    color: '赭石、墨黑、暗红为主，沉厚少亮色',
    note: '道情皮影，神怪与列国戏最多'
  },
  taishan: {
    n: '山东泰山皮影', area: '山东泰安',
    mat: '驴皮',
    craft: '刻工细致规整，人物端正敦厚，脸谱方圆，动作幅度小',
    color: '石青石绿配赭石，色彩沉着',
    note: '十不闲，一人操几件乐器带演'
  },
  lufeng: {
    n: '广东陆丰皮影', area: '广东汕尾 · 陆丰',
    mat: '牛皮',
    craft: '装饰极繁密，衣饰布满细碎花纹，脸谱秀气，旦角高髻簪花',
    color: '桃红翠绿明快，金线勾边',
    note: '潮州影一路，受潮剧扮相影响'
  },
  chengdu: {
    n: '四川成都灯影', area: '四川成都',
    mat: '牛皮，影人体量大',
    craft: '线条粗犷有力，造型憨拙夸张，丑角尤其生动，喜剧感强',
    color: '浓艳，大红大绿，黑线压边',
    note: '成都灯影，灯下调度的做法'
  }
};

const LIT_ROLES = {
  sheng: { n: '生', d: '男性正面角色，俊扮', subs: {
    xiaosheng: { n: '小生', d: '青年男子，面白无须，戴方巾，穿褶子' },
    wusheng: { n: '武生', d: '英武青年，扎靠披甲，束发戴盔，手持长兵器' },
    laosheng: { n: '老生', d: '中年以上男子，三绺长须，戴员外方帽' }
  } },
  dan: { n: '旦', d: '女性角色', subs: {
    qingyi: { n: '青衣', d: '端庄妇人，长裙水袖，发髻簪花' },
    huadan: { n: '花旦', d: '活泼少女，短袄罗裙，手执帕或团扇' },
    daomadan: { n: '刀马旦', d: '女将戎装，凤翅盔插双翎，执刀' }
  } },
  jing: { n: '净', d: '花脸，性格刚猛', subs: {
    hualian: { n: '花脸', d: '脸谱浓烈，勾眉勾眼，重彩，气势压人' },
    wujiang: { n: '武将', d: '靠甲护心镜，束甲绦，横刀立马' },
    laohu: { n: '悍将', d: '体格魁伟，怒目虬髯，赤膊披甲' }
  } },
  chou: { n: '丑', d: '滑稽角色', subs: {
    wen: { n: '文丑', d: '店家、书生一类，鼻梁上一小块白，笑眼' },
    wu: { n: '武丑', d: '身手利落，短打快靴，身形轻巧' },
   laodan: { n: '丑旦', d: '媒婆、店婆一类，鬓边一朵花，动作泼辣' }
  } },
  shen: { n: '神', d: '神仙鬼怪', subs: {
    xian: { n: '神仙', d: '道冠长须，额间一点朱砂，脚踏云头' },
    yao: { n: '妖精', d: '兽面人身，发髻生角，眉眼妖异' },
    gui: { n: '鬼怪', d: '青面獠牙，指爪尖利，身披散碎飘带' }
  } },
  wang: { n: '王', d: '帝王将相', subs: {
    diwang: { n: '帝王', d: '冕旒垂珠，团龙龙袍，朝靴' },
    jiangxiang: { n: '将相', d: '帅盔蟒袍，玉带围腰，手持笏板' },
    fanwang: { n: '番王', d: '翻毛皮帽，络腮胡，弯刀' }
  } }
};

const LIT_POSES = {
  liangxiang: { n: '亮相', d: '定场亮相，一臂平抬，重心落在后腿，衣摆向后扬起' },
  jingli: { n: '静立', d: '垂手端立，身体微侧，袍角自然垂落' },
  jixing: { n: '疾走', d: '大步疾行，前腿弓后腿蹬，战裙与飘带向后翻起' },
  kaida: { n: '开打', d: '横刀立马，双臂张开，兵器斜指前方' },
  shili: { n: '施礼', d: '欠身拱手，头微低，袖口垂落' },
  huimou: { n: '回眸', d: '身子朝前，头向后侧转回望，水袖半掩' }
};

/* 可动模式下扩写要多加一条禁令：姿势由系统统一规定，扩写不许自己安排动作，
   否则「丁字步」「左掌按刀柄」这类词会把四肢画回身上，第二层就切不开。 */
const LIT_EXPAND_RIG = [
  '\n【重要】这一次不要写站姿、步法、手脚动作，也不要写手臂指向哪里；',
  '只写冠帽发式、脸谱、衣饰纹样、手里拿的器物、神态。'
].join('');

/* 拆一句用户话的「画样师傅」：只加看得见的东西，不加剧情 */
const LIT_EXPAND = [
  '你是皮影戏班里的画样师傅。用户会给你一句话、一路流派、一门行当，',
  '你要把它说成「这一只影偶长什么样」：冠帽发式、脸谱、衣饰纹样、手里的东西、神态、站姿。',
  '只写画面里看得见的东西，不写剧情、不写对白、不写人名故事、不做解释、不夸赞。',
  '若用户这句话与流派行当冲突，以流派行当的扮相为准，只取用户话里的身份、性情与道具。',
  '输出一段话，不超过九十字，不要引号、不要分行、不要列点、不要任何前后缀。'
].join('');

function litPick(b) {
  const school = LIT_SCHOOLS[b && b.school] ? b.school : 'tangshan';
  const role = LIT_ROLES[b && b.role] ? b.role : 'sheng';
  const subs = LIT_ROLES[role].subs;
  const sub = subs[b && b.sub] ? b.sub : Object.keys(subs)[0];
  const pose = LIT_POSES[b && b.pose] ? b.pose : 'liangxiang';
  return { school: school, role: role, sub: sub, pose: pose,
           S: LIT_SCHOOLS[school], R: LIT_ROLES[role], T: subs[sub], P: LIT_POSES[pose] };
}

/* 底层规格永远是主语；用户那句只是"这一只画成什么样" */
/* 可动皮影用的「可拆姿势」：四肢必须彼此分开、不与躯干重叠，
   第二层才能按骨架把图切成头/身/上臂/前臂/大腿/小腿六片而不带上别人的像素。
   注意：「双腿分开」这类词会被智谱内容审核拦，一律换成「两腿前后开立」的写法。 */
const LIT_RIG_BODY = [
  '【可拆姿势】这是一只用于「分件缀结」的影偶，姿势必须满足下面每一条：',
  '· 纯正侧面，头与身子同向，脸朝画面右侧平视，不回头、不俯视、不仰头；',
  '· 颈部下方留出清楚的领口，头与身段在领口处只以一小段插榫相接；',
  '· 上肢：靠前的一条手臂向前斜上方抬起，上臂与前臂成钝角，手在腰带高度之上；',
  '  靠后的一条手臂向后下方斜伸，两臂与躯干之间都留出明显的空当，不贴身、不交叉；',
  '· 下肢：前腿向前迈出、略屈，后腿向后撤、蹬直，两腿前后分开且中间露出空隙，不并拢、不交叉；',
  '· 手掌张开，手中若持器物，器物顺着手臂方向伸出，不与躯干、衣摆、飘带相碰；',
  '· 衣摆、腰带、飘带一律贴身垂落，不横穿肩肘腕胯膝，不飘到空当里；',
  '· 头茬与戳子正常缀结，关节处可见细小缀结铆钉。'
].join('\n');

function litSpec(b, desc, rig) {
  const k = litPick(b);
  const head = [
    LIT_BASE,
    '【检索到的流派】' + k.S.n + '（' + k.S.area + '）：' + k.S.mat + '；' + k.S.craft + '；' + k.S.color + '。',
    '【检索到的行当】' + k.R.n + '行 · ' + k.T.n + '：' + k.T.d + '。'
  ];
  const pose = rig
    ? [LIT_RIG_BODY]
    : ['【这一只的姿态】' + k.P.n + '：' + k.P.d + '。'];
  const body = rig
    ? [
        '【用户要的】' + desc + '。',
        '【成品】一只缀结完整的影偶，正侧面朝右，四肢舒展分开：',
        '全身完整入画，盔顶翎尖到靴底都在画面内，四周留白，任何部位不被裁切；竖幅。'
      ]
    : [
        '【用户要的】' + desc + '。',
        '【成品】一只缀结完整的影偶：头茬插在戳子的领口上，肩肘腕胯膝处有细小的缀结铆钉；',
        '全身完整入画，盔顶翎尖到靴底都在画面内，四周留白，任何部位不被裁切；',
        '身体略侧、约三分侧脸，朝画面右侧站立；竖幅。'
      ];
  return head.concat(pose, body, [
    '【画法】非遗皮影文物摄影：皮料半透明，背光透出暖色，镂空处透白，刀口干净，边缘锐利，平光拍摄，无强反光，无景深虚化。',
    '【不要】操纵杆、竹签、支架、底座、人手、人影、幕布、桌面、地面、投影、文字、印章、边框、水印、签名。',
    '【背景】纯白，均匀干净。'
  ]).join('\n');
}

/* 模型从好到次，用得上哪个用哪个；成功过的那个记住，下次直接用它 */
/* 免费档（cogview-3-flash）不按提示词画、还带水印，宁可不画也不给它：
   出一张错图比出一句"余额不足"更伤，用户会以为功能就是这个水平。 */
const LIT_MODELS = [
  { m: 'doubao-seedream-4.0', size: '1728x2304', wm: false },
  { m: 'cogview-4', size: '768x1344', wm: false }
];
let litGood = 0;

function litTimeout(ms) {
  return new Promise(function (_, rej) { setTimeout(function () { rej(new Error('扩写超时')); }, ms); });
}

async function litDraw(zc, prompt) {
  let last = null;
  for (let i = Math.min(litGood, LIT_MODELS.length - 1); i < LIT_MODELS.length; i++) {
    const o = LIT_MODELS[i];
    try {
      const remote = await zgPaint(zc, prompt, { model: o.m, size: o.size, watermark: o.wm });
      litGood = i;
      return { remote: remote, model: o.m, wm: o.wm };
    } catch (e) {
      last = e;
      console.error('[gen] ' + o.m + ' 失败:', e.message);
      if (!/余额|资源包|1113|无可用/.test(String(e.message))) throw e;
    }
  }
  throw last || new Error('没有可用的绘画模型');
}

/* 把远程图片抓到站内（外部临时链接会过期），失败返回 null 由调用方降级 */
function grabImage(url, dir, prefix) {
  return new Promise((resolve) => {
    let u;
    try { u = new URL(url); } catch (e) { return resolve(null); }
    const mod = u.protocol === 'http:' ? http : https;
    let req;
    try {
      req = mod.get({
        host: u.hostname,
        port: u.port || (u.protocol === 'http:' ? 80 : 443),
        path: u.pathname + u.search
      }, (res) => {
        if (res.statusCode !== 200) { res.resume(); return resolve(null); }
        const chunks = [];
        let size = 0;
        res.on('data', (c) => {
          size += c.length;
          if (size > 15 * 1024 * 1024) { req.destroy(); return resolve(null); }
          chunks.push(c);
        });
        res.on('end', () => {
          try {
            const ct = String(res.headers['content-type'] || '').toLowerCase();
            const ext = ct.indexOf('png') >= 0 ? '.png'
              : ct.indexOf('webp') >= 0 ? '.webp'
              : ct.indexOf('gif') >= 0 ? '.gif'
              : '.jpg';
            const name = prefix + '-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex') + ext;
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(dir, name), Buffer.concat(chunks));
            resolve(name);
          } catch (e) { resolve(null); }
        });
      });
    } catch (e) { return resolve(null); }
    req.on('error', () => resolve(null));
    req.setTimeout(60000, () => { try { req.destroy(); } catch (e) {} resolve(null); });
  });
}

function b64(s) {
  return Buffer.from(s, 'utf8').toString('base64');
}
function wrap76(s) {
  return (s.match(/.{1,76}/g) || []).join('\r\n');
}
function encHeader(s) {
  return '=?UTF-8?B?' + b64(s) + '?=';
}

function buildMail(cfg, m) {
  const boundary = 'qn' + crypto.randomBytes(8).toString('hex');
  const from = cfg.name ? encHeader(cfg.name) + ' <' + cfg.from + '>' : cfg.from;
  const head = [
    'From: ' + from,
    'To: ' + m.to,
    'Subject: ' + encHeader(m.subject),
    'Date: ' + new Date().toUTCString().replace('GMT', '+0000'),
    'Message-ID: <' + crypto.randomBytes(12).toString('hex') + '@' + (cfg.from.split('@')[1] || 'qnyx') + '>',
    'MIME-Version: 1.0',
    'Content-Type: multipart/alternative; boundary="' + boundary + '"',
    'Auto-Submitted: auto-generated'
  ].join('\r\n');
  const part = (type, body) =>
    '--' + boundary + '\r\nContent-Type: ' + type + '; charset=UTF-8\r\n' +
    'Content-Transfer-Encoding: base64\r\n\r\n' + wrap76(b64(body)) + '\r\n';
  return head + '\r\n\r\n' + part('text/plain', m.text) + part('text/html', m.html) +
    '--' + boundary + '--';
}

/* 一次 SMTP 会话：读一行 -> 发一条 -> 再读，直到 250 结束 */
function smtpSend(cfg, msg) {
  return new Promise((resolve, reject) => {
    let sock;
    try {
      sock = tls.connect({ host: cfg.host, port: cfg.port, servername: cfg.host });
    } catch (e) {
      return reject(e);
    }

    let buf = '';
    let pending = null;
    let dead = false;

    function die(err) {
      if (dead) return;
      dead = true;
      const p = pending;
      pending = null;
      if (p) {
        clearTimeout(p.timer);
        p.reject(err);
      }
      try { sock.destroy(); } catch (e) { /* 已经关了 */ }
      reject(err);
    }

    sock.setEncoding('utf8');
    sock.on('data', (d) => {
      buf += d;
      while (pending && buf.indexOf('\r\n') >= 0) {
        const i = buf.indexOf('\r\n');
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const code = line.slice(0, 3);
        if (!pending.code) pending.code = code;
        pending.lines.push(line);
        /* 多行回复：250-xxx ... 250 xxx，见到「码 + 空格」才算完 */
        if (code === pending.code && line.charAt(3) !== '-') {
          const p = pending;
          pending = null;
          clearTimeout(p.timer);
          p.resolve({ code: Number(code), text: p.lines.join('\n') });
          break;
        }
      }
    });
    sock.on('error', (e) => die(e));
    sock.on('close', () => die(new Error('SMTP 连接被关掉了')));

    function read() {
      return new Promise((res, rej) => {
        const p = { code: null, lines: [], resolve: res, reject: rej, timer: null };
        p.timer = setTimeout(() => {
          if (pending === p) {
            pending = null;
            rej(new Error('SMTP 响应超时'));
          }
        }, 20000);
        pending = p;
      });
    }

    const run = async () => {
      await new Promise((res, rej) => {
        sock.once('secureConnect', res);
        sock.once('error', rej);
      });
      let r = await read();
      if (r.code !== 220) throw new Error('服务器没打招呼: ' + r.text);

      sock.write('EHLO qnyx.local\r\n');
      r = await read();
      if (r.code !== 250) throw new Error('EHLO 被拒: ' + r.text);

      sock.write('AUTH LOGIN\r\n');
      r = await read();
      if (r.code !== 334) throw new Error('服务器不支持 AUTH LOGIN: ' + r.text);
      sock.write(b64(cfg.user) + '\r\n');
      r = await read();
      if (r.code !== 334) throw new Error('账号被拒: ' + r.text);
      sock.write(b64(cfg.pass) + '\r\n');
      r = await read();
      if (r.code !== 235) throw new Error('邮箱授权码不对: ' + r.text);

      sock.write('MAIL FROM:<' + cfg.from + '>\r\n');
      r = await read();
      if (r.code !== 250) throw new Error('发件人被拒: ' + r.text);

      sock.write('RCPT TO:<' + msg.to + '>\r\n');
      r = await read();
      if (r.code !== 250 && r.code !== 251) throw new Error('收件人被拒: ' + r.text);

      sock.write('DATA\r\n');
      r = await read();
      if (r.code !== 354) throw new Error('DATA 被拒: ' + r.text);

      sock.write(msg.raw + '\r\n.\r\n');
      r = await read();
      if (r.code !== 250) throw new Error('正文被拒: ' + r.text);

      sock.write('QUIT\r\n');
      sock.end();
    };

    run().then(
      () => {
        dead = true;
        try { sock.end(); } catch (e) { /* 已经关了 */ }
        resolve(true);
      },
      (e) => die(e)
    );
  });
}

/* ---------------- 图形验证码 ---------------- */
const captchas = new Map();
const CAPTCHA_TTL = 5 * 60000;

function captchaSVG(code) {
  const W = 132;
  const H = 44;
  const rnd = (a, b) => a + Math.random() * (b - a);
  let out = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H +
    '" viewBox="0 0 ' + W + ' ' + H + '"><rect width="' + W + '" height="' + H + '" fill="#fffdf7"/>';
  /* 纸上的杂点，让 OCR 分不清笔画与底 */
  for (let i = 0; i < 34; i++) {
    out += '<circle cx="' + rnd(3, W - 3).toFixed(1) + '" cy="' + rnd(3, H - 3).toFixed(1) +
      '" r="' + rnd(0.5, 1.4).toFixed(1) + '" fill="#1d0f09" opacity="' + rnd(0.06, 0.2).toFixed(2) + '"/>';
  }
  /* 两道朱、一道金的干扰弯线 */
  for (let i = 0; i < 3; i++) {
    out += '<path d="M' + rnd(0, 16).toFixed(1) + ' ' + rnd(6, H - 6).toFixed(1) +
      ' Q ' + rnd(46, 84).toFixed(1) + ' ' + rnd(-2, H + 2).toFixed(1) +
      ' ' + rnd(W - 16, W).toFixed(1) + ' ' + rnd(6, H - 6).toFixed(1) +
      '" stroke="' + (i % 2 ? '#c70a07' : '#dc9625') + '" stroke-width="1.1" fill="none" opacity=".42"/>';
  }
  const step = (W - 16) / code.length;
  code.split('').forEach((ch, i) => {
    const x = 10 + step * i + step / 2;
    const y = H / 2 + rnd(7, 10);
    out += '<g transform="translate(' + x.toFixed(1) + ',' + y.toFixed(1) + ') rotate(' +
      rnd(-14, 14).toFixed(1) + ')">' +
      '<text x="0" y="0" text-anchor="middle" font-family="Georgia,serif" font-size="' +
      rnd(23, 27).toFixed(0) + '" font-weight="700" fill="#1d0f09">' + ch + '</text></g>';
  });
  return out + '</svg>';
}

function newCaptcha() {
  const pool = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += pool[crypto.randomInt(pool.length)];
  const cid = crypto.randomBytes(12).toString('base64url');
  captchas.set(cid, { code: code, exp: Date.now() + CAPTCHA_TTL });
  return { cid: cid, code: code };
}

/* 提交表单时用：一次性，答错也当场作废，没法反复试 */
function takeCaptcha(cid, answer) {
  if (typeof cid !== 'string' || typeof answer !== 'string') return false;
  const rec = captchas.get(cid);
  if (!rec) return false;
  captchas.delete(cid);
  if (rec.exp < Date.now()) return false;
  rec.tries++;
  return rec.code === answer.trim().toUpperCase();
}

/* 发信时用：答对了先留着，别让「发完验证码还得重新认一遍图」。
   一张图最多换两次发信机会，第三次作废，免得被拿去连续刷别人邮箱。 */
function softCaptcha(cid, answer) {
  if (typeof cid !== 'string' || typeof answer !== 'string') return false;
  const rec = captchas.get(cid);
  if (!rec) return false;
  if (rec.exp < Date.now()) {
    captchas.delete(cid);
    return false;
  }
  rec.tries = (rec.tries || 0) + 1;
  if (rec.tries > 8) {
    captchas.delete(cid);
    return false;
  }
  if (rec.code !== answer.trim().toUpperCase()) return false;
  rec.sends = (rec.sends || 0) + 1;
  if (rec.sends > 2) {
    captchas.delete(cid);
    return false;
  }
  return true;
}

/* ---------------- 邮箱验证码 ---------------- */
const mailCodes = new Map();
const CODE_TTL = 10 * 60000;
const CODE_TRIES = 5;
const RE_MAIL = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,12}$/;

function normMail(v) {
  return typeof v === 'string' ? v.trim().toLowerCase() : '';
}
function codeHash(code, email) {
  return crypto.createHash('sha256').update(code + '|' + email).digest('hex');
}

function putMailCode(purpose, email, code) {
  mailCodes.set(purpose + '|' + email, {
    hash: codeHash(code, email),
    exp: Date.now() + CODE_TTL,
    tries: 0
  });
}

/* 返回 ok / bad / expired / toomany / none */
function takeMailCode(purpose, email, code) {
  const k = purpose + '|' + email;
  const rec = mailCodes.get(k);
  if (!rec) return 'none';
  if (rec.exp < Date.now()) {
    mailCodes.delete(k);
    return 'expired';
  }
  rec.tries++;
  if (rec.tries > CODE_TRIES) {
    mailCodes.delete(k);
    return 'toomany';
  }
  const got = codeHash(String(code == null ? '' : code).trim(), email);
  if (got !== rec.hash) return 'bad';
  mailCodes.delete(k);
  return 'ok';
}

function codeMailText(code, purpose, min) {
  const what = purpose === 'reset' ? '重设密码' : '注册';
  const text = '千年影戏 · ' + what + '验证码\n\n' +
    '    ' + code + '\n\n' +
    '这串数字 ' + min + ' 分钟内有效，只能用来' + what + '一次。\n' +
    '不是你在操作的话，忽略这封邮件就行，你的账号不会有任何变化。\n\n' +
    '—— 千年影戏 qnyx\n';
  const html = '<div style="margin:0;padding:26px 24px;background:#f7f1e3;font-family:-apple-system,\'PingFang SC\',sans-serif;color:#1d0f09">' +
    '<div style="max-width:420px;margin:0 auto;background:#fcf9f0;border:1px solid rgba(44,25,13,.13);border-top:3px solid #c70a07;padding:26px 24px">' +
    '<p style="margin:0 0 14px;font-size:11px;letter-spacing:.24em;color:#9a6410">千 年 影 戏</p>' +
    '<p style="margin:0 0 18px;font-size:13px;letter-spacing:.06em;color:rgba(29,15,9,.7)">' + what + '验证码</p>' +
    '<p style="margin:0 0 18px;font-family:Georgia,serif;font-size:34px;letter-spacing:.28em;font-weight:700;color:#c70a07">' + code + '</p>' +
    '<p style="margin:0;font-size:12.5px;line-height:1.9;color:rgba(29,15,9,.5)">' + min + ' 分钟内有效，只能用一次。<br>不是你在操作的话，忽略这封邮件，账号不会有任何变化。</p>' +
    '</div></div>';
  return { text: text, html: html };
}

async function sendMailCode(email, purpose) {
  const cfg = mailConfig();
  if (!cfg) throw new Error('noconfig');
  const code = String(crypto.randomInt(100000, 1000000));
  const min = Math.round(CODE_TTL / 60000);
  const body = codeMailText(code, purpose, min);

  if (cfg.mode === 'log') {
    /* 联调模式：不外发，只打日志；同时留一份到数据目录，测试脚本能读到 */
    const line = purpose + '|' + email + '|' + code + '|' + Date.now();
    console.log('[mail] ' + line);
    try {
      fs.appendFileSync(path.join(DATA_DIR, 'mail.log'), line + '\n', 'utf8');
    } catch (e) {
      /* 写不进去也不影响流程 */
    }
  } else {
    const subject = '千年影戏 · ' + (purpose === 'reset' ? '重设密码' : '注册') + '验证码 ' + code;
    await smtpSend(cfg, {
      to: email,
      raw: buildMail(cfg, { to: email, subject: subject, text: body.text, html: body.html })
    });
  }
  putMailCode(purpose, email, code);
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of captchas) if (v.exp < now) captchas.delete(k);
  for (const [k, v] of mailCodes) if (v.exp + 3600000 < now) mailCodes.delete(k);
}, 600000).unref();

/* ---------------- 路由 ---------------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  const ip = clientIP(req);

  if (!p.startsWith('/api/')) return fail(res, 404, 'not found');

  try {
    /* ---- 图形验证码 ---- */
    if (p === '/api/captcha' && req.method === 'GET') {
      if (!rateLimit(ip, 'cap', 120, 600000)) return fail(res, 429, '刷新太快了');
      const c = newCaptcha();
      const svg = captchaSVG(c.code);
      return ok(res, {
        cid: c.cid,
        img: 'data:image/svg+xml;base64,' + Buffer.from(svg, 'utf8').toString('base64'),
        /* 发信没配好时，注册不强制邮箱验证码（前端据此收起那一格） */
        mail: !!mailConfig()
      });
    }

    /* ---- 发邮箱验证码 ---- */
    if (p === '/api/email/code' && req.method === 'POST') {
      if (!rateLimit(ip, 'mailcode', 14, 3600000)) return fail(res, 429, '发信太频繁了，过一小时再试');
      const b = await readBody(req);
      const purpose = b.purpose === 'reset' ? 'reset' : 'register';
      const email = normMail(b.email);

      if (!softCaptcha(b.cid, b.answer)) {
        return fail(res, 400, '图形验证码不对，换一张再试');
      }
      if (!RE_MAIL.test(email) || email.length > 120) return fail(res, 400, '邮箱格式不对');

      if (purpose === 'register' && db.users.some((u) => u.email === email)) {
        return fail(res, 409, '这个邮箱已经注册过了，直接登录，或走「找回密码」');
      }
      if (!rateLimit(email, 'code', 5, 3600000)) {
        return fail(res, 429, '这个邮箱收得太多了，过一会儿再试');
      }
      if (!rateLimit(email, 'codecd', 1, 60000)) {
        return fail(res, 429, '刚发过一封，等 60 秒再点');
      }
      if (!mailConfig()) return fail(res, 503, '站点的发信服务还没配好，暂时发不了验证码');

      try {
        await sendMailCode(email, purpose);
      } catch (e) {
        console.error('[mail]', purpose, email, e.message);
        return fail(res, 502, '邮件没发出去，稍后再试或换个邮箱');
      }
      /* 联调模式（QN_MAIL_MODE=log）不外发，告诉前端去 server/data/mail.log 取码 */
      const cfgMail = mailConfig();
      return ok(res, { cooldown: 60, to: email, dev: !!(cfgMail && cfgMail.mode === 'log') });
    }

    /* ---- 注册 ---- */
    if (p === '/api/register' && req.method === 'POST') {
      if (!rateLimit(ip, 'reg', 8, 3600000)) return fail(res, 429, '注册过于频繁，请稍后再试');
      const b = await readBody(req);
      const wantName = cleanUsername(b.username);
      const password = typeof b.password === 'string' ? b.password : '';
      const email = normMail(b.email);

      /* 本站以邮箱为账号：没填用户名时，从邮箱前缀里挑合法字符合成一个，
         再过不了就用「影友+时间戳」，总之不让注册卡在起名这一步 */
      let username = wantName;
      if (!username && email) username = email.split('@')[0].replace(/[^\u4e00-\u9fa5A-Za-z0-9_]/g, '').slice(0, 16);
      if (!RE_USER.test(username)) username = '影友' + String(Date.now()).slice(-8);

      if (!takeCaptcha(b.cid, b.answer)) return fail(res, 400, '图形验证码不对，换一张再试');
      if (wantName && !RE_USER.test(wantName)) return fail(res, 400, '用户名需 3–20 位中文、字母、数字或下划线');
      if (password.length < 6) return fail(res, 400, '密码至少 6 位');
      if (password.length > 64) return fail(res, 400, '密码过长');
      /* 邮箱留空表示站内还没配发信：此时只认用户名口令，不再要验证码 */
      if (!email && mailConfig()) return fail(res, 400, '邮箱格式不对');
      if (email && (!RE_MAIL.test(email) || email.length > 120)) return fail(res, 400, '邮箱格式不对');

      if (wantName) {
        const lc = username.toLowerCase();
        if (db.users.some((u) => u.username.toLowerCase() === lc)) {
          return fail(res, 409, '这个用户名已被占用');
        }
      } else {
        /* 自动起的名字允许重名，加个序号区分，最多试到 99 */
        const base = username;
        let n = 1;
        while (db.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
          username = (base.slice(0, 17) + n).slice(0, 20);
          if (++n > 99) { username = '影友' + crypto.randomInt(100000, 999999); break; }
        }
      }
      if (email && db.users.some((u) => u.email && u.email === email)) {
        return fail(res, 409, '这个邮箱已经注册过了，直接登录，或走「找回密码」');
      }

      if (email) {
        const codeR = takeMailCode('register', email, b.code);
        if (codeR === 'none' || codeR === 'bad') return fail(res, 400, '邮箱验证码不对');
        if (codeR === 'expired') return fail(res, 400, '邮箱验证码过期了，重新发一封');
        if (codeR === 'toomany') return fail(res, 429, '这封验证码试错太多次了，重新发一封');
      }

      const { salt, hash } = hashPassword(password);
      const u = {
        id: db.seq.user++,
        username: username,
        name: username,
        email: email,
        signature: '',
        salt: salt,
        hash: hash,
        created: Date.now()
      };
      db.users.push(u);

      const token = newToken();
      db.sessions.push({ token, uid: u.id, exp: Date.now() + SESSION_DAYS * 86400000 });
      save();
      return ok(res, { user: userView(u) }, {
        'Set-Cookie': setCookie(token, SESSION_DAYS * 86400)
      });
    }

    /* ---- 登录 ---- */
    if (p === '/api/login' && req.method === 'POST') {
      if (!rateLimit(ip, 'login', 12, 900000)) return fail(res, 429, '尝试次数过多，请稍后再试');
      const b = await readBody(req);
      /* 账号可以是邮箱，也可以是用户名；带 @ 的按邮箱找 */
      const ident = String(b.email || b.username || '').trim();
      const password = typeof b.password === 'string' ? b.password : '';
      if (!takeCaptcha(b.cid, b.answer)) return fail(res, 400, '图形验证码不对，换一张再试');
      const u = ident.indexOf('@') > 0
        ? db.users.find((x) => x.email && x.email === normMail(ident))
        : db.users.find((x) => x.username.toLowerCase() === ident.toLowerCase());
      /* 用户名不存在也走一次哈希，避免用响应时间探出账号是否存在 */
      const okPass = u
        ? verifyPassword(password, u.salt, u.hash)
        : (hashPassword(password, 'x'.repeat(32)), false);
      if (!u || !okPass) return fail(res, 401, '邮箱或密码不对');

      purgeSessions();
      const token = newToken();
      db.sessions.push({ token, uid: u.id, exp: Date.now() + SESSION_DAYS * 86400000 });
      save();
      return ok(res, { user: userView(u) }, {
        'Set-Cookie': setCookie(token, SESSION_DAYS * 86400)
      });
    }

    /* ---- 登出 ---- */
    if (p === '/api/logout' && req.method === 'POST') {
      const s = sessionOf(req);
      if (s) {
        db.sessions = db.sessions.filter((x) => x.token !== s.token);
        save();
      }
      return ok(res, {}, { 'Set-Cookie': 'qn_sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' });
    }

    /* ---- 用邮箱验证码重设密码 ---- */
    if (p === '/api/reset' && req.method === 'POST') {
      if (!rateLimit(ip, 'reset', 10, 3600000)) return fail(res, 429, '试得太频繁了，过一会儿再试');
      const b = await readBody(req);
      const email = normMail(b.email);
      const password = typeof b.password === 'string' ? b.password : '';

      if (!takeCaptcha(b.cid, b.answer)) return fail(res, 400, '图形验证码不对，换一张再试');
      if (!RE_MAIL.test(email) || email.length > 120) return fail(res, 400, '邮箱格式不对');
      if (password.length < 6) return fail(res, 400, '新密码至少 6 位');
      if (password.length > 64) return fail(res, 400, '新密码过长');
      if (!mailConfig()) return fail(res, 503, '站点还没配好发信服务，暂时不能靠邮箱重设密码');

      const u = db.users.find((x) => x.email && x.email === email);
      const codeR = takeMailCode('reset', email, b.code);
      if (codeR === 'expired') return fail(res, 400, '邮箱验证码过期了，重新发一封');
      if (codeR === 'toomany') return fail(res, 429, '这封验证码试错太多次了，重新发一封');
      if (!u || codeR !== 'ok') return fail(res, 400, '邮箱或验证码不对');

      const h = hashPassword(password);
      u.salt = h.salt;
      u.hash = h.hash;
      /* 密码换了，所有旧会话一并作废，谁也别想接着用 */
      db.sessions = db.sessions.filter((s) => s.uid !== u.id);
      save();
      return ok(res, { username: u.username });
    }

    /* ---- 当前用户 / 个人资料 ---- */
    if (p === '/api/me' && req.method === 'GET') {
      const u = userOf(req);
      if (!u) return ok(res, { user: null });
      const mine = db.puppets.filter((x) => x.uid === u.id);
      const last = mine.reduce((a, x) => Math.max(a, x.updated || 0), 0);
      return ok(res, {
        user: userView(u),
        count: mine.length,
        stats: {
          count: mine.length,
          shared: mine.filter((x) => x.share).length,
          last: last
        }
      });
    }

    /* ---- 改昵称 / 改个性签名 ---- */
    if (p === '/api/me' && req.method === 'PATCH') {
      const u = userOf(req);
      if (!u) return fail(res, 401, '请先登录');
      const b = await readBody(req);
      let changed = false;

      if (b.signature !== undefined) {
        if (typeof b.signature !== 'string') return fail(res, 400, '签名得是一句话');
        const sig = cleanSign(b.signature);
        if (sig !== (u.signature || '')) { u.signature = sig; changed = true; }
      }
      if (b.name !== undefined) {
        const name = cleanName(b.name);
        if (!name) return fail(res, 400, '昵称不能为空');
        if (name !== u.name) { u.name = name; changed = true; }
      }
      if (changed) save();
      return ok(res, { user: userView(u) });
    }

    /* ---- 改密码 ---- */
    if (p === '/api/me/password' && req.method === 'POST') {
      const u = userOf(req);
      if (!u) return fail(res, 401, '请先登录');
      if (!rateLimit(ip, 'pw' + u.id, 10, 900000)) return fail(res, 429, '改得太频繁，请稍后再试');
      const b = await readBody(req);
      const oldPw = typeof b.old === 'string' ? b.old : '';
      const nextPw = typeof b.next === 'string' ? b.next : '';
      if (!verifyPassword(oldPw, u.salt, u.hash)) return fail(res, 400, '原密码不对');
      if (nextPw.length < 6) return fail(res, 400, '新密码至少 6 位');
      if (nextPw.length > 64) return fail(res, 400, '新密码过长');
      if (nextPw === oldPw) return fail(res, 400, '新密码和原密码一样，换一个');
      const h = hashPassword(nextPw);
      u.salt = h.salt;
      u.hash = h.hash;
      /* 换过密码，别处登录的会话一并作废，当前这台留着 */
      const cur = sessionOf(req);
      db.sessions = db.sessions.filter(
        (s) => s.uid !== u.id || (cur && s.token === cur.token)
      );
      save();
      return ok(res, {});
    }

    /* ---- 影偶列表 ---- */
    if (p === '/api/puppets' && req.method === 'GET') {
      const u = userOf(req);
      if (!u) return fail(res, 401, '请先登录');
      const list = db.puppets
        .filter((x) => x.uid === u.id)
        .sort((a, b) => b.updated - a.updated)
        .map(puppetView);
      return ok(res, { puppets: list });
    }

    /* ---- 新建影偶 ---- */
    if (p === '/api/puppets' && req.method === 'POST') {
      const u = userOf(req);
      if (!u) return fail(res, 401, '请先登录');
      const mine = db.puppets.filter((x) => x.uid === u.id);
      if (mine.length >= MAX_PUPPETS) return fail(res, 400, '影箱已满（上限 ' + MAX_PUPPETS + ' 件）');

      const b = await readBody(req);
      const title = cleanTitle(b.title) || '未命名影偶';
      const config = cleanConfig(b.config);
      const now = Date.now();
      const rec = {
        id: db.seq.puppet++,
        uid: u.id,
        title: title,
        config: config,
        share: null,
        created: now,
        updated: now
      };
      db.puppets.push(rec);
      save();
      return ok(res, { puppet: puppetView(rec) });
    }

    /* ---- 单件操作 ---- */
    let m = p.match(/^\/api\/puppets\/(\d+)$/);
    if (m) {
      const u = userOf(req);
      if (!u) return fail(res, 401, '请先登录');
      const rec = db.puppets.find((x) => x.id === Number(m[1]) && x.uid === u.id);
      if (!rec) return fail(res, 404, '找不到这件影偶');

      if (req.method === 'PATCH') {
        const b = await readBody(req);
        if (b.title !== undefined) rec.title = cleanTitle(b.title) || rec.title;
        if (b.config !== undefined) rec.config = cleanConfig(b.config);
        rec.updated = Date.now();
        save();
        return ok(res, { puppet: puppetView(rec) });
      }
      if (req.method === 'DELETE') {
        db.puppets = db.puppets.filter((x) => x !== rec);
        save();
        return ok(res, {});
      }
    }

    /* ---- 分享开关 ---- */
    m = p.match(/^\/api\/puppets\/(\d+)\/share$/);
    if (m && req.method === 'POST') {
      const u = userOf(req);
      if (!u) return fail(res, 401, '请先登录');
      const rec = db.puppets.find((x) => x.id === Number(m[1]) && x.uid === u.id);
      if (!rec) return fail(res, 404, '找不到这件影偶');
      const b = await readBody(req);
      if (b.on) {
        if (!rec.share) rec.share = crypto.randomBytes(9).toString('base64url');
      } else {
        rec.share = null;
      }
      save();
      return ok(res, { share: rec.share });
    }

    /* ---- 公开查看 ---- */
    m = p.match(/^\/api\/p\/([A-Za-z0-9_-]{6,32})$/);
    if (m && req.method === 'GET') {
      const rec = db.puppets.find((x) => x.share && x.share === m[1]);
      if (!rec) return fail(res, 404, '链接已失效');
      const owner = db.users.find((u) => u.id === rec.uid);
      return ok(res, {
        puppet: {
          title: rec.title,
          config: rec.config,
          created: rec.created,
          by: owner ? owner.name : '佚名'
        }
      });
    }

    /* ================= 社区：吧 / 帖 / 楼 =================
       和上面那套 /api/forum 是两回事：这里按「吧 → 帖子 → 楼层」组织，
       存 db.circles。前端 community.js 一次把整棵数拉走，写操作再单条提交，
       这样渲染逻辑不用改，换掉的只是数据从哪来。 */

    function commPick(uidNow) {
      return db.circles.map((c) => ({
        id: c.id,
        name: c.name,
        seal: c.seal,
        zone: c.zone || '',
        desc: c.desc || '',
        owner: c.owner,
        ownerId: c.ownerId || null,
        at: c.at,
        posts: (c.posts || []).map((t) => ({
          id: t.id,
          title: t.title,
          cat: t.cat || '',
          tags: t.tags || [],
          author: t.author,
          authorId: t.authorId || null,
          at: t.at || ((t.floors && t.floors[0] && t.floors[0].at) || 0),
          floors: (t.floors || []).map((f) => ({
            u: f.u,
            uid: f.uid || null,
            at: f.at,
            like: (f.likedBy || []).length,
            liked: uidNow ? (f.likedBy || []).indexOf(uidNow) >= 0 : false,
            tx: f.tx || []
          }))
        }))
      }));
    }

    function commFindPost(tid) {
      for (let i = 0; i < db.circles.length; i++) {
        const ps = db.circles[i].posts || [];
        for (let j = 0; j < ps.length; j++) {
          if (ps[j].id === tid) return { c: db.circles[i], t: ps[j] };
        }
      }
      return null;
    }

    /* ---- 全量读取 ---- */
    if (p === '/api/comm' && req.method === 'GET') {
      const u = userOf(req);
      return ok(res, {
        circles: commPick(u ? u.id : null),
        me: u ? { id: u.id, name: u.name } : null
      });
    }

    /* ---- 开吧 ---- */
    if (p === '/api/comm/circles' && req.method === 'POST') {
      const u = userOf(req);
      if (!u) return fail(res, 401, '先登录再开吧');
      if (!rateLimit(ip, 'ccircle' + u.id, 8, 86400000)) return fail(res, 429, '今天开的吧够多了，明天再来');

      const b = await readBody(req);
      const name = cleanText(b.name, 14).replace(/吧$/, '');
      const desc = cleanText(b.desc, 40);
      const zone = String(b.zone || '').slice(0, 20);
      const seal = cleanText(b.seal, 1) || name.slice(0, 1);

      if (name.length < 2) return fail(res, 400, '吧名至少两个字');
      if (name.length > 12) return fail(res, 400, '吧名最多十二个字');
      if (db.circles.some((c) => c.name === name)) return fail(res, 409, '「' + name + '吧」已经有人开了');

      const c = {
        id: 'c' + Date.now().toString(36) + crypto.randomInt(100, 999),
        name: name,
        seal: seal.slice(0, 1),
        zone: zone,
        desc: desc,
        owner: u.name,
        ownerId: u.id,
        at: Date.now(),
        posts: []
      };
      db.circles.push(c);
      save();
      return ok(res, { id: c.id, name: c.name });
    }

    /* ---- 删吧：只有吧主 ---- */
    let cmA = p.match(/^\/api\/comm\/circles\/([A-Za-z0-9_-]+)$/);
    if (cmA && req.method === 'DELETE') {
      const u = userOf(req);
      if (!u) return fail(res, 401, '先登录');
      const c = db.circles.find((x) => x.id === cmA[1]);
      if (!c) return fail(res, 404, '这个吧已经不在了');
      if (c.ownerId !== u.id) return fail(res, 403, '只有吧主能删这个吧');
      db.circles = db.circles.filter((x) => x.id !== c.id);
      save();
      return ok(res, { id: c.id });
    }

    /* ---- 在吧里发帖 ---- */
    let cmB = p.match(/^\/api\/comm\/circles\/([A-Za-z0-9_-]+)\/posts$/);
    if (cmB && req.method === 'POST') {
      const u = userOf(req);
      if (!u) return fail(res, 401, '先登录再发帖');
      const c = db.circles.find((x) => x.id === cmB[1]);
      if (!c) return fail(res, 404, '这个吧已经不在了');
      if (!rateLimit(ip, 'cpost' + u.id, 30, 3600000)) return fail(res, 429, '发得有点快，歇一会儿再发');

      const b = await readBody(req);
      const title = cleanText(b.title, 46);
      const body = cleanText(b.body, 4000);
      if (title.length < 4) return fail(res, 400, '标题至少四个字');
      if (body.length < 10) return fail(res, 400, '正文太短，写具体一点');

      const tx = body.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
      const t = {
        id: 't' + Date.now().toString(36) + crypto.randomInt(100, 999),
        title: title,
        cat: String(b.cat || '').slice(0, 20) || 'craft',
        tags: cleanTags(b.tags),
        author: u.name,
        authorId: u.id,
        at: Date.now(),
        floors: [{ u: u.name, uid: u.id, at: Date.now(), likedBy: [], tx: tx }]
      };
      c.posts = c.posts || [];
      c.posts.push(t);
      save();
      return ok(res, { id: t.id, circleId: c.id });
    }

    /* ---- 删帖：作者本人或吧主 ---- */
    let cmC = p.match(/^\/api\/comm\/posts\/([A-Za-z0-9_-]+)$/);
    if (cmC && req.method === 'DELETE') {
      const u = userOf(req);
      if (!u) return fail(res, 401, '先登录');
      const hit = commFindPost(cmC[1]);
      if (!hit) return fail(res, 404, '这帖已经不在了');
      if (hit.t.authorId !== u.id && hit.c.ownerId !== u.id) {
        return fail(res, 403, '只有作者本人或吧主能删这帖');
      }
      hit.c.posts = hit.c.posts.filter((x) => x.id !== hit.t.id);
      save();
      return ok(res, { id: hit.t.id, circleId: hit.c.id });
    }

    /* ---- 回帖 ---- */
    let cmD = p.match(/^\/api\/comm\/posts\/([A-Za-z0-9_-]+)\/replies$/);
    if (cmD && req.method === 'POST') {
      const u = userOf(req);
      if (!u) return fail(res, 401, '先登录再回复');
      if (!rateLimit(ip, 'creply' + u.id, 60, 3600000)) return fail(res, 429, '回得有点快，歇一会儿');
      const hit = commFindPost(cmD[1]);
      if (!hit) return fail(res, 404, '这帖已经不在了');

      const b = await readBody(req);
      const body = cleanText(b.body, LEN_REPLY);
      if (body.length < 2) return fail(res, 400, '写两句再发');

      const tx = body.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
      hit.t.floors.push({ u: u.name, uid: u.id, at: Date.now(), likedBy: [], tx: tx });
      save();
      return ok(res, { floor: hit.t.floors.length - 1, total: hit.t.floors.length });
    }

    /* ---- 点赞：一楼一点，再点取消 ---- */
    let cmE = p.match(/^\/api\/comm\/posts\/([A-Za-z0-9_-]+)\/like$/);
    if (cmE && req.method === 'POST') {
      const u = userOf(req);
      if (!u) return fail(res, 401, '先登录再点赞');
      const hit = commFindPost(cmE[1]);
      if (!hit) return fail(res, 404, '这帖已经不在了');

      const b = await readBody(req);
      const i = parseInt(b.floor, 10);
      if (!(i >= 0 && i < hit.t.floors.length)) return fail(res, 400, '没有这一楼');

      const f = hit.t.floors[i];
      f.likedBy = f.likedBy || [];
      const at = f.likedBy.indexOf(u.id);
      if (at >= 0) f.likedBy.splice(at, 1);
      else f.likedBy.push(u.id);
      save();
      return ok(res, { floor: i, like: f.likedBy.length, liked: at < 0 });
    }

    /* ================= 论坛 ================= */

    /* ---- 概览 + 列表：统计、热门标签、分页帖子 ---- */
    if (p === '/api/forum' && req.method === 'GET') {
      const u = userOf(req);
      const tag = String(url.searchParams.get('tag') || '').trim().slice(0, 20);
      const sort = url.searchParams.get('sort') === 'hot' ? 'hot' : 'new';
      const page = Math.max(1, Math.min(999, parseInt(url.searchParams.get('page'), 10) || 1));

      let list = db.forum.posts.slice();
      if (tag) list = list.filter((x) => (x.tags || []).indexOf(tag) >= 0);
      list.sort(sort === 'hot'
        ? (a, b) => hotScore(b) - hotScore(a)
        : (a, b) => b.created - a.created);

      const total = list.length;
      const pages = Math.max(1, Math.ceil(total / MAX_PAGE));
      const slice = list.slice((page - 1) * MAX_PAGE, page * MAX_PAGE);
      return ok(res, {
        stats: forumStats(),
        tags: forumTags(),
        posts: slice.map(postBrief),
        total: total,
        page: page,
        pages: pages,
        sort: sort,
        tag: tag
      });
    }

    /* ---- 发帖 ---- */
    if (p === '/api/forum/posts' && req.method === 'POST') {
      const u = userOf(req);
      if (!u) return fail(res, 401, '请先登录再发帖');
      if (!rateLimit(ip, 'fpost' + u.id, 20, 3600000)) return fail(res, 429, '发得有点快，歇一会儿再发');
      if (db.forum.posts.filter((x) => x.uid === u.id).length >= MAX_POSTS) {
        return fail(res, 400, '你在论坛的帖子已经有 ' + MAX_POSTS + ' 条了');
      }

      const b = await readBody(req);
      const title = cleanText(b.title, LEN_TITLE);
      const body = cleanText(b.body, LEN_BODY);
      const tags = cleanTags(b.tags);
      if (title.length < 4) return fail(res, 400, '标题至少写 4 个字');
      if (body.length < 6) return fail(res, 400, '正文太短了，写两句再发');
      if (!tags.length) return fail(res, 400, '至少挑一个标签，别人才好找');

      /* 附一枚自己影箱里的影偶；只认自己的，配置按同一套规则清洗 */
      let puppet = null;
      if (b.puppetId) {
        const src = db.puppets.find((x) => x.id === Number(b.puppetId) && x.uid === u.id);
        if (!src) return fail(res, 400, '这件影偶不在你的影箱里');
        puppet = { title: src.title, config: cleanConfig(src.config) };
      }

      const now = Date.now();
      const rec = {
        id: db.seq.post++,
        uid: u.id,
        by: u.name,
        title: title,
        body: body,
        tags: tags,
        puppet: puppet,
        likes: [],
        likes0: 0,
        replies: [],
        created: now,
        updated: now
      };
      db.forum.posts.push(rec);
      save();
      return ok(res, { post: postFull(rec, u.id) });
    }

    /* ---- 单帖 ---- */
    let fm = p.match(/^\/api\/forum\/posts\/(\d+)$/);
    if (fm && req.method === 'GET') {
      const rec = db.forum.posts.find((x) => x.id === Number(fm[1]));
      if (!rec) return fail(res, 404, '这个帖子不见了，可能被作者删了');
      const u = userOf(req);
      const uid = u ? u.id : 0;
      return ok(res, {
        post: postFull(rec, uid),
        replies: (rec.replies || []).map((r) => ({
          id: r.id,
          by: r.by,
          body: r.body,
          created: r.created,
          mine: !!(uid && r.uid === uid)
        }))
      });
    }
    if (fm && req.method === 'DELETE') {
      const u = userOf(req);
      if (!u) return fail(res, 401, '请先登录');
      const rec = db.forum.posts.find((x) => x.id === Number(fm[1]));
      if (!rec) return fail(res, 404, '这个帖子不见了');
      if (rec.uid !== u.id) return fail(res, 403, '只能删自己发的帖子');
      db.forum.posts = db.forum.posts.filter((x) => x !== rec);
      save();
      return ok(res, {});
    }

    /* ---- 回复 ---- */
    fm = p.match(/^\/api\/forum\/posts\/(\d+)\/replies$/);
    if (fm && req.method === 'POST') {
      const u = userOf(req);
      if (!u) return fail(res, 401, '请先登录再回复');
      if (!rateLimit(ip, 'freply' + u.id, 80, 3600000)) return fail(res, 429, '回得有点快，歇一会儿');
      const rec = db.forum.posts.find((x) => x.id === Number(fm[1]));
      if (!rec) return fail(res, 404, '这个帖子不见了');
      const b = await readBody(req);
      const body = cleanText(b.body, LEN_REPLY);
      if (body.length < 2) return fail(res, 400, '回复太短了');
      const now = Date.now();
      const r = { id: db.seq.reply++, uid: u.id, by: u.name, body: body, created: now };
      rec.replies.push(r);
      rec.updated = now;
      save();
      return ok(res, {
        reply: { id: r.id, by: r.by, body: r.body, created: r.created, mine: true },
        count: rec.replies.length
      });
    }

    /* ---- 点赞（再点一次取消） ---- */
    fm = p.match(/^\/api\/forum\/posts\/(\d+)\/like$/);
    if (fm && req.method === 'POST') {
      const u = userOf(req);
      if (!u) return fail(res, 401, '登录后才能点赞');
      if (!rateLimit(ip, 'flike' + u.id, 200, 3600000)) return fail(res, 429, '点得太快了');
      const rec = db.forum.posts.find((x) => x.id === Number(fm[1]));
      if (!rec) return fail(res, 404, '这个帖子不见了');
      rec.likes = rec.likes || [];
      const i = rec.likes.indexOf(u.id);
      if (i >= 0) rec.likes.splice(i, 1);
      else rec.likes.push(u.id);
      save();
      return ok(res, {
        likes: rec.likes.length + (rec.likes0 || 0),
        liked: i < 0
      });
    }

    /* ---- 删自己的回复 ---- */
    fm = p.match(/^\/api\/forum\/replies\/(\d+)$/);
    if (fm && req.method === 'DELETE') {
      const u = userOf(req);
      if (!u) return fail(res, 401, '请先登录');
      const rid = Number(fm[1]);
      let hit = null;
      db.forum.posts.forEach((post) => {
        const i = (post.replies || []).findIndex((r) => r.id === rid && r.uid === u.id);
        if (i >= 0) hit = { post: post, i: i };
      });
      if (!hit) return fail(res, 404, '找不到这条回复');
      hit.post.replies.splice(hit.i, 1);
      save();
      return ok(res, { count: hit.post.replies.length });
    }

    /* ---- 皮影助手（接 DeepSeek，后端代理） ---- */
    if (p === '/api/assistant' && req.method === 'POST') {
      const cfg = llmConfig();
      if (!cfg) return fail(res, 503, '大模型服务还没配好，暂时答不了');
      if (!rateLimit(ip, 'asst', 20, 60000)) return fail(res, 429, '问得太快了，歇一下再问');

      const b = await readBody(req);
      const msg = typeof b.message === 'string' ? b.message.trim().slice(0, 500) : '';
      if (!msg) return fail(res, 400, '说点什么吧');

      /* 最近多轮上下文：只留 user/assistant，限条数与长度，防越权与撑爆上下文 */
      const hist = (Array.isArray(b.history) ? b.history : [])
        .slice(-10)
        .filter((h) => h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string')
        .map((h) => ({ role: h.role, content: h.content.slice(0, 1000) }));

      const messages = [{ role: 'system', content: ASST_SYSTEM }]
        .concat(hist)
        .concat([{ role: 'user', content: msg }]);

      if (cfg.mode === 'mock') {
        return ok(res, { reply: '（本地联调模式）接口已通：你问的是「' + msg + '」。填入 DeepSeek API Key 后，这里就是真的大模型回答。' });
      }

      try {
        const reply = await llmChat(cfg, messages);
        return ok(res, { reply });
      } catch (e) {
        console.error('[assistant]', e.message);
        return fail(res, 502, '大模型没回上话，稍后再试');
      }
    }


    /* ---- 影偶 AI 绘画（智谱 CogView，免费档） ---- */
    /* ------------------------------------------------------------------
       AI 点戏：一句话 → 从部件库里挑一套零件
       模型只做「选件」，不画图。所以永远不会有切歪、水印、审核这些事，
       选的 id 还要过一遍白名单，模型胡写的值一律退回默认。
       ------------------------------------------------------------------ */
    if (p === '/api/studio/cast' && req.method === 'POST') {
      if (!rateLimit(ip, 'cast', 20, 60000)) return fail(res, 429, '派戏派得有点急，歇一下');
      const b = await readBody(req);
      const want = typeof b.prompt === 'string' ? b.prompt.trim().slice(0, 120) : '';
      if (!want) return fail(res, 400, '说说想要什么样的影人');

      const zc = llmConfig();
      if (!zc) return ok(res, { ok: false, by: 'none', reason: '大模型没配，先用关键词认' });
      if (zc.mode === 'mock') {
        return ok(res, { ok: true, by: 'mock', lit: { head: 'kui', body: 'armor' }, why: '联调占位' });
      }

      const sys = CAST_SYSTEM;
      let raw = '';
      try {
        const r = await llmChat(zc, [
          { role: 'system', content: sys },
          { role: 'user', content: want }
        ]);
        raw = typeof r === 'string' ? r : String((r && r.content) || '');
      } catch (e) {
        console.error('[cast]', e.message);
        return ok(res, { ok: false, by: 'error', reason: '派戏台一时没应声' });
      }

      const look = castParse(raw);
      if (!look) return ok(res, { ok: false, by: 'parse', reason: '这一句没听明白' });
      return ok(res, { ok: true, by: 'ai', lit: look.pick, why: look.why });
    }

    /* ---- 皮影资料库：页面上的分类就是这里的条目 ---- */
    if (p === '/api/studio/catalog' && req.method === 'GET') {
      const schools = Object.keys(LIT_SCHOOLS).map(function (k) {
        const v = LIT_SCHOOLS[k];
        return { k: k, n: v.n, area: v.area, mat: v.mat, craft: v.craft, color: v.color, note: v.note };
      });
      const roles = Object.keys(LIT_ROLES).map(function (k) {
        const v = LIT_ROLES[k];
        return { k: k, n: v.n, d: v.d, subs: Object.keys(v.subs).map(function (j) {
          return { k: j, n: v.subs[j].n, d: v.subs[j].d };
        }) };
      });
      const poses = Object.keys(LIT_POSES).map(function (k) {
        return { k: k, n: LIT_POSES[k].n, d: LIT_POSES[k].d };
      });
      return ok(res, { base: LIT_BASE, schools: schools, roles: roles, poses: poses });
    }

    /* ---- 生一张：检索 → 落形 → 出图 ---- */
    if (p === '/api/studio/gen' && req.method === 'POST') {
      const zc = zgConfig();
      if (!zc) return fail(res, 503, '绘画还没配好，暂时画不了');
      if (!rateLimit(ip, 'gen', 5, 60000)) return fail(res, 429, '画得有点快，歇一口气再画');

      const b = await readBody(req);
      const want = typeof b.prompt === 'string' ? b.prompt.trim().slice(0, 200) : '';
      const rigMode = b.rig === true || b.rig === 1 || b.rig === '1';
      const pick = litPick(b);

      /* 第一步：把那句话交给画样师傅，扩成一段看得见的描述；不成也用原话，不挡出图 */
      let desc = want;
      if (want) {
        const lc = llmConfig();
        if (lc && lc.mode !== 'mock') {
          try {
            const r = await Promise.race([
              llmChat(lc, [
                { role: 'system', content: LIT_EXPAND + (rigMode ? LIT_EXPAND_RIG : '') },
                { role: 'user', content: '流派：' + pick.S.n + '；行当：' + pick.R.n + '·' + pick.T.n +
                    '；姿态：' + pick.P.n + '；用户说：' + want }
              ]),
              litTimeout(7000)
            ]);
            const t = String(typeof r === 'string' ? r : ((r && r.content) || ''))
              .replace(/[\r\n]+/g, ' ').replace(/^[「"'']+|[」"'']+$/g, '').trim().slice(0, 120);
            if (t.length >= 8) desc = t;
          } catch (e) {
            console.error('[gen] 扩写跳过:', e.message);
          }
        }
      } else {
        desc = pick.R.n + '行' + pick.T.n + '，' + pick.T.d;
      }

      console.log('[gen] ' + pick.S.n + ' ' + pick.R.n + '·' + pick.T.n + ' → ' + desc.slice(0, 40));

      /* 第二步：底层规格 + 检索结果 + 这一只的描述 */
      const full = litSpec(b, desc, rigMode);
      if (zc.mode === 'mock') return ok(res, { ok: true, url: '', mock: true, prompt: full, desc: desc });

      try {
        const got = await litDraw(zc, full);
        const saved = await grabImage(got.remote, UP_DIR, 'gen');
        return ok(res, {
          ok: true,
          url: saved ? '/uploads/ai/' + saved : got.remote,
          model: got.model,
          wm: got.wm,
          desc: desc,
          prompt: full,
          warn: got.wm ? '当前账户只剩免费档，画面右下角会带一枚「AI 生成」水印；充值后自动换到无水印的高清档' : ''
        });
      } catch (e) {
        const em = String(e.message || '');
        console.error('[gen]', em);
        let tip = '这张没画成，再试一次';
        if (/敏感|不安全|审核/.test(em)) tip = '这段描述被内容审核拦了，换个说法（少提兵器、血腥）';
        else if (/超时/.test(em)) tip = '画得久了点，没出结果，再来一次';
        else if (/余额|资源包|1113/.test(em)) tip = '绘画账户余额不足，充值后才能继续画';
        return fail(res, 502, tip);
      }
    }

    if (p === '/api/studio/paint' && req.method === 'POST') {
      const zc = zgConfig();
      if (!zc) return fail(res, 503, 'AI 绘画还没配好，暂时画不了');
      if (!rateLimit(ip, 'paint', 6, 60000)) return fail(res, 429, '画得有点快，歇一下再画');

      const b = await readBody(req);
      let want = typeof b.prompt === 'string' ? b.prompt.trim().slice(0, 300) : '';
      if (!want) return fail(res, 400, '说说想画什么样的影偶');
      /* 智谱审核对"双腿分开"这类姿势词敏感，温和换掉，不动用户本意 */
      want = want
        .replace(/[两双]腿?\s*分开/g, '双足分立')
        .replace(/[两双]腿?\s*张开/g, '双足分立')
        .replace(/张开[两双]腿?/g, '双足分立')
        .replace(/劈叉/g, '双足分立');

      /* 底层规格 + 用户的一句描述，规格永远是主语，用户描述只是"这一只画成什么样" */
      const full = puppetSpec(zc) + '这一只画的是：' + want + '。';

      if (zc.mode === 'mock') return ok(res, { url: '', mock: true, prompt: full });

      try {
        const remote = await zgPaint(zc, full);
        const saved = await grabImage(remote, UP_DIR, 'paint');
        return ok(res, { url: saved ? '/uploads/ai/' + saved : remote, remote: remote });
      } catch (e) {
        console.error('[paint]', e.message);
        const em = String(e.message || '');
        let tip = '这张没画成，稍后再试';
        if (/敏感|不安全|安全/.test(em)) tip = '这个描述被内容审核拦了，换个说法试试（少提兵器打斗）';
        else if (/超时/.test(em)) tip = '画得太久没出结果，再试一次';
        else if (/429|频繁|限额/.test(em)) tip = '画得有点频繁，歇一会儿再试';
        return fail(res, 502, tip);
      }
    }

    return fail(res, 404, 'not found');
  } catch (e) {
    if (e.message === 'bad json') return fail(res, 400, '请求格式不对');
    if (e.message === 'body too large') return fail(res, 413, '内容过大');
    console.error('[err]', req.method, p, e);
    return fail(res, 500, '服务器开小差了');
  }
});

load();
purgeSessions();
seedForum();
server.listen(PORT, '127.0.0.1', () => {
  console.log('影箱服务已启动 http://127.0.0.1:' + PORT);
});
