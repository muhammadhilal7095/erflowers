// Envie Roses — cart, checkout, payments and WhatsApp orders

(function () {
  const CATALOG = window.ENVIE_CATALOG;
  const RULES = window.ENVIE_RULES;
  const { shop, payments, products } = CATALOG;
  const addons = CATALOG.addons || {};
  const L = window.EnvieLayout;
  const CART_KEY = 'envie_cart';
  const PENDING_KEY = 'envie_pending_order';
  const ORDERS_KEY = 'envie_orders';
  const toast = (msg) => window.envieToast && window.envieToast(msg);
  const $ = (id) => document.getElementById(id);

  // ---------- Helpers ----------
  const money = (pence) => '£' + (pence / 100).toFixed(2);

  function store(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* storage unavailable: cart lives for this visit only */ }
  }
  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function findOption(productId, optionId) {
    const product = products[productId];
    const option = product && product.options.find((o) => o.id === optionId);
    return product && option ? { product, option } : null;
  }

  function makeOrderId() {
    const d = new Date();
    const ymd = String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `ER-${ymd}-${rand}`;
  }

  function waLink(text) {
    return `https://wa.me/${shop.whatsapp}?text=${encodeURIComponent(text)}`;
  }

  // Dialog helpers (with scroll lock)
  function openDialog(d) {
    if (!d.open) d.showModal();
    document.body.classList.add('no-scroll');
  }
  function closeDialog(d) {
    if (d.open) d.close();
  }
  document.querySelectorAll('dialog').forEach((d) => {
    d.addEventListener('close', () => {
      if (!document.querySelector('dialog[open]')) document.body.classList.remove('no-scroll');
    });
    // Click on backdrop closes
    d.addEventListener('click', (e) => { if (e.target === d) closeDialog(d); });
    d.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => closeDialog(d)));
  });

  // ---------- Cart state ----------
  // Lines are flowers { productId, optionId, qty } or gifts { addonId, qty }.
  // Only keep lines that still exist in the catalogue.
  const addonOk = (id) => addons[id] && addons[id].active !== false;
  let cart = load(CART_KEY, []).filter((l) => l.qty > 0 && (l.addonId ? addonOk(l.addonId) : findOption(l.productId, l.optionId)));

  function cartLines() {
    return cart.map((l) => {
      if (l.addonId) {
        const a = addons[l.addonId];
        return { ...l, name: a.name, addon: { id: l.addonId, ...a }, label: 'Gift', price: a.price, total: a.price * l.qty };
      }
      const { product, option } = findOption(l.productId, l.optionId);
      const price = L.unitPrice(product, option);
      return { ...l, name: product.name, image: product.image, label: option.label, price, total: price * l.qty };
    });
  }
  const hasFlowers = () => cart.some((l) => l.productId);
  const itemsForServer = () => cart.map((l) => (l.addonId ? { addonId: l.addonId, qty: l.qty } : { productId: l.productId, optionId: l.optionId, qty: l.qty }));
  const cartCount = () => cart.reduce((n, l) => n + l.qty, 0);
  const subtotal = () => cartLines().reduce((n, l) => n + l.total, 0);
  const deliveryFee = () => (typeof shop.deliveryFee === 'number' ? shop.deliveryFee : 0);
  const deliveryLabel = () => (typeof shop.deliveryFee === 'number' ? (shop.deliveryFee === 0 ? 'Free' : money(shop.deliveryFee)) : 'Confirmed with your order');

  function addToCart(productId, optionId, qty, addonIds = []) {
    const line = cart.find((l) => l.productId === productId && l.optionId === optionId);
    if (line) line.qty = Math.min(line.qty + qty, 20);
    else cart.push({ productId, optionId, qty });
    addonIds.filter(addonOk).forEach((id) => addAddon(id, false));
    saveCart();
  }
  function addAddon(addonId, save = true) {
    const line = cart.find((l) => l.addonId === addonId);
    if (line) line.qty = Math.min(line.qty + 1, 20);
    else cart.push({ addonId, qty: 1 });
    if (save) saveCart();
  }
  function setQty(index, qty) {
    if (qty <= 0) cart.splice(index, 1);
    else cart[index].qty = Math.min(qty, 20);
    saveCart();
  }
  function saveCart() {
    store(CART_KEY, cart);
    renderCart();
  }

  // ---------- Header bag ----------
  const cartBtn = $('cart');
  const countEl = $('cartCount');
  function renderCount(bump) {
    const n = cartCount();
    countEl.textContent = n;
    cartBtn.setAttribute('aria-label', `Bag, ${n} item${n === 1 ? '' : 's'}`);
    if (bump) {
      cartBtn.classList.remove('bump');
      void cartBtn.offsetWidth;
      cartBtn.classList.add('bump');
    }
  }

  // ---------- Product modal ----------
  const pm = $('productModal');
  let pmState = { productId: null, optionId: null, qty: 1 };

  function openProduct(productId) {
    const product = products[productId];
    if (!product) return;
    pmState = { productId, optionId: product.options[0].id, qty: 1 };
    const gifts = RULES.activeAddons(CATALOG);
    $('pmAddonsWrap').hidden = !gifts.length;
    $('pmAddons').innerHTML = gifts.map((a) => L.addonChoice(a, false)).join('');
    window.EnvieLayout.setImg($('pmImg'), product.image, '(max-width: 640px) 100vw, 460px');
    $('pmImg').alt = product.name;
    $('pmName').textContent = product.name;
    $('pmDesc').textContent = product.description || '';
    $('pmOptions').innerHTML = product.options.map((o, i) => `
      <label class="opt">
        <input type="radio" name="pmOption" value="${o.id}"${i === 0 ? ' checked' : ''}>
        <span><strong>${escapeHtml(o.label)}</strong><small>${money(window.EnvieLayout.unitPrice(product, o))}</small></span>
      </label>`).join('');
    renderProduct();
    openDialog(pm);
  }
  function renderProduct() {
    const { option } = findOption(pmState.productId, pmState.optionId);
    $('pmPrice').textContent = money(window.EnvieLayout.unitPrice(products[pmState.productId], option) * pmState.qty);
    $('pmQty').textContent = pmState.qty;
  }
  $('pmOptions').addEventListener('change', (e) => {
    pmState.optionId = e.target.value;
    renderProduct();
  });
  pm.querySelectorAll('[data-qty]').forEach((b) => b.addEventListener('click', () => {
    pmState.qty = Math.max(1, Math.min(20, pmState.qty + Number(b.dataset.qty)));
    renderProduct();
  }));
  const pmGifts = () => [...$('pmAddons').querySelectorAll('[data-addon]:checked')].map((c) => c.value);
  $('pmAdd').addEventListener('click', () => {
    addToCart(pmState.productId, pmState.optionId, pmState.qty, pmGifts());
    closeDialog(pm);
    renderCount(true);
    toast(`${products[pmState.productId].name} added to your bag`);
  });
  $('pmBuy').addEventListener('click', () => {
    closeDialog(pm);
    quickOrder(pmState.productId, pmState.optionId, pmState.qty, pmGifts());
  });

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-buy], .quick-add');
    const card = btn && btn.closest('[data-product]');
    if (card) openProduct(card.dataset.product);
  });

  // ---------- Cart drawer ----------
  const drawer = $('cartDrawer');
  function renderCart() {
    renderCount(false);
    const lines = cartLines();
    const body = $('cartItems');
    if (!lines.length) {
      body.innerHTML = `
        <div class="cart-empty">
          <svg><use href="#i-rose"/></svg>
          <p>Your bag is empty</p>
          <a href="shop.html" class="btn btn--outline btn--sm">Shop the Collection</a>
        </div>`;
      $('cartFoot').hidden = true;
      return;
    }
    $('cartFoot').hidden = false;
    body.innerHTML = lines.map((l, i) => `
      <div class="cart-line${l.addon ? ' cart-line--gift' : ''}">
        ${l.addon ? `<span class="cart-line__gift">${L.addonVisual(l.addon)}</span>` : `<img ${L.imgAttrs(l.image, '80px')} alt="" loading="lazy" decoding="async">`}
        <div class="cart-line__info">
          <p class="cart-line__name">${escapeHtml(l.name)}</p>
          <p class="cart-line__opt">${escapeHtml(l.label)} · ${money(l.price)}</p>
          <div class="qty qty--sm" role="group" aria-label="Quantity">
            <button type="button" data-line="${i}" data-step="-1" aria-label="Decrease">−</button>
            <output>${l.qty}</output>
            <button type="button" data-line="${i}" data-step="1" aria-label="Increase">+</button>
          </div>
        </div>
        <div class="cart-line__end">
          <strong>${money(l.total)}</strong>
          <button type="button" class="cart-line__remove" data-remove="${i}">Remove</button>
        </div>
      </div>`).join('');
    $('cartSubtotal').textContent = money(subtotal());
    $('cartDeliveryNote').textContent = hasFlowers() ? `Delivery: ${deliveryLabel()}` : 'Add some flowers to go with your gifts.';
    $('cartCheckout').disabled = !hasFlowers();
    renderExtras();
  }

  // "Add a little extra": gifts not yet in the bag
  function renderExtras() {
    const box = $('cartExtras');
    const inBag = new Set(cart.filter((l) => l.addonId).map((l) => l.addonId));
    const suggestions = RULES.activeAddons(CATALOG).filter((a) => !inBag.has(a.id));
    box.hidden = !cart.length || !suggestions.length;
    if (box.hidden) return;
    box.innerHTML = `<p class="drawer__extras-title">Add a little extra</p>
      <div class="extras">${suggestions.map((a) => `
        <button type="button" class="extra" data-add-gift="${escapeHtml(a.id)}">
          <span class="extra__media">${L.addonVisual(a)}</span>
          <span class="extra__name">${escapeHtml(a.name)}</span>
          <span class="extra__price">${a.price === 0 ? 'Free' : money(a.price)}</span>
          <span class="extra__add" aria-hidden="true">+</span>
        </button>`).join('')}</div>`;
  }
  $('cartExtras').addEventListener('click', (e) => {
    const b = e.target.closest('[data-add-gift]');
    if (!b) return;
    addAddon(b.dataset.addGift);
    toast(`${addons[b.dataset.addGift].name} added`);
  });
  $('cartItems').addEventListener('click', (e) => {
    const step = e.target.closest('[data-step]');
    const remove = e.target.closest('[data-remove]');
    if (step) setQty(Number(step.dataset.line), cart[Number(step.dataset.line)].qty + Number(step.dataset.step));
    if (remove) setQty(Number(remove.dataset.remove), 0);
  });
  cartBtn.addEventListener('click', () => { renderCart(); openDialog(drawer); });
  $('cartCheckout').addEventListener('click', () => { closeDialog(drawer); openCheckout(); });

  // ---------- Checkout ----------
  const co = $('checkoutModal');
  const form = $('checkoutForm');
  const errorEl = $('coError');

  // Payment methods from settings
  document.querySelectorAll('.pay-option').forEach((opt) => {
    if (!payments[opt.dataset.method]) opt.remove();
  });
  const firstMethod = form.querySelector('input[name="payment"]');
  if (firstMethod) firstMethod.checked = true;

  // ---------- Delivery: postcode, date, slot and fee (same rules as the server) ----------
  const dateInput = $('coDate');
  const postcodeInput = $('coPostcode');
  const infoEl = $('coDeliveryInfo');
  const slots = (CATALOG.delivery && CATALOG.delivery.slots) || [];
  $('coSlotWrap').hidden = !slots.length;
  $('coSlot').innerHTML = `<option value="">Any time</option>` + slots.map((x) => `<option>${escapeHtml(x)}</option>`).join('');
  let quote = RULES.deliveryQuote(CATALOG, {});
  dateInput.min = quote.earliest;

  const niceDate = (ymd) => new Date(ymd + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const timeLeft = (mins) => (mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins} minutes`);
  function updateDelivery() {
    const pc = postcodeInput.value.trim();
    const date = dateInput.value;
    const base = RULES.deliveryQuote(CATALOG, { postcode: RULES.normalizePostcode(pc) ? pc : '' });
    dateInput.min = base.earliest || quote.earliest;
    quote = RULES.deliveryQuote(CATALOG, { postcode: RULES.normalizePostcode(pc) ? pc : '', date: date || undefined });
    infoEl.className = 'co-info field--full';
    if (pc && !RULES.normalizePostcode(pc)) infoEl.textContent = '';
    else if (base.blocked) { infoEl.textContent = base.error; infoEl.classList.add('is-error'); }
    else if (date && !quote.ok) { infoEl.textContent = quote.error; infoEl.classList.add('is-error'); }
    else if (base.sameDayPossible && (!date || quote.sameDay)) { infoEl.textContent = `Same-day delivery available: order within ${timeLeft(base.cutoffMinutesLeft)} for delivery today.`; infoEl.classList.add('is-good'); }
    else if (base.postcode) infoEl.textContent = `Earliest delivery to ${base.outward}: ${niceDate(base.earliest)}.`;
    else infoEl.textContent = '';
    renderSummary();
  }
  postcodeInput.addEventListener('input', updateDelivery);
  dateInput.addEventListener('change', updateDelivery);
  const currentFee = () => (quote.ok && typeof quote.fee === 'number' ? quote.fee : typeof shop.deliveryFee === 'number' ? shop.deliveryFee : null);

  // ---------- Customer account (optional): prefill, saved addresses, loyalty points ----------
  const ACCOUNT_KEY = 'envie_account_token';
  // Partner link the customer arrived through (kept for the partner's link period)
  function affiliateCode() {
    try {
      const a = JSON.parse(localStorage.getItem('envie_aff') || 'null');
      const days = (CATALOG.affiliates && CATALOG.affiliates.cookieDays) || 30;
      return a && Date.now() - a.at < days * 86400000 ? a.code : '';
    } catch (e) { return ''; }
  }
  const accountToken = () => { try { return localStorage.getItem(ACCOUNT_KEY) || ''; } catch (e) { return ''; } };
  const authHeaders = () => (accountToken() ? { Authorization: `Bearer ${accountToken()}` } : {});
  let account = null;
  async function loadAccount() {
    if (!accountToken() || location.protocol === 'file:') { account = null; return; }
    try {
      const res = await fetch('/api/account/me', { headers: authHeaders() });
      if (res.status === 401) { try { localStorage.removeItem(ACCOUNT_KEY); } catch (e) { /* ignore */ } account = null; return; }
      account = res.ok ? await res.json() : null;
    } catch (e) { account = null; }
  }
  // "Create an account" at checkout: only for customers who aren't logged in
  function showJoin() {
    const join = $('coJoin');
    join.hidden = Boolean(account) || location.protocol === 'file:';
    const ly = CATALOG.loyalty || {};
    const rf = CATALOG.referrals || {};
    let ref = null;
    try { ref = JSON.parse(localStorage.getItem('envie_ref') || 'null'); } catch (e) { /* ignore */ }
    const perks = [];
    if (ly.enabled) perks.push(`earn ${ly.pointsPerPound} point${ly.pointsPerPound === 1 ? '' : 's'} per £1${ly.signupBonus ? ` plus ${ly.signupBonus} welcome points` : ''}`);
    if (ref && rf.enabled) perks.push(`get your friend's ${money(rf.friendAmount)} off`);
    $('coJoinPerk').textContent = perks.length ? ' and ' + perks.join(', and ') : '';
  }
  $('coJoinOn').addEventListener('change', () => {
    const on = $('coJoinOn').checked;
    $('coJoinFields').hidden = !on;
    $('coJoinPass').required = on;
    if (on) $('coJoinPass').focus();
  });
  async function joinAtCheckout() {
    const f = form.elements;
    let ref = '';
    try { const r = JSON.parse(localStorage.getItem('envie_ref') || 'null'); if (r) ref = r.code; } catch (e) { /* ignore */ }
    const res = await fetch('/api/account/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: f.name.value.trim(), email: f.email.value.trim(), phone: f.phone.value.trim(), password: $('coJoinPass').value, ref })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'We could not create your account.');
    try {
      localStorage.setItem(ACCOUNT_KEY, data.token);
      localStorage.setItem('envie_account_name', data.customer.name.split(' ')[0]);
      localStorage.removeItem('envie_ref');
    } catch (e) { /* ignore */ }
    L.accountLabel && L.accountLabel();
    await loadAccount();
    $('coJoinOn').checked = false;
    $('coJoinFields').hidden = true;
    $('coJoinPass').required = false;
    $('coJoinPass').value = '';
    fillFromAccount();
    renderSummary();
  }

  function fillFromAccount() {
    showJoin();
    const acc = $('coAccount');
    let pendingRef = null;
    try { pendingRef = JSON.parse(localStorage.getItem('envie_ref') || 'null'); } catch (e) { /* ignore */ }
    const rf = CATALOG.referrals || {};
    if (!account && pendingRef && rf.enabled) {
      acc.innerHTML = `<a href="account.html">Create an account</a> to get ${money(rf.friendAmount)} off this order with your friend's invite${rf.minSpend ? ` (orders of ${money(rf.minSpend)} or more)` : ''}.`;
      $('coSavedWrap').hidden = true;
      return;
    }
    if (!account) {
      acc.innerHTML = CATALOG.loyalty && CATALOG.loyalty.enabled
        ? `<a href="account.html">Log in or create an account</a> to earn ${CATALOG.loyalty.pointsPerPound} point${CATALOG.loyalty.pointsPerPound === 1 ? '' : 's'} for every £1.`
        : '';
      $('coSavedWrap').hidden = true;
      return;
    }
    const c = account.customer;
    acc.textContent = `Logged in as ${c.name}.`;
    const set = (name, v) => { const el = form.elements[name]; if (el && !el.value && v) el.value = v; };
    set('name', c.name); set('phone', c.phone); set('email', c.email);
    const list = c.addresses || [];
    $('coSavedWrap').hidden = !list.length;
    $('coSaved').innerHTML = '<option value="">Enter a new address</option>' + list.map((a, i) =>
      `<option value="${i}">${escapeHtml([a.label, a.recipient, a.address1, a.postcode].filter(Boolean).join(', '))}</option>`).join('');
  }
  $('coSaved').addEventListener('change', (e) => {
    const a = account && account.customer.addresses[Number(e.target.value)];
    if (!a) return;
    const map = { recipient: a.recipient, recipientPhone: a.phone, address1: a.address1, address2: a.address2, city: a.city, postcode: a.postcode };
    Object.entries(map).forEach(([k, v]) => { form.elements[k].value = v || ''; });
    updateDelivery();
  });

  // Points: whole points, at least minRedeem, at most maxPercent of what is left to pay
  function pointsUsable(due) {
    const ly = CATALOG.loyalty || {};
    if (!account || !ly.enabled) return { usable: 0, amount: 0 };
    const usable = Math.min(account.customer.points || 0, Math.floor((due * (ly.maxPercent || 0)) / 100 / ly.pointValue));
    return usable >= (ly.minRedeem || 0) && usable > 0 ? { usable, amount: usable * ly.pointValue } : { usable: 0, amount: 0 };
  }
  $('coUsePoints').addEventListener('change', () => renderSummary());

  // ---------- Discount codes (checked by the server; codes are never stored in the website) ----------
  let applied = null;
  let giftApplied = null;
  const discountAmount = () => (applied ? applied.amount : 0);
  async function applyCode(silent) {
    const code = RULES.cleanCode($('coCode').value);
    const msg = $('coCodeMsg');
    if (!code) { if (!silent) msg.textContent = ''; renderSummary(); return; }
    if (location.protocol === 'file:') { msg.textContent = 'Discount codes work on the live website.'; msg.className = 'co-discount__msg is-error'; return; }
    try {
      const pc = postcodeInput.value.trim();
      const res = await fetch('/api/discount', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, items: itemsForServer(), postcode: RULES.normalizePostcode(pc) ? pc : undefined, date: dateInput.value || undefined, discountCode: applied ? applied.code : undefined })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'That code is not valid.');
      if (data.giftCard) {
        giftApplied = { code: data.code, display: data.display, balance: data.balance };
        msg.textContent = `Gift card ${data.display} applied (balance ${money(data.balance)}).`;
      } else {
        applied = { code: data.code, label: data.label, amount: data.amount };
        msg.textContent = `${data.code} applied: ${data.label}.`;
      }
      msg.className = 'co-discount__msg is-good';
      $('coCode').value = '';
    } catch (err) {
      if (!silent) { msg.textContent = err.message; msg.className = 'co-discount__msg is-error'; }
      else { applied = null; giftApplied = null; }
    }
    renderSummary();
  }
  $('coApply').addEventListener('click', () => applyCode(false));
  $('coCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); applyCode(false); } });

  function renderSummary() {
    const lines = cartLines();
    $('coItems').innerHTML = lines.map((l) => `
      <div class="co-line">
        ${l.addon ? `<span class="co-line__gift">${L.addonVisual(l.addon)}</span>` : `<img ${L.imgAttrs(l.image, '60px')} alt="" loading="lazy" decoding="async">`}<span class="co-line__qty">${l.qty}</span>
        <div><p>${escapeHtml(l.name)}</p><small>${escapeHtml(l.label)}</small></div>
        <span>${money(l.total)}</span>
      </div>`).join('');
    const fee = currentFee();
    $('coSubtotal').textContent = money(subtotal());
    $('coDelivery').textContent = fee === null ? 'Confirmed with your order' : fee === 0 ? 'Free' : money(fee) + (quote.sameDay ? ' (same day)' : '');
    $('coDiscountRow').hidden = !applied;
    if (applied) { $('coDiscountLabel').textContent = `Discount (${applied.code})`; $('coDiscount').textContent = '−' + money(applied.amount); }
    const t = totals();
    $('coReferralRow').hidden = !t.referral;
    if (t.referral) $('coReferral').textContent = '−' + money(t.referral);
    $('coGiftRow').hidden = !t.gift;
    if (t.gift) { $('coGiftLabel').textContent = `Gift card (${giftApplied.display})`; $('coGift').textContent = '−' + money(t.gift); }
    const pq = pointsUsable(t.afterGift);
    $('coPointsWrap').hidden = !pq.usable;
    if (account && CATALOG.loyalty && CATALOG.loyalty.enabled) {
      $('coPointsText').textContent = pq.usable
        ? `Use ${pq.usable} points for ${money(pq.amount)} off (you have ${account.customer.points})`
        : '';
    }
    $('coPointsRow').hidden = !t.points;
    if (t.points) { $('coPointsLabel').textContent = `Points (${t.pointsUsed})`; $('coPoints').textContent = '−' + money(t.points); }
    $('coTotal').textContent = money(t.total);
    $('coTotalLabel').textContent = fee === null ? 'Total (excl. delivery)' : 'Total';
    updateSubmitLabel();
  }
  // Discount, then gift card, then points (the same order the server uses)
  // Friend's first-order offer: only when logged in, not with a discount code, and over the minimum spend
  function referralAmount(base) {
    const rf = CATALOG.referrals || {};
    const c = account && account.customer;
    if (!rf.enabled || !c || !c.referralCredit || applied) return 0;
    if (subtotal() < (c.referralMinSpend || 0)) return 0;
    return Math.min(c.referralCredit, base);
  }
  function totals() {
    const afterDiscount = Math.max(0, subtotal() + (currentFee() || 0) - discountAmount());
    const referral = referralAmount(afterDiscount);
    const base = afterDiscount - referral;
    const gift = giftApplied ? Math.min(giftApplied.balance, base) : 0;
    const afterGift = base - gift;
    const pq = $('coUsePoints').checked ? pointsUsable(afterGift) : { usable: 0, amount: 0 };
    return { base, referral, gift, afterGift, points: pq.amount, pointsUsed: pq.usable, total: Math.max(0, afterGift - pq.amount) };
  }
  const orderTotal = () => totals().total;
  function selectedMethod() {
    const r = form.querySelector('input[name="payment"]:checked');
    return r ? r.value : null;
  }
  function updateSubmitLabel() {
    const btn = $('coSubmit');
    btn.innerHTML = selectedMethod() === 'stripe'
      ? `<svg class="icon"><use href="#i-lock"/></svg> Pay ${money(orderTotal())} Securely`
      : `<svg class="icon"><use href="#i-whatsapp"/></svg> Send Order on WhatsApp`;
  }
  form.addEventListener('change', (e) => { if (e.target.name === 'payment') updateSubmitLabel(); });

  function openCheckout() {
    if (!cart.length) { toast('Your bag is empty'); return; }
    if (!hasFlowers()) { toast('Add some flowers to go with your gifts'); return; }
    errorEl.textContent = '';
    if (!postcodeInput.value) { try { postcodeInput.value = localStorage.getItem('envie_postcode') || ''; } catch (e) { /* ignore */ } }
    updateDelivery();
    if (applied) applyCode(true);
    openDialog(co);
    loadAccount().then(() => { fillFromAccount(); renderSummary(); });
  }

  function buildOrder(orderId) {
    const data = Object.fromEntries(new FormData(form).entries());
    for (const k in data) data[k] = String(data[k]).trim();
    return {
      id: orderId,
      createdAt: new Date().toISOString(),
      items: itemsForServer(),
      lines: cartLines().map((l) => ({ name: l.name, label: l.label, qty: l.qty, total: l.total, gift: Boolean(l.addonId) })),
      subtotal: subtotal(),
      deliveryFee: currentFee(),
      sameDay: Boolean(quote.sameDay),
      discount: applied,
      discountCode: applied ? applied.code : '',
      referral: totals().referral ? { amount: totals().referral } : null,
      giftCard: totals().gift ? { display: giftApplied.display, amount: totals().gift } : null,
      giftCardCode: giftApplied ? giftApplied.code : '',
      points: totals().points ? { used: totals().pointsUsed, amount: totals().points } : null,
      usePoints: Boolean(totals().points),
      total: orderTotal(),
      payment: data.payment,
      customer: { name: data.name, phone: data.phone, email: data.email },
      delivery: {
        recipient: data.recipient, phone: data.recipientPhone,
        address1: data.address1, address2: data.address2, city: data.city,
        postcode: (RULES.normalizePostcode(data.postcode) || data.postcode).toUpperCase(), date: data.date, slot: data.slot || ''
      },
      message: data.message,
      notes: data.notes
    };
  }

  // Message for "Buy Now on WhatsApp": the customer adds their details in the chat
  function quickText(order) {
    const l = order.lines[0];
    const out = [
      `*New Order - ${shop.name}*`,
      `Order: *${order.id}*`,
      '',
      ...order.lines.map((x) => `• ${x.qty} x ${x.name}${x.gift ? '' : ` (${x.label})`} - ${x.total === 0 ? 'Free' : money(x.total)}`),
      `*Total: ${money(order.total)}*${typeof order.deliveryFee === 'number' ? '' : ' + delivery (to be confirmed)'}`
    ];
    if (order.offer) out.push(`Offer: ${order.offer}`);
    if (order.link) out.push(`Link: ${order.link}`);
    out.push('', 'To complete my order:', 'Name: ', 'Delivery address & postcode: ', 'Delivery date: ', 'Card message: ');
    return l ? out.join('\n') : '';
  }

  function orderText(order, paid) {
    if (order.quick) return quickText(order);
    if (order.giftCardOrder) {
      const g = order.giftCardOrder;
      return [
        `*Gift Card Order - ${shop.name}*`, `Order: *${order.id}*`, '',
        `Gift card: *${money(g.amount)}*`, `For: ${g.to}`, ...(g.from ? [`From: ${g.from}`] : []), ...(g.message ? [`Message: "${g.message}"`] : []), '',
        `Payment: ${paid ? 'Paid by card (Stripe)' : 'To arrange - please send payment details'}`, '',
        '*My details*', order.customer.name, order.customer.phone, ...(order.customer.email ? [order.customer.email] : []),
        ...(order.notes ? ['', order.notes] : [])
      ].join('\n');
    }
    const d = order.delivery;
    const date = new Date(d.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const out = [
      `*New Order - ${shop.name}*`,
      `Order: *${order.id}*`,
      '',
      '*Items*',
      ...order.lines.map((l) => `• ${l.qty} x ${l.name}${l.gift ? '' : ` (${l.label})`} - ${l.total === 0 ? 'Free' : money(l.total)}`),
      '',
      `Subtotal: ${money(order.subtotal)}`,
      `Delivery: ${typeof order.deliveryFee === 'number' ? money(order.deliveryFee) : 'to be confirmed'}${order.sameDay ? ' (same day)' : ''}`,
      ...(order.discount ? [`Discount (${order.discount.code}): -${money(order.discount.amount)}`] : []),
      ...(order.referral ? [`Friend's welcome offer: -${money(order.referral.amount)}`] : []),
      ...(order.giftCard ? [`Gift card (${order.giftCard.display}): -${money(order.giftCard.amount)}`] : []),
      ...(order.points ? [`Points (${order.points.used}): -${money(order.points.amount)}`] : []),
      `*Total: ${money(order.total)}*`,
      `Payment: ${paid ? 'Paid by card (Stripe)' : 'To arrange - please send payment details'}`,
      '',
      '*Customer*',
      order.customer.name,
      order.customer.phone,
      order.customer.email,
      '',
      '*Deliver to*',
      d.recipient + (d.phone ? ` (${d.phone})` : ''),
      d.address1,
      ...(d.address2 ? [d.address2] : []),
      `${d.city} ${d.postcode}`,
      `Date: ${date}${d.slot ? `, ${d.slot}` : ''}`
    ];
    if (order.message) out.push('', '*Card message*', `"${order.message}"`);
    if (order.notes) out.push('', '*Notes*', order.notes);
    return out.join('\n');
  }

  function showConfirmation(order, paid) {
    $('cfRef').textContent = order.id;
    $('cfText').textContent = order.quick
      ? 'WhatsApp has opened with your order. Add your name, delivery address, date and card message, then press send. We will reply to confirm delivery and payment. If WhatsApp did not open, tap below.'
      : paid
        ? 'Your payment was successful. Tap below to send your order details to us on WhatsApp so we can prepare your roses.'
        : 'Your order is ready to send. If WhatsApp did not open, tap below. We will reply to confirm your order and payment.';
    $('cfWhatsapp').href = waLink(orderText(order, paid));
    openDialog($('confirmModal'));
  }

  function saveOrder(order, paid) {
    const orders = load(ORDERS_KEY, []).filter((o) => o.id !== order.id);
    orders.unshift({ ...order, paid });
    store(ORDERS_KEY, orders.slice(0, 25));
  }

  // Send the order to the dashboard (only works on the live site; ignored when offline)
  function recordOrder(order) {
    if (location.protocol === 'file:') return;
    fetch('/api/orders', {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        orderId: order.id, items: order.items, customer: order.customer, quick: order.quick === true,
        delivery: order.delivery, message: order.message, notes: order.notes, discountCode: order.discountCode || '',
        giftCardCode: order.giftCardCode || '', usePoints: order.usePoints === true, giftCardPurchase: order.giftCardOrder || undefined,
        affiliateCode: affiliateCode()
      })
    }).catch(() => {});
  }

  // Opens WhatsApp in a new tab (or the app on phones) as a normal link, which browsers allow
  function openWhatsApp(url) {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // "Buy Now on WhatsApp": no form, the order goes straight into a WhatsApp message
  function quickOrder(productId, optionId, qty, addonIds = []) {
    const product = products[productId];
    const option = product && product.options.find((o) => o.id === optionId);
    if (!option) return;
    const price = L.unitPrice(product, option);
    const gifts = addonIds.filter(addonOk).map((id) => ({ id, ...addons[id] }));
    const subtotal = price * qty + gifts.reduce((n, g) => n + g.price, 0);
    const order = {
      id: makeOrderId(),
      createdAt: new Date().toISOString(),
      quick: true,
      items: [{ productId, optionId, qty }, ...gifts.map((g) => ({ addonId: g.id, qty: 1 }))],
      lines: [{ name: product.name, label: option.label, qty, total: price * qty }, ...gifts.map((g) => ({ name: g.name, label: 'Gift', qty: 1, total: g.price, gift: true }))],
      subtotal,
      deliveryFee: shop.deliveryFee,
      total: subtotal + deliveryFee(),
      payment: 'whatsapp',
      customer: {},
      delivery: {},
      message: '',
      notes: '',
      offer: window.EnvieLayout.saleActive(product) ? `${product.sale.label || 'Special Offer'} (${product.sale.percent}% off)` : '',
      link: location.protocol === 'file:' ? '' : new URL(window.EnvieLayout.productUrl(productId), location.href).href
    };
    openWhatsApp(waLink(orderText(order, false)));
    saveOrder(order, false);
    recordOrder(order);
    showConfirmation(order, false);
  }

  function clearCart() {
    cart = [];
    saveCart();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    if (!form.checkValidity()) {
      const bad = form.querySelector(':invalid');
      errorEl.textContent = 'Please check the highlighted fields.';
      form.classList.add('was-validated');
      if (bad) bad.focus();
      return;
    }
    if (!cart.length) return;
    updateDelivery();
    if (!quote.ok) { errorEl.textContent = quote.error; dateInput.focus(); return; }

    // Create the account first, so the order is saved to it (and any friend's offer applies)
    if ($('coJoinOn').checked && !account) {
      const submitBtn = $('coSubmit');
      submitBtn.disabled = true;
      try {
        const before = orderTotal();
        await joinAtCheckout();
        if (orderTotal() !== before) {
          submitBtn.disabled = false;
          toast('Account created! Your total has been updated, please check it and place your order.');
          return;
        }
        toast('Account created. Thank you for joining!');
      } catch (err) {
        submitBtn.disabled = false;
        errorEl.innerHTML = /already exists/i.test(err.message)
          ? 'You already have an account with this email. <a href="account.html">Log in</a> first, or untick "Create an account".'
          : escapeHtml(err.message);
        return;
      }
      submitBtn.disabled = false;
    }

    const order = buildOrder(makeOrderId());
    const submit = $('coSubmit');

    if (order.payment === 'stripe') {
      submit.disabled = true;
      submit.textContent = 'Connecting to secure payment…';
      store(PENDING_KEY, order);
      try {
        const res = await fetch('/api/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({
            orderId: order.id,
            items: order.items,
            customer: order.customer,
            delivery: order.delivery,
            message: order.message,
            notes: order.notes,
            discountCode: order.discountCode,
            giftCardCode: order.giftCardCode,
            usePoints: order.usePoints,
            affiliateCode: affiliateCode()
          })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.url) throw new Error(data.error || 'Payment is unavailable right now.');
        window.location.href = data.url;
      } catch (err) {
        store(PENDING_KEY, null);
        submit.disabled = false;
        updateSubmitLabel();
        errorEl.textContent = `${err.message} You can choose "Order on WhatsApp" instead.`;
      }
      return;
    }

    // WhatsApp order
    window.open(waLink(orderText(order, false)), '_blank', 'noopener');
    saveOrder(order, false);
    recordOrder(order);
    closeDialog(co);
    clearCart();
    form.reset();
    applied = null;
    giftApplied = null;
    $('coUsePoints').checked = false;
    $('coCodeMsg').textContent = '';
    if (firstMethod) firstMethod.checked = true;
    showConfirmation(order, false);
  });

  // ---------- Return from Stripe ----------
  const params = new URLSearchParams(window.location.search);
  const status = params.get('checkout');
  if (status) {
    const pending = load(PENDING_KEY, null);
    history.replaceState(null, '', window.location.pathname + window.location.hash);
    if (status === 'success' && pending && pending.id === params.get('order')) {
      store(PENDING_KEY, null);
      saveOrder(pending, true);
      clearCart();
      showConfirmation(pending, true);
    } else if (status === 'cancelled') {
      toast('Payment cancelled. Your bag has been saved.');
    }
  }

  // ---------- WhatsApp enquiries ----------
  function enquiryText(subject) {
    return subject
      ? `Hello ${shop.name}, I'm interested in ${subject}. Could you share the options and prices?`
      : `Hello ${shop.name}, I'd like some help choosing roses.`;
  }
  document.querySelectorAll('[data-enquire]').forEach((el) => {
    el.href = waLink(enquiryText(el.dataset.enquire));
    el.target = '_blank';
    el.rel = 'noopener';
  });
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-enquire]');
    if (!el) return;
    // Cards drawn after load: set the link just in time
    el.href = waLink(enquiryText(el.dataset.enquire));
    el.target = '_blank';
    el.rel = 'noopener';
  });

  // ---------- Same-day concierge (floating WhatsApp button) ----------
  const concierge = $('concierge');
  const waFloat = $('waFloat');
  $('conciergeWa').href = waLink(`Hello ${shop.name}, I'd like a bouquet delivered today. My budget is: `);
  // WhatsApp has no official link that starts a call, so open the chat ready for the customer to tap Call
  $('conciergeWaCall').href = `https://wa.me/${shop.whatsapp}`;
  function setConcierge(open) {
    if (open) {
      concierge.hidden = false;
      requestAnimationFrame(() => concierge.classList.add('is-open'));
    } else {
      concierge.classList.remove('is-open');
      setTimeout(() => { if (!concierge.classList.contains('is-open')) concierge.hidden = true; }, 250);
    }
    waFloat.setAttribute('aria-expanded', String(open));
    waFloat.classList.toggle('is-open', open);
  }
  waFloat.addEventListener('click', () => setConcierge(waFloat.getAttribute('aria-expanded') !== 'true'));
  $('conciergeClose').addEventListener('click', () => { setConcierge(false); waFloat.focus(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !concierge.hidden) { setConcierge(false); waFloat.focus(); }
  });
  document.addEventListener('click', (e) => {
    if (!concierge.hidden && !concierge.contains(e.target) && !waFloat.contains(e.target)) setConcierge(false);
  });

  window.EnvieShop = {
    orderText, waLink, money,
    orders: () => load(ORDERS_KEY, []),
    // Used by the product page
    add(productId, optionId, qty, addonIds = []) {
      addToCart(productId, optionId, qty, addonIds);
      renderCount(true);
      toast(`${products[productId].name} added to your bag`);
    },
    buy(productId, optionId, qty, addonIds = []) {
      quickOrder(productId, optionId, qty, addonIds);
    },
    // Used by gift-cards.html. payment: 'whatsapp' or 'stripe'
    async buyGiftCard({ amount, to, from, message, customer, payment }) {
      const order = {
        id: makeOrderId(), createdAt: new Date().toISOString(),
        giftCardOrder: { amount, to, from, message },
        lines: [{ name: `${shop.name} Gift Card`, label: `For ${to}`, qty: 1, total: amount }],
        subtotal: amount, deliveryFee: 0, total: amount, payment, customer, delivery: {}, message: '', notes: ''
      };
      if (payment === 'stripe') {
        store(PENDING_KEY, order);
        const res = await fetch('/api/checkout', {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ orderId: order.id, giftCardPurchase: order.giftCardOrder, customer })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.url) { store(PENDING_KEY, null); throw new Error(data.error || 'Payment is unavailable right now.'); }
        window.location.href = data.url;
        return;
      }
      openWhatsApp(waLink(orderText(order, false)));
      saveOrder(order, false);
      recordOrder(order);
      showConfirmation(order, false);
    },
    accountToken, authHeaders, openWhatsApp
  };

  renderCart();
})();
