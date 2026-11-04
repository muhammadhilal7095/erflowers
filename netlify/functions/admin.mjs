// Dashboard API. Every route except login needs a valid admin token.
//
//   POST   /api/admin/login            { password } -> { token }
//   GET    /api/admin/catalog          -> catalogue
//   PUT    /api/admin/catalog          catalogue -> saved catalogue
//   POST   /api/admin/upload           image body (jpeg/png/webp) -> { url }
//   GET    /api/admin/orders           -> { orders }
//   PATCH  /api/admin/orders/:id       { status } -> order
//   DELETE /api/admin/orders/:id
//   GET    /api/admin/reviews          -> { reviews }
//   PATCH  /api/admin/reviews/:product/:id  { status } -> review
//   DELETE /api/admin/reviews/:product/:id
//   GET    /api/admin/discounts        -> { discounts }
//   PUT    /api/admin/discounts        [codes] -> { discounts }
//   GET    /api/admin/posts            -> { posts } (including drafts)
//   PUT    /api/admin/posts            { post, previousSlug } -> post
//   DELETE /api/admin/posts/:slug
//   GET    /api/admin/customers        -> { customers }
//   PATCH  /api/admin/customers/:id    { points, reason } -> customer   (add or remove points)
//   POST   /api/admin/customers/:id/reset-link -> { link }
//   DELETE /api/admin/customers/:id
//   GET    /api/admin/giftcards        -> { giftcards }
//   POST   /api/admin/giftcards        { amount, note, to, orderId? } -> card
//   PATCH  /api/admin/giftcards/:code  { active?, note? } -> card
//   GET    /api/admin/subscriptions    -> { subscriptions }
//   PATCH  /api/admin/subscriptions/:id { status?, adminNotes? } -> subscription
//   POST   /api/admin/subscriptions/:id/cancel -> subscription (also cancels the Stripe payments)
//   DELETE /api/admin/subscriptions/:id
//
// Needs the environment variable ADMIN_PASSWORD.

import { purgeCache } from '@netlify/functions';
import {
  ORDER_STATUSES, REVIEW_STATUSES, adminConfigured, deleteReview, listReviews, updateReview, checkPassword, deleteOrder, getCatalog, imageStore,
  isAdmin, json, listOrders, getOrder, makeToken, newImageKey, saveCatalog, updateOrder, validOrderId, validateCatalog,
  deletePost, getDiscounts, listPosts, saveDiscounts, savePost, validateDiscounts, validatePost
} from '../lib/shop-data.mjs';
import {
  changePoints, deleteCustomer, deleteSubscription, getCustomer, getGiftCard, getSubscription, issueGiftCard, listCustomers,
  listGiftCards, listSubscriptions, makeResetLink, onOrderStatus, publicCustomer, saveSubscription, stripe, updateGiftCard
} from '../lib/accounts.mjs';

import {
  deleteAffiliate, getAffiliate, listAffiliates, newAffiliateKey, onAffiliateStatus, recordPayout, updateAffiliate, approveAffiliate
} from '../lib/affiliates.mjs';

import { MEMBER_STATUSES, deleteMembership, getMembership, listMemberships, markTrialUsed, saveMembership } from '../lib/membership.mjs';

import { getIntegrations, integrationStatus, saveIntegrations } from '../lib/integrations.mjs';
import { sendEmail, stripeForm } from '../lib/accounts.mjs';

// Calls Stripe with a given key (used to check a key before saving it)
async function stripeWith(key, path, params, method = 'POST') {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params && method !== 'GET' ? stripeForm(params) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.error && data.error.message) || `Stripe said no (${res.status}).`);
  return data;
}
const WEBHOOK_EVENTS = ['checkout.session.completed', 'invoice.paid', 'customer.subscription.updated', 'customer.subscription.deleted'];

const SUB_STATUSES = ['pending', 'awaiting-payment', 'active', 'paused', 'past-due', 'cancelled'];

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE = 5 * 1024 * 1024;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export default async (req) => {
  const path = new URL(req.url).pathname.replace(/^\/api\/admin\/?/, '').replace(/\/$/, '');
  const method = req.method;

  if (path === 'login' && method === 'POST') {
    if (!adminConfigured()) return json(503, { error: 'The dashboard password has not been set up yet. Add ADMIN_PASSWORD in Netlify.' });
    const { password } = await req.json().catch(() => ({}));
    if (!checkPassword(password || '')) {
      await wait(800); // slows down password guessing
      return json(401, { error: 'Incorrect password.' });
    }
    return json(200, { token: makeToken() });
  }

  if (!isAdmin(req)) return json(401, { error: 'Please log in again.' });

  try {
    if (path === 'catalog' && method === 'GET') return json(200, await getCatalog());

    if (path === 'catalog' && method === 'PUT') {
      const clean = validateCatalog(await req.json());
      await saveCatalog(clean);
      // Clear the cached catalogue so every page shows the change straight away
      await purgeCache({ tags: ['catalog'] }).catch((err) => console.warn('Cache purge skipped:', err.message));
      return json(200, clean);
    }

    if (path === 'upload' && method === 'POST') {
      const type = (req.headers.get('content-type') || '').split(';')[0].trim();
      if (!IMAGE_TYPES.includes(type)) return json(400, { error: 'Please upload a JPG, PNG or WebP image.' });
      const data = await req.arrayBuffer();
      if (!data.byteLength) return json(400, { error: 'The image is empty.' });
      if (data.byteLength > MAX_IMAGE) return json(413, { error: 'The image is larger than 5 MB.' });
      const key = newImageKey();
      await imageStore().set(key, data, { metadata: { contentType: type } });
      return json(200, { url: `/api/image/${key}` });
    }

    if (path === 'orders' && method === 'GET') return json(200, { orders: await listOrders() });

    const orderMatch = path.match(/^orders\/([^/]+)$/);
    if (orderMatch) {
      const id = decodeURIComponent(orderMatch[1]);
      if (!validOrderId(id)) return json(400, { error: 'Invalid order reference.' });
      if (method === 'PATCH') {
        const { status } = await req.json().catch(() => ({}));
        if (!ORDER_STATUSES.includes(status)) return json(400, { error: 'Unknown status.' });
        const before = await getOrder(id);
        if (!before) return json(404, { error: 'Order not found.' });
        // Loyalty points and gift card balances follow the status (see onOrderStatus)
        const extra = { ...(await onOrderStatus(await getCatalog(), before, status)), ...(await onAffiliateStatus(before, status)) };
        return json(200, await updateOrder(id, { status, ...extra }));
      }
      if (method === 'DELETE') {
        await deleteOrder(id);
        return json(200, { ok: true });
      }
    }

    if (path === 'discounts' && method === 'GET') return json(200, { discounts: await getDiscounts() });
    if (path === 'discounts' && method === 'PUT') {
      const clean = validateDiscounts(await req.json());
      await saveDiscounts(clean);
      return json(200, { discounts: clean });
    }

    if (path === 'posts' && method === 'GET') return json(200, { posts: await listPosts({ includeDrafts: true }) });
    if (path === 'posts' && method === 'PUT') {
      const { post, previousSlug } = await req.json();
      const clean = validatePost(post || {});
      await savePost(clean, previousSlug && /^[a-z0-9-]{1,80}$/.test(previousSlug) ? previousSlug : null);
      return json(200, clean);
    }
    const postMatch = path.match(/^posts\/([a-z0-9-]{1,80})$/);
    if (postMatch && method === 'DELETE') {
      await deletePost(postMatch[1]);
      return json(200, { ok: true });
    }

    if (path === 'reviews' && method === 'GET') return json(200, { reviews: await listReviews() });

    // ---------- Payments & integrations (Stripe, email) ----------
    if (path === 'integrations' && method === 'GET') {
      const site = process.env.URL || new URL(req.url).origin;
      return json(200, { ...(await integrationStatus()), webhookUrl: `${site}/api/stripe-webhook` });
    }
    if (path === 'integrations' && method === 'PUT') {
      const body = await req.json().catch(() => ({}));
      const changes = {};
      if (body.disconnect === 'stripe') {
        const i = await getIntegrations();
        if (i.stripeWebhookId && i.stripeSecretKey) await stripeWith(i.stripeSecretKey, `webhook_endpoints/${i.stripeWebhookId}`, null, 'DELETE').catch(() => {});
        Object.assign(changes, { stripeSecretKey: null, stripeWebhookSecret: null, stripeWebhookId: null, stripeWebhookUrl: null, stripeAccountName: null });
        // No key any more: switch card payments off so checkout doesn't offer them
        const cat = await getCatalog();
        if (cat.payments.stripe) {
          cat.payments.stripe = false;
          if (!cat.payments.whatsapp) cat.payments.whatsapp = true;
          await saveCatalog(validateCatalog(cat));
        }
      }
      if (body.disconnect === 'email') Object.assign(changes, { resendApiKey: null, emailFrom: null });
      if (body.stripeSecretKey) {
        const key = String(body.stripeSecretKey).trim();
        if (!/^(sk|rk)_(live|test)_[A-Za-z0-9]{10,}$/.test(key)) return json(400, { error: 'That doesn\u2019t look like a Stripe secret key. It starts with sk_live_ (or sk_test_ for testing).' });
        let account;
        try { account = await stripeWith(key, 'account', null, 'GET'); } catch (err) { return json(400, { error: `Stripe didn't accept that key: ${err.message}` }); }
        const name = (account.settings && account.settings.dashboard && account.settings.dashboard.display_name) || (account.business_profile && account.business_profile.name) || account.email || account.id;
        Object.assign(changes, { stripeSecretKey: key, stripeAccountName: String(name || '').slice(0, 80) });
      }
      if (body.stripeWebhookSecret) {
        const wh = String(body.stripeWebhookSecret).trim();
        if (!/^whsec_[A-Za-z0-9+/=]{10,}$/.test(wh)) return json(400, { error: 'A webhook signing secret starts with whsec_.' });
        changes.stripeWebhookSecret = wh;
      }
      if (body.resendApiKey) {
        const rk = String(body.resendApiKey).trim();
        if (!/^re_[A-Za-z0-9_]{10,}$/.test(rk)) return json(400, { error: 'A Resend API key starts with re_.' });
        changes.resendApiKey = rk;
      }
      if (body.emailFrom !== undefined && body.emailFrom !== '') {
        const from = String(body.emailFrom).trim().slice(0, 120);
        if (!/^([^<>]+<)?[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>?$/.test(from)) return json(400, { error: 'Enter the sender like: Envie Roses <hello@yourdomain.co.uk>' });
        changes.emailFrom = from;
      }
      await saveIntegrations(changes);
      return json(200, await integrationStatus());
    }
    if (path === 'integrations/stripe-webhook' && method === 'POST') {
      const i = await getIntegrations();
      const key = i.stripeSecretKey;
      if (!key) return json(400, { error: 'Connect your Stripe key first.' });
      const site = process.env.URL || new URL(req.url).origin;
      if (!/^https:\/\//.test(site) || /localhost|127\.0\.0\.1/.test(site)) {
        return json(400, { error: 'Open the dashboard on your live website (https://…) to connect the webhook. Stripe can\u2019t reach a computer\u2019s local copy.' });
      }
      if (i.stripeWebhookId) await stripeWith(key, `webhook_endpoints/${i.stripeWebhookId}`, null, 'DELETE').catch(() => {});
      const url = `${site}/api/stripe-webhook`;
      const params = { url, description: 'Envie Roses website (orders, Flower Club, membership)' };
      WEBHOOK_EVENTS.forEach((e, n) => { params[`enabled_events[${n}]`] = e; });
      let hook;
      try { hook = await stripeWith(key, 'webhook_endpoints', params); } catch (err) { return json(400, { error: `Stripe couldn't create the webhook: ${err.message}` }); }
      await saveIntegrations({ stripeWebhookSecret: hook.secret, stripeWebhookId: hook.id, stripeWebhookUrl: url });
      return json(200, await integrationStatus());
    }
    if (path === 'integrations/test-email' && method === 'POST') {
      const { to } = await req.json().catch(() => ({}));
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(to || ''))) return json(400, { error: 'Enter an email address to send the test to.' });
      const ok = await sendEmail(String(to), 'Test email from your Envie Roses website', 'Your website can send emails. Password-reset emails will now be sent automatically.');
      return ok ? json(200, { ok: true }) : json(400, { error: 'The email was not sent. Check the API key and that the sender\u2019s domain is verified in Resend.' });
    }

    // ---------- Memberships ----------
    if (path === 'memberships' && method === 'GET') return json(200, { memberships: await listMemberships() });
    const memMatch = path.match(/^memberships\/([a-z0-9]{6,40})(\/cancel)?$/);
    if (memMatch) {
      const [, cid, cancel] = memMatch;
      const m = await getMembership(cid);
      if (!m) return json(404, { error: 'Membership not found.' });
      if (cancel && method === 'POST') {
        // Stops all future charges straight away
        if (m.stripeSubscription && m.status !== 'cancelled') await stripe(`subscriptions/${m.stripeSubscription}`, null, 'DELETE');
        const saved = { ...m, status: 'cancelled', cancelledAt: new Date().toISOString() };
        await saveMembership(saved);
        return json(200, saved);
      }
      if (!cancel && method === 'PATCH') {
        const body = await req.json().catch(() => ({}));
        const changes = {};
        if (body.status !== undefined) {
          if (!MEMBER_STATUSES.includes(body.status)) return json(400, { error: 'Unknown status.' });
          if (m.payment === 'card' && m.stripeSubscription) return json(400, { error: 'Card memberships are updated by Stripe. Use Cancel to end one.' });
          changes.status = body.status;
          if (body.status === 'trialing' && m.trialDays && !m.trialEnd) changes.trialEnd = new Date(Date.now() + m.trialDays * 86400000).toISOString();
          if (body.status === 'trialing') await markTrialUsed(m.customerId);
        }
        if (body.adminNotes !== undefined) changes.adminNotes = String(body.adminNotes).slice(0, 500);
        const saved = { ...m, ...changes };
        await saveMembership(saved);
        return json(200, saved);
      }
      if (!cancel && method === 'DELETE') {
        if (m.stripeSubscription && m.status !== 'cancelled') return json(400, { error: 'Cancel the membership first, so the member stops being charged.' });
        await deleteMembership(cid);
        return json(200, { ok: true });
      }
    }

    // ---------- Partners (affiliates) ----------
    if (path === 'affiliates' && method === 'GET') {
      const affiliates = (await listAffiliates()).map(({ keyHash, ...a }) => ({ ...a, ledger: (a.ledger || []).slice(-50).reverse() }));
      return json(200, { affiliates });
    }
    const affMatch = path.match(/^affiliates\/(af[a-z0-9]{6,30})(\/payout|\/key)?$/);
    if (affMatch) {
      const [, id, action] = affMatch;
      const a = await getAffiliate(id);
      if (!a) return json(404, { error: 'Partner not found.' });
      const site = process.env.URL || new URL(req.url).origin;
      const strip = ({ keyHash, ...rest }) => rest;
      if (!action && method === 'PATCH') {
        const body = await req.json().catch(() => ({}));
        // Approving for the first time also creates their private stats link
        if (body.status === 'approved' && !a.keyHash) {
          const { affiliate, key } = await approveAffiliate(a);
          return json(200, { affiliate: strip(affiliate), statsLink: `${site}/partners.html?key=${key}` });
        }
        return json(200, { affiliate: strip(await updateAffiliate(a, body)) });
      }
      if (action === '/key' && method === 'POST') {
        if (a.status !== 'approved') return json(400, { error: 'Approve the partner first.' });
        return json(200, { statsLink: `${site}/partners.html?key=${await newAffiliateKey(a)}` });
      }
      if (action === '/payout' && method === 'POST') {
        const { amount, note } = await req.json().catch(() => ({}));
        return json(200, { affiliate: strip(await recordPayout(a, amount, note)) });
      }
      if (!action && method === 'DELETE') {
        if ((a.earned || 0) - (a.paid || 0) > 0) return json(400, { error: 'This partner still has unpaid earnings. Record the payout first.' });
        await deleteAffiliate(a);
        return json(200, { ok: true });
      }
    }

    // ---------- Customers ----------
    if (path === 'customers' && method === 'GET') {
      const all = await listCustomers();
      const names = Object.fromEntries(all.map((c) => [c.id, c.name]));
      const customers = all.map((c) => ({ ...publicCustomer(c), orderCount: (c.orders || []).length, stripe: Boolean(c.stripeCustomerId), referredBy: c.referredBy ? names[c.referredBy] || 'a deleted account' : '' }));
      return json(200, { customers });
    }
    const custMatch = path.match(/^customers\/([a-z0-9]{6,40})(\/reset-link)?$/);
    if (custMatch) {
      const [, id, reset] = custMatch;
      const c = await getCustomer(id);
      if (!c) return json(404, { error: 'Customer not found.' });
      if (reset && method === 'POST') {
        const site = process.env.URL || new URL(req.url).origin;
        return json(200, { link: await makeResetLink(c, site) });
      }
      if (!reset && method === 'PATCH') {
        const { points, reason } = await req.json().catch(() => ({}));
        const n = Number(points);
        if (!Number.isInteger(n) || !n || Math.abs(n) > 1000000) return json(400, { error: 'Enter a number of points, e.g. 200 or -200.' });
        const updated = await changePoints(id, n, String(reason || 'Adjusted by Envie Roses').slice(0, 80));
        return json(200, publicCustomer(updated));
      }
      if (!reset && method === 'DELETE') {
        await deleteCustomer(id);
        return json(200, { ok: true });
      }
    }

    // ---------- Gift cards ----------
    if (path === 'giftcards' && method === 'GET') return json(200, { giftcards: await listGiftCards() });
    if (path === 'giftcards' && method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const catalog = await getCatalog();
      let orderId = '';
      if (body.orderId) {
        if (!validOrderId(body.orderId)) return json(400, { error: 'Invalid order reference.' });
        const order = await getOrder(body.orderId);
        if (!order || !order.giftCardOrder) return json(400, { error: 'That order is not a gift card order.' });
        if (order.giftCardIssued) return json(400, { error: `A gift card was already issued for this order (${order.giftCardIssued}).` });
        orderId = order.id;
      }
      const card = await issueGiftCard({ amount: body.amount, months: catalog.giftCards.months, note: body.note, to: body.to, orderId });
      if (orderId) await updateOrder(orderId, { giftCardIssued: card.display });
      return json(200, card);
    }
    const gcMatch = path.match(/^giftcards\/([A-Za-z0-9-]{8,20})$/);
    if (gcMatch && method === 'PATCH') {
      const card = await updateGiftCard(gcMatch[1], await req.json().catch(() => ({})));
      return card ? json(200, card) : json(404, { error: 'Gift card not found.' });
    }

    // ---------- Flower Club subscriptions ----------
    if (path === 'subscriptions' && method === 'GET') return json(200, { subscriptions: await listSubscriptions() });
    const subMatch = path.match(/^subscriptions\/(SUB-[A-Z0-9]{6,20})(\/cancel)?$/);
    if (subMatch) {
      const [, id, cancel] = subMatch;
      const sub = await getSubscription(id);
      if (!sub) return json(404, { error: 'Subscription not found.' });
      if (cancel && method === 'POST') {
        if (sub.stripeSubscription) await stripe(`subscriptions/${sub.stripeSubscription}`, null, 'DELETE');
        const saved = { ...sub, status: 'cancelled' };
        await saveSubscription(saved);
        return json(200, saved);
      }
      if (!cancel && method === 'PATCH') {
        const body = await req.json().catch(() => ({}));
        const changes = {};
        if (body.status !== undefined) {
          if (!SUB_STATUSES.includes(body.status)) return json(400, { error: 'Unknown status.' });
          changes.status = body.status;
        }
        if (body.adminNotes !== undefined) changes.adminNotes = String(body.adminNotes).slice(0, 500);
        const saved = { ...sub, ...changes };
        await saveSubscription(saved);
        return json(200, saved);
      }
      if (!cancel && method === 'DELETE') {
        if (sub.stripeSubscription && !['cancelled'].includes(sub.status)) return json(400, { error: 'Cancel the subscription first, so the customer stops being charged.' });
        await deleteSubscription(id);
        return json(200, { ok: true });
      }
    }

    const reviewMatch = path.match(/^reviews\/([a-z0-9-]{1,60})\/([a-z0-9-]{1,40})$/);
    if (reviewMatch) {
      const [, productId, id] = reviewMatch;
      if (method === 'PATCH') {
        const { status } = await req.json().catch(() => ({}));
        if (!REVIEW_STATUSES.includes(status)) return json(400, { error: 'Unknown status.' });
        const review = await updateReview(productId, id, { status });
        return review ? json(200, review) : json(404, { error: 'Review not found.' });
      }
      if (method === 'DELETE') {
        await deleteReview(productId, id);
        return json(200, { ok: true });
      }
    }

    return json(404, { error: 'Not found.' });
  } catch (err) {
    return json(400, { error: err.message || 'Something went wrong.' });
  }
};

export const config = { path: '/api/admin/*' };
