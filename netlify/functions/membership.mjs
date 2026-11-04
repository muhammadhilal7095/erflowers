// Membership sign-up and cancellation (customer must be logged in).
//   POST /api/membership/join   { planId, agree } -> { url } (Stripe page) or { whatsapp: true }
//   POST /api/membership/cancel -> { membership }
// The renewal price and first charge date are shown on membership.html before joining.

import { getCatalog, json } from '../lib/shop-data.mjs';
import { customerFromRequest, stripe } from '../lib/accounts.mjs';
import { getMembership, isActive, markTrialUsed, publicMembership, saveMembership } from '../lib/membership.mjs';
import { stripeKey } from '../lib/integrations.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  const path = new URL(req.url).pathname.replace(/^\/api\/membership\/?/, '').replace(/\/$/, '');
  const c = await customerFromRequest(req);
  if (!c) return json(401, { error: 'Please log in or create an account first.' });
  const body = await req.json().catch(() => ({}));
  try {
    const catalog = await getCatalog();
    const cfg = catalog.membership || {};
    const existing = await getMembership(c.id);

    if (path === 'join') {
      if (!cfg.enabled) throw new Error('Membership is not open at the moment.');
      const plan = (cfg.plans || {})[body.planId];
      if (!plan || plan.active === false) throw new Error('Please choose a plan.');
      if (body.agree !== true) throw new Error('Please confirm you understand how billing works.');
      if (existing && (isActive(existing) || existing.status === 'pending')) {
        throw new Error('You already have a membership. To change plan, cancel it in My Account first, or message us.');
      }
      const trialDays = cfg.trialDays > 0 && !c.membershipTrialUsed ? cfg.trialDays : 0;
      const base = {
        customerId: c.id, customer: { name: c.name, email: c.email, phone: c.phone },
        planId: body.planId, planName: plan.name, price: plan.price, trialDays, createdAt: new Date().toISOString()
      };
      const site = process.env.URL || new URL(req.url).origin;

      if (catalog.payments.stripe && (await stripeKey())) {
        const meta = { membership_customer: c.id, membership_plan: body.planId };
        const session = await stripe('checkout/sessions', {
          mode: 'subscription',
          success_url: `${site}/account.html?member=welcome#membership`,
          cancel_url: `${site}/membership.html?cancelled=1`,
          client_reference_id: `member-${c.id}`,
          ...(c.stripeCustomerId ? { customer: c.stripeCustomerId } : { customer_email: c.email }),
          line_items: [{
            price_data: { currency: catalog.shop.currency, unit_amount: plan.price, recurring: { interval: 'month', interval_count: 1 }, product_data: { name: `${catalog.shop.name} membership: ${plan.name}` } },
            quantity: 1
          }],
          payment_method_collection: 'always',
          metadata: meta,
          subscription_data: { metadata: meta, ...(trialDays ? { trial_period_days: trialDays } : {}) }
        });
        await saveMembership({ ...base, status: 'awaiting-payment', payment: 'card', stripeSession: session.id });
        return json(200, { url: session.url });
      }

      // No card payments yet: the request comes to you on WhatsApp; set it live in the dashboard
      await saveMembership({ ...base, status: 'pending', payment: 'whatsapp' });
      if (trialDays) await markTrialUsed(c.id);
      return json(200, { whatsapp: true, trialDays });
    }

    if (path === 'cancel') {
      if (!existing || existing.status === 'cancelled') throw new Error('You do not have a membership to cancel.');
      let m = existing;
      if (m.stripeSubscription) {
        // Ends at the end of the trial or the month already paid for: no further charges
        const sub = await stripe(`subscriptions/${m.stripeSubscription}`, { cancel_at_period_end: true });
        m = { ...m, cancelAtPeriodEnd: true, periodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : m.periodEnd };
      } else {
        m = { ...m, status: 'cancelled', cancelledAt: new Date().toISOString() };
      }
      await saveMembership(m);
      return json(200, { membership: publicMembership(m, catalog) });
    }
    return json(404, { error: 'Not found.' });
  } catch (err) {
    return json(400, { error: err.message || 'Something went wrong.' });
  }
};

export const config = { path: '/api/membership/*' };
