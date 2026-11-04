// Partner (affiliate) programme: people promote Envie Roses with their own link and
// earn a fixed commission for every delivered order that came through it.
//
//   affiliates/<id>                 the partner, their stats and payout history
//   affiliate-code/<CODE>           -> { id }   (the code in their link: ?aff=CODE)
//   affiliate-key/<hash of key>     -> { id }   (private link to their stats page)

import { createHash, randomBytes } from 'node:crypto';
import { dataStore } from './shop-data.mjs';

const store = () => dataStore();
const now = () => new Date().toISOString();
const t = (v, max) => String(v ?? '').trim().slice(0, max);
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const rand = (n) => Array.from(randomBytes(n), (b) => CHARS[b % CHARS.length]).join('');
const keyHash = (key) => createHash('sha256').update(String(key)).digest('hex');
export const cleanAffCode = (code) => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
const norm = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9@.+]/g, '');
const digits = (v) => String(v || '').replace(/\D/g, '').replace(/^44/, '0');

export const STATUSES = ['pending', 'approved', 'rejected', 'suspended'];

export const getAffiliate = (id) => (/^af[a-z0-9]{6,30}$/.test(String(id)) ? store().get(`affiliates/${id}`, { type: 'json' }) : null);
const put = (a) => store().setJSON(`affiliates/${a.id}`, { ...a, updatedAt: now() });

export async function listAffiliates() {
  const { blobs } = await store().list({ prefix: 'affiliates/' });
  const all = await Promise.all(blobs.map((b) => store().get(b.key, { type: 'json' })));
  return all.filter(Boolean).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function applyAffiliate(body) {
  const a = {
    id: `af${Date.now().toString(36)}${randomBytes(4).toString('hex')}`,
    status: 'pending', createdAt: now(),
    name: t(body.name, 100), email: t(body.email, 120).toLowerCase(), phone: t(body.phone, 30),
    links: t(body.links, 400), audience: t(body.audience, 60), how: t(body.how, 800),
    clicks: 0, orders: 0, pending: 0, earned: 0, paid: 0, ledger: [], payouts: []
  };
  if (!a.name) throw new Error('Please enter your name.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(a.email)) throw new Error('Please enter a valid email address.');
  if (!a.phone) throw new Error('Please enter your phone or WhatsApp number.');
  if (!a.links) throw new Error('Please add a link to your website or social media.');
  if (body.agree !== true) throw new Error('Please accept the partner terms.');
  const existing = (await listAffiliates()).find((x) => x.email === a.email && x.status !== 'rejected');
  if (existing) throw new Error('You have already applied with this email. We will be in touch soon.');
  await put(a);
  return a;
}

// Approving gives the partner a link code and a private key for their stats page
export async function approveAffiliate(a) {
  if (!a.code) {
    const base = (a.name.split(/\s+/)[0] || 'PARTNER').normalize('NFKD').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 8) || 'PARTNER';
    let code;
    do { code = base + rand(3); } while (await store().get(`affiliate-code/${code}`, { type: 'json' }));
    a.code = code;
    await store().setJSON(`affiliate-code/${code}`, { id: a.id });
  }
  let key = null;
  if (!a.keyHash) {
    key = randomBytes(18).toString('base64url');
    a.keyHash = keyHash(key);
    await store().setJSON(`affiliate-key/${a.keyHash}`, { id: a.id });
  }
  a.status = 'approved';
  a.approvedAt = a.approvedAt || now();
  await put(a);
  return { affiliate: a, key };
}

// A fresh private link (the old one stops working)
export async function newAffiliateKey(a) {
  if (a.keyHash) await store().delete(`affiliate-key/${a.keyHash}`);
  const key = randomBytes(18).toString('base64url');
  a.keyHash = keyHash(key);
  await store().setJSON(`affiliate-key/${a.keyHash}`, { id: a.id });
  await put(a);
  return key;
}

export async function updateAffiliate(a, changes) {
  if (changes.status !== undefined) {
    if (!STATUSES.includes(changes.status)) throw new Error('Unknown status.');
    if (changes.status === 'approved') return (await approveAffiliate(a)).affiliate;
    a.status = changes.status;
  }
  if (changes.notes !== undefined) a.notes = t(changes.notes, 500);
  await put(a);
  return a;
}

export async function deleteAffiliate(a) {
  if (a.code) await store().delete(`affiliate-code/${a.code}`);
  if (a.keyHash) await store().delete(`affiliate-key/${a.keyHash}`);
  await store().delete(`affiliates/${a.id}`);
}

export async function findByAffCode(code) {
  const c = cleanAffCode(code);
  if (c.length < 4) return null;
  const ref = await store().get(`affiliate-code/${c}`, { type: 'json' });
  const a = ref ? await getAffiliate(ref.id) : null;
  return a && a.status === 'approved' ? a : null;
}

export async function findByKey(key) {
  if (!/^[\w-]{20,40}$/.test(String(key || ''))) return null;
  const ref = await store().get(`affiliate-key/${keyHash(key)}`, { type: 'json' });
  return ref ? getAffiliate(ref.id) : null;
}

export async function recordClick(code) {
  const a = await findByAffCode(code);
  if (!a) return false;
  a.clicks = (a.clicks || 0) + 1;
  await put(a);
  return true;
}

// What the partner sees on their private stats page
export function publicStats(a, catalog) {
  return {
    name: a.name, code: a.code, status: a.status, approvedAt: a.approvedAt,
    clicks: a.clicks || 0, orders: a.orders || 0, pending: a.pending || 0, earned: a.earned || 0, paid: a.paid || 0,
    balance: (a.earned || 0) - (a.paid || 0),
    commission: catalog.affiliates.commission, minPayout: catalog.affiliates.minPayout, cookieDays: catalog.affiliates.cookieDays,
    recent: (a.ledger || []).slice(-30).reverse().map((x) => ({ at: x.at, order: x.orderId.slice(-4), amount: x.amount, status: x.status })),
    payouts: (a.payouts || []).slice(-20).reverse()
  };
}

// Which partner (if any) gets credit for an order. Partners can't earn from their own orders,
// and gift card purchases don't count.
export async function affiliateForOrder(catalog, code, order) {
  const cfg = catalog.affiliates || {};
  if (!cfg.enabled || !code || order.giftCardOrder) return null;
  const a = await findByAffCode(code);
  if (!a) return null;
  const c = order.customer || {};
  if ((c.email && norm(c.email) === norm(a.email)) || (c.phone && digits(c.phone) && digits(c.phone) === digits(a.phone))) return null;
  return { id: a.id, code: a.code, commission: cfg.commission };
}

// Order saved: counted as pending until delivered
export async function noteAffiliateOrder(order) {
  if (!order.affiliate) return;
  const a = await getAffiliate(order.affiliate.id);
  if (!a) return;
  a.orders = (a.orders || 0) + 1;
  a.pending = (a.pending || 0) + order.affiliate.commission;
  a.ledger = [...(a.ledger || []), { orderId: order.id, at: now(), amount: order.affiliate.commission, status: 'pending' }].slice(-1000);
  await put(a);
}

// Delivered: commission earned. Cancelled: removed (taken back if already earned).
export async function onAffiliateStatus(order, status) {
  if (!order.affiliate) return {};
  const a = await getAffiliate(order.affiliate.id);
  if (!a) return {};
  const entry = (a.ledger || []).find((x) => x.orderId === order.id);
  const amount = order.affiliate.commission;
  const changes = {};
  if (status === 'delivered' && !order.affiliateEarned) {
    if (entry && entry.status === 'pending') a.pending = Math.max(0, (a.pending || 0) - amount);
    a.earned = (a.earned || 0) + amount;
    if (entry) entry.status = 'earned';
    changes.affiliateEarned = true;
  } else if (status === 'cancelled' && !order.affiliateCancelled) {
    if (order.affiliateEarned) a.earned = Math.max(0, (a.earned || 0) - amount);
    else if (entry && entry.status === 'pending') a.pending = Math.max(0, (a.pending || 0) - amount);
    if (entry) entry.status = 'cancelled';
    changes.affiliateCancelled = true;
    changes.affiliateEarned = false;
  } else return {};
  await put(a);
  return changes;
}

export async function recordPayout(a, amount, note) {
  const n = Number(amount);
  if (!Number.isInteger(n) || n <= 0) throw new Error('Enter the amount paid, e.g. 50.00');
  if (n > (a.earned || 0) - (a.paid || 0)) throw new Error('That is more than the partner has earned and not yet been paid.');
  a.paid = (a.paid || 0) + n;
  a.payouts = [...(a.payouts || []), { at: now(), amount: n, note: t(note, 120) }].slice(-200);
  await put(a);
  return a;
}
