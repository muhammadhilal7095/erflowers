// Stripe tells the site about payments here, so nothing has to be updated by hand:
//   - a card order is marked Paid when the payment goes through
//   - a Flower Club subscription becomes Active, and every paid delivery appears in Orders
//   - cancelled or failed subscriptions are updated
//
// Set up in Stripe: Developers -> Webhooks -> Add endpoint -> https://yourdomain.co.uk/api/stripe-webhook
// Events: checkout.session.completed, invoice.paid, customer.subscription.updated, customer.subscription.deleted
// (the same events also run memberships: trial start, renewals, cancellations, VIP monthly bouquets)
// Then add the signing secret as STRIPE_WEBHOOK_SECRET.

import { randomBytes } from 'node:crypto';
import RULES from '../../js/rules.js';
import { getCatalog, getOrder, json, saveOrder, updateOrder } from '../lib/shop-data.mjs';
import { getCustomer, getSubscription, linkOrder, saveSubscription, verifyStripeSignature, saveCustomer } from '../lib/accounts.mjs';
import { getMembership, markTrialUsed, saveMembership } from '../lib/membership.mjs';

// Membership events carry membership_customer in their metadata
const memberMeta = (obj) =>
  (obj.metadata && obj.metadata.membership_customer && obj.metadata) ||
  (obj.subscription_details && obj.subscription_details.metadata && obj.subscription_details.metadata.membership_customer && obj.subscription_details.metadata) ||
  (obj.parent && obj.parent.subscription_details && obj.parent.subscription_details.metadata && obj.parent.subscription_details.metadata.membership_customer && obj.parent.subscription_details.metadata) ||
  (obj.lines && obj.lines.data && obj.lines.data[0] && obj.lines.data[0].metadata && obj.lines.data[0].metadata.membership_customer && obj.lines.data[0].metadata) || null;
const iso = (sec) => (sec ? new Date(sec * 1000).toISOString() : '');
const MEMBER_STATUS = { trialing: 'trialing', active: 'active', past_due: 'past-due', unpaid: 'past-due', canceled: 'cancelled', incomplete: 'awaiting-payment', incomplete_expired: 'cancelled', paused: 'past-due' };

async function handleMembership(event, obj, meta) {
  const m = await getMembership(meta.membership_customer);
  if (!m) return;
  if (event.type === 'checkout.session.completed') {
    await saveMembership({ ...m, status: m.trialDays ? 'trialing' : 'active', stripeSubscription: obj.subscription, stripeCustomer: obj.customer });
    if (m.trialDays) await markTrialUsed(m.customerId);
    const c = await getCustomer(m.customerId);
    if (c && obj.customer && c.stripeCustomerId !== obj.customer) await saveCustomer({ ...c, stripeCustomerId: obj.customer });
    return;
  }
  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const item = obj.items && obj.items.data && obj.items.data[0];
    await saveMembership({
      ...m,
      status: event.type === 'customer.subscription.deleted' ? 'cancelled' : MEMBER_STATUS[obj.status] || m.status,
      trialEnd: iso(obj.trial_end) || m.trialEnd || '',
      periodEnd: iso(obj.current_period_end || (item && item.current_period_end)) || m.periodEnd || '',
      cancelAtPeriodEnd: Boolean(obj.cancel_at_period_end)
    });
    return;
  }
  if (event.type === 'invoice.paid' && obj.amount_paid > 0 && !(m.invoices || []).includes(obj.id)) {
    const line = obj.lines && obj.lines.data && obj.lines.data[0];
    const next = { ...m, status: 'active', invoices: [...(m.invoices || []), obj.id].slice(-200), lastPaidAt: new Date().toISOString(),
      periodEnd: iso(line && line.period && line.period.end) || m.periodEnd || '' };
    // VIP: a standard bouquet for each paid month, added to Orders for you to arrange
    const catalog = await getCatalog();
    const plan = ((catalog.membership || {}).plans || {})[m.planId];
    if (plan && plan.monthlyBouquet) {
      const c = await getCustomer(m.customerId);
      const a = (c && c.addresses && c.addresses[0]) || {};
      const id = newOrderId();
      await saveOrder({
        id, createdAt: new Date().toISOString(), status: 'paid', payment: 'card', membershipBouquet: true, customerId: m.customerId,
        customer: m.customer,
        delivery: { recipient: a.recipient || m.customer.name, phone: a.phone || m.customer.phone, address1: a.address1 || '', address2: a.address2 || '', city: a.city || '', postcode: a.postcode || '', date: '', slot: '' },
        notes: a.address1 ? 'VIP monthly bouquet: confirm the delivery date with the member.' : 'VIP monthly bouquet: no saved address, contact the member to arrange delivery.',
        message: '', lines: [{ name: `${plan.name}: monthly bouquet`, label: 'Membership', price: 0, qty: 1, total: 0 }],
        subtotal: 0, deliveryFee: 0, sameDay: false, discount: null, total: 0
      });
      await linkOrder(m.customerId, id);
    }
    await saveMembership(next);
  }
}


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
    const meta = memberMeta(obj);
    if (meta) {
      await handleMembership(event, obj, meta);
      return json(200, { received: true });
    }
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
