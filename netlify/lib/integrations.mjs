// Keys for outside services (Stripe, email), entered in the dashboard.
// Stored server-side only (secrets/integrations) and never sent to the website.
// Environment variables still work and are used when nothing is saved in the dashboard.

import { dataStore } from './shop-data.mjs';

const KEY = 'secrets/integrations';
let cache = null;
let cacheAt = 0;

export async function getIntegrations() {
  if (cache && Date.now() - cacheAt < 30000) return cache;
  const saved = (await dataStore().get(KEY, { type: 'json' }).catch(() => null)) || {};
  cache = saved;
  cacheAt = Date.now();
  return saved;
}

export async function saveIntegrations(changes) {
  const current = { ...(await dataStore().get(KEY, { type: 'json' }).catch(() => null)) };
  for (const [k, v] of Object.entries(changes)) {
    if (v === null || v === '') delete current[k];
    else current[k] = v;
  }
  current.updatedAt = new Date().toISOString();
  await dataStore().setJSON(KEY, current);
  cache = current;
  cacheAt = Date.now();
  return current;
}

export const stripeKey = async () => (await getIntegrations()).stripeSecretKey || process.env.STRIPE_SECRET_KEY || '';
export const webhookSecret = async () => (await getIntegrations()).stripeWebhookSecret || process.env.STRIPE_WEBHOOK_SECRET || '';
export async function emailSettings() {
  const i = await getIntegrations();
  return { apiKey: i.resendApiKey || process.env.RESEND_API_KEY || '', from: i.emailFrom || process.env.EMAIL_FROM || '' };
}

// "sk_live_…a1b2" — enough to recognise a key without showing it
export const mask = (v) => (v ? `${v.slice(0, v.indexOf('_', 3) + 1 || 3)}…${v.slice(-4)}` : '');

export async function integrationStatus() {
  const i = await getIntegrations();
  const key = i.stripeSecretKey || process.env.STRIPE_SECRET_KEY || '';
  const wh = i.stripeWebhookSecret || process.env.STRIPE_WEBHOOK_SECRET || '';
  const email = await emailSettings();
  return {
    stripe: {
      connected: Boolean(key),
      source: i.stripeSecretKey ? 'dashboard' : key ? 'host settings' : '',
      mode: key.startsWith('sk_live') || key.startsWith('rk_live') ? 'live' : key ? 'test' : '',
      keyHint: mask(key),
      account: i.stripeAccountName || '',
      webhook: { set: Boolean(wh), hint: mask(wh), id: i.stripeWebhookId || '', url: i.stripeWebhookUrl || '' }
    },
    email: { connected: Boolean(email.apiKey && email.from), keyHint: mask(email.apiKey), from: email.from }
  };
}
