// Membership: monthly plans that give member prices (see catalog.membership).
//   memberships/<customerId>   one membership per customer
// Benefits apply while the status is 'trialing' or 'active'.

import { dataStore } from './shop-data.mjs';
import { customerFromRequest, getCustomer, saveCustomer } from './accounts.mjs';

const store = () => dataStore();
const now = () => new Date().toISOString();
export const ACTIVE = ['trialing', 'active'];
export const MEMBER_STATUSES = ['pending', 'awaiting-payment', 'trialing', 'active', 'past-due', 'cancelled'];

export const getMembership = (customerId) => (/^[a-z0-9]{6,40}$/.test(String(customerId)) ? store().get(`memberships/${customerId}`, { type: 'json' }) : null);
export const saveMembership = (m) => store().setJSON(`memberships/${m.customerId}`, { ...m, updatedAt: now() });
export const deleteMembership = (customerId) => store().delete(`memberships/${customerId}`);

export async function listMemberships() {
  const { blobs } = await store().list({ prefix: 'memberships/' });
  const all = await Promise.all(blobs.map((b) => store().get(b.key, { type: 'json' })));
  return all.filter(Boolean).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

// A WhatsApp-arranged membership has no Stripe dates: it stays active until you change it
export function isActive(m) {
  if (!m || !ACTIVE.includes(m.status)) return false;
  if (m.periodEnd && Date.parse(m.periodEnd) + 3 * 86400000 < Date.now() && m.payment === 'card') return false; // Stripe missed: grace of 3 days
  return true;
}

// The member prices for this customer's order, or null
export function benefitsFor(catalog, m) {
  const cfg = catalog.membership || {};
  if (!cfg.enabled || !isActive(m)) return null;
  const plan = (cfg.plans || {})[m.planId];
  if (!plan) return null;
  return { planId: m.planId, name: plan.name, discount: plan.discount, freeDeliveryOver: plan.freeDeliveryOver };
}

export async function memberForRequest(req, catalog) {
  const c = await customerFromRequest(req);
  if (!c) return { customer: null, membership: null, member: null };
  const membership = await getMembership(c.id);
  return { customer: c, membership, member: benefitsFor(catalog, membership) };
}

// What the customer sees in My Account
export function publicMembership(m, catalog) {
  if (!m) return null;
  const plan = ((catalog.membership || {}).plans || {})[m.planId] || {};
  return {
    planId: m.planId, planName: plan.name || m.planName, price: m.price, status: m.status, payment: m.payment,
    trialEnd: m.trialEnd || '', periodEnd: m.periodEnd || '', cancelAtPeriodEnd: Boolean(m.cancelAtPeriodEnd),
    createdAt: m.createdAt, active: isActive(m), discount: plan.discount, freeDeliveryOver: plan.freeDeliveryOver, monthlyBouquet: plan.monthlyBouquet
  };
}

// One free trial per customer, ever
export async function markTrialUsed(customerId) {
  const c = await getCustomer(customerId);
  if (c && !c.membershipTrialUsed) { c.membershipTrialUsed = now(); await saveCustomer(c); }
}
