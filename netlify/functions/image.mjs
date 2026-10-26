// Serves photos uploaded from the dashboard.

import { imageStore } from '../lib/shop-data.mjs';

export default async (req, context) => {
  const key = context.params.key;
  if (!/^[\w-]{1,80}$/.test(key || '')) return new Response('Not found', { status: 404 });
  const result = await imageStore().getWithMetadata(key, { type: 'arrayBuffer' });
  if (!result) return new Response('Not found', { status: 404 });
  return new Response(result.data, {
    headers: {
      'content-type': result.metadata.contentType || 'image/jpeg',
      // Each upload gets a new key, so the file never changes
      'cache-control': 'public, max-age=31536000, immutable'
    }
  });
};

export const config = { path: '/api/image/:key' };
