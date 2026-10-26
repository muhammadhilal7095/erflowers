// MySQL storage with the same methods the code uses from Netlify Blobs.
// Used by server.js when database details are set:
//   DATABASE_URL=mysql://user:password@host:3306/database
// or
//   DB_HOST, DB_PORT (default 3306), DB_USER, DB_PASSWORD, DB_NAME
// Optional: DB_SSL=true for hosts that require an encrypted connection.
//
// Everything lives in one table, envie_store (created automatically, or by
// importing database/envie.sql):
//   store  'envie' (catalogue, orders, reviews) or 'envie-images' (uploaded photos)
//   k      key, e.g. "catalog", "orders/ER-261026-AB12"
//   v      the value (JSON text or image bytes)
//   meta   metadata as JSON (e.g. an image's content type)

import { asType, toBuffer } from './file-store.mjs';

export const SCHEMA = `CREATE TABLE IF NOT EXISTS envie_store (
  store VARCHAR(40) NOT NULL,
  k VARCHAR(191) NOT NULL,
  v LONGBLOB NOT NULL,
  meta TEXT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (store, k)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;

export const dbConfigured = () =>
  Boolean(process.env.DATABASE_URL || (process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME));

let poolPromise = null;

function settings() {
  const ssl = process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined;
  const common = { waitForConnections: true, connectionLimit: 5, charset: 'utf8mb4', ssl, connectTimeout: 5000 };
  if (process.env.DATABASE_URL) return { uri: process.env.DATABASE_URL, ...common };
  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME,
    ...common
  };
}

async function pool() {
  if (!poolPromise) {
    poolPromise = (async () => {
      const mysql = (await import('mysql2/promise')).default;
      const p = mysql.createPool(settings());
      await p.query(SCHEMA);
      return p;
    })().catch((err) => {
      poolPromise = null; // try again on the next request
      throw err;
    });
  }
  return poolPromise;
}

// Checks the connection at start-up so problems show in the host's logs
export async function checkDatabase() {
  const p = await pool();
  const [rows] = await p.query('SELECT COUNT(*) AS n FROM envie_store');
  return rows[0].n;
}

const likePrefix = (prefix) => prefix.replace(/[\\%_]/g, '\\$&') + '%';

export function getMysqlStore(name) {
  return {
    async get(key, { type } = {}) {
      const [rows] = await (await pool()).query('SELECT v FROM envie_store WHERE store = ? AND k = ?', [name, key]);
      return rows.length ? asType(Buffer.from(rows[0].v), type) : null;
    },
    async getWithMetadata(key, { type } = {}) {
      const [rows] = await (await pool()).query('SELECT v, meta FROM envie_store WHERE store = ? AND k = ?', [name, key]);
      if (!rows.length) return null;
      return { data: asType(Buffer.from(rows[0].v), type), metadata: rows[0].meta ? JSON.parse(rows[0].meta) : {} };
    },
    async set(key, data, { metadata } = {}) {
      await (await pool()).query(
        'INSERT INTO envie_store (store, k, v, meta) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v), meta = VALUES(meta)',
        [name, key, toBuffer(data), metadata ? JSON.stringify(metadata) : null]
      );
    },
    async setJSON(key, value) {
      await this.set(key, JSON.stringify(value));
    },
    async delete(key) {
      await (await pool()).query('DELETE FROM envie_store WHERE store = ? AND k = ?', [name, key]);
    },
    async list({ prefix = '' } = {}) {
      const [rows] = await (await pool()).query('SELECT k FROM envie_store WHERE store = ? AND k LIKE ? ORDER BY k', [name, likePrefix(prefix)]);
      return { blobs: rows.map((r) => ({ key: r.k })) };
    }
  };
}
