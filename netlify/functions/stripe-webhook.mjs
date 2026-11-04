// Stripe tells the site about payments here, so nothing has to be updated by hand:
//   - a card order is marked Paid when the payment goes through
//   - a Flower Club subscription becomes Active, and every paid delivery appears in Orders
//   - cancelled or failed subscriptions are updated
//
// Set up in Stripe: Developers -> Webhooks -> Add endpoint -> https://yourdomain.co.uk/api/stripe-webhook
// Events: checkout.session.completed, invoice.paid, customer.subscription.updated, customer.subscription.deleted
// Then add the signing secret as STRIPE_WEBHOOK_SECRET.

import { randomBytes } from 'node:crypto';
import RULES from '../../js/rules.js';
import { getCatalog, getOrder, json, saveOrder, updateOrder } from '../lib/shop-data.mjs';
import { getCustomer, getSubscription, linkOrder, saveSubscription, verifyStripeSignature, saveCustomer } from '../lib/accounts.mjs';

const STATUS = { active: 'active', trialing: 'active', past_due: 'past-due', unpaid: 'past-due', canceled: 'cancelled', incomplete: 'awaiting-payment', incomplete_expired: 'cancelled', paused: 'paused' };

function newOrderId() {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return `ER-${ymd}-${Array.from(randomBytes(4), (b) => chars[b % chars.length]).join('')}`;
}

const subIdFrom = (obj) =>
  (obj.metadata && obj.metadata.subscription_id) ||
  (obj.subscription_details && obj.subscription_details.metadata && obj.subscription_details.metadata.subscription_id) ||
  (obj.parent && obj.parent.subscription_details && obj.parent.subscription_details.metadata && obj.parent.subscription_details.metadata.subscription_id) ||
  (obj.lines && obj.lines.data && obj.lines.data[0] && obj.lines.data[0].metadata && obj.lines.data[0].metadata.subscription_id) || '';

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return json(503, { error: 'Webhook not set up.' });
  const raw = await req.text();
  if (!verifyStripeSignature(raw, req.headers.get('stripe-signature'), secret)) return json(400, { error: 'Bad signature.' });

  const event = JSON.parse(raw);
  const obj = event.data && event.data.object ? event.data.object : {};
  try {
    if (event.type === 'checkout.session.completed') {
      if (obj.mode === 'payment' && obj.client_reference_id && obj.payment_status === 'paid') {
        const order = await getOrder(obj.client_reference_id);
        if (order && order.status === 'awaiting-payment') await updateOrder(order.id, { status: 'paid', paidAt: new Date().toISOString() });
      }
      if (obj.mode === 'subscription') {
        const sub = await getSubscription(obj.client_reference_id || subIdFrom(obj));
        if (sub) {
          await saveSubscription({ ...sub, status: 'active', stripeSubscription: obj.subscription, stripeCustomer: obj.customer });
          const c = await getCustomer(sub.customerId);
          if (c && obj.customer && c.stripeCustomerId !== obj.customer) await saveCustomer({ ...c, stripeCustomerId: obj.customer });
        }
      }
    }

    if (event.type === 'invoice.paid' && obj.amount_paid > 0) {
      const sub = await getSubscription(subIdFrom(obj));
      if (sub && !(sub.invoices || []).includes(obj.id)) {
        // Each paid delivery appears in Orders with the next delivery date
        const catalog = await getCatalog();
        const first = obj.billing_reason === 'subscription_create';
        const date = first ? sub.startDate : RULES.deliveryQuote(catalog, { postcode: sub.delivery.postcode }).earliest || '';
        const id = newOrderId();
        const order = {
          id, createdAt: new Date().toISOString(), status: 'paid', payment: 'card', subscriptionId: sub.id, customerId: sub.customerId,
          customer: sub.customer, delivery: { ...sub.delivery, date, slot: '' }, message: sub.message, notes: sub.notes,
          lines: [{ name: `Flower Club: ${sub.planName}`, label: sub.frequencyLabel, price: obj.amount_paid, qty: 1, total: obj.amount_paid }],
          subtotal: obj.amount_paid, deliveryFee: 0, sameDay: false, discount: null, total: obj.amount_paid
        };
        await saveOrder(order);
        await linkOrder(sub.customerId, id);
        await saveSubscription({ ...sub, status: 'active', invoices: [...(sub.invoices || []), obj.id].slice(-200), lastPaidAt: new Date().toISOString() });
      }
    }

    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const sub = await getSubscription(subIdFrom(obj));
      if (sub) {
        const status = event.type === 'customer.subscription.deleted' ? 'cancelled' : STATUS[obj.status] || sub.status;
        await saveSubscription({ ...sub, status, cancelAtPeriodEnd: Boolean(obj.cancel_at_period_end) });
      }
    }
  } catch (err) {
    console.error('Webhook error', event.type, err);
    return json(500, { error: 'Could not process the event.' });
  }
  return json(200, { received: true });
};

export const config = { path: '/api/stripe-webhook' };
