// Records a WhatsApp order (full checkout, quick "Buy Now on WhatsApp", or a gift card purchase)
// so it appears in the dashboard. Prices are recalculated from the live catalogue, never taken from the browser.
// A logged-in customer's order is added to their account; gift card codes and loyalty points are applied here.

import { cleanOrderDetails, findDiscount, getCatalog, json, priceOrder, saveOrder, validOrderId } from '../lib/shop-data.mjs';
import { cleanGiftBuyer, commitExtras, prepareExtras, priceGiftCardPurchase } from '../lib/order-extras.mjs';

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
  if (!validOrderId(body.orderId)) return json(400, { error: 'Invalid order reference.' });

  try {
    const catalog = await getCatalog();
    if (!catalog.payments.whatsapp) return json(400, { error: 'WhatsApp ordering is switched off.' });

    let order;
    if (body.giftCardPurchase) {
      const { priced, gift } = priceGiftCardPurchase(catalog, body.giftCardPurchase);
      const { fields } = await prepareExtras(req, {}, catalog, priced);
      order = { ...cleanGiftBuyer(body), ...priced, giftCardOrder: gift, customerId: fields.customerId };
      if (!order.customerId) delete order.customerId;
    } else {
      // Quick orders come straight from "Buy Now on WhatsApp": the customer's
      // name and address are collected in the WhatsApp chat instead of a form
      const quick = body.quick === true;
      const details = quick ? { quick: true, customer: {}, delivery: {}, message: '', notes: '' } : cleanOrderDetails(body);
      let discount = null;
      if (!quick && body.discountCode) {
        discount = await findDiscount(body.discountCode);
        if (!discount) return json(400, { error: 'That discount code is not valid.' });
      }
      const priced = priceOrder(catalog, body.items, { delivery: quick ? null : details.delivery, discount });
      const { fields } = await prepareExtras(req, quick ? {} : body, catalog, priced);
      order = { ...details, ...priced, ...fields };
    }

    const fresh = { id: body.orderId, createdAt: new Date().toISOString(), status: 'new', payment: 'whatsapp', ...order };
    const saved = await saveOrder(fresh);
    if (saved === fresh) await commitExtras(saved);
    return json(200, { ok: true, id: saved.id, total: saved.total, giftCard: saved.giftCard || null, points: saved.points || null });
  } catch (err) {
    return json(400, { error: err.message });
  }
};

export const config = { path: '/api/orders' };
