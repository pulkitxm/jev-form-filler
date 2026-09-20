import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const files = new Map([['/', ['playground/index.html', 'text/html']], ['/app.js', ['playground/app.js', 'text/javascript']], ['/style.css', ['playground/style.css', 'text/css']], ['/icon.png', ['extension/icons/icon-32.png', 'image/png']]]);
const port = Number(process.env.PORT || 4178);
createServer(async (request, response) => {
  const file = files.get(new URL(request.url, 'http://localhost').pathname);
  if (request.method !== 'GET' || !file) { response.writeHead(404); response.end('Not found'); return; }
  try {
    const content = await readFile(new URL(`../${file[0]}`, import.meta.url));
    response.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-store' });
    response.end(content);
  } catch { response.writeHead(500); response.end('Unable to load playground'); }
}).listen(port, '127.0.0.1', () => console.log(`Form Studio: http://127.0.0.1:${port}`));
