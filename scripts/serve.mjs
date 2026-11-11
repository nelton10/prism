import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { handleAiRequest } from '../lib/ai-handler.mjs';

const root = new URL('../public/', import.meta.url);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.data': 'application/octet-stream'
};

try {
  await stat(new URL('index.html', root));
} catch {
  console.error('Execute npm run build antes de iniciar o servidor.');
  process.exit(1);
}

createServer(async (request, response) => {
  if (new URL(request.url, 'http://localhost').pathname === '/api/chat') {
    await handleAiRequest(request, response);
    return;
  }
  try {
    const path = decodeURIComponent(request.url.split('?')[0]);
    const parts = path.split('/').slice(1);
    if (parts.some(part => part === '..' || part.includes('\\') || part.includes(':'))) {
      response.writeHead(404).end();
      return;
    }
    const relative = path === '/' ? 'index.html' : parts.map(encodeURIComponent).join('/');
    const file = new URL(relative, root);
    if (!file.href.startsWith(root.href)) {
      response.writeHead(404).end();
      return;
    }
    const info = await stat(file);
    if (!info.isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      'Content-Type': types[extname(file.pathname)] || 'application/octet-stream',
      'Content-Length': info.size
    });
    createReadStream(file).on('error', () => response.destroy()).pipe(response);
  } catch {
    response.writeHead(404).end();
  }
}).listen(4179, '127.0.0.1', () => console.log('Ateliê TeX em http://127.0.0.1:4179/'));
