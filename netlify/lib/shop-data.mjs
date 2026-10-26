// Shared server code for the Envie Roses dashboard, catalogue and orders.
// Data lives in Netlify Blobs on Netlify, or in files when run by server.js
// on a normal Node.js host. js/catalog.js holds the starting defaults.

import { getStore } from '@netlify/blobs';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import DEFAULTS from '../../js/catalog.js';
import { getFileStore } from './file-store.mjs';

const useFiles = process.env.ENVIE_STORAGE === 'file';
const store = (name) => (useFiles ? getFileStore(name) : getStore({ name, consistency: 'strong' }));
const dataStore = () => store('envie');
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

export async function getCatalog() {
  let saved = null;
  try {
    saved = await dataStore().get('catalog', { type: 'json' });
  } catch (err) {
    console.error('Could not read catalogue, using defaults', err);
  }
  if (!saved) return structuredClone(DEFAULTS);
  return {
    shop: { ...DEFAULTS.shop, ...saved.shop },
    legal: { ...DEFAULTS.legal, ...saved.legal },
    social: { ...DEFAULTS.social, ...saved.social },
    payments: { ...DEFAULTS.payments, ...saved.payments },
    images: { ...DEFAULTS.images, ...saved.images },
    products: saved.products || {}
  };
}

export async function saveCatalog(catalog) {
  await dataStore().setJSON('catalog', catalog);
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
      options.push({ id: oid, label, price: int(o.price, 1, 10000000, `Price for "${name}" (${label})`) });
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
      gallery,
      ...(sale ? { sale } : {}),
      ...(enquire ? { enquire: true } : {}),
      options: enquire ? [] : options
    };
  }

  return { shop, legal, social, payments, images, products };
}

// ---------- Orders ----------

export function unitPrice(product, option, now = Date.now()) {
  const s = product.sale;
  const live = s && s.percent > 0 && Date.parse(s.endsAt) > now;
  return live ? Math.round((option.price * (100 - s.percent)) / 100) : option.price;
}

export function priceOrder(catalog, items) {
  if (!Array.isArray(items) || !items.length || items.length > 20) throw new Error('Your bag is empty.');
  const lines = [];
  for (const item of items) {
    const product = catalog.products[item.productId];
    const option = product && !product.enquire && product.options.find((o) => o.id === item.optionId);
    const qty = Number(item.qty);
    if (!option || !Number.isInteger(qty) || qty < 1 || qty > 20) throw new Error('One of the items in your bag is no longer available.');
    const price = unitPrice(product, option);
    lines.push({ productId: item.productId, optionId: option.id, name: product.name, label: option.label, price, qty, total: price * qty });
  }
  const subtotal = lines.reduce((n, l) => n + l.total, 0);
  const deliveryFee = typeof catalog.shop.deliveryFee === 'number' ? catalog.shop.deliveryFee : null;
  return { lines, subtotal, deliveryFee, total: subtotal + (deliveryFee || 0) };
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
      postcode: t(d.postcode, 10).toUpperCase(), date: t(d.date, 10)
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
