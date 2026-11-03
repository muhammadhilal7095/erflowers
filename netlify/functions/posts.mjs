// Published blog posts.
//   GET /api/posts             -> { posts: [...] } (without the full text)
//   GET /api/posts?slug=<slug> -> the post

import { getPost, json, listPosts } from '../lib/shop-data.mjs';

const cached = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=60' }
  });

export default async (req) => {
  if (req.method !== 'GET') return json(405, { error: 'Method not allowed.' });
  const slug = new URL(req.url).searchParams.get('slug');
  if (slug) {
    const post = await getPost(slug);
    if (!post || post.status !== 'published') return json(404, { error: 'Post not found.' });
    return cached(200, post);
  }
  const posts = (await listPosts()).map(({ body, ...summary }) => summary);
  return cached(200, { posts });
};

export const config = { path: '/api/posts' };
