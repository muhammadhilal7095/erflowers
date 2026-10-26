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
//
// Needs the environment variable ADMIN_PASSWORD.

import { purgeCache } from '@netlify/functions';
import {
  ORDER_STATUSES, REVIEW_STATUSES, adminConfigured, deleteReview, listReviews, updateReview, checkPassword, deleteOrder, getCatalog, imageStore,
  isAdmin, json, listOrders, makeToken, newImageKey, saveCatalog, updateOrder, validOrderId, validateCatalog
} from '../lib/shop-data.mjs';

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
        const order = await updateOrder(id, { status });
        return order ? json(200, order) : json(404, { error: 'Order not found.' });
      }
      if (method === 'DELETE') {
        await deleteOrder(id);
        return json(200, { ok: true });
      }
    }

    if (path === 'reviews' && method === 'GET') return json(200, { reviews: await listReviews() });

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
