// Envie Roses — Node.js server for hosts that run a server.js entry file.
// Serves the website and runs the same API code as the Netlify Functions,
// storing data in files (DATA_DIR) instead of Netlify Blobs.
//
//   npm start              (or: node server.js)
//
// Environment variables:
//   PORT            port to listen on (the host usually sets this)
//   ADMIN_PASSWORD  password for the dashboard at /admin
//   DATABASE_URL    MySQL database, e.g. mysql://user:password@host:3306/dbname
//     or DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME (and DB_SSL=true if required)
//                   When set, products, orders, reviews and uploaded photos are saved there.
//   DATA_DIR        without a database: folder where the data is saved as files
//                   (default ./data; use a folder that survives redeploys if your host allows)
//   STRIPE_SECRET_KEY  only needed for card payments

// Use the MySQL database when its details are set, otherwise save files in DATA_DIR
const usingDatabase = Boolean(process.env.DATABASE_URL || (process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME));
process.env.ENVIE_STORAGE = usingDatabase ? 'mysql' : 'file';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3000;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2'
};
const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.json', '.svg', '.txt']);

// Project files that are not part of the website
const PRIVATE = /^\/(node_modules|netlify|data|database|scripts|\.git)(\/|$)|^\/(server\.js|package(-lock)?\.json|SETUP\.md|netlify\.toml)$|\/\./;

// ---------- API routes (same handlers Netlify runs) ----------
const fn = (file) => import(path.join(ROOT, 'netlify', 'functions', file));
const ROUTES = [
  { match: (p) => p === '/js/catalog.js', load: () => fn('catalog-js.mjs') },
  { match: (p) => p === '/api/checkout', load: () => fn('checkout.mjs') },
  { match: (p) => p === '/api/orders', load: () => fn('orders.mjs') },
  { match: (p) => p === '/api/reviews', load: () => fn('reviews.mjs') },
  { match: (p) => p.startsWith('/api/admin/'), load: () => fn('admin.mjs') },
  { match: (p) => /^\/api\/image\/[\w-]+$/.test(p), load: () => fn('image.mjs'), params: (p) => ({ key: p.split('/').pop() }) }
];

function readBody(req, limit = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('Request too large'), { status: 413 })); req.destroy(); }
      else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function runHandler(route, req, res, pathname) {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
    else if (v !== undefined) headers.set(k, v);
  }
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const url = `${proto}://${req.headers.host || 'localhost'}${req.url}`;
  const hasBody = !['GET', 'HEAD'].includes(req.method);
  const request = new Request(url, { method: req.method, headers, body: hasBody ? await readBody(req) : undefined });
  const handler = (await route.load()).default;
  const response = await handler(request, { params: route.params ? route.params(pathname) : {} });
  const out = Buffer.from(await response.arrayBuffer());
  const resHeaders = {};
  response.headers.forEach((v, k) => { if (!k.startsWith('netlify-')) resHeaders[k] = v; });
  res.writeHead(response.status, resHeaders);
  res.end(req.method === 'HEAD' ? undefined : out);
}

// ---------- Static files ----------
const gzCache = new Map();

function cacheControl(ext) {
  if (['.jpg', '.jpeg', '.png', '.webp', '.svg', '.ico', '.woff2'].includes(ext)) return 'public, max-age=2592000';
  return 'public, max-age=0, must-revalidate';
}

function sendFile(req, res, file, status = 200) {
  const stat = fs.statSync(file);
  const ext = path.extname(file).toLowerCase();
  const etag = `"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`;
  const headers = {
    'content-type': TYPES[ext] || 'application/octet-stream',
    'cache-control': cacheControl(ext),
    etag,
    'x-content-type-options': 'nosniff'
  };
  if (path.basename(file) === 'admin.html') {
    Object.assign(headers, { 'x-robots-tag': 'noindex, nofollow', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer', 'cache-control': 'no-store' });
  }
  if (status === 200 && req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers);
    return res.end();
  }
  let body = fs.readFileSync(file);
  if (COMPRESSIBLE.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    const cached = gzCache.get(file);
    if (cached && cached.etag === etag) body = cached.body;
    else { body = zlib.gzipSync(body, { level: 9 }); gzCache.set(file, { etag, body }); }
    headers['content-encoding'] = 'gzip';
    headers.vary = 'Accept-Encoding';
  }
  headers['content-length'] = body.length;
  res.writeHead(status, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
}

function resolveStatic(pathname) {
  if (pathname === '/') return path.join(ROOT, 'index.html');
  if (pathname === '/admin' || pathname === '/admin/') return path.join(ROOT, 'admin.html');
  const file = path.join(ROOT, pathname);
  if (!file.startsWith(ROOT + path.sep)) return null; // outside the site folder
  if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  if (!path.extname(file) && fs.existsSync(file + '.html')) return file + '.html'; // /shop -> shop.html
  return null;
}

// Netlify's image service is not available here: serve the original photo instead
async function netlifyImageFallback(req, res, url) {
  const src = url.searchParams.get('url') || '';
  if (/^\/api\/image\/[\w-]+$/.test(src)) {
    req.url = src;
    return runHandler(ROUTES.find((r) => r.match(src)), req, res, src);
  }
  const file = resolveStatic(decodeURIComponent(src));
  if (file && !PRIVATE.test(src)) return sendFile(req, res, file);
  res.writeHead(404).end();
}

// ---------- Server ----------
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);

    const route = ROUTES.find((r) => r.match(pathname));
    if (route) return await runHandler(route, req, res, pathname);
    if (pathname === '/.netlify/images') return await netlifyImageFallback(req, res, url);

    if (!['GET', 'HEAD'].includes(req.method)) return res.writeHead(405).end();
    const file = PRIVATE.test(pathname) ? null : resolveStatic(pathname);
    if (file) return sendFile(req, res, file);
    return sendFile(req, res, path.join(ROOT, '404.html'), 404);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(err.status || 500, { 'content-type': 'text/plain' });
    res.end(err.status === 413 ? 'Request too large' : 'Server error');
  }
});

server.listen(PORT, async () => {
  console.log(`Envie Roses running on port ${PORT}`);
  if (!process.env.ADMIN_PASSWORD) console.log('Note: set ADMIN_PASSWORD to use the dashboard at /admin');
  if (usingDatabase) {
    try {
      const { checkDatabase } = await import(path.join(ROOT, 'netlify', 'lib', 'mysql-store.mjs'));
      console.log(`Connected to MySQL database (${await checkDatabase()} saved records)`);
    } catch (err) {
      console.error('Could not connect to the MySQL database. Check DB_HOST, DB_USER, DB_PASSWORD and DB_NAME:', err.message);
    }
  } else {
    console.log('Saving data as files in', process.env.DATA_DIR || path.join(ROOT, 'data'));
  }
});
