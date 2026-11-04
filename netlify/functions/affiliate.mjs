// Partner programme (public side).
//   POST /api/affiliate/apply  { name, email, phone, links, audience, how, agree } -> { ok }
//   POST /api/affiliate/click  { code } -> { ok }   (one visit through a partner link)
//   GET  /api/affiliate/me?key=<private key> -> the partner's stats

import { getCatalog, json } from '../lib/shop-data.mjs';
import { applyAffiliate, findByKey, publicStats, recordClick } from '../lib/affiliates.mjs';

export default async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/affiliate\/?/, '').replace(/\/$/, '');
  try {
    const catalog = await getCatalog();
    if (path === 'me' && req.method === 'GET') {
      const a = await findByKey(url.searchParams.get('key'));
      if (!a) { await new Promise((r) => setTimeout(r, 400)); return json(404, { error: 'This partner link is not valid. Please contact us for a new one.' }); }
      return json(200, publicStats(a, catalog));
    }
    if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' });
    const raw = await req.text();
    if (raw.length > 5000) return json(413, { error: 'Request too large.' });
    const body = JSON.parse(raw || '{}');
    if (!catalog.affiliates.enabled) return json(400, { error: 'The partner programme is not open at the moment.' });
    if (path === 'apply') { await applyAffiliate(body); return json(200, { ok: true }); }
    if (path === 'click') { await recordClick(body.code); return json(200, { ok: true }); }
    return json(404, { error: 'Not found.' });
  } catch (err) {
    return json(400, { error: err.message || 'Something went wrong.' });
  }
};

export const config = { path: '/api/affiliate/*' };
