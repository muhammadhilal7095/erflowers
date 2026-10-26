// File-based storage with the same methods the code uses from Netlify Blobs.
// Used when the site runs on a normal Node.js host via server.js
// (Netlify uses Netlify Blobs instead).
//
// Data is kept in DATA_DIR (default: ./data next to server.js):
//   data/<store>/<key>             the stored value
//   data/<store>/<key>.meta.json   metadata (e.g. an image's content type)

import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
const META = '.meta.json';

function fileFor(store, key) {
  // Keys look like "catalog", "orders/ER-261026-AB12" or "reviews/<product>/<id>"
  if (!/^[\w-]+(\/[\w-]+)*$/.test(key)) throw new Error('Invalid storage key.');
  return path.join(ROOT, store, ...key.split('/'));
}

async function writeAtomic(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, file);
}

async function readOrNull(file) {
  try {
    return await fs.readFile(file);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

async function walk(dir, base = '') {
  let entries = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const keys = [];
  for (const e of entries) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) keys.push(...(await walk(path.join(dir, e.name), rel)));
    else if (!e.name.endsWith(META) && !e.name.endsWith('.tmp')) keys.push(rel);
  }
  return keys;
}

export const toBuffer = (data) => (typeof data === 'string' ? Buffer.from(data) : Buffer.from(data instanceof ArrayBuffer ? new Uint8Array(data) : data));
export const asType = (buf, type) => {
  if (type === 'json') return JSON.parse(buf.toString('utf8'));
  if (type === 'arrayBuffer') return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return buf.toString('utf8');
};

export function getFileStore(name) {
  return {
    async get(key, { type } = {}) {
      const buf = await readOrNull(fileFor(name, key));
      return buf === null ? null : asType(buf, type);
    },
    async getWithMetadata(key, { type } = {}) {
      const file = fileFor(name, key);
      const buf = await readOrNull(file);
      if (buf === null) return null;
      const meta = await readOrNull(file + META);
      return { data: asType(buf, type), metadata: meta ? JSON.parse(meta.toString('utf8')) : {} };
    },
    async set(key, data, { metadata } = {}) {
      const file = fileFor(name, key);
      await writeAtomic(file, toBuffer(data));
      if (metadata) await writeAtomic(file + META, JSON.stringify(metadata));
    },
    async setJSON(key, value) {
      await writeAtomic(fileFor(name, key), JSON.stringify(value));
    },
    async delete(key) {
      const file = fileFor(name, key);
      await fs.rm(file, { force: true });
      await fs.rm(file + META, { force: true });
    },
    async list({ prefix = '' } = {}) {
      const keys = (await walk(path.join(ROOT, name))).filter((k) => k.startsWith(prefix));
      return { blobs: keys.map((key) => ({ key })) };
    }
  };
}
