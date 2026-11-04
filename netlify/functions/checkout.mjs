// Creates a Stripe Checkout session for an Envie Roses order (or gift card purchase) and records the order.
// Prices always come from the live catalogue on the server, never from the browser.
//
// Needs the environment variable STRIPE_SECRET_KEY. With STRIPE_WEBHOOK_SECRET also set,
// card orders are marked Paid automatically (see stripe-webhook.mjs).

import { cleanOrderDetails, findDiscount, getCatalog, json, priceOrder, saveOrder, validOrderId } from '../lib/shop-data.mjs';
import { cleanGiftBuyer, commitExtras, prepareExtras, priceGiftCardPurchase } from '../lib/order-extras.mjs';
import { stripe } from '../lib/accounts.mjs';

// Stripe metadata values are limited to 500 characters
const clip = (value, max = 490) => String(value || '').trim().slice(0, max);

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  if (!process.env.STRIPE_SECRET_KEY) return json(503, { error: 'Card payments are not set up yet.' });

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return json(400, { error: 'Invalid request.' });
  }
  if (!validOrderId(body.orderId)) return json(400, { error: 'Invalid order reference.' });

  const catalog = await getCatalog();
  if (!catalog.payments.stripe) return json(400, { error: 'Card payments are switched off.' });

  let order;
  try {
    if (body.giftCardPurchase) {
      const { priced, gift } = priceGiftCardPurchase(catalog, body.giftCardPurchase);
      const { fields } = await prepareExtras(req, {}, catalog, priced);
      order = { ...cleanGiftBuyer(body), ...priced, giftCardOrder: gift, ...(fields.customerId ? { customerId: fields.customerId } : {}) };
    } else {
      const details = cleanOrderDetails(body);
      const discount = body.discountCode ? await findDiscount(body.discountCode) : null;
      if (body.discountCode && !discount) throw new Error('That discount code is not valid.');
      const priced = priceOrder(catalog, body.items, { delivery: details.delivery, discount });
      const { fields } = await prepareExtras(req, body, catalog, priced);
      order = { ...details, ...priced, ...fields };
    }
  } catch (err) {
    return json(400, { error: err.message });
  }

  const site = process.env.URL || new URL(req.url).origin;
  const base = { id: body.orderId, createdAt: new Date().toISOString(), payment: 'card' };

  // Fully paid by gift card and/or points: nothing to charge
  if (order.total === 0) {
    const fresh = { ...base, ...order, status: 'paid', payment: 'gift card / points' };
    const saved = await saveOrder(fresh);
    if (saved === fresh) await commitExtras(saved);
    return json(200, { url: `${site}/?checkout=success&order=${body.orderId}` });
  }

  // Free gifts (e.g. a free vase) are listed in the order details, not as £0 Stripe lines
  const lineItems = order.lines.filter((l) => l.price > 0).map((l) => ({
    price_data: { currency: catalog.shop.currency, unit_amount: l.price, product_data: { name: `${l.name} (${l.label})` } },
    quantity: l.qty
  }));
  if (order.deliveryFee > 0) {
    lineItems.push({ price_data: { currency: catalog.shop.currency, unit_amount: order.deliveryFee, product_data: { name: 'Delivery' } }, quantity: 1 });
  }

  // Discount code, gift card and points become one single-use coupon, so Stripe charges exactly our total
  const off = ((order.discount && order.discount.amount) || 0) + ((order.referral && order.referral.amount) || 0) + ((order.giftCard && order.giftCard.amount) || 0) + ((order.points && order.points.amount) || 0);
  let coupon = null;
  if (off > 0) {
    try {
      const names = [order.discount && order.discount.code, order.referral && 'Friend offer', order.giftCard && 'Gift card', order.points && 'Points'].filter(Boolean).join(' + ');
      coupon = (await stripe('coupons', { amount_off: off, currency: catalog.shop.currency, duration: 'once', max_redemptions: 1, name: clip(`${names} (${body.orderId})`, 40) })).id;
    } catch (err) {
      return json(502, { error: 'We could not apply your discount. Please try again.' });
    }
  }

  const d = order.delivery || {};
  const g = order.giftCardOrder;
  const params = {
    mode: 'payment',
    success_url: `${site}/?checkout=success&order=${body.orderId}`,
    cancel_url: `${site}/?checkout=cancelled`,
    client_reference_id: body.orderId,
    customer_email: order.customer.email || undefined,
    line_items: lineItems,
    ...(coupon ? { discounts: [{ coupon }] } : {}),
    payment_intent_data: { description: `${catalog.shop.name} order ${body.orderId}` },
    metadata: g
      ? { order_id: body.orderId, gift_card: clip(`${g.amount / 100} GBP for ${g.to}${g.from ? ` from ${g.from}` : ''}`), message: clip(g.message), customer_name: clip(order.customer.name), customer_phone: clip(order.customer.phone) }
      : {
          order_id: body.orderId,
          items: clip(order.lines.map((l) => `${l.qty} x ${l.name} (${l.label})`).join('; ')),
          customer_name: clip(order.customer.name),
          customer_phone: clip(order.customer.phone),
          recipient: clip(`${d.recipient}${d.phone ? ` (${d.phone})` : ''}`),
          delivery_address: clip([d.address1, d.address2, d.city, d.postcode].filter(Boolean).join(', ')),
          delivery_date: clip(d.date + (d.slot ? ` (${d.slot})` : '') + (order.sameDay ? ' SAME DAY' : '')),
          discount: clip(order.discount ? `${order.discount.code}: ${order.discount.label}` : ''),
          gift_card_used: clip(order.giftCard ? `${order.giftCard.display}: ${order.giftCard.amount / 100} GBP` : ''),
          points_used: order.points ? String(order.points.used) : '',
          card_message: clip(order.message),
          notes: clip(order.notes)
        }
  };

  try {
    const session = await stripe('checkout/sessions', params);
    // Record the order. Gift card balance and points are taken now and given back if you cancel the order.
    const fresh = { ...base, ...order, status: 'awaiting-payment', stripeSession: session.id };
    const saved = await saveOrder(fresh).catch((err) => { console.error('Could not record order', err); return null; });
    if (saved === fresh) await commitExtras(saved).catch((err) => console.error('Could not apply gift card / points', err));
    return json(200, { url: session.url });
  } catch (err) {
    return json(502, { error: 'We could not start the payment. Please try again.' });
  }
};

export const config = { path: '/api/checkout' };
