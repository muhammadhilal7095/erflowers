// Shared server code for the Envie Roses dashboard, catalogue and orders.
// Data lives in Netlify Blobs on Netlify; when run by server.js on a Node.js
// host it lives in a MySQL database or in files. js/catalog.js holds the starting defaults.

import { getStore } from '@netlify/blobs';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import DEFAULTS from '../../js/catalog.js';
import RULES from '../../js/rules.js';
import { DEFAULT_POSTS } from './default-posts.mjs';
import { getFileStore } from './file-store.mjs';
import { getMysqlStore } from './mysql-store.mjs';

// Netlify -> Netlify Blobs. server.js sets ENVIE_STORAGE to 'mysql' (database
// details given) or 'file' (saved in DATA_DIR).
const mode = process.env.ENVIE_STORAGE;
const store = (name) =>
  mode === 'mysql' ? getMysqlStore(name) : mode === 'file' ? getFileStore(name) : getStore({ name, consistency: 'strong' });
export const dataStore = () => store('envie');
export const imageStore = () => store('envie-images');

export const CATEGORIES = ['boxes', 'bouquets', 'exclusive'];
export const IMAGE_KEYS = ['hero', 'blueBanner', 'bespoke', 'about', 'pageHero', 'insta1', 'insta2', 'insta3', 'insta4', 'insta5'];
export const ORDER_STATUSES = ['new', 'awaiting-payment', 'confirmed', 'paid', 'out-for-delivery', 'delivered', 'cancelled'];

export function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });
}

// ---------- Catalogue ----------

// On a Node.js host (one long-running server) the catalogue is kept in memory, so
// pages never wait on the database; saving in the dashboard updates it at once.
// Netlify runs many short-lived copies, so it always reads fresh (its CDN caches instead).
const keepInMemory = mode === 'mysql' || mode === 'file';
const MEMORY_MS = 60 * 1000;
let memory = null;
let memoryAt = 0;

const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms))]);

function withDefaults(saved) {
  if (!saved) return structuredClone(DEFAULTS);
  return {
    shop: { ...DEFAULTS.shop, ...saved.shop },
    legal: { ...DEFAULTS.legal, ...saved.legal },
    social: { ...DEFAULTS.social, ...saved.social },
    payments: { ...DEFAULTS.payments, ...saved.payments },
    images: { ...DEFAULTS.images, ...saved.images },
    delivery: { ...DEFAULTS.delivery, ...saved.delivery },
    addons: saved.addons || DEFAULTS.addons,
    cities: saved.cities || DEFAULTS.cities,
    loyalty: { ...DEFAULTS.loyalty, ...saved.loyalty },
    referrals: { ...DEFAULTS.referrals, ...saved.referrals },
    popup: { ...DEFAULTS.popup, ...saved.popup },
    affiliates: { ...DEFAULTS.affiliates, ...saved.affiliates },
    club: saved.club ? { ...DEFAULTS.club, ...saved.club } : structuredClone(DEFAULTS.club),
    giftCards: { ...DEFAULTS.giftCards, ...saved.giftCards },
    products: saved.products || {}
  };
}

export async function getCatalog() {
  if (keepInMemory && memory && Date.now() - memoryAt < MEMORY_MS) return structuredClone(memory);
  try {
    const saved = await withTimeout(dataStore().get('catalog', { type: 'json' }), 4000);
    const catalog = withDefaults(saved);
    if (keepInMemory) { memory = catalog; memoryAt = Date.now(); }
    return structuredClone(catalog);
  } catch (err) {
    console.error('Could not read catalogue, using', memory ? 'the last saved copy' : 'the starting products', '-', err.message);
    if (!keepInMemory) return structuredClone(DEFAULTS);
    // Serve the last good copy (or the starting products) and try the database again in 15 seconds
    if (!memory) memory = structuredClone(DEFAULTS);
    memoryAt = Date.now() - MEMORY_MS + 15000;
    return structuredClone(memory);
  }
}

export async function saveCatalog(catalog) {
  await dataStore().setJSON('catalog', catalog);
  if (keepInMemory) { memory = structuredClone(catalog); memoryAt = Date.now(); }
}

const str = (value, max, field, { required = false } = {}) => {
  const v = typeof value === 'string' ? value.trim() : '';
  if (required && !v) throw new Error(`${field} is required.`);
  if (v.length > max) throw new Error(`${field} must be ${max} characters or fewer.`);
  return v;
};
const int = (value, min, max, field) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${field} must be a whole number between ${min} and ${max}.`);
  return n;
};
const imagePath = (value, field) => {
  const v = str(value, 200, field);
  if (v && !/^(images\/[\w.-]+|\/api\/image\/[\w-]+)$/.test(v)) throw new Error(`${field} is not a valid image.`);
  return v;
};
const httpsUrl = (value, field) => {
  const v = str(value, 300, field);
  if (v && !/^https:\/\/[^\s"'<>]+$/.test(v)) throw new Error(`${field} must start with https://`);
  return v;
};

const tagList = (value, allowed, field) =>
  [...new Set((Array.isArray(value) ? value : []).filter((t) => Object.prototype.hasOwnProperty.call(allowed, t)))].slice(0, 20);
const areaList = (value, field) =>
  [...new Set((Array.isArray(value) ? value : String(value || '').split(/[\s,]+/)).map((a) => String(a).toUpperCase().trim()).filter(Boolean))]
    .map((a) => { if (!/^[A-Z]{1,2}(\d[A-Z\d]?)?$/.test(a)) throw new Error(`"${a}" in ${field} is not a postcode area like SW or KW15.`); return a; })
    .slice(0, 300);
const pence = (value, field, { nullable = false } = {}) =>
  nullable && (value === null || value === '' || value === undefined) ? null : int(value, 0, 10000000, field);

// Checks everything the dashboard saves and returns a clean copy
export function validateCatalog(input) {
  if (!input || typeof input !== 'object') throw new Error('Invalid data.');
  const s = input.shop || {};
  const whatsapp = str(s.whatsapp, 15, 'WhatsApp number', { required: true });
  if (!/^\d{8,15}$/.test(whatsapp)) throw new Error('WhatsApp number must be digits only in international format, e.g. 447464418817.');
  const email = str(s.email, 120, 'Email', { required: true });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Email address is not valid.');

  const shop = {
    name: str(s.name, 80, 'Shop name', { required: true }),
    currency: 'gbp',
    phone: str(s.phone, 30, 'Phone', { required: true }),
    whatsapp,
    email,
    location: str(s.location, 100, 'Location'),
    hours: str(s.hours, 120, 'Opening hours'),
    deliveryFee: s.deliveryFee === null || s.deliveryFee === '' || s.deliveryFee === undefined ? null : int(s.deliveryFee, 0, 100000, 'Delivery fee'),
    minDeliveryDays: int(s.minDeliveryDays, 0, 14, 'Earliest delivery')
  };

  const l = input.legal || {};
  const legal = {
    companyName: str(l.companyName, 120, 'Company name'),
    companyNumber: str(l.companyNumber, 20, 'Company number'),
    registeredIn: str(l.registeredIn, 60, 'Registered in') || 'England and Wales',
    registeredAddress: str(l.registeredAddress, 200, 'Registered address'),
    vatNumber: str(l.vatNumber, 20, 'VAT number'),
    updated: str(l.updated, 40, 'Policies updated date')
  };

  const so = input.social || {};
  const social = {
    instagram: httpsUrl(so.instagram, 'Instagram link'),
    facebook: httpsUrl(so.facebook, 'Facebook link'),
    tiktok: httpsUrl(so.tiktok, 'TikTok link'),
    pinterest: httpsUrl(so.pinterest, 'Pinterest link')
  };

  const p = input.payments || {};
  const payments = { stripe: p.stripe === true, whatsapp: p.whatsapp !== false };
  if (!payments.stripe && !payments.whatsapp) throw new Error('At least one payment method must be switched on.');

  const dv = input.delivery || {};
  const cutoff = str(dv.sameDayCutoff, 5, 'Same-day cut-off time') || '14:00';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(cutoff)) throw new Error('Same-day cut-off must be a time like 14:00.');
  const delivery = {
    sameDayEnabled: dv.sameDayEnabled === true,
    sameDayCutoff: cutoff,
    sameDayFee: pence(dv.sameDayFee, 'Same-day delivery charge', { nullable: true }),
    sameDayAreas: areaList(dv.sameDayAreas, 'same-day areas'),
    slots: (Array.isArray(dv.slots) ? dv.slots : []).map((x, i) => str(x, 60, `Delivery slot ${i + 1}`)).filter(Boolean).slice(0, 8),
    noDeliveryAreas: areaList(dv.noDeliveryAreas, 'areas we cannot deliver to online'),
    closedDates: [...new Set((Array.isArray(dv.closedDates) ? dv.closedDates : []).map((x) => String(x).trim()).filter(Boolean))]
      .map((x) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(x)) throw new Error(`Closed date "${x}" must look like 2026-12-25.`); return x; }).sort().slice(0, 100)
  };

  const addonsIn = input.addons && typeof input.addons === 'object' ? input.addons : {};
  if (Object.keys(addonsIn).length > 40) throw new Error('Too many gift add-ons (maximum 40).');
  const addons = {};
  for (const [id, a] of Object.entries(addonsIn)) {
    if (!/^[a-z0-9-]{1,60}$/.test(id)) throw new Error(`Add-on ID "${id}" is not valid.`);
    const name = str(a.name, 60, 'Add-on name', { required: true });
    addons[id] = {
      name,
      price: int(a.price, 0, 1000000, `Price for "${name}"`),
      icon: ['vase', 'chocolate', 'teddy', 'balloon', 'candle', 'gift'].includes(a.icon) ? a.icon : 'gift',
      image: imagePath(a.image, `Photo for "${name}"`),
      description: str(a.description, 200, `Description for "${name}"`),
      active: a.active !== false
    };
  }

  const cities = [...new Set((Array.isArray(input.cities) ? input.cities : []).map((c) => str(c, 40, 'City name')).filter(Boolean))].slice(0, 60);

  const im = input.images || {};
  const images = {};
  for (const key of IMAGE_KEYS) images[key] = imagePath(im[key], `Site image (${key})`);

  const productsIn = input.products && typeof input.products === 'object' ? input.products : {};
  const ids = Object.keys(productsIn);
  if (ids.length > 200) throw new Error('Too many products (maximum 200).');
  const products = {};
  for (const id of ids) {
    if (!/^[a-z0-9-]{1,60}$/.test(id)) throw new Error(`Product ID "${id}" is not valid.`);
    const pr = productsIn[id] || {};
    const name = str(pr.name, 120, 'Product name', { required: true });
    if (!CATEGORIES.includes(pr.category)) throw new Error(`Choose a category for "${name}".`);
    const enquire = pr.enquire === true;
    const options = [];
    const seen = new Set();
    for (const o of Array.isArray(pr.options) ? pr.options.slice(0, 10) : []) {
      const label = str(o.label, 40, `Size name for "${name}"`, { required: true });
      const oid = (str(o.id, 40, 'Size ID') || label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'size';
      if (seen.has(oid)) throw new Error(`"${name}" has two sizes with the same name.`);
      seen.add(oid);
      const note = str(o.note, 60, `Size note for "${name}" (${label})`);
      options.push({ id: oid, label, price: int(o.price, 1, 10000000, `Price for "${name}" (${label})`), ...(note ? { note } : {}) });
    }
    if (!enquire && !options.length) throw new Error(`"${name}" needs at least one size and price, or set it to price on request.`);
    const gallery = (Array.isArray(pr.gallery) ? pr.gallery : []).slice(0, 8).map((g) => imagePath(g, `Gallery photo for "${name}"`)).filter(Boolean);
    let sale = null;
    if (pr.sale && !enquire) {
      const percent = int(pr.sale.percent, 1, 90, `Offer discount for "${name}"`);
      const ends = Date.parse(pr.sale.endsAt);
      if (!Number.isFinite(ends)) throw new Error(`Choose when the offer for "${name}" ends.`);
      sale = { percent, label: str(pr.sale.label, 40, `Offer name for "${name}"`) || 'Special Offer', endsAt: new Date(ends).toISOString() };
    }
    products[id] = {
      ...(pr.featured === true ? { featured: true } : {}),
      name,
      category: pr.category,
      image: imagePath(pr.image, `Image for "${name}"`) || 'images/product-1.jpg',
      description: str(pr.description, 600, `Description for "${name}"`),
      details: str(pr.details, 3000, `Details for "${name}"`),
      recipe: str(pr.recipe, 1000, `Recipe for "${name}"`),
      colours: tagList(pr.colours, RULES.TAGS.colours),
      flowers: tagList(pr.flowers, RULES.TAGS.flowers),
      occasions: tagList(pr.occasions, RULES.TAGS.occasions),
      recipients: tagList(pr.recipients, RULES.TAGS.recipients),
      gallery,
      ...(sale ? { sale } : {}),
      ...(enquire ? { enquire: true } : {}),
      options: enquire ? [] : options
    };
  }

  const ly = input.loyalty || {};
  const loyalty = {
    enabled: ly.enabled === true,
    pointsPerPound: int(ly.pointsPerPound ?? 1, 0, 100, 'Points per £1'),
    pointValue: int(ly.pointValue ?? 1, 1, 100, 'Value of a point'),
    minRedeem: int(ly.minRedeem ?? 0, 0, 1000000, 'Smallest number of points to use'),
    maxPercent: int(ly.maxPercent ?? 50, 1, 100, 'Most of an order points can pay for'),
    signupBonus: int(ly.signupBonus ?? 0, 0, 100000, 'Welcome points')
  };

  const rf = input.referrals || {};
  const referrals = {
    enabled: rf.enabled === true,
    friendAmount: int(rf.friendAmount ?? 1000, 100, 100000, "Friend's discount"),
    minSpend: int(rf.minSpend ?? 0, 0, 1000000, 'Minimum first order'),
    referrerPoints: int(rf.referrerPoints ?? 0, 0, 100000, 'Points for referring'),
    maxPerCustomer: int(rf.maxPerCustomer ?? 50, 1, 1000, 'Most rewards per customer')
  };

  const af = input.affiliates || {};
  const affiliates = {
    enabled: af.enabled === true,
    commission: int(af.commission ?? 1000, 100, 100000, 'Partner commission'),
    cookieDays: int(af.cookieDays ?? 30, 1, 90, 'Partner link lasts (days)'),
    minPayout: int(af.minPayout ?? 5000, 0, 1000000, 'Minimum payout')
  };

  const pu = input.popup || {};
  const popup = {
    enabled: pu.enabled === true,
    delay: int(pu.delay ?? 0, 0, 120, 'Popup delay (seconds)'),
    pages: pu.pages === 'home' ? 'home' : 'all',
    everyDays: int(pu.everyDays ?? 0, 0, 60, 'Show the popup again after (days)')
  };

  const cl = input.club || {};
  const FREQ = ['weekly', 'fortnightly', 'monthly'];
  const frequencies = (Array.isArray(cl.frequencies) ? cl.frequencies : FREQ).filter((f) => FREQ.includes(f));
  const plansIn = cl.plans && typeof cl.plans === 'object' ? cl.plans : {};
  if (Object.keys(plansIn).length > 12) throw new Error('Too many Flower Club plans (maximum 12).');
  const plans = {};
  for (const [id, pl] of Object.entries(plansIn)) {
    if (!/^[a-z0-9-]{1,60}$/.test(id)) throw new Error(`Plan ID "${id}" is not valid.`);
    const name = str(pl.name, 60, 'Plan name', { required: true });
    plans[id] = {
      name,
      description: str(pl.description, 300, `Description for "${name}"`),
      image: imagePath(pl.image, `Photo for "${name}"`),
      price: int(pl.price, 100, 1000000, `Price for "${name}"`),
      active: pl.active !== false
    };
  }
  const club = { enabled: cl.enabled === true, frequencies: frequencies.length ? frequencies : FREQ, plans };

  const gc = input.giftCards || {};
  const giftCards = {
    enabled: gc.enabled === true,
    amounts: [...new Set((Array.isArray(gc.amounts) ? gc.amounts : []).map((a) => int(a, 500, 100000, 'Gift card amount')))].sort((a, b) => a - b).slice(0, 10),
    months: int(gc.months ?? 24, 12, 120, 'Gift card validity (months)')
  };
  if (giftCards.enabled && !giftCards.amounts.length) throw new Error('Add at least one gift card amount.');

  return { shop, legal, social, payments, delivery, addons, cities, loyalty, referrals, club, giftCards, popup, affiliates, images, products };
}

// ---------- Orders ----------

export const unitPrice = RULES.unitPrice;

// Prices an order from the live catalogue. items: { productId, optionId, qty } or { addonId, qty }.
// delivery: { postcode, date } checks same-day rules and sets the fee; omit for WhatsApp quick orders.
export function priceOrder(catalog, items, { delivery = null, discount = null } = {}) {
  if (!Array.isArray(items) || !items.length || items.length > 30) throw new Error('Your bag is empty.');
  const lines = [];
  for (const item of items) {
    const qty = Number(item.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 20) throw new Error('One of the items in your bag is no longer available.');
    if (item.addonId) {
      const addon = (catalog.addons || {})[item.addonId];
      if (!addon || addon.active === false) throw new Error('One of the gifts in your bag is no longer available.');
      lines.push({ addonId: item.addonId, name: addon.name, label: 'Gift', price: addon.price, qty, total: addon.price * qty });
      continue;
    }
    const product = catalog.products[item.productId];
    const option = product && !product.enquire && product.options.find((o) => o.id === item.optionId);
    if (!option) throw new Error('One of the items in your bag is no longer available.');
    const price = unitPrice(product, option);
    lines.push({ productId: item.productId, optionId: option.id, name: product.name, label: option.label, price, qty, total: price * qty });
  }
  if (!lines.some((l) => l.productId)) throw new Error('Please add some flowers to go with your gifts.');
  const subtotal = lines.reduce((n, l) => n + l.total, 0);

  let deliveryFee = typeof catalog.shop.deliveryFee === 'number' ? catalog.shop.deliveryFee : null;
  let sameDay = false;
  if (delivery) {
    const quote = RULES.deliveryQuote(catalog, { postcode: delivery.postcode, date: delivery.date });
    if (!quote.ok) throw new Error(quote.error);
    deliveryFee = quote.fee;
    sameDay = Boolean(quote.sameDay);
  }

  let discountInfo = null;
  if (discount) {
    const result = RULES.applyDiscount(discount, subtotal, deliveryFee);
    if (!result.ok) throw new Error(result.error);
    discountInfo = { code: result.code, label: result.label, amount: result.amount };
  }
  const total = Math.max(0, subtotal + (deliveryFee || 0) - (discountInfo ? discountInfo.amount : 0));
  return { lines, subtotal, deliveryFee, sameDay, discount: discountInfo, total };
}

export function cleanOrderDetails(body) {
  const c = body.customer || {};
  const d = body.delivery || {};
  const t = (v, max) => String(v || '').trim().slice(0, max);
  const order = {
    customer: { name: t(c.name, 100), phone: t(c.phone, 30), email: t(c.email, 120) },
    delivery: {
      recipient: t(d.recipient, 100), phone: t(d.phone, 30),
      address1: t(d.address1, 150), address2: t(d.address2, 150), city: t(d.city, 80),
      postcode: t(d.postcode, 10).toUpperCase(), date: t(d.date, 10), slot: t(d.slot, 60)
    },
    message: t(body.message, 250),
    notes: t(body.notes, 200)
  };
  if (!order.customer.name || !order.customer.phone || !order.delivery.recipient || !order.delivery.address1 || !order.delivery.postcode) {
    throw new Error('Please complete your details and the delivery address.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(order.delivery.date)) throw new Error('Please choose a delivery date.');
  return order;
}

export const validOrderId = (id) => /^ER-\d{6}-[A-Z0-9]{4}$/.test(String(id));

export async function saveOrder(order) {
  const store = dataStore();
  const key = `orders/${order.id}`;
  const existing = await store.get(key, { type: 'json' });
  if (existing) return existing; // the same order sent twice
  await store.setJSON(key, order);
  return order;
}

export async function getOrder(id) {
  return dataStore().get(`orders/${id}`, { type: 'json' });
}

export async function updateOrder(id, changes) {
  const order = await getOrder(id);
  if (!order) return null;
  const updated = { ...order, ...changes, updatedAt: new Date().toISOString() };
  await dataStore().setJSON(`orders/${id}`, updated);
  return updated;
}

export async function deleteOrder(id) {
  await dataStore().delete(`orders/${id}`);
}

export async function listOrders(limit = 300) {
  const store = dataStore();
  const { blobs } = await store.list({ prefix: 'orders/' });
  const keys = blobs.map((b) => b.key).sort().reverse().slice(0, limit);
  const orders = await Promise.all(keys.map((k) => store.get(k, { type: 'json' })));
  return orders.filter(Boolean).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

// ---------- Dashboard login ----------

const secret = () => process.env.ADMIN_SECRET || `envie-admin:${process.env.ADMIN_PASSWORD || ''}`;
const sign = (value) => createHmac('sha256', secret()).update(String(value)).digest('base64url');
const sha = (value) => createHash('sha256').update(String(value)).digest();

export const adminConfigured = () => Boolean(process.env.ADMIN_PASSWORD);

export function checkPassword(password) {
  if (!adminConfigured()) return false;
  return timingSafeEqual(sha(password), sha(process.env.ADMIN_PASSWORD));
}

export function makeToken(hours = 12) {
  const exp = Date.now() + hours * 3600 * 1000;
  return `${exp}.${sign(exp)}`;
}

export function isAdmin(req) {
  if (!adminConfigured()) return false;
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const [exp, sig] = token.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const expected = sign(exp);
  return expected.length === sig.length && timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}

export const newImageKey = () => `${Date.now().toString(36)}-${randomBytes(5).toString('hex')}`;

// ---------- Reviews ----------
// Stored as reviews/<productId>/<reviewId>. New reviews wait for approval in the dashboard.

export const REVIEW_STATUSES = ['pending', 'approved', 'rejected'];

export async function addReview(review) {
  await dataStore().setJSON(`reviews/${review.productId}/${review.id}`, review);
}

export async function listReviews(productId) {
  const store = dataStore();
  const { blobs } = await store.list({ prefix: productId ? `reviews/${productId}/` : 'reviews/' });
  const reviews = await Promise.all(blobs.map((b) => store.get(b.key, { type: 'json' })));
  return reviews.filter(Boolean).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function updateReview(productId, id, changes) {
  const key = `reviews/${productId}/${id}`;
  const review = await dataStore().get(key, { type: 'json' });
  if (!review) return null;
  const updated = { ...review, ...changes };
  await dataStore().setJSON(key, updated);
  return updated;
}

export async function deleteReview(productId, id) {
  await dataStore().delete(`reviews/${productId}/${id}`);
}

export const newReviewId = () => `${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;

// ---------- Discount codes (server only: never sent to the browser in full) ----------

export async function getDiscounts() {
  return (await dataStore().get('discounts', { type: 'json' })) || [];
}

export async function findDiscount(code) {
  const clean = RULES.cleanCode(code);
  if (!clean) return null;
  return (await getDiscounts()).find((d) => d.code === clean) || null;
}

export function validateDiscounts(input) {
  if (!Array.isArray(input)) throw new Error('Invalid data.');
  if (input.length > 200) throw new Error('Too many discount codes (maximum 200).');
  const seen = new Set();
  return input.map((d) => {
    const code = RULES.cleanCode(d.code);
    if (code.length < 3) throw new Error('Each code needs at least 3 letters or numbers.');
    if (seen.has(code)) throw new Error(`The code ${code} is listed twice.`);
    seen.add(code);
    if (!['percent', 'fixed', 'free-delivery'].includes(d.type)) throw new Error(`Choose a discount type for ${code}.`);
    const value = d.type === 'percent' ? int(d.value, 1, 100, `Percentage for ${code}`) : d.type === 'fixed' ? int(d.value, 1, 1000000, `Amount for ${code}`) : 0;
    const endsAt = d.endsAt ? new Date(Date.parse(d.endsAt)).toISOString() : '';
    if (d.endsAt && !Number.isFinite(Date.parse(d.endsAt))) throw new Error(`Expiry date for ${code} is not valid.`);
    return {
      code, type: d.type, value,
      minSpend: d.minSpend ? int(d.minSpend, 0, 10000000, `Minimum spend for ${code}`) : 0,
      endsAt, active: d.active !== false,
      note: str(d.note, 100, `Note for ${code}`)
    };
  });
}

export async function saveDiscounts(list) {
  await dataStore().setJSON('discounts', list);
}

// ---------- Blog ----------
// Stored as posts/<slug>. Until the first post is saved, the starting posts are shown.


export async function listPosts({ includeDrafts = false } = {}) {
  const store = dataStore();
  const started = await store.get('posts-started', { type: 'json' });
  let posts;
  if (!started) posts = DEFAULT_POSTS;
  else {
    const { blobs } = await store.list({ prefix: 'posts/' });
    posts = (await Promise.all(blobs.map((b) => store.get(b.key, { type: 'json' })))).filter(Boolean);
  }
  return posts.filter((p) => includeDrafts || p.status === 'published')
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export async function getPost(slug) {
  return (await listPosts({ includeDrafts: true })).find((p) => p.slug === slug) || null;
}

async function startBlog(store) {
  if (await store.get('posts-started', { type: 'json' })) return;
  for (const p of DEFAULT_POSTS) await store.setJSON(`posts/${p.slug}`, p);
  await store.setJSON('posts-started', true);
}

export function validatePost(input) {
  const title = str(input.title, 140, 'Title', { required: true });
  const slug = (str(input.slug, 80, 'Web address') || title).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
  if (!slug) throw new Error('Please give the post a title.');
  const date = str(input.date, 10, 'Date') || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Date must look like 2026-11-03.');
  return {
    slug, title, date,
    status: input.status === 'published' ? 'published' : 'draft',
    cover: imagePath(input.cover, 'Cover photo'),
    excerpt: str(input.excerpt, 300, 'Short summary'),
    body: str(input.body, 30000, 'Post text', { required: true })
  };
}

export async function savePost(post, previousSlug) {
  const store = dataStore();
  await startBlog(store);
  if (previousSlug && previousSlug !== post.slug) await store.delete(`posts/${previousSlug}`);
  await store.setJSON(`posts/${post.slug}`, post);
}

export async function deletePost(slug) {
  const store = dataStore();
  await startBlog(store);
  await store.delete(`posts/${slug}`);
}
