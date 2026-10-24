import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('dist/web/browser');
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm+xml',
  '.jpg': 'image/jpeg',
  '.ktx2': 'image/ktx2',
  '.woff2': 'font/woff2',
};
http
  .createServer(async (req, res) => {
    try {
      const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const target = path.resolve(root, '.' + name);
      if (target !== root && !target.startsWith(root + path.sep)) {
        res.writeHead(403);
        res.end();
        return;
      }
      let file = target;
      try {
        if (!(await fs.stat(file)).isFile()) file = path.join(root, 'index.html');
      } catch {
        file = path.join(root, 'index.html');
      }
      res.setHeader('Content-Type', types[path.extname(file)] ?? 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-store');
      res.end(await fs.readFile(file));
    } catch {
      res.writeHead(500);
      res.end('Preview unavailable');
    }
  })
  .listen(4200, '127.0.0.1', () => console.log('Preview: http://localhost:4200'));
