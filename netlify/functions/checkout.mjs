// Creates a Stripe Checkout session for an Envie Roses order and records the order.
// Prices always come from the live catalogue on the server, never from the browser.
//
// Needs the environment variable STRIPE_SECRET_KEY (Netlify: Site configuration → Environment variables).

import { cleanOrderDetails, getCatalog, json, priceOrder, saveOrder, validOrderId } from '../lib/shop-data.mjs';

// Stripe metadata values are limited to 500 characters
const clip = (value, max = 490) => String(value || '').trim().slice(0, max);

// Encode nested params the way the Stripe API expects (a[b][c]=d)
function encode(obj, prefix, out = []) {
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null || value === '') continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (typeof value === 'object') encode(value, name, out);
    else out.push(`${encodeURIComponent(name)}=${encodeURIComponent(value)}`);
  }
  return out.join('&');
}

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' });

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return json(503, { error: 'Card payments are not set up yet.' });

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return json(400, { error: 'Invalid request.' });
  }
  if (!validOrderId(body.orderId)) return json(400, { error: 'Invalid order reference.' });

  const catalog = await getCatalog();
  if (!catalog.payments.stripe) return json(400, { error: 'Card payments are switched off.' });

  let priced, details;
  try {
    priced = priceOrder(catalog, body.items);
    details = cleanOrderDetails(body);
  } catch (err) {
    return json(400, { error: err.message });
  }

  const lineItems = priced.lines.map((l) => ({
    price_data: { currency: catalog.shop.currency, unit_amount: l.price, product_data: { name: `${l.name} (${l.label})` } },
    quantity: l.qty
  }));
  if (priced.deliveryFee > 0) {
    lineItems.push({ price_data: { currency: catalog.shop.currency, unit_amount: priced.deliveryFee, product_data: { name: 'Delivery' } }, quantity: 1 });
  }

  const site = process.env.URL || new URL(req.url).origin;
  const d = details.delivery;
  const params = {
    mode: 'payment',
    success_url: `${site}/?checkout=success&order=${body.orderId}`,
    cancel_url: `${site}/?checkout=cancelled`,
    client_reference_id: body.orderId,
    customer_email: details.customer.email || undefined,
    line_items: lineItems,
    payment_intent_data: { description: `${catalog.shop.name} order ${body.orderId}` },
    metadata: {
      order_id: body.orderId,
      items: clip(priced.lines.map((l) => `${l.qty} x ${l.name} (${l.label})`).join('; ')),
      customer_name: clip(details.customer.name),
      customer_phone: clip(details.customer.phone),
      recipient: clip(`${d.recipient}${d.phone ? ` (${d.phone})` : ''}`),
      delivery_address: clip([d.address1, d.address2, d.city, d.postcode].filter(Boolean).join(', ')),
      delivery_date: clip(d.date),
      card_message: clip(details.message),
      notes: clip(details.notes)
    }
  };

  try {
    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: encode(params)
    });
    const session = await res.json();
    if (!res.ok) {
      console.error('Stripe error', session.error);
      return json(502, { error: 'We could not start the payment. Please try again.' });
    }
    // Record the order; mark it paid in the dashboard once you see the payment in Stripe
    await saveOrder({
      id: body.orderId,
      createdAt: new Date().toISOString(),
      status: 'awaiting-payment',
      payment: 'card',
      stripeSession: session.id,
      ...priced,
      ...details
    }).catch((err) => console.error('Could not record order', err));
    return json(200, { url: session.url });
  } catch (err) {
    console.error(err);
    return json(502, { error: 'We could not reach the payment provider. Please try again.' });
  }
};

export const config = { path: '/api/checkout' };
