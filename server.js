const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const BASE = __dirname;
const MIME = {
  '.html':'text/html; charset=utf-8', '.css':'text/css', '.js':'application/javascript',
  '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg',
  '.gif':'image/gif', '.svg':'image/svg+xml', '.ico':'image/x-icon', '.webp':'image/webp',
  '.mp4':'video/mp4', '.woff2':'font/woff2', '.txt':'text/plain; charset=utf-8'
};

function sendFile(res, fpath, code=200) {
  const ext = path.extname(fpath).toLowerCase();
  const ct = MIME[ext] || 'application/octet-stream';
  try {
    const data = fs.readFileSync(fpath);
    res.writeHead(code, { 'Content-Type': ct, 'Access-Control-Allow-Origin': '*' });
    res.end(data);
  } catch { send404(res); }
}

function send404(res) { res.writeHead(404); res.end('Not found'); }
function sendJSON(res, data) {
  res.writeHead(200, { 'Content-Type':'application/json', 'Access-Control-Allow-Origin':'*' });
  res.end(JSON.stringify(data));
}

function listDir(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath)
    .filter(f => /\.(png|jpg|jpeg)$/i.test(f))
    .map(f => {
      const s = fs.statSync(path.join(dirPath, f));
      return { name: f, size_kb: +(s.size/1024).toFixed(1), mtime: s.mtime.toISOString() };
    })
    .sort((a,b) => b.name.localeCompare(a.name));
}

const server = http.createServer((req, res) => {
  const uri = url.parse(req.url).pathname;

  // ── API routes ──
  if (uri === '/api/captures') {
    return sendJSON(res, { captures: listDir(path.join(BASE,'captures')), count: 0 });
  }
  if (uri === '/api/screenshots') {
    return sendJSON(res, { screenshots: listDir(path.join(BASE,'Screenshot')), count: 0 });
  }

  // ── Upload handler ──
  if (uri === '/api/upload' && req.method === 'POST') {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks);
      // Parse multipart to extract filename + data
      const boundary = req.headers['content-type']?.split('boundary=')[1];
      if (!boundary) return sendJSON(res, { error: 'no boundary' }, 400);
      const parts = raw.toString('binary').split('--' + boundary);
      let fileData = null, fileName = 'image.png';
      for (const p of parts) {
        const hdrEnd = p.indexOf('\r\n\r\n');
        if (hdrEnd === -1) continue;
        const hdrs = p.slice(0, hdrEnd);
        const body = p.slice(hdrEnd + 4);
        const nameMatch = hdrs.match(/filename="(.+?)"/);
        if (nameMatch) { fileName = nameMatch[1]; fileData = body; break; }
      }
      if (!fileData) return sendJSON(res, { error: 'no file in upload' }, 400);
      const ext = path.extname(fileName) || '.png';
      const safeName = Date.now() + ext;
      const dest = path.join(BASE, 'uploads', safeName);
      fs.writeFileSync(dest, fileData, 'binary');
      sendJSON(res, { status:'ok', path:'/uploads/'+safeName, name: safeName });
    });
    return;
  }

  // ── Static files ──
  let filePath = uri === '/' ? path.join(BASE, 'annotation_tool.html')
    : path.join(BASE, uri.startsWith('/') ? uri.slice(1) : uri);

  // Security: prevent path traversal
  if (!filePath.startsWith(BASE)) return send404(res);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile())
    return sendFile(res, filePath);

  // Try index.html in directories
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    const idx = path.join(filePath, 'index.html');
    if (fs.existsSync(idx)) return sendFile(res, idx);
  }

  send404(res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Annotation Tool → http://0.0.0.0:${PORT}`);
});
