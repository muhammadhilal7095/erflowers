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

  // ---------- Discount codes (checked by the server; codes are never stored in the website) ----------
  let applied = null;
  const discountAmount = () => (applied ? applied.amount : 0);
  async function applyCode(silent) {
    const code = RULES.cleanCode($('coCode').value);
    const msg = $('coCodeMsg');
    if (!code) { applied = null; msg.textContent = ''; renderSummary(); return; }
    if (location.protocol === 'file:') { msg.textContent = 'Discount codes work on the live website.'; msg.className = 'co-discount__msg is-error'; return; }
    try {
      const pc = postcodeInput.value.trim();
      const res = await fetch('/api/discount', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, items: itemsForServer(), postcode: RULES.normalizePostcode(pc) ? pc : undefined, date: dateInput.value || undefined })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'That code is not valid.');
      applied = { code: data.code, label: data.label, amount: data.amount };
      msg.textContent = `${data.code} applied: ${data.label}.`;
      msg.className = 'co-discount__msg is-good';
    } catch (err) {
      applied = null;
      if (!silent) { msg.textContent = err.message; msg.className = 'co-discount__msg is-error'; }
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
    $('coTotal').textContent = money(orderTotal());
    $('coTotalLabel').textContent = fee === null ? 'Total (excl. delivery)' : 'Total';
    updateSubmitLabel();
  }
  const orderTotal = () => Math.max(0, subtotal() + (currentFee() || 0) - discountAmount());
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: order.id, items: order.items, customer: order.customer, quick: order.quick === true,
        delivery: order.delivery, message: order.message, notes: order.notes, discountCode: order.discountCode || ''
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

    const order = buildOrder(makeOrderId());
    const submit = $('coSubmit');

    if (order.payment === 'stripe') {
      submit.disabled = true;
      submit.textContent = 'Connecting to secure payment…';
      store(PENDING_KEY, order);
      try {
        const res = await fetch('/api/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: order.id,
            items: order.items,
            customer: order.customer,
            delivery: order.delivery,
            message: order.message,
            notes: order.notes,
            discountCode: order.discountCode
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
    }
  };

  renderCart();
})();
