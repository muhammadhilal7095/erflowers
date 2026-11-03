// Checks a discount code against the bag and returns the priced result.
//   POST /api/discount  { code, items, postcode?, date? } -> { code, label, amount, subtotal, deliveryFee, total }

import { findDiscount, getCatalog, json, priceOrder } from '../lib/shop-data.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  const raw = await req.text();
  if (raw.length > 10000) return json(413, { error: 'Request too large.' });
  let body;
  try {
    body = JSON.parse(raw);
  } catch (e) {
    return json(400, { error: 'Invalid request.' });
  }

  const discount = await findDiscount(body.code);
  if (!discount) {
    await new Promise((r) => setTimeout(r, 400)); // slows down guessing codes
    return json(400, { error: 'That code is not valid.' });
  }
  try {
    const catalog = await getCatalog();
    const delivery = body.postcode && body.date ? { postcode: body.postcode, date: body.date } : null;
    const priced = priceOrder(catalog, body.items, { delivery, discount });
    return json(200, { ...priced.discount, subtotal: priced.subtotal, deliveryFee: priced.deliveryFee, total: priced.total });
  } catch (err) {
    return json(400, { error: err.message });
  }
};

export const config = { path: '/api/discount' };
