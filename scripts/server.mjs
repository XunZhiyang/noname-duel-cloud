/**
 * Read-only HTTP gateway for the unmodified upstream noname app and lobby.
 * Gameplay, room messages, file response formats, and the UI remain upstream.
 */
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { access, realpath } from 'node:fs/promises';
import { once } from 'node:events';
import { fileURLToPath, pathToFileURL } from 'node:url';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readRoutes = new Map([
  ['/checkFile', 'fileName'], ['/checkDir', 'dir'], ['/readFile', 'fileName'],
  ['/readFileAsText', 'fileName'], ['/getFileList', 'dir'],
]);
const writeRoutes = new Set(['/writeFile', '/removeFile', '/removeDir', '/createDir']);
const hopHeaders = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade']);

class RequestError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function sendError(response, status, message) {
  if (response.headersSent) return response.destroy();
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(JSON.stringify({ success: false, code: status, errorMsg: message }));
}

function relativeResource(value, { root = false } = {}) {
  if (typeof value !== 'string' || value.includes('\0') || value.includes('\\') || value.includes('%') || /^[a-z]:/i.test(value)) throw new RequestError(403, 'Resource path is not allowed');
  if (value.startsWith('/')) throw new RequestError(403, 'Resource path must be relative');
  if (root && (value === '' || value === '.')) return '';
  const segments = value.split('/');
  if (segments.some((part, index) => part === '..' || part === '.' || (part.startsWith('.') && !(part === '.pnpm' && segments[index - 1] === 'node_modules')))) throw new RequestError(403, 'Resource path is not allowed');
  if (!value && !root) throw new RequestError(400, 'A resource path is required');
  return value;
}

function inside(root, candidate) { return candidate === root || candidate.startsWith(root + path.sep); }

/** Resolve existing ancestors too, so a missing child of an outside symlink is denied. */
async function assertInsideDistribution(root, relative) {
  let candidate = path.resolve(root, relative);
  if (!inside(root, candidate)) throw new RequestError(403, 'Resource is outside the game distribution');
  while (true) {
    try {
      if (!inside(root, await realpath(candidate))) throw new RequestError(403, 'Resource is outside the game distribution');
      return;
    } catch (error) {
      if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error;
      if (candidate === root) throw error;
      candidate = path.dirname(candidate);
    }
  }
}

async function authorizeRequest(request, root) {
  if (!['GET', 'HEAD'].includes(request.method)) throw new RequestError(405, 'This deployment is read-only');
  const rawPath = String(request.url || '').split('?')[0];
  if (!rawPath.startsWith('/') || rawPath.startsWith('//')) throw new RequestError(400, 'Invalid request target');
  let pathname;
  try { pathname = decodeURIComponent(rawPath); } catch { throw new RequestError(400, 'Invalid URL encoding'); }
  const relative = relativeResource(pathname.slice(1), { root: true });
  if (writeRoutes.has(pathname.replace(/\/+$/, ''))) throw new RequestError(403, 'This deployment is read-only');
  const parameter = readRoutes.get(pathname);
  if (parameter) {
    const url = new URL(request.url, 'http://localhost');
    if ([...url.searchParams.keys()].some(key => key !== parameter) || url.searchParams.getAll(parameter).length !== 1) throw new RequestError(400, 'Invalid file query');
    const resource = relativeResource(url.searchParams.get(parameter), { root: parameter === 'dir' });
    await assertInsideDistribution(root, resource);
  } else {
    await assertInsideDistribution(root, relative);
  }
  return { pathname, isReadApi: Boolean(parameter) };
}

async function reservePort() {
  const probe = net.createServer();
  probe.listen({ host: '127.0.0.1', port: 0 });
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  return port;
}

function portNumber(value, name) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`${name} must be an integer from 0 to 65535`);
  return port;
}

/** Start the built upstream distribution. Only this HTTP gateway is public. */
export async function startHosting(options = {}) {
  const upstream = path.resolve(options.upstreamDir || path.join(workspace, 'noname'));
  const root = await realpath(options.gameDir || path.join(upstream, 'dist'));
  await access(path.join(root, 'index.html'));
  const port = portNumber(options.port ?? process.env.PORT ?? 8080, 'PORT');
  const host = options.host ?? process.env.HOST ?? '127.0.0.1';
  let createFsApp, createLobby;
  try {
    ({ default: createFsApp } = await import(pathToFileURL(path.join(upstream, 'packages/fs/dist/index.js'))));
    ({ createServer: createLobby } = await import(pathToFileURL(path.join(upstream, 'packages/server/dist/index.js'))));
  } catch (error) {
    throw new Error('Build the upstream file and lobby packages before starting the game.', { cause: error });
  }

  let fsApp, lobby, gateway;
  const sockets = new Set();
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    const gatewayClosed = gateway?.listening ? new Promise(resolve => gateway.close(resolve)) : Promise.resolve();
    for (const socket of sockets) socket.destroy();
    await Promise.allSettled([gatewayClosed, lobby?.stop(), fsApp?.close()]);
  };

  try {
    // The original Fastify app defaults to localhost and chooses its own free port.
    fsApp = createFsApp({ dirname: root, port: 0, server: true });
    if (!fsApp.server.listening) await once(fsApp.server, 'listening');
    const fsAddress = fsApp.server.address();
    if (!fsAddress || typeof fsAddress === 'string') throw new Error('The upstream file server did not open a TCP listener');

    // Upstream exposes only a port option, so reserve a local port and retry collisions.
    // Its lobby protocol is forwarded without reinterpretation or replacement.
    let lobbyPort;
    for (let attempt = 0; attempt < 4; attempt++) {
      lobbyPort = portNumber(options.lobbyPort ?? process.env.NONAME_LOBBY_PORT ?? await reservePort(), 'NONAME_LOBBY_PORT');
      if (lobbyPort === 0) lobbyPort = await reservePort();
      lobby = createLobby({ port: lobbyPort });
      try { await lobby.start(); break; }
      catch (error) {
        if (error.code !== 'EADDRINUSE' || options.lobbyPort || process.env.NONAME_LOBBY_PORT || attempt === 3) throw error;
      }
    }

    gateway = http.createServer(async (request, response) => {
      try {
        const { pathname, isReadApi } = await authorizeRequest(request, root);
        if (pathname === '/healthz') {
          response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          response.end(JSON.stringify({ ok: true, service: 'noname' }));
          return;
        }
        const headers = Object.fromEntries(Object.entries(request.headers).filter(([name]) => !hopHeaders.has(name)));
        headers.host = `localhost:${fsAddress.port}`;
        const outgoing = http.request({ hostname: fsAddress.address, port: fsAddress.port, path: request.url, method: request.method, headers }, upstreamResponse => {
          const outgoingHeaders = Object.fromEntries(Object.entries(upstreamResponse.headers).filter(([name]) => !hopHeaders.has(name) && !name.startsWith('access-control-')));
          outgoingHeaders['x-content-type-options'] = 'nosniff';
          outgoingHeaders['referrer-policy'] = 'no-referrer';
          if (isReadApi) outgoingHeaders['cache-control'] = 'no-store';
          response.writeHead(upstreamResponse.statusCode || 502, outgoingHeaders);
          upstreamResponse.pipe(response);
          upstreamResponse.on('error', () => response.destroy());
        });
        outgoing.on('error', () => sendError(response, 502, 'The game service is unavailable'));
        request.on('aborted', () => outgoing.destroy());
        response.on('close', () => { if (!response.writableFinished) outgoing.destroy(); });
        request.pipe(outgoing);
      } catch (error) {
        sendError(response, error.status || 500, error.status ? error.message : 'Unable to read this game resource');
      }
    });

    gateway.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
    gateway.on('upgrade', (request, socket, head) => {
      const pathname = String(request.url || '').split('?')[0];
      if (request.method !== 'GET' || request.headers.upgrade?.toLowerCase() !== 'websocket' || !['/', '/ws'].includes(pathname)) {
        socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
        return;
      }
      const upstreamSocket = net.connect({ host: '127.0.0.1', port: lobbyPort }, () => {
        const headers = { ...request.headers, host: `127.0.0.1:${lobbyPort}` };
        upstreamSocket.write(`GET ${request.url} HTTP/1.1\r\n${Object.entries(headers).map(([key, value]) => `${key}: ${value}`).join('\r\n')}\r\n\r\n`);
        if (head.length) upstreamSocket.write(head);
        upstreamSocket.pipe(socket);
        socket.pipe(upstreamSocket);
      });
      upstreamSocket.on('error', () => socket.destroy());
      socket.on('error', () => upstreamSocket.destroy());
      socket.once('close', () => upstreamSocket.destroy());
      upstreamSocket.once('close', () => socket.destroy());
    });
    gateway.on('clientError', (_error, socket) => socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'));
    gateway.listen({ host, port });
    await once(gateway, 'listening');
    const address = gateway.address();
    const displayHost = ['0.0.0.0', '::'].includes(host) ? '127.0.0.1' : host.includes(':') ? `[${host}]` : host;
    return { server: gateway, port: address.port, url: `http://${displayHost}:${address.port}`, lobbyPort, close };
  } catch (error) {
    await close();
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const hosting = await startHosting();
    console.log(`无名杀原版已启动：${hosting.url}`);
    console.log('联机地址与网页地址相同；公开 HTTPS 网址请使用 wss://。');
    const shutdown = async () => { await hosting.close(); process.exit(0); };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
