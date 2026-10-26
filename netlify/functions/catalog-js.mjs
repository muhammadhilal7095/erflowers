// Serves the live catalogue (saved from the dashboard) in place of the static js/catalog.js,
// so every page picks up dashboard changes without editing any files.

import { getCatalog } from '../lib/shop-data.mjs';

export default async () => {
  const catalog = await getCatalog();
  const body = `/* Envie Roses live catalogue */\nwindow.ENVIE_CATALOG = ${JSON.stringify(catalog).replace(/</g, '\\u003c')};\n`;
  return new Response(body, {
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      // Browsers check back each visit; Netlify's CDN keeps a copy until the dashboard saves
      'cache-control': 'public, max-age=0, must-revalidate',
      'netlify-cdn-cache-control': 'public, durable, s-maxage=31536000, stale-while-revalidate=60',
      'netlify-cache-tag': 'catalog'
    }
  });
};

export const config = { path: '/js/catalog.js' };
