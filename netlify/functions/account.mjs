// Customer accounts.
//   POST /api/account/register  { name, email, phone, password } -> { token, customer }
//   POST /api/account/login     { email, password } -> { token, customer }
//   GET  /api/account/me        -> { customer, orders, subscriptions, loyalty }
//   PUT  /api/account/me        { name?, phone?, addresses? } -> { customer }
//   POST /api/account/password  { current, password } -> { token }
//   POST /api/account/forgot    { email } -> { ok, emailed }
//   POST /api/account/reset     { token, password } -> { token, customer }
//   POST /api/account/portal    -> { url }  (Stripe page to manage Flower Club card payments)
//   POST /api/account/referral  { code } -> { name, friendAmount, minSpend }

import { getCatalog, getOrder, json } from '../lib/shop-data.mjs';
import {
  changePassword, createCustomer, customerFromRequest, emailConfigured, findCustomerByEmail, listSubscriptions,
  login, makeCustomerToken, makeResetLink, publicCustomer, resetPassword, sendEmail, stripe, updateProfile, cleanEmail,
  ensureReferralCode, findByReferralCode
} from '../lib/accounts.mjs';
import { getMembership, publicMembership } from '../lib/membership.mjs';

const orderSummary = (o) => ({
  id: o.id, createdAt: o.createdAt, status: o.status, payment: o.payment, quick: o.quick || false,
  total: o.total, deliveryFee: o.deliveryFee, discount: o.discount || null, giftCard: o.giftCard || null, points: o.points || null,
  pointsAwarded: o.pointsAwarded || 0, giftCardOrder: o.giftCardOrder || null, referral: o.referral ? { amount: o.referral.amount } : null,
  lines: (o.lines || []).map((l) => ({ name: l.name, label: l.label, qty: l.qty, total: l.total })),
  delivery: o.delivery ? { recipient: o.delivery.recipient, city: o.delivery.city, postcode: o.delivery.postcode, date: o.delivery.date, slot: o.delivery.slot } : {}
});

const subSummary = (s) => ({
  id: s.id, planName: s.planName, price: s.price, frequency: s.frequency, frequencyLabel: s.frequencyLabel, startDate: s.startDate,
  status: s.status, payment: s.payment, cancelAtPeriodEnd: s.cancelAtPeriodEnd || false, createdAt: s.createdAt,
  delivery: { recipient: s.delivery.recipient, city: s.delivery.city, postcode: s.delivery.postcode }
});

export default async (req) => {
  const path = new URL(req.url).pathname.replace(/^\/api\/account\/?/, '').replace(/\/$/, '');
  const method = req.method;
  const body = method === 'GET' ? {} : await req.json().catch(() => ({}));
  const site = process.env.URL || new URL(req.url).origin;

  try {
    const catalog = await getCatalog();
    const loyalty = catalog.loyalty;

    if (path === 'register' && method === 'POST') {
      const c = await createCustomer(body, catalog);
      return json(200, { token: await makeCustomerToken(c), customer: publicCustomer(c) });
    }
    if (path === 'login' && method === 'POST') {
      const c = await login(body.email, body.password);
      return json(200, { token: await makeCustomerToken(c), customer: publicCustomer(c) });
    }
    // Checks a referral code before sign-up, so the page can say whose link it is
    if (path === 'referral' && method === 'POST') {
      const r = catalog.referrals && catalog.referrals.enabled ? await findByReferralCode(body.code) : null;
      if (!r) { await new Promise((ok) => setTimeout(ok, 300)); return json(404, { error: 'That referral code is not valid.' }); }
      return json(200, { name: r.name.split(' ')[0], friendAmount: catalog.referrals.friendAmount, minSpend: catalog.referrals.minSpend });
    }
    if (path === 'forgot' && method === 'POST') {
      // Always the same answer, so nobody can find out which emails have accounts
      const c = await findCustomerByEmail(cleanEmail(body.email));
      if (c && emailConfigured()) {
        const link = await makeResetLink(c, site);
        await sendEmail(c.email, `Reset your ${catalog.shop.name} password`,
          `Hello ${c.name},\n\nUse this link to choose a new password. It works for one hour:\n${link}\n\nIf you didn't ask for this, you can ignore this email.\n\n${catalog.shop.name}`);
      }
      return json(200, { ok: true, emailed: emailConfigured() });
    }
    if (path === 'reset' && method === 'POST') {
      const c = await resetPassword(body.token, body.password);
      return json(200, { token: await makeCustomerToken(c), customer: publicCustomer(c) });
    }

    const c = await customerFromRequest(req);
    if (!c) return json(401, { error: 'Please log in.' });

    if (path === 'me' && method === 'GET') {
      await ensureReferralCode(c);
      const orders = (await Promise.all((c.orders || []).slice(0, 50).map((id) => getOrder(id)))).filter(Boolean).map(orderSummary);
      const subscriptions = (await listSubscriptions(c.id)).map(subSummary);
      const membership = publicMembership(await getMembership(c.id), catalog);
      return json(200, { customer: { ...publicCustomer(c), trialUsed: Boolean(c.membershipTrialUsed) }, membership, orders, subscriptions, loyalty, billing: Boolean(c.stripeCustomerId && process.env.STRIPE_SECRET_KEY) });
    }
    if (path === 'me' && method === 'PUT') {
      return json(200, { customer: publicCustomer(await updateProfile(c, body)) });
    }
    if (path === 'password' && method === 'POST') {
      const updated = await changePassword(c, body.current, body.password);
      return json(200, { token: await makeCustomerToken(updated) });
    }
    if (path === 'portal' && method === 'POST') {
      if (!c.stripeCustomerId) return json(400, { error: 'There are no card payments to manage.' });
      const session = await stripe('billing_portal/sessions', { customer: c.stripeCustomerId, return_url: `${site}/account.html#subscriptions` });
      return json(200, { url: session.url });
    }
    return json(404, { error: 'Not found.' });
  } catch (err) {
    return json(400, { error: err.message || 'Something went wrong.' });
  }
};

export const config = { path: '/api/account/*' };
