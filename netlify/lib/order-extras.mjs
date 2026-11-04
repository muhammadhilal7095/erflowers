// Things added on top of a priced order: gift card codes, loyalty points,
// the customer's account, and gift card purchases. Used by orders.mjs and checkout.mjs.

import {
  changePoints, customerFromRequest, getGiftCard, giftCardProblem, linkOrder, pointsQuote, useGiftCard
} from './accounts.mjs';

const t = (v, max) => String(v ?? '').trim().slice(0, max);

// Works out gift card and points amounts. Nothing is taken until commitExtras runs.
export async function prepareExtras(req, body, catalog, priced) {
  const customer = await customerFromRequest(req);
  let due = priced.total;
  let giftCard = null;
  let points = null;
  if (body.giftCardCode) {
    const card = await getGiftCard(body.giftCardCode);
    const problem = giftCardProblem(card);
    if (problem) throw new Error(problem);
    giftCard = { code: card.code, display: card.display, amount: Math.min(card.balance, due) };
    due -= giftCard.amount;
  }
  if (body.usePoints === true && customer) {
    const q = pointsQuote(catalog, customer, due);
    if (q.usable) { points = { used: q.usable, amount: q.amount }; due -= q.amount; }
  }
  return {
    customer,
    fields: {
      ...(customer ? { customerId: customer.id } : {}),
      ...(giftCard ? { giftCard } : {}),
      ...(points ? { points } : {}),
      total: Math.max(0, due)
    }
  };
}

// Runs once the order is saved for the first time
export async function commitExtras(order) {
  if (order.customerId) await linkOrder(order.customerId, order.id);
  if (order.giftCard && order.giftCard.amount) await useGiftCard(order.giftCard.code, order.giftCard.amount, order.id);
  if (order.customerId && order.points && order.points.used) await changePoints(order.customerId, -order.points.used, `Used on order ${order.id}`, order.id);
}

// Buying a gift card: { amount, to, from, message }
export function priceGiftCardPurchase(catalog, gp) {
  const gc = catalog.giftCards || {};
  if (!gc.enabled) throw new Error('Gift cards are not available at the moment.');
  const amount = Number(gp && gp.amount);
  if (!(gc.amounts || []).includes(amount)) throw new Error('Please choose a gift card amount.');
  const to = t(gp.to, 100);
  if (!to) throw new Error('Please enter who the gift card is for.');
  const label = `£${(amount / 100).toFixed(amount % 100 ? 2 : 0)} for ${to}`;
  return {
    priced: {
      lines: [{ giftCard: true, name: 'Envie Roses Gift Card', label, price: amount, qty: 1, total: amount }],
      subtotal: amount, deliveryFee: 0, sameDay: false, discount: null, total: amount
    },
    gift: { amount, to, from: t(gp.from, 100), message: t(gp.message, 250) }
  };
}

export function cleanGiftBuyer(body) {
  const c = body.customer || {};
  const customer = { name: t(c.name, 100), phone: t(c.phone, 30), email: t(c.email, 120) };
  if (!customer.name || !customer.phone) throw new Error('Please enter your name and phone number.');
  return { customer, delivery: {}, message: '', notes: t(body.notes, 200) };
}
