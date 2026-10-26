// Writes database/envie.sql: the table the website uses, plus your starting
// products and settings from js/catalog.js. Import it in phpMyAdmin (or any
// MySQL tool) to set up the live database.
//
//   npm run db:sql

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import CATALOG from '../js/catalog.js';
import { SCHEMA } from '../netlify/lib/mysql-store.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// Hex keeps the JSON exact, whatever quotes or symbols it contains
const hex = (text) => '0x' + Buffer.from(text, 'utf8').toString('hex');

const sql = `-- Envie Roses database
-- Import this file into your MySQL database (phpMyAdmin: Import -> choose this file -> Go).
-- It creates the table the website uses and adds your starting products and settings.
-- Safe to import again: existing data is never overwritten.
-- Generated from js/catalog.js on ${new Date().toISOString().slice(0, 10)}.

SET NAMES utf8mb4;

${SCHEMA};

-- Products, prices, offers and shop settings (edit them later in the dashboard at /admin)
INSERT IGNORE INTO envie_store (store, k, v, meta) VALUES
  ('envie', 'catalog', ${hex(JSON.stringify(CATALOG))}, NULL);
`;

writeFileSync(path.join(root, 'database', 'envie.sql'), sql);
console.log(`database/envie.sql written (${Object.keys(CATALOG.products).length} products)`);
