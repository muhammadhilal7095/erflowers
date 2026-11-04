// Checks a discount code or gift card code against the bag.
//   POST /api/discount  { code, items, postcode?, date?, discountCode? }
//   -> discount: { code, label, amount, subtotal, deliveryFee, total }
//   -> gift card: { giftCard: true, code, display, balance, amount }

import { findDiscount, getCatalog, json, priceOrder } from '../lib/shop-data.mjs';
import { cleanGiftCode, getGiftCard, giftCardProblem } from '../lib/accounts.mjs';

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

  const slow = () => new Promise((r) => setTimeout(r, 400)); // slows down guessing codes
  try {
    const catalog = await getCatalog();
    const delivery = body.postcode && body.date ? { postcode: body.postcode, date: body.date } : null;

    if (/^GC/.test(cleanGiftCode(body.code))) {
      const card = await getGiftCard(body.code);
      const problem = giftCardProblem(card);
      if (problem) { await slow(); return json(400, { error: problem }); }
      const other = body.discountCode ? await findDiscount(body.discountCode) : null;
      const priced = priceOrder(catalog, body.items, { delivery, discount: other });
      return json(200, { giftCard: true, code: card.code, display: card.display, balance: card.balance, amount: Math.min(card.balance, priced.total) });
    }

    const discount = await findDiscount(body.code);
    if (!discount) { await slow(); return json(400, { error: 'That code is not valid.' }); }
    const priced = priceOrder(catalog, body.items, { delivery, discount });
    return json(200, { ...priced.discount, subtotal: priced.subtotal, deliveryFee: priced.deliveryFee, total: priced.total });
  } catch (err) {
    return json(400, { error: err.message });
  }
};

export const config = { path: '/api/discount' };
