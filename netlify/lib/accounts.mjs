// Customer accounts, loyalty points, gift cards and Flower Club subscriptions.
//
// Stored in the same place as orders (Netlify Blobs, MySQL or files):
//   customers/<id>                 the account (password is hashed with scrypt)
//   customer-email/<hash of email> -> { id }
//   giftcards/<CODE>               a gift card and what it has been used on
//   subscriptions/<id>             a Flower Club subscription
//   secrets/customer               random key used to sign customer logins

import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { dataStore } from './shop-data.mjs';

const now = () => new Date().toISOString();
const t = (v, max) => String(v ?? '').trim().slice(0, max);
const emailKey = (email) => `customer-email/${createHash('sha256').update(String(email).trim().toLowerCase()).digest('hex')}`;
export const cleanEmail = (email) => t(email, 120).toLowerCase();
export const validEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);

// ---------- Signing key (made once, kept in storage) ----------
let signingKey = null;
async function key() {
  if (process.env.CUSTOMER_SECRET) return process.env.CUSTOMER_SECRET;
  if (signingKey) return signingKey;
  const store = dataStore();
  let saved = await store.get('secrets/customer', { type: 'json' });
  if (!saved || !saved.key) {
    saved = { key: randomBytes(32).toString('hex'), createdAt: now() };
    await store.setJSON('secrets/customer', saved);
  }
  signingKey = saved.key;
  return signingKey;
}
const hmac = async (value) => createHmac('sha256', await key()).update(String(value)).digest('base64url');
const same = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// ---------- Passwords ----------
function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(String(password), salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}
function verifyPassword(password, stored) {
  const [, salt, hash] = String(stored || '').split('$');
  if (!salt || !hash) return false;
  const test = scryptSync(String(password), Buffer.from(salt, 'base64'), 64, { N: 16384, r: 8, p: 1 });
  return timingSafeEqual(test, Buffer.from(hash, 'base64'));
}
export function checkNewPassword(password) {
  const p = String(password || '');
  if (p.length < 8) throw new Error('Please use a password of at least 8 characters.');
  if (p.length > 200) throw new Error('That password is too long.');
}

// ---------- Customers ----------
const store = () => dataStore();
export const getCustomer = (id) => (/^[a-z0-9]{6,40}$/.test(String(id)) ? store().get(`customers/${id}`, { type: 'json' }) : null);
const putCustomer = (c) => store().setJSON(`customers/${c.id}`, c);
export const saveCustomer = putCustomer;

export async function findCustomerByEmail(email) {
  const ref = await store().get(emailKey(email), { type: 'json' });
  return ref ? getCustomer(ref.id) : null;
}

// What the browser is allowed to see
export function publicCustomer(c) {
  const refs = c.referrals || [];
  return {
    id: c.id, name: c.name, email: c.email, phone: c.phone,
    addresses: c.addresses || [], points: c.points || 0,
    pointsLog: (c.pointsLog || []).slice(-30).reverse(),
    createdAt: c.createdAt,
    referralCode: c.referralCode || '',
    referralCredit: c.referralCredit && !c.referralUsed ? c.referralCredit : null,
    referralMinSpend: c.referralMinSpend || 0,
    referralStats: { joined: refs.length, rewarded: refs.filter((r) => r.rewarded).length }
  };
}

// ---------- Referrals ----------
// Each customer has a code like AMELIA-7K2P. referral/<CODE> -> { id }
const REF_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const cleanReferralCode = (code) => String(code || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 20);

export async function findByReferralCode(code) {
  const clean = cleanReferralCode(code);
  if (!/^[A-Z0-9]{1,10}-[A-Z0-9]{4}$/.test(clean)) return null;
  const ref = await store().get(`referral/${clean}`, { type: 'json' });
  return ref ? getCustomer(ref.id) : null;
}

// Gives the customer a referral code if they don't have one yet (older accounts get one on their next visit)
export async function ensureReferralCode(c) {
  if (c.referralCode) return c;
  const first = String(c.name || '').trim().split(/\s+/)[0] || '';
  const base = first.normalize('NFKD').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 10) || 'ENVIE';
  let code;
  do {
    code = `${base}-${Array.from(randomBytes(4), (b) => REF_CHARS[b % REF_CHARS.length]).join('')}`;
  } while (await store().get(`referral/${code}`, { type: 'json' }));
  await store().setJSON(`referral/${code}`, { id: c.id });
  c.referralCode = code;
  await putCustomer(c);
  return c;
}

export async function createCustomer({ name, email, phone, password, ref }, catalog) {
  const mail = cleanEmail(email);
  if (!t(name, 100)) throw new Error('Please enter your name.');
  if (!validEmail(mail)) throw new Error('Please enter a valid email address.');
  checkNewPassword(password);
  if (await findCustomerByEmail(mail)) throw new Error('An account already exists for that email. Please log in instead.');
  const bonus = catalog.loyalty && catalog.loyalty.enabled ? catalog.loyalty.signupBonus || 0 : 0;
  const c = {
    id: `${Date.now().toString(36)}${randomBytes(5).toString('hex')}`,
    name: t(name, 100), email: mail, phone: t(phone, 30),
    pass: hashPassword(password), v: 1,
    addresses: [], orders: [], points: bonus,
    pointsLog: bonus ? [{ at: now(), change: bonus, reason: 'Welcome bonus' }] : [],
    createdAt: now()
  };

  // Joined through a friend's link: £ off their first order, and the friend is told who joined
  const rf = catalog.referrals || {};
  const referrer = rf.enabled && ref ? await findByReferralCode(ref) : null;
  if (referrer && referrer.email !== mail) {
    c.referredBy = referrer.id;
    c.referralCredit = rf.friendAmount;
    c.referralMinSpend = rf.minSpend;
  }

  await putCustomer(c);
  await store().setJSON(emailKey(mail), { id: c.id });
  if (c.referredBy) {
    referrer.referrals = [...(referrer.referrals || []), { id: c.id, name: c.name.split(' ')[0], at: now(), rewarded: false }].slice(-500);
    await putCustomer(referrer);
  }
  return ensureReferralCode(c);
}

// Works out the friend's first-order discount (not combined with discount codes)
export function referralQuote(catalog, customer, priced) {
  const rf = catalog.referrals || {};
  if (!rf.enabled || !customer || !customer.referralCredit || customer.referralUsed) return null;
  if (priced.discount) return null;
  if ((priced.subtotal || 0) < (customer.referralMinSpend || 0)) return null;
  const amount = Math.min(customer.referralCredit, priced.total);
  return amount > 0 ? { amount, referrerId: customer.referredBy } : null;
}

async function setReferralUsed(customerId, orderId) {
  const c = await getCustomer(customerId);
  if (!c) return;
  if (orderId) c.referralUsed = orderId; else delete c.referralUsed;
  await putCustomer(c);
}
export const markReferralUsed = (customerId, orderId) => setReferralUsed(customerId, orderId);

// The person who shared the link gets their points once the friend's order is delivered
async function rewardReferrer(catalog, order, give) {
  const rf = catalog.referrals || {};
  const r = await getCustomer(order.referral.referrerId);
  if (!r) return 0;
  const entry = (r.referrals || []).find((x) => x.id === order.customerId);
  if (give) {
    const already = (r.referrals || []).filter((x) => x.rewarded).length;
    if (already >= (rf.maxPerCustomer || 0) || (entry && entry.rewarded)) return 0;
    const pts = rf.referrerPoints || 0;
    if (entry) entry.rewarded = true;
    await putCustomer(r);
    if (pts) await changePoints(r.id, pts, `Friend referral: ${entry ? entry.name : 'a friend'}`, order.id);
    return pts;
  }
  if (entry) entry.rewarded = false;
  await putCustomer(r);
  await changePoints(r.id, -order.referralRewarded, 'Friend referral reversed (order cancelled)', order.id);
  return 0;
}

export async function login(email, password) {
  const c = await findCustomerByEmail(cleanEmail(email));
  if (c && c.lockUntil && Date.parse(c.lockUntil) > Date.now()) throw new Error('Too many attempts. Please wait 15 minutes and try again.');
  if (!c || !verifyPassword(password, c.pass)) {
    await new Promise((r) => setTimeout(r, 400));
    if (c) {
      c.fails = (c.fails || 0) + 1;
      if (c.fails >= 8) { c.lockUntil = new Date(Date.now() + 15 * 60000).toISOString(); c.fails = 0; }
      await putCustomer(c);
    }
    throw new Error('That email and password don’t match.');
  }
  if (c.fails || c.lockUntil) { delete c.fails; delete c.lockUntil; await putCustomer(c); }
  return c;
}

// Login token: <id>.<version>.<expiry>.<signature>. Changing the password bumps the version.
export async function makeCustomerToken(c, days = 30) {
  const body = `${c.id}.${c.v || 1}.${Date.now() + days * 86400000}`;
  return `${body}.${await hmac(body)}`;
}

export async function customerFromRequest(req) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [id, v, exp, sig] = parts;
  if (Number(exp) < Date.now() || !same(await hmac(`${id}.${v}.${exp}`), sig)) return null;
  const c = await getCustomer(id);
  return c && String(c.v || 1) === v ? c : null;
}

const cleanAddress = (a) => ({
  label: t(a.label, 40), recipient: t(a.recipient, 100), phone: t(a.phone, 30),
  address1: t(a.address1, 150), address2: t(a.address2, 150), city: t(a.city, 80), postcode: t(a.postcode, 10).toUpperCase()
});

export async function updateProfile(c, body) {
  if (body.name !== undefined) { if (!t(body.name, 100)) throw new Error('Please enter your name.'); c.name = t(body.name, 100); }
  if (body.phone !== undefined) c.phone = t(body.phone, 30);
  if (Array.isArray(body.addresses)) {
    c.addresses = body.addresses.slice(0, 10).map(cleanAddress).filter((a) => a.address1 && a.postcode);
  }
  await putCustomer(c);
  return c;
}

export async function changePassword(c, current, next) {
  if (!verifyPassword(current, c.pass)) throw new Error('Your current password is not correct.');
  checkNewPassword(next);
  c.pass = hashPassword(next);
  c.v = (c.v || 1) + 1; // logs out other devices
  await putCustomer(c);
  return c;
}

// ---------- Password reset ----------
// A one-hour link. Sent by email when RESEND_API_KEY is set; the dashboard can also make one.
export async function makeResetLink(c, site) {
  const raw = randomBytes(24).toString('base64url');
  c.reset = { hash: createHash('sha256').update(raw).digest('hex'), exp: Date.now() + 3600000 };
  await putCustomer(c);
  return `${site}/account.html#reset=${c.id}.${raw}`;
}

export async function resetPassword(token, password) {
  const [id, raw] = String(token || '').split('.');
  const c = id && raw ? await getCustomer(id) : null;
  const hash = raw ? createHash('sha256').update(raw).digest('hex') : '';
  if (!c || !c.reset || c.reset.exp < Date.now() || !same(c.reset.hash, hash)) throw new Error('This reset link has expired. Please ask for a new one.');
  checkNewPassword(password);
  c.pass = hashPassword(password);
  c.v = (c.v || 1) + 1;
  delete c.reset;
  delete c.lockUntil;
  await putCustomer(c);
  return c;
}

export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

export async function sendEmail(to, subject, text) {
  if (!emailConfigured()) return false;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject, text })
  });
  if (!res.ok) console.error('Email not sent', res.status, await res.text().catch(() => ''));
  return res.ok;
}

export async function listCustomers() {
  const { blobs } = await store().list({ prefix: 'customers/' });
  const all = await Promise.all(blobs.map((b) => store().get(b.key, { type: 'json' })));
  return all.filter(Boolean).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function deleteCustomer(id) {
  const c = await getCustomer(id);
  if (!c) return;
  await store().delete(emailKey(c.email));
  await store().delete(`customers/${id}`);
}

export async function linkOrder(customerId, orderId) {
  const c = await getCustomer(customerId);
  if (!c) return;
  c.orders = [orderId, ...(c.orders || []).filter((x) => x !== orderId)].slice(0, 200);
  await putCustomer(c);
}

// ---------- Loyalty points ----------
export async function changePoints(customerId, change, reason, orderId) {
  const c = await getCustomer(customerId);
  if (!c || !change) return c;
  c.points = Math.max(0, (c.points || 0) + change);
  c.pointsLog = [...(c.pointsLog || []), { at: now(), change, reason, ...(orderId ? { orderId } : {}) }].slice(-200);
  await putCustomer(c);
  return c;
}

// Works out how many points can go towards this order (all whole points, never below zero)
export function pointsQuote(catalog, customer, amountDue) {
  const ly = catalog.loyalty || {};
  const balance = customer ? customer.points || 0 : 0;
  if (!ly.enabled || !customer) return { usable: 0, amount: 0, balance };
  const cap = Math.floor((amountDue * (ly.maxPercent || 0)) / 100 / ly.pointValue);
  const usable = Math.min(balance, cap);
  if (usable < (ly.minRedeem || 0) || usable <= 0) return { usable: 0, amount: 0, balance };
  return { usable, amount: usable * ly.pointValue, balance };
}

export const pointsEarned = (catalog, order) => {
  const ly = catalog.loyalty || {};
  if (!ly.enabled || !order.customerId || order.giftCardOrder) return 0;
  const spent = (order.subtotal || 0) - ((order.discount && order.discount.amount) || 0);
  return Math.max(0, Math.floor((spent / 100) * (ly.pointsPerPound || 0)));
};

// ---------- Gift cards ----------
const GC_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const cleanGiftCode = (code) => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const gcKey = (code) => `giftcards/${cleanGiftCode(code)}`;
const prettyCode = (c) => `${c.slice(0, 2)}-${c.slice(2, 6)}-${c.slice(6, 10)}`;

export async function getGiftCard(code) {
  const c = cleanGiftCode(code);
  if (!/^GC[A-Z0-9]{8}$/.test(c)) return null;
  return store().get(gcKey(c), { type: 'json' });
}

export async function issueGiftCard({ amount, months = 24, note = '', orderId = '', to = '' }) {
  const value = Number(amount);
  if (!Number.isInteger(value) || value < 100 || value > 1000000) throw new Error('Enter a gift card amount between £1 and £10,000.');
  let code;
  do {
    code = 'GC' + Array.from(randomBytes(8), (b) => GC_CHARS[b % GC_CHARS.length]).join('');
  } while (await store().get(gcKey(code), { type: 'json' }));
  const expires = new Date();
  expires.setMonth(expires.getMonth() + Number(months || 24));
  const card = {
    code, display: prettyCode(code), initial: value, balance: value, active: true,
    createdAt: now(), expiresAt: expires.toISOString(), note: t(note, 120), to: t(to, 100),
    ...(orderId ? { orderId } : {}), uses: []
  };
  await store().setJSON(gcKey(code), card);
  return card;
}

export function giftCardProblem(card) {
  if (!card || !card.active) return 'That gift card code is not valid.';
  if (card.expiresAt && Date.parse(card.expiresAt) < Date.now()) return 'That gift card has expired.';
  if (card.balance <= 0) return 'That gift card has no balance left.';
  return '';
}

// Takes up to `amount` from the card; returns what was actually taken
export async function useGiftCard(code, amount, orderId) {
  const card = await getGiftCard(code);
  if (giftCardProblem(card)) throw new Error(giftCardProblem(card));
  const take = Math.min(card.balance, amount);
  card.balance -= take;
  card.uses = [...(card.uses || []), { orderId, amount: take, at: now() }].slice(-100);
  await store().setJSON(gcKey(card.code), card);
  return take;
}

export async function refundGiftCard(code, amount, orderId) {
  const card = await getGiftCard(code);
  if (!card || !amount) return;
  card.balance = Math.min(card.initial, card.balance + amount);
  card.uses = [...(card.uses || []), { orderId, amount: -amount, at: now(), refund: true }];
  await store().setJSON(gcKey(card.code), card);
}

export async function listGiftCards() {
  const { blobs } = await store().list({ prefix: 'giftcards/' });
  const all = await Promise.all(blobs.map((b) => store().get(b.key, { type: 'json' })));
  return all.filter(Boolean).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function updateGiftCard(code, changes) {
  const card = await getGiftCard(code);
  if (!card) return null;
  if (changes.active !== undefined) card.active = changes.active === true;
  if (changes.note !== undefined) card.note = t(changes.note, 120);
  await store().setJSON(gcKey(card.code), card);
  return card;
}

// ---------- Flower Club subscriptions ----------
export const FREQUENCIES = {
  weekly: { label: 'Every week', interval: 'week', count: 1 },
  fortnightly: { label: 'Every 2 weeks', interval: 'week', count: 2 },
  monthly: { label: 'Every month', interval: 'month', count: 1 }
};

export const newSubscriptionId = () => `SUB-${Date.now().toString(36).toUpperCase()}${randomBytes(2).toString('hex').toUpperCase()}`;
export const getSubscription = (id) => (/^SUB-[A-Z0-9]{6,20}$/.test(String(id)) ? store().get(`subscriptions/${id}`, { type: 'json' }) : null);
export const saveSubscription = (s) => store().setJSON(`subscriptions/${s.id}`, { ...s, updatedAt: now() });

export async function listSubscriptions(customerId) {
  const { blobs } = await store().list({ prefix: 'subscriptions/' });
  const all = (await Promise.all(blobs.map((b) => store().get(b.key, { type: 'json' })))).filter(Boolean);
  return all.filter((s) => !customerId || s.customerId === customerId).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function deleteSubscription(id) {
  await store().delete(`subscriptions/${id}`);
}

// ---------- Stripe ----------
export function stripeForm(obj, prefix, out = []) {
  for (const [k, value] of Object.entries(obj)) {
    if (value === undefined || value === null || value === '') continue;
    const name = prefix ? `${prefix}[${k}]` : k;
    if (typeof value === 'object') stripeForm(value, name, out);
    else out.push(`${encodeURIComponent(name)}=${encodeURIComponent(value)}`);
  }
  return out.join('&');
}

export async function stripe(path, params, method = 'POST') {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error('Card payments are not set up yet.');
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params && method !== 'GET' ? stripeForm(params) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('Stripe error', path, data.error);
    throw new Error((data.error && data.error.message) || 'The payment provider did not respond.');
  }
  return data;
}

// Checks the Stripe-Signature header (https://docs.stripe.com/webhooks#verify-manually)
export function verifyStripeSignature(raw, header, secret, toleranceSec = 300) {
  const parts = Object.fromEntries(String(header || '').split(',').map((x) => x.split('=')).filter((x) => x.length === 2).map(([k, v]) => [k, v]));
  const sigs = String(header || '').split(',').filter((x) => x.startsWith('v1=')).map((x) => x.slice(3));
  if (!parts.t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > toleranceSec) return false;
  const expected = createHmac('sha256', secret).update(`${parts.t}.${raw}`).digest('hex');
  return sigs.some((s) => same(s, expected));
}

// ---------- When an order's status changes in the dashboard ----------
// Delivered: add loyalty points. Cancelled: give back points and gift card balance used, and remove points earned.
export async function onOrderStatus(catalog, order, status) {
  const changes = {};
  if (status === 'delivered' && order.customerId && !order.pointsAwarded) {
    const pts = pointsEarned(catalog, order);
    if (pts) await changePoints(order.customerId, pts, `Order ${order.id}`, order.id);
    changes.pointsAwarded = pts;
  }
  if (status === 'delivered' && order.referral && order.referral.referrerId && !order.referralRewarded) {
    changes.referralRewarded = await rewardReferrer(catalog, order, true);
  }
  if (status === 'cancelled') {
    if (order.referral && order.customerId && !order.referralReturned) {
      await setReferralUsed(order.customerId, null); // the friend can use their discount again
      changes.referralReturned = true;
    }
    if (order.referral && order.referralRewarded) {
      changes.referralRewarded = await rewardReferrer(catalog, order, false);
    }
    if (order.customerId && order.points && order.points.used && !order.pointsReturned) {
      await changePoints(order.customerId, order.points.used, `Points returned (order ${order.id} cancelled)`, order.id);
      changes.pointsReturned = true;
    }
    if (order.customerId && order.pointsAwarded) {
      await changePoints(order.customerId, -order.pointsAwarded, `Order ${order.id} cancelled`, order.id);
      changes.pointsAwarded = 0;
    }
    if (order.giftCard && order.giftCard.amount && !order.giftCardReturned) {
      await refundGiftCard(order.giftCard.code, order.giftCard.amount, order.id);
      changes.giftCardReturned = true;
    }
  }
  return changes;
}
