#!/usr/bin/env node
/**
 * Postinga — servidor local sin dependencias.
 *
 * Sirve la aplicación y expone un lector de URLs (/api/fetch) que evita
 * los bloqueos de CORS y permite extraer metadatos con un User-Agent real.
 *
 * Uso:
 *   node server.js            → http://127.0.0.1:4173
 *   node server.js --open     → abre el navegador
 *   PORT=8080 node server.js  → otro puerto
 */

'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const dns = require('node:dns').promises;
const net = require('node:net');
const { execFile } = require('node:child_process');

const ROOT = __dirname;
const VERSION = '2.0.0';
const START_PORT = Number(process.env.PORT) || 4173;
const HOST = process.env.HOST || '127.0.0.1';
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT = 22000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8'
};

const ALLOWED_TYPES = /^(?:text\/html|application\/xhtml\+xml|text\/plain|text\/markdown|application\/xml|text\/xml|application\/json)/i;

const CORS_BASE = {
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept'
};

/* Cada respuesta conoce su request, para decidir el CORS sin cambiar las firmas. */
const REQUEST_OF = new WeakMap();

function isLocalOrigin(origin, req) {
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.replace(/^\[|\]$/g, '');
    const esLocal = host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1';
    if (!esLocal) return false;
    // Tiene que ser el mismo host y puerto que atiende este servidor.
    const hostHeader = req && req.headers ? String(req.headers.host || '') : '';
    if (hostHeader && parsed.host !== hostHeader) return false;
    return true;
  } catch (error) {
    return false;
  }
}

/* Solo se refleja el origen si es local: nada de "Access-Control-Allow-Origin: *". */
function corsHeaders(res) {
  const headers = { ...CORS_BASE };
  const req = res ? REQUEST_OF.get(res) : null;
  const origin = req && req.headers ? String(req.headers.origin || '') : '';
  if (origin && isLocalOrigin(origin, req)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
  }
  return headers;
}

/* ============================================================
   Respuestas
   ============================================================ */
function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...corsHeaders(res)
  });
  res.end(body);
}

function sendText(res, status, text) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    ...corsHeaders(res)
  });
  res.end(text);
}

function log(...args) {
  const time = new Date().toLocaleTimeString('es-AR', { hour12: false });
  console.log(`[${time}]`, ...args);
}

/* ============================================================
   Protección SSRF
   ============================================================ */
function ipv4ToInt(ip) {
  return ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

function isPrivateV4(ip) {
  const value = ipv4ToInt(ip);
  const inRange = (base, bits) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (value & mask) === (ipv4ToInt(base) & mask);
  };
  return (
    inRange('0.0.0.0', 8) ||
    inRange('10.0.0.0', 8) ||
    inRange('100.64.0.0', 10) ||
    inRange('127.0.0.0', 8) ||
    inRange('169.254.0.0', 16) ||
    inRange('172.16.0.0', 12) ||
    inRange('192.0.0.0', 24) ||
    inRange('192.0.2.0', 24) ||
    inRange('192.168.0.0', 16) ||
    inRange('198.18.0.0', 15) ||
    inRange('198.51.100.0', 24) ||
    inRange('203.0.113.0', 24) ||
    inRange('224.0.0.0', 4) ||
    inRange('240.0.0.0', 4) ||
    ip === '255.255.255.255'
  );
}

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) return isPrivateV4(ip);
  if (net.isIPv6(ip)) {
    const value = ip.toLowerCase();
    if (value === '::' || value === '::1') return true;
    if (/^f[cd][0-9a-f]{0,2}:/.test(value)) return true;
    if (/^fe[89ab][0-9a-f]?:/.test(value)) return true;
    if (/^ff[0-9a-f]{0,2}:/.test(value)) return true;
    if (/^2001:db8:/.test(value)) return true;
    const mapped = value.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
    if (mapped) return isPrivateV4(mapped[1]);
    return false;
  }
  return true;
}

async function assertSafeUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch (error) {
    const invalid = new Error('La URL no es válida.');
    invalid.code = 'INVALID_URL';
    throw invalid;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    const invalid = new Error('Solo se permiten enlaces http o https.');
    invalid.code = 'INVALID_URL';
    throw invalid;
  }
  if (url.username || url.password) {
    const invalid = new Error('No se permiten URLs con usuario y contraseña.');
    invalid.code = 'INVALID_URL';
    throw invalid;
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    const blocked = new Error('Ese host no está permitido.');
    blocked.code = 'BLOCKED_URL';
    throw blocked;
  }

  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      const blocked = new Error('Ese host no está permitido (red privada).');
      blocked.code = 'BLOCKED_URL';
      throw blocked;
    }
    return;
  }

  let records;
  try {
    records = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch (error) {
    const notFound = new Error('No se pudo resolver el dominio del enlace.');
    notFound.code = 'DNS_ERROR';
    throw notFound;
  }
  if (!records.length || records.some(record => isPrivateIp(record.address))) {
    const blocked = new Error('Ese host no está permitido (red privada).');
    blocked.code = 'BLOCKED_URL';
    throw blocked;
  }
}

/* ============================================================
   Lector de URLs
   ============================================================ */
function requestHeaders(url) {
  return {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5',
    'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    Referer: new URL(url).origin + '/'
  };
}

async function readBody(response, maxBytes) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > maxBytes) {
    throw new Error('La página es demasiado grande para procesarla.');
  }
  if (!response.body) return Buffer.alloc(0);

  const chunks = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.length;
    if (total > maxBytes) {
      try { await response.body.cancel(); } catch (error) { /* noop */ }
      throw new Error('La página es demasiado grande para procesarla.');
    }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function sniffCharset(buffer) {
  const head = buffer.slice(0, 8192).toString('latin1');
  const meta = head.match(/<meta[^>]+charset\s*=\s*["']?\s*([a-z0-9_-]+)/i);
  if (meta) return meta[1];
  const xml = head.match(/encoding\s*=\s*["']([a-z0-9_-]+)["']/i);
  if (xml) return xml[1];
  return 'utf-8';
}

function decodeBuffer(buffer, charset) {
  const label = String(charset || 'utf-8').trim().toLowerCase().replace(/["']/g, '');
  try {
    return new TextDecoder(label, { fatal: false }).decode(buffer);
  } catch (error) {
    return new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  }
}

async function fetchPage(rawUrl) {
  let current;
  try {
    current = new URL(rawUrl);
  } catch (error) {
    const invalid = new Error('La URL no es válida.');
    invalid.code = 'INVALID_URL';
    throw invalid;
  }

  for (let attempt = 0; attempt <= MAX_REDIRECTS; attempt++) {
    await assertSafeUrl(current.href);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    try {
      const response = await fetch(current.href, {
        redirect: 'manual',
        signal: controller.signal,
        headers: requestHeaders(current.href)
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) throw new Error('La página redirige a una dirección inválida.');
        current = new URL(location, current);
        continue;
      }

      // Una página de error del sitio remoto no es contenido para analizar.
      if (response.status >= 400) {
        const error = new Error(`El sitio respondió ${response.status}.`);
        error.code = 'HTTP_ERROR';
        error.httpStatus = response.status;
        throw error;
      }

      const contentType = response.headers.get('content-type') || 'text/html';
      if (!ALLOWED_TYPES.test(contentType)) {
        const error = new Error(`No se puede leer este tipo de archivo (${contentType.split(';')[0]}).`);
        error.code = 'UNSUPPORTED_TYPE';
        throw error;
      }

      const buffer = await readBody(response, MAX_BYTES);
      const headerCharset = (contentType.match(/charset\s*=\s*["']?([^;"'\s]+)/i) || [])[1];
      const charset = headerCharset || sniffCharset(buffer);
      const text = decodeBuffer(buffer, charset);

      return {
        finalUrl: current.href,
        status: response.status,
        contentType,
        charset,
        text,
        isHtml: /html|xml/i.test(contentType) || /^\s*<!doctype html/i.test(text)
      };
    } catch (error) {
      if (error.name === 'AbortError') {
        const timeout = new Error('El sitio tardó demasiado en responder.');
        timeout.code = 'TIMEOUT';
        throw timeout;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error('El enlace redirige demasiadas veces.');
}

async function handleFetch(req, res, requestUrl) {
  const target = requestUrl.searchParams.get('url');
  if (!target) return sendJson(res, 400, { ok: false, error: 'Falta el parámetro url.' });

  try {
    const page = await fetchPage(target);
    if (page.isHtml) {
      log('fetch', page.status, page.finalUrl, `${Math.round(page.text.length / 1024)} KB`);
      return sendJson(res, 200, {
        ok: true,
        url: target,
        finalUrl: page.finalUrl,
        status: page.status,
        contentType: page.contentType,
        charset: page.charset,
        html: page.text
      });
    }
    log('fetch-text', page.status, page.finalUrl, `${Math.round(page.text.length / 1024)} KB`);
    return sendJson(res, 200, {
      ok: true,
      url: target,
      finalUrl: page.finalUrl,
      status: page.status,
      contentType: page.contentType,
      charset: page.charset,
      html: '',
      text: page.text
    });
  } catch (error) {
    const status = error.code === 'INVALID_URL' || error.code === 'BLOCKED_URL' ? 400 : 502;
    log('fetch-error', target, error.message);
    return sendJson(res, status, {
      ok: false,
      code: error.code || 'FETCH_ERROR',
      httpStatus: error.httpStatus || 0,
      error: error.message || 'No se pudo leer el enlace.'
    });
  }
}

/* ============================================================
   Estáticos
   ============================================================ */
function serveStatic(req, res, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch (error) {
    return sendText(res, 400, 'Solicitud inválida.');
  }

  if (decoded === '/' || decoded === '') decoded = '/index.html';

  const safePath = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(ROOT, safePath);
  const relative = path.relative(ROOT, filePath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return sendText(res, 403, 'Acceso denegado.');
  }
  if (relative.split(path.sep).some(part => part.startsWith('.') || part === 'node_modules')) {
    return sendText(res, 404, 'No encontrado.');
  }

  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      if (!path.extname(filePath)) return serveStatic(req, res, '/index.html');
      return sendText(res, 404, 'No encontrado.');
    }

    const headers = {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stats.size,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff'
    };
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    const stream = fs.createReadStream(filePath);
    stream.on('error', () => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
    stream.pipe(res);
  });
}

/* ============================================================
   Servidor
   ============================================================ */
function requestHandler(req, res) {
  REQUEST_OF.set(res, req);
  let requestUrl;
  try {
    requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch (error) {
    return sendText(res, 400, 'Solicitud inválida.');
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { ...corsHeaders(res), 'Access-Control-Max-Age': '86400' });
    return res.end();
  }

  if (requestUrl.pathname === '/api/health') {
    return sendJson(res, 200, {
      ok: true,
      name: 'postinga-reader',
      version: VERSION,
      node: process.version
    });
  }

  if (requestUrl.pathname === '/api/fetch') {
    if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'Método no permitido.' });
    return handleFetch(req, res, requestUrl);
  }

  if (requestUrl.pathname.startsWith('/api/')) {
    return sendJson(res, 404, { ok: false, error: 'Endpoint no encontrado.' });
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendText(res, 405, 'Método no permitido.');
  }

  return serveStatic(req, res, requestUrl.pathname);
}

function openBrowser(url) {
  const platform = process.platform;
  const command = platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = platform === 'win32' ? ['/c', 'start', '', url] : [url];
  execFile(command, args, error => {
    if (error) log('No se pudo abrir el navegador automáticamente.');
  });
}

function start(port, attempt = 0) {
  const server = http.createServer((req, res) => {
    try {
      requestHandler(req, res);
    } catch (error) {
      log('error', error.stack || error.message);
      if (!res.headersSent) sendText(res, 500, 'Error interno del servidor.');
      else res.end();
    }
  });

  server.once('error', error => {
    if (error.code === 'EADDRINUSE' && attempt < 10) {
      start(port + 1, attempt + 1);
      return;
    }
    console.error('No se pudo iniciar el servidor:', error.message);
    process.exitCode = 1;
  });

  server.listen(port, HOST, () => {
    const url = `http://${HOST}:${port}`;
    console.log('');
    console.log('  ┌──────────────────────────────────────────────┐');
    console.log('  │  Postinga                                    │');
    console.log('  └──────────────────────────────────────────────┘');
    console.log('');
    console.log(`  Local:     ${url}`);
    console.log(`  Lector:    ${url}/api/fetch?url=https://…`);
    console.log('  Detener:   Ctrl+C');
    console.log('');
    if (process.argv.includes('--open')) openBrowser(url);
  });

  const shutdown = () => {
    log('Cerrando servidor…');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (require.main === module) {
  start(START_PORT);
}

module.exports = { start, requestHandler };
