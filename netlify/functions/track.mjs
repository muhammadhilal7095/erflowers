// Order tracking: the order reference plus the delivery postcode must match.
//   POST /api/track { orderId, postcode } -> { id, status, statusLabel, date, slot, items }

import RULES from '../../js/rules.js';
import { getOrder, json, validOrderId } from '../lib/shop-data.mjs';

const LABELS = {
  new: 'Order received', 'awaiting-payment': 'Waiting for payment', confirmed: 'Confirmed: being prepared', paid: 'Paid: being prepared',
  'out-for-delivery': 'Out for delivery', delivered: 'Delivered', cancelled: 'Cancelled'
};
const STEPS = ['received', 'preparing', 'out-for-delivery', 'delivered'];
const step = (s) => ({ new: 0, 'awaiting-payment': 0, confirmed: 1, paid: 1, 'out-for-delivery': 2, delivered: 3 }[s] ?? 0);

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  const body = await req.json().catch(() => ({}));
  const id = String(body.orderId || '').trim().toUpperCase();
  const pc = RULES.normalizePostcode(body.postcode);
  const notFound = async () => { await new Promise((r) => setTimeout(r, 400)); return json(404, { error: 'We couldn’t find an order with that reference and postcode.' }); };
  if (!validOrderId(id) || !pc) return notFound();
  const o = await getOrder(id);
  if (!o || !o.delivery || RULES.normalizePostcode(o.delivery.postcode) !== pc) return notFound();
  return json(200, {
    id: o.id, status: o.status, statusLabel: LABELS[o.status] || o.status, step: step(o.status), steps: STEPS,
    cancelled: o.status === 'cancelled', date: o.delivery.date, slot: o.delivery.slot || '', sameDay: o.sameDay || false,
    items: (o.lines || []).map((l) => `${l.qty} × ${l.name}`)
  });
};

export const config = { path: '/api/track' };
