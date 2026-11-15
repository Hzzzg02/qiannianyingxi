/* ==========================================================================
   本地开发服：一个端口把静态站和 /api 一起端出来
   --------------------------------------------------------------------------
   线上是 nginx 直出静态、/api/ 反代到 127.0.0.1:3100；
   本地没有 nginx，就用这个文件扮演 nginx 那一层，行为对齐：

     · /api/*   → 转发到 127.0.0.1:3100（server.js）
     · 其他     → 从项目根读文件
     · 支持 Range：首页那几段 m4a/mp3 要能拖动进度条
     · html/css/js 不缓存，图片音视频给一天

   用法：node server/dev.js   （先另起 node server/server.js）
   ========================================================================== */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.DEV_PORT || 8092);
const API = { host: '127.0.0.1', port: Number(process.env.API_PORT || 3100) };

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.mp4': 'video/mp4',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8'
};

function proxy(req, res) {
  const opt = {
    host: API.host,
    port: API.port,
    method: req.method,
    path: req.url,
    headers: Object.assign({}, req.headers, { host: API.host + ':' + API.port })
  };
  const up = http.request(opt, (ur) => {
    res.writeHead(ur.statusCode, ur.headers);
    ur.pipe(res);
  });
  up.on('error', (e) => {
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: '后端没起来：' + e.message }));
  });
  // 智谱那边一笔要等十几秒，别让本地这一层先断了
  up.setTimeout(180000, () => up.destroy(new Error('上游超时')));
  req.pipe(up);
}

function send404(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404');
}

function serve(req, res) {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
  catch (e) { return send404(res); }

  if (pathname === '/') pathname = '/index.html';
  const file = path.join(ROOT, pathname);

  // 不许跳出项目根
  if (!file.startsWith(ROOT)) return send404(res);

  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send404(res);

    const ext = path.extname(file).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const headers = {
      'Content-Type': type,
      'Accept-Ranges': 'bytes',
      'Last-Modified': st.mtime.toUTCString(),
      'Cache-Control': 'no-cache'   // 本地开发一律不缓存：改图改样式立刻生效
    };

    // Range：音频拖动进度条靠这个，缺了它浏览器只能从头播
    const range = req.headers.range;
    if (range && /^bytes=/.test(range)) {
      const parts = range.replace(/bytes=/, '').split('-');
      let start = parts[0] ? parseInt(parts[0], 10) : 0;
      let end = parts[1] ? parseInt(parts[1], 10) : st.size - 1;
      if (isNaN(start) || isNaN(end) || start > end || start >= st.size) {
        res.writeHead(416, { 'Content-Range': 'bytes */' + st.size });
        return res.end();
      }
      end = Math.min(end, st.size - 1);
      headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + st.size;
      headers['Content-Length'] = end - start + 1;
      res.writeHead(206, headers);
      if (req.method === 'HEAD') return res.end();
      return fs.createReadStream(file, { start, end }).pipe(res);
    }

    headers['Content-Length'] = st.size;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) return proxy(req, res);
  if (req.method !== 'GET' && req.method !== 'HEAD') return send404(res);
  serve(req, res);
}).listen(PORT, '127.0.0.1', () => {
  console.log('本地预览 http://127.0.0.1:' + PORT + '（/api 转发到 ' + API.host + ':' + API.port + '）');
});
