// Customer reviews.
//   GET  /api/reviews?product=<id>  -> approved reviews and rating summary
//   POST /api/reviews               -> new review, held for approval in the dashboard

import { addReview, getCatalog, json, listReviews, newReviewId } from '../lib/shop-data.mjs';

const clean = (v, max) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, max);

export default async (req) => {
  const url = new URL(req.url);

  if (req.method === 'GET') {
    const productId = url.searchParams.get('product') || '';
    if (!/^[a-z0-9-]{1,60}$/.test(productId)) return json(400, { error: 'Unknown product.' });
    const approved = (await listReviews(productId)).filter((r) => r.status === 'approved');
    const reviews = approved.map(({ name, rating, title, text, createdAt }) => ({ name, rating, title, text, createdAt }));
    const count = reviews.length;
    const average = count ? Math.round((reviews.reduce((n, r) => n + r.rating, 0) / count) * 10) / 10 : 0;
    const breakdown = [5, 4, 3, 2, 1].map((star) => reviews.filter((r) => r.rating === star).length);
    return new Response(JSON.stringify({ count, average, breakdown, reviews }), {
      headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=60' }
    });
  }

  if (req.method === 'POST') {
    const raw = await req.text();
    if (raw.length > 6000) return json(413, { error: 'Your review is too long.' });
    let body;
    try {
      body = JSON.parse(raw);
    } catch (e) {
      return json(400, { error: 'Invalid request.' });
    }
    // Hidden field that people never fill in; bots usually do
    if (body.company) return json(200, { ok: true });

    const catalog = await getCatalog();
    const productId = String(body.productId || '');
    if (!catalog.products[productId]) return json(400, { error: 'Unknown product.' });

    const rating = Number(body.rating);
    const name = clean(body.name, 60);
    const title = clean(body.title, 100);
    const text = String(body.text || '').trim().slice(0, 1500);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return json(400, { error: 'Please choose a star rating.' });
    if (name.length < 2) return json(400, { error: 'Please enter your name.' });
    if (text.length < 10) return json(400, { error: 'Please write a few words about your roses.' });

    await addReview({
      id: newReviewId(),
      productId,
      productName: catalog.products[productId].name,
      name,
      email: clean(body.email, 120),
      rating,
      title,
      text,
      status: 'pending',
      createdAt: new Date().toISOString()
    });
    return json(200, { ok: true });
  }

  return json(405, { error: 'Method not allowed.' });
};

export const config = { path: '/api/reviews' };
