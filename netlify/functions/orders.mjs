// Records a WhatsApp order (full checkout or quick "Buy Now on WhatsApp") so it appears in the dashboard.
// Prices are recalculated from the live catalogue, never taken from the browser.

import { cleanOrderDetails, getCatalog, json, priceOrder, saveOrder, validOrderId } from '../lib/shop-data.mjs';

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
    // Quick orders come straight from "Buy Now on WhatsApp": the customer's
    // name and address are collected in the WhatsApp chat instead of a form
    const quick = body.quick === true;
    const order = await saveOrder({
      id: body.orderId,
      createdAt: new Date().toISOString(),
      status: 'new',
      payment: 'whatsapp',
      ...(quick ? { quick: true, customer: {}, delivery: {}, message: '', notes: '' } : cleanOrderDetails(body)),
      ...priceOrder(catalog, body.items)
    });
    return json(200, { ok: true, id: order.id });
  } catch (err) {
    return json(400, { error: err.message });
  }
};

export const config = { path: '/api/orders' };
