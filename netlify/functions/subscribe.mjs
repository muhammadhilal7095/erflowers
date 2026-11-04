// Flower Club sign-up (customer must be logged in).
//   POST /api/subscribe { planId, frequency, startDate, delivery, message, notes }
//   -> { url } (Stripe page for the regular card payment) or { whatsapp: true, id } when card payments are off

import RULES from '../../js/rules.js';
import { getCatalog, json } from '../lib/shop-data.mjs';
import { FREQUENCIES, customerFromRequest, newSubscriptionId, saveSubscription, stripe } from '../lib/accounts.mjs';

const t = (v, max) => String(v ?? '').trim().slice(0, max);

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  const c = await customerFromRequest(req);
  if (!c) return json(401, { error: 'Please log in or create an account to join the Flower Club.' });
  const body = await req.json().catch(() => ({}));

  try {
    const catalog = await getCatalog();
    const club = catalog.club || {};
    if (!club.enabled) throw new Error('The Flower Club is not open at the moment.');
    const plan = (club.plans || {})[body.planId];
    if (!plan || plan.active === false) throw new Error('Please choose a plan.');
    if (!(club.frequencies || []).includes(body.frequency) || !FREQUENCIES[body.frequency]) throw new Error('Please choose how often.');

    const d = body.delivery || {};
    const delivery = {
      recipient: t(d.recipient, 100), phone: t(d.phone, 30), address1: t(d.address1, 150), address2: t(d.address2, 150),
      city: t(d.city, 80), postcode: t(d.postcode, 10).toUpperCase()
    };
    if (!delivery.recipient || !delivery.address1 || !delivery.city || !delivery.postcode) throw new Error('Please complete the delivery address.');
    const quote = RULES.deliveryQuote(catalog, { postcode: delivery.postcode, date: t(body.startDate, 10) });
    if (!quote.ok) throw new Error(quote.error);

    const freq = FREQUENCIES[body.frequency];
    const sub = {
      id: newSubscriptionId(), createdAt: new Date().toISOString(),
      customerId: c.id, customer: { name: c.name, email: c.email, phone: c.phone },
      planId: body.planId, planName: plan.name, price: plan.price,
      frequency: body.frequency, frequencyLabel: freq.label, startDate: quote.date,
      delivery, message: t(body.message, 250), notes: t(body.notes, 200)
    };

    const site = process.env.URL || new URL(req.url).origin;
    if (catalog.payments.stripe && process.env.STRIPE_SECRET_KEY) {
      const session = await stripe('checkout/sessions', {
        mode: 'subscription',
        success_url: `${site}/account.html?club=success#subscriptions`,
        cancel_url: `${site}/club.html?cancelled=1`,
        client_reference_id: sub.id,
        ...(c.stripeCustomerId ? { customer: c.stripeCustomerId } : { customer_email: c.email }),
        line_items: [{
          price_data: {
            currency: catalog.shop.currency, unit_amount: plan.price,
            recurring: { interval: freq.interval, interval_count: freq.count },
            product_data: { name: `Flower Club: ${plan.name} (${freq.label.toLowerCase()})` }
          },
          quantity: 1
        }],
        metadata: { subscription_id: sub.id },
        subscription_data: { metadata: { subscription_id: sub.id, first_delivery: sub.startDate } }
      });
      await saveSubscription({ ...sub, status: 'awaiting-payment', payment: 'card', stripeSession: session.id });
      return json(200, { url: session.url });
    }

    await saveSubscription({ ...sub, status: 'pending', payment: 'whatsapp' });
    return json(200, { whatsapp: true, id: sub.id });
  } catch (err) {
    return json(400, { error: err.message || 'Something went wrong.' });
  }
};

export const config = { path: '/api/subscribe' };
