// Envie Roses — dashboard
// Talks to /api/admin/* (netlify/functions/admin.mjs). Every change is saved straight to the live site.

(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (str) => String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (pence) => '£' + (pence / 100).toFixed(2);
  const toPence = (value) => {
    const n = Number(String(value).replace(/[£,\s]/g, ''));
    return value !== '' && Number.isFinite(n) ? Math.round(n * 100) : NaN;
  };
  const clone = (obj) => JSON.parse(JSON.stringify(obj));
  const icon = (id) => `<svg><use href="#a-${id}"/></svg>`;

  const TOKEN_KEY = 'envie_admin_token';
  let token = null;
  try { token = sessionStorage.getItem(TOKEN_KEY); } catch (e) { /* private mode */ }

  let catalog = null;
  let orders = [];
  let reviews = [];
  let view = 'overview';
  const ui = { productSearch: '', productCat: '', orderSearch: '', orderStatus: '', reviewStatus: 'pending' };

  const CATEGORY_LABELS = { boxes: 'Rose Boxes', bouquets: 'Bouquets', exclusive: 'Exclusive' };
  const STATUS_LABELS = {
    new: 'New', 'awaiting-payment': 'Awaiting payment', confirmed: 'Confirmed', paid: 'Paid',
    'out-for-delivery': 'Out for delivery', delivered: 'Delivered', cancelled: 'Cancelled'
  };
  const IMAGE_SLOTS = [
    ['hero', 'Homepage hero', 'Landscape photo, at least 2000 px wide', 'images/hero.jpg', false],
    ['blueBanner', 'Blue roses banner', 'Homepage banner, any shape', 'images/blue-roses.jpg', false],
    ['bespoke', 'Bespoke section', 'Homepage, portrait or square', 'images/bespoke.jpg', false],
    ['about', 'About photo', 'Homepage and About page', 'images/about-rose.jpg', false],
    ['pageHero', 'Page banner', 'Background behind every inner page title', 'images/page-hero.jpg', false],
    ['insta1', 'Instagram photo 1', 'Square, cropped to 1080 × 1080', 'images/insta-1.jpg', true],
    ['insta2', 'Instagram photo 2', 'Square, cropped to 1080 × 1080', 'images/insta-2.jpg', true],
    ['insta3', 'Instagram photo 3', 'Square, cropped to 1080 × 1080', 'images/insta-3.jpg', true],
    ['insta4', 'Instagram photo 4', 'Square, cropped to 1080 × 1080', 'images/insta-4.jpg', true],
    ['insta5', 'Instagram photo 5', 'Square, cropped to 1080 × 1080', 'images/insta-5.jpg', true]
  ];
  const VIEWS = {
    overview: 'Overview', orders: 'Orders', products: 'Products', reviews: 'Reviews',
    addons: 'Gift Add-ons', delivery: 'Delivery', discounts: 'Discount Codes',
    customers: 'Customers & Points', club: 'Flower Club', giftcards: 'Gift Cards', blog: 'Blog',
    images: 'Site Images', settings: 'Settings'
  };
  const RULES = window.ENVIE_RULES;
  const TAG_GROUPS = [['occasions', 'Occasion'], ['colours', 'Colour'], ['flowers', 'Flowers'], ['recipients', 'Who for']];
  const ADDON_ICONS = { vase: 'Vase', chocolate: 'Chocolates', teddy: 'Teddy bear', balloon: 'Balloon', candle: 'Candle', gift: 'Gift box' };
  const REVIEW_LABELS = { pending: 'Waiting for approval', approved: 'Published', rejected: 'Rejected' };

  // ---------- Feedback ----------
  let toastTimer;
  function toast(message, isError) {
    const el = $('toast');
    el.textContent = message;
    el.classList.toggle('is-error', Boolean(isError));
    el.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-visible'), isError ? 5000 : 2600);
  }

  // ---------- API ----------
  async function api(path, { method = 'GET', body, raw = false, contentType } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = raw ? contentType : 'application/json';
    const res = await fetch(`/api/admin/${path}`, { method, headers, body: body === undefined ? undefined : raw ? body : JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && path !== 'login') {
      logout('Your session has ended. Please log in again.');
      throw new Error('Session ended');
    }
    if (!res.ok) throw new Error(data.error || `Something went wrong (${res.status}).`);
    return data;
  }

  // Save the whole catalogue; the server validates it and the website updates immediately
  async function publish(next, message) {
    try {
      catalog = await api('catalog', { method: 'PUT', body: next });
      toast(message || 'Saved. Your website is updated.');
      return true;
    } catch (err) {
      if (err.message !== 'Session ended') toast(err.message, true);
      return false;
    }
  }

  // ---------- Images ----------
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file could not be opened as an image.')); };
      img.src = url;
    });
  }

  // Square photos are centre-cropped to 1080 × 1080; others are scaled to at most 2200 px wide
  async function prepareImage(file, square) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Please choose a JPG, PNG or WebP image.');
    if (file.size > 25 * 1024 * 1024) throw new Error('That photo is larger than 25 MB.');
    const img = await loadImage(file);
    let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight, w, h;
    if (square) {
      const side = Math.min(sw, sh);
      sx = (sw - side) / 2; sy = (sh - side) / 2; sw = sh = side;
      w = h = 1080;
    } else {
      const scale = Math.min(1, 2200 / sw);
      w = Math.round(sw * scale); h = Math.round(sh * scale);
    }
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
    return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not process the photo.'))), 'image/jpeg', 0.86));
  }

  async function uploadImage(file, square) {
    const blob = await prepareImage(file, square);
    const { url } = await api('upload', { method: 'POST', body: blob, raw: true, contentType: 'image/jpeg' });
    return url;
  }

  // ---------- Helpers ----------
  const priceRange = (p) => {
    if (p.enquire || !p.options.length) return 'Price on request';
    const prices = p.options.map((o) => o.price);
    const lo = Math.min(...prices), hi = Math.max(...prices);
    return lo === hi ? money(lo) : `${money(lo)} – ${money(hi)}`;
  };
  const slugify = (text) => text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'product';
  const fmtDate = (iso, opts = { day: 'numeric', month: 'short', year: 'numeric' }) => (iso ? new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('en-GB', opts) : '—');
  const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '');
  const waNumber = (phone) => {
    let d = String(phone || '').replace(/\D/g, '');
    if (d.startsWith('00')) d = d.slice(2);
    if (d.startsWith('0')) d = '44' + d.slice(1);
    return d;
  };
  const statusBadge = (s) => `<span class="badge st-${esc(s)}">${esc(STATUS_LABELS[s] || s)}</span>`;
  const statusSelect = (o) => `<select class="status-select st-${esc(o.status)}" data-status="${esc(o.id)}" aria-label="Status for ${esc(o.id)}">${Object.entries(STATUS_LABELS).map(([k, v]) => `<option value="${k}"${k === o.status ? ' selected' : ''}>${v}</option>`).join('')}</select>`;
  const paymentLabel = (o) => (o.payment === 'card' ? 'Card (Stripe)' : 'WhatsApp');
  const counts = (o) => o.reduce((acc, x) => ((acc[x.status] = (acc[x.status] || 0) + 1), acc), {});

  function updateBadge() {
    const n = orders.filter((o) => o.status === 'new').length;
    $('newBadge').hidden = !n;
    $('newBadge').textContent = n;
    const r = reviews.filter((x) => x.status === 'pending').length;
    $('reviewBadge').hidden = !r;
    $('reviewBadge').textContent = r;
  }
  const saleLive = (p) => Boolean(p.sale && p.sale.percent > 0 && Date.parse(p.sale.endsAt) > Date.now());

  // ---------- Shell ----------
  function setBar(actionsHtml) { $('barActions').innerHTML = actionsHtml || ''; }

  function go(next) {
    view = VIEWS[next] ? next : 'overview';
    addonDraft = null;
    planDraft = null;
    if (location.hash !== `#${view}`) history.replaceState(null, '', `#${view}`);
    document.querySelectorAll('.side__nav [data-view]').forEach((b) => b.classList.toggle('is-active', b.dataset.view === view));
    $('viewTitle').textContent = VIEWS[view];
    closeSide();
    render();
    window.scrollTo(0, 0);
  }

  function render() {
    ({
      overview: renderOverview, orders: renderOrders, products: renderProducts, reviews: renderReviews,
      addons: renderAddons, delivery: renderDelivery, discounts: renderDiscounts, blog: renderBlog,
      customers: renderCustomers, club: renderClub, giftcards: renderGiftCards,
      images: renderImages, settings: renderSettings
    })[view]();
  }

  // ---------- Overview ----------
  function renderOverview() {
    setBar(`<a href="index.html" target="_blank" rel="noopener" class="btn btn--outline btn--sm">${icon('ext')}<span>View website</span></a>`);
    const now = new Date();
    const monthOrders = orders.filter((o) => {
      const d = new Date(o.createdAt);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const sales = monthOrders.filter((o) => !['cancelled', 'awaiting-payment'].includes(o.status)).reduce((n, o) => n + (o.total || 0), 0);
    const newCount = orders.filter((o) => o.status === 'new').length;
    const toDeliver = orders.filter((o) => ['new', 'confirmed', 'paid', 'out-for-delivery'].includes(o.status)).length;
    const month = now.toLocaleDateString('en-GB', { month: 'long' });

    $('content').innerHTML = `
      <div class="stats">
        <div class="card stat"><p class="stat__label">New orders</p><p class="stat__value">${newCount}</p><p class="stat__sub">Waiting for you to confirm</p></div>
        <div class="card stat"><p class="stat__label">To deliver</p><p class="stat__value">${toDeliver}</p><p class="stat__sub">Open orders</p></div>
        <div class="card stat"><p class="stat__label">Orders in ${esc(month)}</p><p class="stat__value">${monthOrders.length}</p><p class="stat__sub">All channels</p></div>
        <div class="card stat"><p class="stat__label">Sales in ${esc(month)}</p><p class="stat__value">${money(sales)}</p><p class="stat__sub">Excludes cancelled and unpaid card orders</p></div>
      </div>
      <div class="card">
        <div class="card__head"><h2>Latest orders</h2><button type="button" class="btn btn--ghost btn--sm" data-go="orders">View all</button></div>
        ${orders.length ? ordersTable(orders.slice(0, 5)) : emptyOrders()}
      </div>
      <div class="card">
        <div class="card__head"><h2>Quick actions</h2></div>
        <div class="card__body quick">
          <button type="button" data-action="add-product">${icon('plus')}<span><strong>Add a product</strong><small>New rose box or bouquet</small></span></button>
          <button type="button" data-go="images">${icon('image')}<span><strong>Change site photos</strong><small>Hero, banners and Instagram</small></span></button>
          <button type="button" data-go="settings">${icon('gear')}<span><strong>Update settings</strong><small>Contact, delivery and payments</small></span></button>
        </div>
      </div>`;
    bindOrderTable();
  }

  function emptyOrders() {
    return `<div class="empty">${icon('bag')}<strong>No orders yet</strong>Orders placed on your website will appear here.</div>`;
  }

  function ordersTable(list) {
    return `<div class="table-wrap"><table class="table">
      <thead><tr><th>Order</th><th>Customer</th><th>Delivery</th><th>Total</th><th>Payment</th><th>Status</th></tr></thead>
      <tbody>${list.map((o) => `
        <tr data-order="${esc(o.id)}">
          <td class="ref">${esc(o.id)}<small>${fmtDate(o.createdAt)} ${fmtTime(o.createdAt)}</small></td>
          <td data-label="Customer">${o.quick ? 'WhatsApp quick order<small>Details in your WhatsApp chat</small>' : `${esc(o.customer?.name)}<small>${esc(o.customer?.phone)}</small>`}</td>
          <td data-label="Delivery">${o.giftCardOrder ? `Gift card<small>${o.giftCardIssued ? 'Issued ' + esc(o.giftCardIssued) : 'Not issued yet'}</small>` : o.quick ? 'On WhatsApp' : `${fmtDate(o.delivery?.date, { weekday: 'short', day: 'numeric', month: 'short' })}${o.sameDay ? ' · same day' : ''}<small>${esc(o.delivery?.postcode)}${o.delivery?.slot ? ` · ${esc(o.delivery.slot)}` : ''}</small>`}</td>
          <td data-label="Total">${money(o.total || 0)}</td>
          <td data-label="Payment">${paymentLabel(o)}</td>
          <td>${statusSelect(o)}</td>
        </tr>`).join('')}</tbody></table></div>`;
  }

  function bindOrderTable() {
    const content = $('content');
    content.querySelectorAll('tr[data-order]').forEach((row) => row.addEventListener('click', (e) => {
      if (e.target.closest('select')) return;
      openOrder(row.dataset.order);
    }));
    content.querySelectorAll('select[data-status]').forEach((sel) => sel.addEventListener('change', () => setStatus(sel.dataset.status, sel.value)));
  }

  // ---------- Orders ----------
  async function loadOrders() {
    try {
      orders = (await api('orders')).orders || [];
    } catch (err) {
      if (err.message !== 'Session ended') toast(err.message, true);
    }
    updateBadge();
  }

  async function setStatus(id, status) {
    try {
      const updated = await api(`orders/${encodeURIComponent(id)}`, { method: 'PATCH', body: { status } });
      orders = orders.map((o) => (o.id === id ? updated : o));
      updateBadge();
      toast(`${id} marked as ${STATUS_LABELS[status].toLowerCase()}.`);
      if (!$('orderDialog').open) render();
      else openOrder(id);
    } catch (err) {
      if (err.message !== 'Session ended') toast(err.message, true);
      render();
    }
  }

  function renderOrders() {
    setBar(`<button type="button" class="btn btn--outline btn--sm" id="refreshOrders">${icon('refresh')}<span>Refresh</span></button>`);
    const c = counts(orders);
    const q = ui.orderSearch.toLowerCase();
    const list = orders.filter((o) => (!ui.orderStatus || o.status === ui.orderStatus) &&
      (!q || [o.id, o.customer?.name, o.customer?.phone, o.delivery?.recipient, o.delivery?.postcode].join(' ').toLowerCase().includes(q)));
    $('content').innerHTML = `
      <div class="toolbar">
        <input type="search" class="input" id="orderSearch" placeholder="Search order, name, phone or postcode" value="${esc(ui.orderSearch)}">
        <div class="chips">
          <button type="button" class="chip${ui.orderStatus ? '' : ' is-active'}" data-ostatus="">All<span>${orders.length}</span></button>
          ${Object.entries(STATUS_LABELS).map(([k, v]) => `<button type="button" class="chip${ui.orderStatus === k ? ' is-active' : ''}" data-ostatus="${k}">${v}<span>${c[k] || 0}</span></button>`).join('')}
        </div>
      </div>
      <div class="card">${list.length ? ordersTable(list) : orders.length ? '<div class="empty"><strong>No matching orders</strong>Try a different search or status.</div>' : emptyOrders()}</div>`;
    bindOrderTable();
    $('refreshOrders').addEventListener('click', async () => { await loadOrders(); render(); toast('Orders updated.'); });
    const search = $('orderSearch');
    search.addEventListener('input', () => {
      ui.orderSearch = search.value;
      const pos = search.selectionStart;
      renderOrders();
      const again = $('orderSearch');
      again.focus();
      again.setSelectionRange(pos, pos);
    });
    document.querySelectorAll('[data-ostatus]').forEach((b) => b.addEventListener('click', () => { ui.orderStatus = b.dataset.ostatus; renderOrders(); }));
  }

  function openOrder(id) {
    const o = orders.find((x) => x.id === id);
    if (!o) return;
    const d = o.delivery || {};
    const c = o.customer || {};
    const greeting = encodeURIComponent(`Hello ${c.name || ''}, thank you for your Envie Roses order ${o.id}.`);
    $('odTitle').textContent = o.id;
    $('odBody').innerHTML = `
      <div class="od-section">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
          <span>${fmtDate(o.createdAt, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })} at ${fmtTime(o.createdAt)} · ${paymentLabel(o)}</span>
          ${statusSelect(o)}
        </div>
        ${o.payment === 'card' ? '<p class="help" style="margin-top:8px">Card order: check the payment in your Stripe Dashboard before marking it as paid.</p>' : ''}
      </div>
      <div class="od-section">
        <h3>Items</h3>
        <ul class="od-lines">${(o.lines || []).map((l) => `<li><span>${l.qty} × ${esc(l.name)} <span class="help">(${esc(l.label)})</span></span><span>${money(l.total)}</span></li>`).join('')}</ul>
        <div class="od-lines"><li style="display:flex;justify-content:space-between"><span>Delivery${o.sameDay ? ' (same day)' : ''}</span><span>${typeof o.deliveryFee === 'number' ? money(o.deliveryFee) : 'To confirm'}</span></li>
        ${o.discount ? `<li style="display:flex;justify-content:space-between"><span>Discount ${esc(o.discount.code)} <span class="help">(${esc(o.discount.label)})</span></span><span>−${money(o.discount.amount)}</span></li>` : ''}
        ${o.referral ? `<li style="display:flex;justify-content:space-between"><span>Friend's welcome offer${o.referralReturned ? ' <span class="help">(returned)</span>' : ''}</span><span>−${money(o.referral.amount)}</span></li>` : ''}
        ${o.giftCard ? `<li style="display:flex;justify-content:space-between"><span>Gift card ${esc(o.giftCard.display)}${o.giftCardReturned ? ' <span class="help">(returned)</span>' : ''}</span><span>−${money(o.giftCard.amount)}</span></li>` : ''}
        ${o.points ? `<li style="display:flex;justify-content:space-between"><span>${o.points.used} loyalty points${o.pointsReturned ? ' <span class="help">(returned)</span>' : ''}</span><span>−${money(o.points.amount)}</span></li>` : ''}</div>
        <div class="od-total"><span>Total</span><span>${money(o.total || 0)}</span></div>
      </div>
      ${o.quick ? `<div class="od-section"><p class="notice" style="margin:0">Quick order from <strong>Buy Now on WhatsApp</strong>. The customer sends their name, delivery address, date and card message in your WhatsApp chat. Search WhatsApp for <strong>${esc(o.id)}</strong> to find it.</p></div>` : `
      <div class="od-section">
        <h3>Customer</h3>
        <p><strong>${esc(c.name)}</strong></p>
        <p>${esc(c.phone)}${c.email ? ` · ${esc(c.email)}` : ''}</p>
        <div class="od-actions">
          ${c.phone ? `<a class="btn btn--wa btn--sm" href="https://wa.me/${waNumber(c.phone)}?text=${greeting}" target="_blank" rel="noopener">${icon('wa')} WhatsApp</a>` : ''}
          ${c.phone ? `<a class="btn btn--outline btn--sm" href="tel:${esc(c.phone.replace(/[^\d+]/g, ''))}">Call</a>` : ''}
          ${c.email ? `<a class="btn btn--outline btn--sm" href="mailto:${esc(c.email)}?subject=${encodeURIComponent('Your Envie Roses order ' + o.id)}">Email</a>` : ''}
        </div>
      </div>
      <div class="od-section">
        <h3>Deliver to</h3>
        <p><strong>${esc(d.recipient)}</strong>${d.phone ? ` · ${esc(d.phone)}` : ''}</p>
        <p>${[d.address1, d.address2, d.city, d.postcode].filter(Boolean).map(esc).join(', ')}</p>
        <p><strong>${fmtDate(d.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</strong>${d.slot ? ` · ${esc(d.slot)}` : ''}${o.sameDay ? ' <span class="badge st-new">Same day</span>' : ''}</p>
      </div>`}
      ${o.giftCardOrder ? `<div class="od-section"><h3>Gift card</h3>
        <p><strong>${money(o.giftCardOrder.amount)}</strong> for ${esc(o.giftCardOrder.to)}${o.giftCardOrder.from ? ` from ${esc(o.giftCardOrder.from)}` : ''}</p>
        ${o.giftCardOrder.message ? `<p class="od-quote">${esc(o.giftCardOrder.message)}</p>` : ''}
        ${o.giftCardIssued ? `<p>Issued: <strong>${esc(o.giftCardIssued)}</strong></p>` : `<p class="help">Once paid, issue the card and send the code to the customer.</p><button type="button" class="btn btn--gold btn--sm" id="odIssue">${icon('card')} Issue gift card</button>`}
      </div>` : ''}
      ${o.customerId || o.subscriptionId || o.pointsAwarded ? `<div class="od-section"><p class="help">${o.customerId ? 'Customer has an account. ' : ''}${o.subscriptionId ? `Flower Club delivery (${esc(o.subscriptionId)}). ` : ''}${o.pointsAwarded ? `${o.pointsAwarded} points added.` : o.customerId && !o.giftCardOrder ? 'Loyalty points are added when you mark this order Delivered.' : ''}</p></div>` : ''}
      ${o.message ? `<div class="od-section"><h3>Card message</h3><p class="od-quote">${esc(o.message)}</p></div>` : ''}
      ${o.notes ? `<div class="od-section"><h3>Notes</h3><p>${esc(o.notes)}</p></div>` : ''}
      <div class="od-section"><button type="button" class="btn btn--danger btn--sm" id="odDelete">${icon('trash')} Delete order</button></div>`;
    $('odBody').querySelector('select[data-status]').addEventListener('change', (e) => setStatus(o.id, e.target.value));
    if ($('odIssue')) $('odIssue').addEventListener('click', async () => {
      if (!confirm(`Issue a ${money(o.giftCardOrder.amount)} gift card for ${o.giftCardOrder.to}? Only do this once the order is paid.`)) return;
      try {
        const card = await api('giftcards', { method: 'POST', body: { amount: o.giftCardOrder.amount, orderId: o.id, to: o.giftCardOrder.to, note: `Order ${o.id}` } });
        orders = orders.map((x) => (x.id === o.id ? { ...x, giftCardIssued: card.display } : x));
        giftcards = null;
        openOrder(o.id);
        showGiftCode(card, o.customer && o.customer.phone, o.giftCardOrder);
      } catch (err) { if (err.message !== 'Session ended') toast(err.message, true); }
    });
    $('odDelete').addEventListener('click', async () => {
      if (!confirm(`Delete order ${o.id}? This cannot be undone.`)) return;
      try {
        await api(`orders/${encodeURIComponent(o.id)}`, { method: 'DELETE' });
        orders = orders.filter((x) => x.id !== o.id);
        updateBadge();
        $('orderDialog').close();
        render();
        toast('Order deleted.');
      } catch (err) {
        if (err.message !== 'Session ended') toast(err.message, true);
      }
    });
    if (!$('orderDialog').open) $('orderDialog').showModal();
  }

  // ---------- Products ----------
  function renderProducts() {
    setBar(`<button type="button" class="btn btn--gold btn--sm" data-action="add-product">${icon('plus')}<span>Add product</span></button>`);
    const ids = Object.keys(catalog.products);
    const q = ui.productSearch.toLowerCase();
    const shown = ids.filter((id) => {
      const p = catalog.products[id];
      return (!ui.productCat || p.category === ui.productCat) && (!q || `${p.name} ${p.description}`.toLowerCase().includes(q));
    });
    const filtered = Boolean(q || ui.productCat);
    $('content').innerHTML = `
      <div class="notice">${icon('star')}<span>Starred products appear in <strong>The Signature Line</strong> on your homepage. Use the arrows to change the order products appear in the shop.</span></div>
      <div class="toolbar">
        <input type="search" class="input" id="productSearch" placeholder="Search products" value="${esc(ui.productSearch)}">
        <div class="chips">
          <button type="button" class="chip${ui.productCat ? '' : ' is-active'}" data-pcat="">All<span>${ids.length}</span></button>
          ${Object.entries(CATEGORY_LABELS).map(([k, v]) => `<button type="button" class="chip${ui.productCat === k ? ' is-active' : ''}" data-pcat="${k}">${v}<span>${ids.filter((id) => catalog.products[id].category === k).length}</span></button>`).join('')}
        </div>
      </div>
      <div class="card">
        ${shown.length ? `<ul class="plist">${shown.map((id) => {
          const p = catalog.products[id];
          const index = ids.indexOf(id);
          return `<li class="prow" data-id="${esc(id)}">
            <img src="${esc(p.image)}" alt="" loading="lazy">
            <div><p class="prow__name">${esc(p.name)}${saleLive(p) ? ` <span class="badge st-cancelled">-${p.sale.percent}% offer</span>` : ''}</p><p class="prow__id">${esc(id)}</p></div>
            <span class="prow__cat"><span class="badge badge--${esc(p.category)}">${esc(CATEGORY_LABELS[p.category])}</span></span>
            <span class="prow__price">${esc(priceRange(p))}</span>
            <div class="prow__actions">
              <button type="button" class="icon-btn${p.featured ? ' is-on' : ''}" data-pact="feature" title="${p.featured ? 'Remove from homepage' : 'Show on homepage'}" aria-label="${p.featured ? 'Remove from homepage' : 'Show on homepage'}">${icon('star')}</button>
              <button type="button" class="icon-btn mv" data-pact="up" title="Move up" aria-label="Move up"${index === 0 || filtered ? ' disabled' : ''}>${icon('up')}</button>
              <button type="button" class="icon-btn mv" data-pact="down" title="Move down" aria-label="Move down"${index === ids.length - 1 || filtered ? ' disabled' : ''}>${icon('down')}</button>
              <button type="button" class="icon-btn" data-pact="edit" title="Edit" aria-label="Edit">${icon('edit')}</button>
              <button type="button" class="icon-btn icon-btn--danger" data-pact="delete" title="Delete" aria-label="Delete">${icon('trash')}</button>
            </div>
          </li>`;
        }).join('')}</ul>` : `<div class="empty">${icon('box')}<strong>No products found</strong>${ids.length ? 'Try a different search.' : 'Add your first product to get started.'}</div>`}
      </div>`;

    const search = $('productSearch');
    search.addEventListener('input', () => {
      ui.productSearch = search.value;
      const pos = search.selectionStart;
      renderProducts();
      const again = $('productSearch');
      again.focus();
      again.setSelectionRange(pos, pos);
    });
    document.querySelectorAll('[data-pcat]').forEach((b) => b.addEventListener('click', () => { ui.productCat = b.dataset.pcat; renderProducts(); }));
    document.querySelectorAll('[data-pact]').forEach((b) => b.addEventListener('click', () => productAction(b.closest('[data-id]').dataset.id, b.dataset.pact)));
  }

  async function productAction(id, action) {
    const p = catalog.products[id];
    if (action === 'edit') return openProduct(id);
    if (action === 'delete') {
      if (!confirm(`Delete "${p.name}"? It will be removed from your website straight away.`)) return;
      const next = clone(catalog);
      delete next.products[id];
      if (await publish(next, `"${p.name}" deleted.`)) render();
      return;
    }
    if (action === 'feature') {
      const next = clone(catalog);
      if (p.featured) delete next.products[id].featured;
      else next.products[id].featured = true;
      if (await publish(next, p.featured ? 'Removed from the homepage.' : 'Now shown on the homepage.')) render();
      return;
    }
    if (action === 'up' || action === 'down') {
      const ids = Object.keys(catalog.products);
      const i = ids.indexOf(id);
      const j = action === 'up' ? i - 1 : i + 1;
      if (j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      const next = clone(catalog);
      next.products = {};
      ids.forEach((k) => { next.products[k] = catalog.products[k]; });
      if (await publish(next, 'Order updated.')) render();
    }
  }

  // Product editor
  const pd = { id: null, image: '', gallery: [] };
  const form = $('productForm');

  function sizeRow(label = '', price = '', note = '') {
    const row = document.createElement('div');
    row.className = 'size-row';
    row.innerHTML = `
      <input class="input" data-size="label" placeholder="e.g. Standard" maxlength="40" value="${esc(label)}" aria-label="Size name">
      <div class="money"><input class="input" data-size="price" inputmode="decimal" placeholder="0.00" value="${esc(price)}" aria-label="Price in pounds"></div>
      <input class="input" data-size="note" placeholder="Note (optional)" maxlength="60" value="${esc(note)}" aria-label="Size note">
      <button type="button" class="icon-btn icon-btn--danger" aria-label="Remove size">${icon('trash')}</button>`;
    row.querySelector('button').addEventListener('click', () => row.remove());
    $('pdSizes').appendChild(row);
  }

  // Tag checkboxes (occasion, colour, flowers, who for)
  function renderTags(p) {
    $('pdTags').innerHTML = TAG_GROUPS.map(([group, label]) => `
      <div class="tags__group"><p class="tags__title">${label}</p>
        ${Object.entries(RULES.TAGS[group]).map(([k, v]) => `<label class="tag"><input type="checkbox" data-tag="${group}" value="${k}"${(p[group] || []).includes(k) ? ' checked' : ''}><span>${esc(v)}</span></label>`).join('')}
      </div>`).join('');
  }
  function readTags() {
    const out = {};
    TAG_GROUPS.forEach(([group]) => { out[group] = [...$('pdTags').querySelectorAll(`[data-tag="${group}"]:checked`)].map((x) => x.value); });
    return out;
  }

  function setPdImage(url) {
    pd.image = url || '';
    const img = $('pdImg');
    if (url) img.src = url; else img.removeAttribute('src');
    $('pdDrop').classList.toggle('has-img', Boolean(url));
  }

  function syncEnquire() {
    $('pdSizesWrap').hidden = form.elements.enquire.checked;
    $('pdOfferWrap').hidden = form.elements.enquire.checked;
  }
  function syncOffer() {
    $('pdOffer').hidden = !form.elements.saleOn.checked;
  }
  // Offer times are always UK time (Europe/London, including British Summer Time),
  // whatever timezone the computer running the dashboard is set to
  const UK = 'Europe/London';
  function ukParts(ms) {
    const parts = {};
    new Intl.DateTimeFormat('en-GB', { timeZone: UK, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(ms)).forEach((x) => { parts[x.type] = x.value; });
    return parts;
  }
  const toLocalInput = (iso) => {
    const p = ukParts(Date.parse(iso));
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  };
  // "2026-11-02T23:59" read as UK time -> milliseconds
  function fromUkInput(value) {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value || '');
    if (!m) return NaN;
    const wall = Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5]);
    let guess = wall;
    for (let i = 0; i < 2; i++) {
      const p = ukParts(guess);
      const shown = Date.UTC(+p.year, p.month - 1, +p.day, +p.hour, +p.minute);
      guess += wall - shown;
    }
    return guess;
  }

  function renderGallery() {
    $('pdGallery').innerHTML = pd.gallery.map((url, i) => `
      <div class="gal-edit__item"><img src="${esc(url)}" alt=""><button type="button" data-gremove="${i}" aria-label="Remove photo">${icon('close')}</button></div>`).join('') +
      (pd.gallery.length < 8 ? `<button type="button" class="gal-edit__add" id="pdGalleryAdd" aria-label="Add gallery photos">${icon('plus')}</button>` : '');
    const add = $('pdGalleryAdd');
    if (add) add.addEventListener('click', () => $('pdGalleryFile').click());
    $('pdGallery').querySelectorAll('[data-gremove]').forEach((b) => b.addEventListener('click', () => {
      pd.gallery.splice(Number(b.dataset.gremove), 1);
      renderGallery();
    }));
  }
  $('pdGalleryFile').addEventListener('change', async (e) => {
    const files = [...e.target.files].slice(0, 8 - pd.gallery.length);
    e.target.value = '';
    const add = $('pdGalleryAdd');
    if (add) { add.disabled = true; add.textContent = '…'; }
    for (const file of files) {
      try {
        pd.gallery.push(await uploadImage(file, true));
      } catch (err) {
        if (err.message !== 'Session ended') toast(err.message, true);
      }
    }
    renderGallery();
  });

  function openProduct(id) {
    const p = id ? catalog.products[id] : { name: '', category: 'boxes', description: '', image: '', options: [{ label: 'Standard', price: '' }] };
    pd.id = id || null;
    $('pdTitle').textContent = id ? 'Edit product' : 'Add product';
    form.reset();
    form.elements.name.value = p.name;
    form.elements.category.value = p.category;
    form.elements.description.value = p.description || '';
    form.elements.details.value = p.details || '';
    pd.gallery = [...(p.gallery || [])];
    renderGallery();
    // An offer that has already ended starts unticked, so the product can still be saved
    form.elements.saleOn.checked = saleLive(p);
    form.elements.saleLabel.value = p.sale ? p.sale.label || '' : '';
    form.elements.salePercent.value = p.sale ? p.sale.percent : '';
    form.elements.saleEnds.value = p.sale ? toLocalInput(p.sale.endsAt) : '';
    syncOffer();
    form.elements.featured.checked = Boolean(p.featured);
    form.elements.enquire.checked = Boolean(p.enquire);
    $('pdSizes').innerHTML = '';
    (p.options.length ? p.options : [{ label: 'Standard', price: '' }]).forEach((o) => sizeRow(o.label, o.price === '' ? '' : (o.price / 100).toFixed(2), o.note || ''));
    form.elements.recipe.value = p.recipe || '';
    renderTags(p);
    setPdImage(p.image);
    syncEnquire();
    $('pdError').textContent = '';
    $('productDialog').showModal();
    form.elements.name.focus();
  }

  form.elements.enquire.addEventListener('change', syncEnquire);
  form.elements.saleOn.addEventListener('change', syncOffer);
  $('pdAddSize').addEventListener('click', () => sizeRow());

  async function handleProductFile(file) {
    if (!file) return;
    $('pdBusy').hidden = false;
    try {
      setPdImage(await uploadImage(file, true));
    } catch (err) {
      if (err.message !== 'Session ended') toast(err.message, true);
    } finally {
      $('pdBusy').hidden = true;
      $('pdFile').value = '';
    }
  }
  const drop = $('pdDrop');
  drop.addEventListener('click', () => $('pdFile').click());
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('pdFile').click(); } });
  $('pdChange').addEventListener('click', () => $('pdFile').click());
  $('pdFile').addEventListener('change', (e) => handleProductFile(e.target.files[0]));
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('is-over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('is-over'); handleProductFile(e.dataTransfer.files[0]); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('pdError');
    err.textContent = '';
    const name = form.elements.name.value.trim();
    const enquire = form.elements.enquire.checked;
    if (!name) { err.textContent = 'Please enter a product name.'; return form.elements.name.focus(); }
    if (!pd.image) { err.textContent = 'Please upload a product photo.'; return; }

    const options = [];
    if (!enquire) {
      for (const row of $('pdSizes').querySelectorAll('.size-row')) {
        const label = row.querySelector('[data-size="label"]').value.trim();
        const priceText = row.querySelector('[data-size="price"]').value.trim();
        if (!label && !priceText) continue;
        const price = toPence(priceText);
        if (!label) { err.textContent = 'Every size needs a name, e.g. Standard.'; return; }
        if (!Number.isInteger(price) || price <= 0) { err.textContent = `Enter a price for "${label}", e.g. 119.00`; return; }
        const note = row.querySelector('[data-size="note"]').value.trim();
        options.push({ id: slugify(label), label, price, ...(note ? { note } : {}) });
      }
      if (!options.length) { err.textContent = 'Add at least one size and price, or tick "Price on request".'; return; }
    }

    let sale = null;
    if (!enquire && form.elements.saleOn.checked) {
      const percent = Number(form.elements.salePercent.value);
      const ends = fromUkInput(form.elements.saleEnds.value);
      if (!Number.isInteger(percent) || percent < 1 || percent > 90) { err.textContent = 'Enter an offer discount between 1 and 90%.'; return; }
      if (!Number.isFinite(ends)) { err.textContent = 'Choose when the offer ends.'; return; }
      if (ends <= Date.now()) { err.textContent = 'The offer end time must be in the future.'; return; }
      sale = { percent, label: form.elements.saleLabel.value.trim() || 'Special Offer', endsAt: new Date(ends).toISOString() };
    }

    let id = pd.id;
    if (!id) {
      const base = slugify(name);
      id = base;
      for (let n = 2; catalog.products[id]; n++) id = `${base}-${n}`;
    }
    const product = {
      ...(form.elements.featured.checked ? { featured: true } : {}),
      name,
      category: form.elements.category.value,
      image: pd.image,
      description: form.elements.description.value.trim(),
      details: form.elements.details.value.trim(),
      gallery: pd.gallery,
      recipe: form.elements.recipe.value.trim(),
      ...readTags(),
      ...(sale ? { sale } : {}),
      ...(enquire ? { enquire: true } : {}),
      options
    };
    const next = clone(catalog);
    next.products[id] = product;

    $('pdSave').disabled = true;
    const ok = await publish(next, pd.id ? `"${name}" updated.` : `"${name}" added to your shop.`);
    $('pdSave').disabled = false;
    if (ok) {
      $('productDialog').close();
      if (view !== 'products') go('products'); else render();
    }
  });

  // ---------- Reviews ----------
  async function loadReviews() {
    try {
      reviews = (await api('reviews')).reviews || [];
    } catch (err) {
      if (err.message !== 'Session ended') toast(err.message, true);
    }
    updateBadge();
  }

  function renderReviews() {
    setBar(`<button type="button" class="btn btn--outline btn--sm" id="refreshReviews">${icon('refresh')}<span>Refresh</span></button>`);
    const c = counts(reviews);
    const list = reviews.filter((r) => !ui.reviewStatus || r.status === ui.reviewStatus);
    $('content').innerHTML = `
      <div class="notice">${icon('star')}<span>New reviews wait here until you approve them. Publish genuine reviews, good or bad; UK law does not allow hiding negative reviews to mislead customers. Reject only spam, abuse or reviews that are not about your products.</span></div>
      <div class="toolbar">
        <div class="chips">
          ${Object.entries(REVIEW_LABELS).map(([k, v]) => `<button type="button" class="chip${ui.reviewStatus === k ? ' is-active' : ''}" data-rstatus="${k}">${v}<span>${c[k] || 0}</span></button>`).join('')}
          <button type="button" class="chip${ui.reviewStatus ? '' : ' is-active'}" data-rstatus="">All<span>${reviews.length}</span></button>
        </div>
      </div>
      <div class="card">${list.length ? list.map((r) => `
        <div class="rv-card" data-review="${esc(r.productId)}/${esc(r.id)}">
          <div class="rv-card__head">
            <span class="rv-card__stars" aria-label="${r.rating} out of 5 stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
            <span class="badge st-${esc(r.status)}">${esc(REVIEW_LABELS[r.status] || r.status)}</span>
            <a class="rv-card__product" href="product.html?id=${encodeURIComponent(r.productId)}" target="_blank" rel="noopener">${esc(r.productName || r.productId)}</a>
          </div>
          ${r.title ? `<p class="rv-card__title">${esc(r.title)}</p>` : ''}
          <p class="rv-card__text">${esc(r.text)}</p>
          <p class="rv-card__meta">${esc(r.name)}${r.email ? ` · ${esc(r.email)}` : ''} · ${fmtDate(r.createdAt)} ${fmtTime(r.createdAt)}</p>
          <div class="rv-card__actions">
            ${r.status !== 'approved' ? `<button type="button" class="btn btn--gold btn--sm" data-ract="approved">Publish</button>` : ''}
            ${r.status !== 'rejected' ? `<button type="button" class="btn btn--ghost btn--sm" data-ract="rejected">${r.status === 'approved' ? 'Unpublish' : 'Reject'}</button>` : ''}
            <button type="button" class="btn btn--danger btn--sm" data-ract="delete">${icon('trash')} Delete</button>
          </div>
        </div>`).join('') : `<div class="empty">${icon('star')}<strong>No reviews here</strong>${ui.reviewStatus === 'pending' ? 'You are all caught up.' : 'Reviews from customers will appear here.'}</div>`}
      </div>`;
    $('refreshReviews').addEventListener('click', async () => { await loadReviews(); render(); toast('Reviews updated.'); });
    document.querySelectorAll('[data-rstatus]').forEach((b) => b.addEventListener('click', () => { ui.reviewStatus = b.dataset.rstatus; renderReviews(); }));
    document.querySelectorAll('[data-ract]').forEach((b) => b.addEventListener('click', () => reviewAction(b.closest('[data-review]').dataset.review, b.dataset.ract)));
  }

  async function reviewAction(key, action) {
    const [productId, rid] = key.split('/');
    const path = `reviews/${encodeURIComponent(productId)}/${encodeURIComponent(rid)}`;
    try {
      if (action === 'delete') {
        if (!confirm('Delete this review permanently?')) return;
        await api(path, { method: 'DELETE' });
        reviews = reviews.filter((r) => !(r.productId === productId && r.id === rid));
        toast('Review deleted.');
      } else {
        const updated = await api(path, { method: 'PATCH', body: { status: action } });
        reviews = reviews.map((r) => (r.productId === productId && r.id === rid ? updated : r));
        toast(action === 'approved' ? 'Review published on your website.' : 'Review hidden from your website.');
      }
      updateBadge();
      render();
    } catch (err) {
      if (err.message !== 'Session ended') toast(err.message, true);
    }
  }

  // ---------- Site images ----------
  let pendingSlot = null;
  function renderImages() {
    setBar('');
    $('content').innerHTML = `
      <p class="help" style="margin-bottom:16px">Replace the photos used around your website. Changes appear on the live site straight away. Use <strong>Reset</strong> to go back to the original photo.</p>
      <div class="img-grid">${IMAGE_SLOTS.map(([key, label, hint, def]) => {
        const custom = catalog.images[key];
        return `<div class="card img-card">
          <div class="img-card__preview"><img src="${esc(custom || def)}" alt="" loading="lazy"><span class="badge">${custom ? 'Custom' : 'Original'}</span></div>
          <div class="img-card__body">
            <strong>${esc(label)}</strong><small>${esc(hint)}</small>
            <div class="img-card__actions">
              <button type="button" class="btn btn--outline btn--sm" data-replace="${key}">${icon('upload')} Replace</button>
              ${custom ? `<button type="button" class="btn btn--ghost btn--sm" data-reset="${key}">Reset</button>` : ''}
            </div>
          </div>
        </div>`;
      }).join('')}</div>`;
    document.querySelectorAll('[data-replace]').forEach((b) => b.addEventListener('click', () => { pendingSlot = b.dataset.replace; $('siteFile').click(); }));
    document.querySelectorAll('[data-reset]').forEach((b) => b.addEventListener('click', async () => {
      const next = clone(catalog);
      next.images[b.dataset.reset] = '';
      if (await publish(next, 'Original photo restored.')) render();
    }));
  }

  $('siteFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file || !pendingSlot) return;
    const slot = IMAGE_SLOTS.find((s) => s[0] === pendingSlot);
    const btn = document.querySelector(`[data-replace="${pendingSlot}"]`);
    if (btn) { btn.disabled = true; btn.textContent = 'Uploading…'; }
    try {
      const url = await uploadImage(file, slot[4]);
      const next = clone(catalog);
      next.images[pendingSlot] = url;
      await publish(next, `${slot[1]} updated.`);
    } catch (err) {
      if (err.message !== 'Session ended') toast(err.message, true);
    }
    render();
  });


  // ---------- Gift add-ons ----------
  let addonDraft = null;
  function renderAddons() {
    if (!addonDraft) addonDraft = Object.entries(catalog.addons || {}).map(([id, a]) => ({ id, ...a }));
    setBar(`<button type="button" class="btn btn--gold btn--sm" id="saveAddonsTop">Save add-ons</button>`);
    $('content').innerHTML = `
      <div class="notice">${icon('gift')}<span>Gifts customers can add to their order: on the product page, in the quick view and in the bag. Set the price to <strong>0</strong> for a free gift, e.g. a free glass vase. Untick <strong>Show on website</strong> to hide one without deleting it.</span></div>
      <div class="addon-list">${addonDraft.map((a, i) => `
        <div class="card addon-edit" data-i="${i}">
          <button type="button" class="addon-edit__img" data-aimg="${i}" aria-label="Upload photo for ${esc(a.name || 'gift')}">
            ${a.image ? `<img src="${esc(a.image)}" alt="">` : `${icon('upload')}<small>Photo</small>`}
          </button>
          <div class="addon-edit__fields">
            <div class="grid-addon">
              <label class="field"><span>Name</span><input class="input" data-af="name" value="${esc(a.name)}" maxlength="60"></label>
              <label class="field"><span>Price</span><div class="money"><input class="input" data-af="price" inputmode="decimal" value="${a.price === '' ? '' : (a.price / 100).toFixed(2)}" placeholder="0.00"></div></label>
              <label class="field"><span>Icon <small>when there is no photo</small></span><select class="input" data-af="icon">${Object.entries(ADDON_ICONS).map(([k, v]) => `<option value="${k}"${a.icon === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
            </div>
            <label class="field"><span>Description</span><input class="input" data-af="description" value="${esc(a.description)}" maxlength="200"></label>
            <div class="addon-edit__foot">
              <label class="check"><input type="checkbox" data-af="active"${a.active !== false ? ' checked' : ''}> Show on website</label>
              <span>
                ${a.image ? `<button type="button" class="btn btn--ghost btn--sm" data-anoimg="${i}">Remove photo</button>` : ''}
                <button type="button" class="btn btn--danger btn--sm" data-adel="${i}">${icon('trash')} Delete</button>
              </span>
            </div>
          </div>
        </div>`).join('') || `<div class="card"><div class="empty">${icon('gift')}<strong>No gift add-ons</strong>Add chocolates, a teddy or a free vase.</div></div>`}
      </div>
      <div class="od-actions" style="margin-top:16px">
        <button type="button" class="btn btn--outline btn--sm" id="addAddon">${icon('plus')} Add a gift</button>
        <button type="button" class="btn btn--gold btn--sm" id="saveAddons">Save add-ons</button>
      </div>
      <p class="form-error" id="addonError" role="alert"></p>
      <input type="file" id="addonFile" accept="image/jpeg,image/png,image/webp" hidden>`;

    const syncDraft = () => {
      document.querySelectorAll('.addon-edit').forEach((card) => {
        const a = addonDraft[Number(card.dataset.i)];
        card.querySelectorAll('[data-af]').forEach((el) => {
          const k = el.dataset.af;
          if (k === 'active') a.active = el.checked;
          else if (k === 'price') a.price = el.value.trim() === '' ? '' : toPence(el.value);
          else a[k] = el.value;
        });
      });
    };
    let target = null;
    document.querySelectorAll('[data-aimg]').forEach((b) => b.addEventListener('click', () => { syncDraft(); target = Number(b.dataset.aimg); $('addonFile').click(); }));
    $('addonFile').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file || target === null) return;
      const b = document.querySelector(`[data-aimg="${target}"]`);
      b.innerHTML = '<small>Uploading…</small>';
      try { addonDraft[target].image = await uploadImage(file, true); } catch (err) { if (err.message !== 'Session ended') toast(err.message, true); }
      renderAddons();
    });
    document.querySelectorAll('[data-anoimg]').forEach((b) => b.addEventListener('click', () => { syncDraft(); addonDraft[Number(b.dataset.anoimg)].image = ''; renderAddons(); }));
    document.querySelectorAll('[data-adel]').forEach((b) => b.addEventListener('click', () => {
      syncDraft();
      const a = addonDraft[Number(b.dataset.adel)];
      if (!confirm(`Delete "${a.name || 'this gift'}"? Click Save to update the website.`)) return;
      addonDraft.splice(Number(b.dataset.adel), 1);
      renderAddons();
    }));
    $('addAddon').addEventListener('click', () => {
      syncDraft();
      addonDraft.push({ id: '', name: '', price: '', icon: 'gift', image: '', description: '', active: true });
      renderAddons();
      const last = document.querySelector('.addon-edit:last-child [data-af="name"]');
      if (last) last.focus();
    });
    const save = async () => {
      syncDraft();
      const err = $('addonError');
      err.textContent = '';
      const next = clone(catalog);
      next.addons = {};
      for (const a of addonDraft) {
        const name = String(a.name || '').trim();
        if (!name) { err.textContent = 'Every gift needs a name.'; return; }
        if (!Number.isInteger(a.price) || a.price < 0) { err.textContent = `Enter a price for "${name}" (0 for free).`; return; }
        let id = a.id;
        if (!id) { const base = slugify(name); id = base; for (let n = 2; next.addons[id] || addonDraft.some((x) => x !== a && x.id === id); n++) id = `${base}-${n}`; a.id = id; }
        next.addons[id] = { name, price: a.price, icon: a.icon, image: a.image || '', description: String(a.description || '').trim(), active: a.active !== false };
      }
      if (await publish(next, 'Gift add-ons saved. Your website is updated.')) { addonDraft = null; renderAddons(); }
    };
    $('saveAddons').addEventListener('click', save);
    $('saveAddonsTop').addEventListener('click', save);
  }

  // ---------- Delivery ----------
  const lines = (text) => String(text || '').split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);
  function renderDelivery() {
    setBar(`<button type="button" class="btn btn--gold btn--sm" id="saveDeliveryTop">Save delivery</button>`);
    const d = catalog.delivery || {};
    const shop = catalog.shop;
    $('content').innerHTML = `
      <form id="deliveryForm" novalidate>
        <div class="settings-grid">
          <div class="card">
            <div class="card__head"><h2>Same-day delivery</h2></div>
            <div class="card__body">
              <label class="check"><input type="checkbox" name="sameDayEnabled"${d.sameDayEnabled ? ' checked' : ''}> Offer same-day delivery online</label>
              <div class="grid2" style="margin-top:12px">
                <label class="field"><span>Order by (UK time)</span><input class="input" type="time" name="sameDayCutoff" value="${esc(d.sameDayCutoff || '14:00')}"></label>
                <label class="field"><span>Same-day charge <small>empty = normal charge</small></span><div class="money"><input class="input" name="sameDayFee" inputmode="decimal" value="${typeof d.sameDayFee === 'number' ? (d.sameDayFee / 100).toFixed(2) : ''}" placeholder="e.g. 14.95"></div></label>
              </div>
              <label class="field"><span>Same-day postcode areas <small>separate with commas. "SW" covers all SW postcodes; "SW1" covers only SW1.</small></span><textarea class="input" name="sameDayAreas" rows="3">${esc((d.sameDayAreas || []).join(', '))}</textarea></label>
              <p class="help">Customers in these areas can choose today at checkout until the cut-off time.</p>
            </div>
          </div>

          <div class="card">
            <div class="card__head"><h2>Time slots</h2></div>
            <div class="card__body">
              <label class="field"><span>Delivery time slots <small>one per line; leave empty to hide the time choice</small></span><textarea class="input" name="slots" rows="4">${esc((d.slots || []).join('\n'))}</textarea></label>
              <p class="help">Customers pick one at checkout. Earliest date online: <strong>${[['0', 'same day'], ['1', 'next day'], ['2', 'in 2 days'], ['3', 'in 3 days']].find(([n]) => Number(n) === Number(shop.minDeliveryDays))?.[1] || shop.minDeliveryDays + ' days'}</strong> (change it in <a href="#settings" data-go="settings">Settings</a>).</p>
            </div>
          </div>

          <div class="card">
            <div class="card__head"><h2>Closed days</h2></div>
            <div class="card__body">
              <label class="field"><span>Dates you don't deliver <small>one per line, like 2026-12-25</small></span><textarea class="input" name="closedDates" rows="4">${esc((d.closedDates || []).join('\n'))}</textarea></label>
              <div class="od-actions"><input class="input" type="date" id="addClosed" aria-label="Pick a date to close" style="max-width:200px"><button type="button" class="btn btn--outline btn--sm" id="addClosedBtn">${icon('plus')} Add date</button></div>
            </div>
          </div>

          <div class="card">
            <div class="card__head"><h2>Areas we can't deliver to online</h2></div>
            <div class="card__body">
              <label class="field"><span>Postcode areas <small>separate with commas</small></span><textarea class="input" name="noDeliveryAreas" rows="3">${esc((d.noDeliveryAreas || []).join(', '))}</textarea></label>
              <p class="help">Customers with these postcodes are asked to message you on WhatsApp instead (e.g. islands).</p>
            </div>
          </div>

          <div class="card">
            <div class="card__head"><h2>City delivery pages</h2></div>
            <div class="card__body">
              <label class="field"><span>Towns and cities <small>one per line; each gets its own page, listed on the Delivery page</small></span><textarea class="input" name="cities" rows="6">${esc((catalog.cities || []).join('\n'))}</textarea></label>
            </div>
          </div>
        </div>
        <p class="form-error" id="deliveryError" role="alert" style="margin-top:16px"></p>
        <button type="submit" class="btn btn--gold" id="saveDelivery">Save delivery</button>
      </form>`;
    const f = $('deliveryForm');
    $('addClosedBtn').addEventListener('click', () => {
      const v = $('addClosed').value;
      if (!v) return;
      const list = new Set(lines(f.elements.closedDates.value));
      list.add(v);
      f.elements.closedDates.value = [...list].sort().join('\n');
      $('addClosed').value = '';
    });
    $('saveDeliveryTop').addEventListener('click', () => f.requestSubmit());
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('deliveryError');
      err.textContent = '';
      const feeText = f.elements.sameDayFee.value.trim();
      const fee = feeText === '' ? null : toPence(feeText);
      if (fee !== null && (!Number.isInteger(fee) || fee < 0)) { err.textContent = 'Enter the same-day charge, e.g. 14.95, or leave it empty.'; return; }
      const area = (x) => x.toUpperCase().replace(/\s+/g, '');
      const next = clone(catalog);
      next.delivery = {
        sameDayEnabled: f.elements.sameDayEnabled.checked,
        sameDayCutoff: f.elements.sameDayCutoff.value || '14:00',
        sameDayFee: fee,
        sameDayAreas: lines(f.elements.sameDayAreas.value).map(area),
        slots: f.elements.slots.value.split('\n').map((x) => x.trim()).filter(Boolean),
        noDeliveryAreas: lines(f.elements.noDeliveryAreas.value).map(area),
        closedDates: lines(f.elements.closedDates.value)
      };
      next.cities = f.elements.cities.value.split('\n').map((x) => x.trim()).filter(Boolean);
      $('saveDelivery').disabled = true;
      const ok = await publish(next, 'Delivery settings saved. Your website is updated.');
      $('saveDelivery').disabled = false;
      if (ok) renderDelivery(); else err.textContent = 'Not saved. Please check the details above.';
    });
  }

  // ---------- Discount codes ----------
  let discounts = null;
  const DISCOUNT_TYPES = { percent: '% off', fixed: '£ off', 'free-delivery': 'Free delivery' };
  async function renderDiscounts() {
    setBar(`<button type="button" class="btn btn--gold btn--sm" id="saveCodesTop">Save codes</button>`);
    if (!discounts) {
      $('content').innerHTML = '<div class="card"><div class="empty">Loading codes…</div></div>';
      try { discounts = (await api('discounts')).discounts || []; } catch (err) { if (err.message !== 'Session ended') toast(err.message, true); return; }
      if (view !== 'discounts') return;
    }
    const ukDate = (iso) => (iso ? toLocalInput(iso).slice(0, 10) : '');
    $('content').innerHTML = `
      <div class="notice">${icon('tag')}<span>Customers type a code at checkout. Codes are checked on the server, so they never appear in your website's code. Leave <strong>Expires</strong> empty for no end date; a code works until the end of that day (UK time).</span></div>
      <div class="card">
        <div class="table-wrap"><table class="table codes">
          <thead><tr><th>Code</th><th>Type</th><th>Amount</th><th>Min. spend</th><th>Expires</th><th>On</th><th>Note</th><th></th></tr></thead>
          <tbody>${discounts.map((d, i) => `
            <tr data-i="${i}">
              <td><input class="input" data-df="code" value="${esc(d.code)}" maxlength="30" aria-label="Code" style="text-transform:uppercase"></td>
              <td><select class="input" data-df="type" aria-label="Type">${Object.entries(DISCOUNT_TYPES).map(([k, v]) => `<option value="${k}"${d.type === k ? ' selected' : ''}>${v}</option>`).join('')}</select></td>
              <td><input class="input" data-df="value" inputmode="decimal" value="${d.type === 'fixed' ? (d.value / 100).toFixed(2) : d.type === 'percent' ? d.value : ''}" aria-label="Amount"${d.type === 'free-delivery' ? ' disabled' : ''} placeholder="${d.type === 'percent' ? '10' : '5.00'}"></td>
              <td><div class="money"><input class="input" data-df="minSpend" inputmode="decimal" value="${d.minSpend ? (d.minSpend / 100).toFixed(2) : ''}" placeholder="0.00" aria-label="Minimum spend"></div></td>
              <td><input class="input" type="date" data-df="endsAt" value="${esc(ukDate(d.endsAt))}" aria-label="Expires"></td>
              <td><input type="checkbox" data-df="active"${d.active !== false ? ' checked' : ''} aria-label="Active"></td>
              <td><input class="input" data-df="note" value="${esc(d.note)}" maxlength="100" placeholder="e.g. Instagram" aria-label="Note"></td>
              <td><button type="button" class="icon-btn icon-btn--danger" data-ddel="${i}" aria-label="Delete code">${icon('trash')}</button></td>
            </tr>`).join('')}</tbody>
        </table></div>
        ${discounts.length ? '' : `<div class="empty">${icon('tag')}<strong>No discount codes yet</strong>Add one, e.g. WELCOME10 for 10% off.</div>`}
      </div>
      <div class="od-actions" style="margin-top:16px">
        <button type="button" class="btn btn--outline btn--sm" id="addCode">${icon('plus')} Add code</button>
        <button type="button" class="btn btn--gold btn--sm" id="saveCodes">Save codes</button>
      </div>
      <p class="form-error" id="codeError" role="alert"></p>`;

    const read = () => [...document.querySelectorAll('.codes tbody tr')].map((row) => {
      const g = (k) => row.querySelector(`[data-df="${k}"]`);
      const type = g('type').value;
      const raw = g('value').value.trim();
      const ends = g('endsAt').value;
      return {
        code: g('code').value.trim().toUpperCase(), type,
        value: type === 'percent' ? Number(raw) : type === 'fixed' ? toPence(raw) : 0,
        minSpend: g('minSpend').value.trim() ? toPence(g('minSpend').value) : 0,
        endsAt: ends ? new Date(fromUkInput(`${ends}T23:59`) + 59000).toISOString() : '',
        active: g('active').checked,
        note: g('note').value.trim()
      };
    });
    document.querySelectorAll('[data-df="type"]').forEach((sel) => sel.addEventListener('change', () => { discounts = read(); renderDiscounts(); }));
    document.querySelectorAll('[data-ddel]').forEach((b) => b.addEventListener('click', () => { discounts = read(); discounts.splice(Number(b.dataset.ddel), 1); renderDiscounts(); }));
    $('addCode').addEventListener('click', () => {
      discounts = read();
      discounts.push({ code: '', type: 'percent', value: '', minSpend: 0, endsAt: '', active: true, note: '' });
      renderDiscounts();
      const rows = document.querySelectorAll('.codes [data-df="code"]');
      rows[rows.length - 1].focus();
    });
    const save = async () => {
      const err = $('codeError');
      err.textContent = '';
      const list = read();
      for (const d of list) {
        if (d.type !== 'free-delivery' && !(Number.isFinite(d.value) && d.value > 0)) { err.textContent = `Enter an amount for ${d.code || 'each code'}.`; return; }
        if (!Number.isFinite(d.minSpend)) { err.textContent = `Check the minimum spend for ${d.code}.`; return; }
      }
      try {
        discounts = (await api('discounts', { method: 'PUT', body: list })).discounts;
        toast('Discount codes saved.');
        renderDiscounts();
      } catch (e2) {
        if (e2.message !== 'Session ended') err.textContent = e2.message;
      }
    };
    $('saveCodes').addEventListener('click', save);
    $('saveCodesTop').addEventListener('click', save);
  }

  // ---------- Blog ----------
  let posts = null;
  async function renderBlog() {
    setBar(`<button type="button" class="btn btn--gold btn--sm" id="newPost">${icon('plus')}<span>New post</span></button>`);
    $('newPost').addEventListener('click', () => openPost(null));
    if (!posts) {
      $('content').innerHTML = '<div class="card"><div class="empty">Loading posts…</div></div>';
      try { posts = (await api('posts')).posts || []; } catch (err) { if (err.message !== 'Session ended') toast(err.message, true); return; }
      if (view !== 'blog') return;
    }
    $('content').innerHTML = `
      <div class="notice">${icon('pen')}<span>Posts appear on your <a href="blog.html" target="_blank" rel="noopener">Blog</a> page once published. Drafts are only visible here.</span></div>
      <div class="card">${posts.length ? `<ul class="plist">${posts.map((p) => `
        <li class="prow prow--post" data-slug="${esc(p.slug)}">
          ${p.cover ? `<img src="${esc(p.cover)}" alt="" loading="lazy">` : `<span class="prow__ph">${icon('pen')}</span>`}
          <div><p class="prow__name">${esc(p.title)}</p><p class="prow__id">${fmtDate(p.date)} · /post.html?slug=${esc(p.slug)}</p></div>
          <span class="prow__cat"><span class="badge ${p.status === 'published' ? 'st-delivered' : 'st-awaiting-payment'}">${p.status === 'published' ? 'Published' : 'Draft'}</span></span>
          <div class="prow__actions">
            ${p.status === 'published' ? `<a class="icon-btn" href="post.html?slug=${encodeURIComponent(p.slug)}" target="_blank" rel="noopener" title="View" aria-label="View post">${icon('ext')}</a>` : ''}
            <button type="button" class="icon-btn" data-bact="edit" title="Edit" aria-label="Edit">${icon('edit')}</button>
            <button type="button" class="icon-btn icon-btn--danger" data-bact="delete" title="Delete" aria-label="Delete">${icon('trash')}</button>
          </div>
        </li>`).join('')}</ul>` : `<div class="empty">${icon('pen')}<strong>No posts yet</strong>Write about rose care, gift ideas or your latest designs.</div>`}
      </div>`;
    document.querySelectorAll('[data-bact]').forEach((b) => b.addEventListener('click', async () => {
      const slug = b.closest('[data-slug]').dataset.slug;
      if (b.dataset.bact === 'edit') return openPost(slug);
      const p = posts.find((x) => x.slug === slug);
      if (!confirm(`Delete "${p.title}"? This cannot be undone.`)) return;
      try {
        await api(`posts/${encodeURIComponent(slug)}`, { method: 'DELETE' });
        posts = posts.filter((x) => x.slug !== slug);
        toast('Post deleted.');
        renderBlog();
      } catch (err) { if (err.message !== 'Session ended') toast(err.message, true); }
    }));
  }

  const bp = { slug: null, cover: '' };
  const postForm = $('postForm');
  function setCover(url) {
    bp.cover = url || '';
    if (url) $('bpImg').src = url; else $('bpImg').removeAttribute('src');
    $('bpDrop').classList.toggle('has-img', Boolean(url));
    $('bpRemoveCover').hidden = !url;
  }
  function openPost(slug) {
    const p = slug ? posts.find((x) => x.slug === slug) : { title: '', slug: '', date: new Date().toISOString().slice(0, 10), status: 'draft', cover: '', excerpt: '', body: '' };
    bp.slug = slug;
    $('bpTitle').textContent = slug ? 'Edit post' : 'New post';
    postForm.reset();
    ['title', 'slug', 'date', 'status', 'excerpt', 'body'].forEach((k) => { postForm.elements[k].value = p[k] || ''; });
    setCover(p.cover);
    $('bpError').textContent = '';
    $('postDialog').showModal();
    postForm.elements.title.focus();
  }
  async function handleCover(file) {
    if (!file) return;
    $('bpBusy').hidden = false;
    try { setCover(await uploadImage(file, false)); } catch (err) { if (err.message !== 'Session ended') toast(err.message, true); }
    finally { $('bpBusy').hidden = true; $('bpFile').value = ''; }
  }
  $('bpDrop').addEventListener('click', () => $('bpFile').click());
  $('bpDrop').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('bpFile').click(); } });
  $('bpFile').addEventListener('change', (e) => handleCover(e.target.files[0]));
  $('bpRemoveCover').addEventListener('click', () => setCover(''));
  postForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('bpError');
    err.textContent = '';
    const post = {};
    ['title', 'slug', 'date', 'status', 'excerpt', 'body'].forEach((k) => { post[k] = postForm.elements[k].value.trim(); });
    post.cover = bp.cover;
    if (!post.title) { err.textContent = 'Please add a title.'; return postForm.elements.title.focus(); }
    if (!post.body) { err.textContent = 'Please write the post text.'; return postForm.elements.body.focus(); }
    const newSlug = slugify(post.slug || post.title);
    if (newSlug !== bp.slug && posts.some((x) => x.slug === newSlug)) { err.textContent = 'Another post already uses that web address. Change the title or web address.'; return; }
    $('bpSave').disabled = true;
    try {
      const saved = await api('posts', { method: 'PUT', body: { post, previousSlug: bp.slug } });
      posts = [saved, ...posts.filter((x) => x.slug !== bp.slug && x.slug !== saved.slug)].sort((a, b) => String(b.date).localeCompare(String(a.date)));
      $('postDialog').close();
      toast(saved.status === 'published' ? 'Post published.' : 'Draft saved.');
      if (view === 'blog') renderBlog();
    } catch (e2) {
      if (e2.message !== 'Session ended') err.textContent = e2.message;
    } finally {
      $('bpSave').disabled = false;
    }
  });


  // ---------- Customers & loyalty points ----------
  let customers = null;
  async function renderCustomers() {
    setBar(`<button type="button" class="btn btn--outline btn--sm" id="refreshCustomers">${icon('refresh')}<span>Refresh</span></button>`);
    $('refreshCustomers').addEventListener('click', () => { customers = null; renderCustomers(); });
    if (!customers) {
      $('content').innerHTML = '<div class="card"><div class="empty">Loading customers…</div></div>';
      try { customers = (await api('customers')).customers || []; } catch (err) { if (err.message !== 'Session ended') toast(err.message, true); return; }
      if (view !== 'customers') return;
    }
    const ly = catalog.loyalty;
    const q = (ui.customerSearch || '').toLowerCase();
    const list = customers.filter((c) => !q || `${c.name} ${c.email} ${c.phone}`.toLowerCase().includes(q));
    $('content').innerHTML = `
      <div class="card">
        <div class="card__head"><h2>Loyalty points</h2></div>
        <form class="card__body" id="loyaltyForm" novalidate>
          <label class="check"><input type="checkbox" name="enabled"${ly.enabled ? ' checked' : ''}> Loyalty points are on</label>
          <div class="grid-loyalty">
            <label class="field"><span>Points per £1 spent</span><input class="input" name="pointsPerPound" type="number" min="0" max="100" value="${ly.pointsPerPound}"></label>
            <label class="field"><span>Points for £1 off</span><input class="input" name="perPound" type="number" min="1" max="100" value="${Math.round(100 / ly.pointValue)}"></label>
            <label class="field"><span>Smallest number to use</span><input class="input" name="minRedeem" type="number" min="0" value="${ly.minRedeem}"></label>
            <label class="field"><span>Most of an order (%)</span><input class="input" name="maxPercent" type="number" min="1" max="100" value="${ly.maxPercent}"></label>
            <label class="field"><span>Welcome points</span><input class="input" name="signupBonus" type="number" min="0" value="${ly.signupBonus}"></label>
          </div>
          <p class="help">Points are added when you mark an order <strong>Delivered</strong>, and taken back (with any points used) if you mark it <strong>Cancelled</strong>. "Points for £1 off" must divide into 100 (e.g. 100, 50, 20, 10).</p>
          <button type="submit" class="btn btn--gold btn--sm" style="margin-top:12px">Save loyalty settings</button>
        </form>
      </div>
      <div class="card">
        <div class="card__head"><h2>Refer a friend</h2></div>
        <form class="card__body" id="referForm" novalidate>
          <label class="check"><input type="checkbox" name="enabled"${catalog.referrals.enabled ? ' checked' : ''}> Refer a friend is on</label>
          <div class="grid-loyalty">
            <label class="field"><span>Friend's discount</span><div class="money"><input class="input" name="friendAmount" inputmode="decimal" value="${(catalog.referrals.friendAmount / 100).toFixed(2)}"></div></label>
            <label class="field"><span>Minimum first order</span><div class="money"><input class="input" name="minSpend" inputmode="decimal" value="${(catalog.referrals.minSpend / 100).toFixed(2)}"></div></label>
            <label class="field"><span>Points for the referrer</span><input class="input" name="referrerPoints" type="number" min="0" value="${catalog.referrals.referrerPoints}"></label>
            <label class="field"><span>Most rewards per customer</span><input class="input" name="maxPerCustomer" type="number" min="1" value="${catalog.referrals.maxPerCustomer}"></label>
          </div>
          <p class="help">Customers share their link from My Account. The friend's discount applies to their first order (not with discount codes). The referrer's points are added when that order is marked <strong>Delivered</strong>, and removed if it's cancelled.</p>
          <button type="submit" class="btn btn--gold btn--sm" style="margin-top:12px">Save referral settings</button>
        </form>
      </div>
      <div class="toolbar"><input type="search" class="input" id="customerSearch" placeholder="Search name, email or phone" value="${esc(ui.customerSearch || '')}"></div>
      <div class="card">${list.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>Customer</th><th>Phone</th><th>Joined</th><th>Orders</th><th>Points</th><th>Referrals</th><th></th></tr></thead>
        <tbody>${list.map((c) => `
          <tr data-cid="${esc(c.id)}">
            <td class="ref">${esc(c.name)}<small>${esc(c.email)}</small></td>
            <td data-label="Phone">${esc(c.phone) || '—'}</td>
            <td data-label="Joined">${fmtDate(c.createdAt)}</td>
            <td data-label="Orders">${c.orderCount}</td>
            <td data-label="Points"><strong>${c.points}</strong></td>
            <td data-label="Referrals">${c.referralStats.joined}${c.referralStats.joined ? `<small>${c.referralStats.rewarded} rewarded</small>` : ''}${c.referredBy ? `<small>Invited by ${esc(c.referredBy)}</small>` : ''}</td>
            <td><div class="row-actions">
              <button type="button" class="btn btn--outline btn--sm" data-cact="points">Points</button>
              <button type="button" class="btn btn--ghost btn--sm" data-cact="reset">Reset link</button>
              <button type="button" class="icon-btn icon-btn--danger" data-cact="delete" aria-label="Delete account">${icon('trash')}</button>
            </div></td>
          </tr>`).join('')}</tbody></table></div>`
        : `<div class="empty">${icon('user')}<strong>${customers.length ? 'No matching customers' : 'No customer accounts yet'}</strong>${customers.length ? '' : 'Customers create an account on the My Account page.'}</div>`}</div>`;

    const search = $('customerSearch');
    search.addEventListener('input', () => { ui.customerSearch = search.value; const pos = search.selectionStart; renderCustomers(); const s2 = $('customerSearch'); s2.focus(); s2.setSelectionRange(pos, pos); });
    $('referForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const friendAmount = toPence(f.elements.friendAmount.value);
      const minSpend = toPence(f.elements.minSpend.value || '0');
      if (!Number.isInteger(friendAmount) || friendAmount < 100) { toast("Enter the friend's discount, e.g. 10.00", true); return; }
      if (!Number.isInteger(minSpend) || minSpend < 0) { toast('Enter the minimum first order, e.g. 40.00', true); return; }
      const next = clone(catalog);
      next.referrals = { enabled: f.elements.enabled.checked, friendAmount, minSpend, referrerPoints: Number(f.elements.referrerPoints.value), maxPerCustomer: Number(f.elements.maxPerCustomer.value) };
      if (await publish(next, 'Referral settings saved.')) renderCustomers();
    });
    $('loyaltyForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const per = Number(f.elements.perPound.value);
      if (!Number.isInteger(per) || per < 1 || 100 % per) { toast('"Points for £1 off" must divide into 100, e.g. 100, 50 or 10.', true); return; }
      const next = clone(catalog);
      next.loyalty = {
        enabled: f.elements.enabled.checked, pointsPerPound: Number(f.elements.pointsPerPound.value), pointValue: 100 / per,
        minRedeem: Number(f.elements.minRedeem.value), maxPercent: Number(f.elements.maxPercent.value), signupBonus: Number(f.elements.signupBonus.value)
      };
      if (await publish(next, 'Loyalty settings saved.')) renderCustomers();
    });
    document.querySelectorAll('[data-cact]').forEach((b) => b.addEventListener('click', async () => {
      const id = b.closest('[data-cid]').dataset.cid;
      const c = customers.find((x) => x.id === id);
      try {
        if (b.dataset.cact === 'points') {
          const n = prompt(`${c.name} has ${c.points} points.\nPoints to add (use a minus sign to remove, e.g. -200):`);
          if (n === null || n.trim() === '') return;
          const reason = prompt('Reason (shown to the customer):', 'Thank you from Envie Roses') || 'Adjusted by Envie Roses';
          const updated = await api(`customers/${id}`, { method: 'PATCH', body: { points: Number(n), reason } });
          customers = customers.map((x) => (x.id === id ? { ...x, points: updated.points } : x));
          toast(`${c.name} now has ${updated.points} points.`);
          renderCustomers();
        } else if (b.dataset.cact === 'reset') {
          const { link } = await api(`customers/${id}/reset-link`, { method: 'POST' });
          const text = encodeURIComponent(`Hello ${c.name}, here is your link to set a new Envie Roses password (it works for 1 hour): ${link}`);
          showDialogHtml('Password reset link', `<p>This link lets ${esc(c.name)} choose a new password. It works for one hour, once.</p>
            <input class="input" readonly value="${esc(link)}" onclick="this.select()">
            <div class="od-actions" style="margin-top:12px">${c.phone ? `<a class="btn btn--wa btn--sm" target="_blank" rel="noopener" href="https://wa.me/${waNumber(c.phone)}?text=${text}">${icon('wa')} Send on WhatsApp</a>` : ''}
            <a class="btn btn--outline btn--sm" href="mailto:${esc(c.email)}?subject=${encodeURIComponent('Reset your password')}&body=${text}">Email</a></div>`);
        } else if (b.dataset.cact === 'delete') {
          if (!confirm(`Delete ${c.name}'s account? Their orders stay in Orders, but their points and saved addresses are deleted.`)) return;
          await api(`customers/${id}`, { method: 'DELETE' });
          customers = customers.filter((x) => x.id !== id);
          toast('Account deleted.');
          renderCustomers();
        }
      } catch (err) { if (err.message !== 'Session ended') toast(err.message, true); }
    }));
  }

  // A simple information dialog (reuses the order dialog)
  function showDialogHtml(title, html) {
    $('odTitle').textContent = title;
    $('odBody').innerHTML = `<div class="od-section">${html}</div>`;
    if (!$('orderDialog').open) $('orderDialog').showModal();
  }
  function showGiftCode(card, phone, gift) {
    const text = encodeURIComponent(`Thank you for your order! Here is your Envie Roses gift card${gift && gift.to ? ` for ${gift.to}` : ''}:\n\nCode: ${card.display}\nValue: ${money(card.initial)}\nValid until: ${fmtDate(card.expiresAt)}\n\nUse it at checkout in the "Discount or gift card code" box.`);
    showDialogHtml('Gift card issued', `<p class="gc-code">${esc(card.display)}</p><p>${money(card.initial)}, valid until ${fmtDate(card.expiresAt)}.</p>
      <div class="od-actions">${phone ? `<a class="btn btn--wa btn--sm" target="_blank" rel="noopener" href="https://wa.me/${waNumber(phone)}?text=${text}">${icon('wa')} Send code on WhatsApp</a>` : ''}
      <button type="button" class="btn btn--outline btn--sm" onclick="navigator.clipboard && navigator.clipboard.writeText('${esc(card.display)}')">Copy code</button></div>`);
  }

  // ---------- Gift cards ----------
  let giftcards = null;
  async function renderGiftCards() {
    setBar(`<button type="button" class="btn btn--gold btn--sm" id="newCard">${icon('plus')}<span>Issue gift card</span></button>`);
    $('newCard').addEventListener('click', async () => {
      const amount = toPence(prompt('Gift card value in £ (e.g. 50):') || '');
      if (!Number.isInteger(amount) || amount <= 0) return;
      const note = prompt('Note (optional, e.g. who it is for):') || '';
      try {
        const card = await api('giftcards', { method: 'POST', body: { amount, note } });
        giftcards = null;
        await renderGiftCards();
        showGiftCode(card, '', null);
      } catch (err) { if (err.message !== 'Session ended') toast(err.message, true); }
    });
    if (!giftcards) {
      $('content').innerHTML = '<div class="card"><div class="empty">Loading gift cards…</div></div>';
      try { giftcards = (await api('giftcards')).giftcards || []; } catch (err) { if (err.message !== 'Session ended') toast(err.message, true); return; }
      if (view !== 'giftcards') return;
    }
    const gc = catalog.giftCards;
    $('content').innerHTML = `
      <div class="card">
        <div class="card__head"><h2>Gift card shop</h2></div>
        <form class="card__body" id="gcSettings" novalidate>
          <label class="check"><input type="checkbox" name="enabled"${gc.enabled ? ' checked' : ''}> Sell gift cards on the website (<a href="gift-cards.html" target="_blank" rel="noopener">Gift Cards page</a>)</label>
          <div class="grid2" style="margin-top:12px">
            <label class="field"><span>Amounts customers can choose <small>in £, separated by commas</small></span><input class="input" name="amounts" value="${gc.amounts.map((a) => a / 100).join(', ')}"></label>
            <label class="field"><span>Valid for (months)</span><input class="input" name="months" type="number" min="12" max="120" value="${gc.months}"></label>
          </div>
          <p class="help">When someone buys a gift card it appears in <strong>Orders</strong>. Once it's paid, open the order and press <strong>Issue gift card</strong>, then send them the code.</p>
          <button type="submit" class="btn btn--gold btn--sm" style="margin-top:12px">Save</button>
        </form>
      </div>
      <div class="card">${giftcards.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>Code</th><th>Value</th><th>Balance</th><th>Expires</th><th>Note</th><th>Active</th></tr></thead>
        <tbody>${giftcards.map((c) => `
          <tr>
            <td class="ref">${esc(c.display)}<small>${fmtDate(c.createdAt)}${c.orderId ? ' · ' + esc(c.orderId) : ''}</small></td>
            <td data-label="Value">${money(c.initial)}</td>
            <td data-label="Balance"><strong>${money(c.balance)}</strong>${c.uses.length ? `<small>${c.uses.filter((u) => !u.refund).length} use(s)</small>` : ''}</td>
            <td data-label="Expires">${fmtDate(c.expiresAt)}${Date.parse(c.expiresAt) < Date.now() ? ' <span class="badge st-cancelled">Expired</span>' : ''}</td>
            <td data-label="Note">${esc(c.note || c.to || '')}</td>
            <td><input type="checkbox" data-gcact="${esc(c.code)}"${c.active ? ' checked' : ''} aria-label="Active"></td>
          </tr>`).join('')}</tbody></table></div>` : `<div class="empty">${icon('card')}<strong>No gift cards yet</strong>Issue one here, or from a gift card order.</div>`}</div>`;
    $('gcSettings').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const amounts = f.elements.amounts.value.split(',').map((x) => toPence(x.trim())).filter((x) => Number.isInteger(x) && x > 0);
      const next = clone(catalog);
      next.giftCards = { enabled: f.elements.enabled.checked, amounts, months: Number(f.elements.months.value) };
      if (await publish(next, 'Gift card settings saved.')) renderGiftCards();
    });
    document.querySelectorAll('[data-gcact]').forEach((b) => b.addEventListener('change', async () => {
      try {
        const card = await api(`giftcards/${encodeURIComponent(b.dataset.gcact)}`, { method: 'PATCH', body: { active: b.checked } });
        giftcards = giftcards.map((x) => (x.code === card.code ? card : x));
        toast(card.active ? 'Gift card can be used.' : 'Gift card switched off.');
      } catch (err) { if (err.message !== 'Session ended') toast(err.message, true); }
    }));
  }

  // ---------- Flower Club ----------
  let subscriptions = null;
  const SUB_LABELS = { pending: 'Waiting to start', 'awaiting-payment': 'Awaiting payment', active: 'Active', paused: 'Paused', 'past-due': 'Payment failed', cancelled: 'Cancelled' };
  const SUB_BADGE = { pending: 'new', 'awaiting-payment': 'awaiting-payment', active: 'delivered', paused: 'confirmed', 'past-due': 'cancelled', cancelled: 'cancelled' };
  let planDraft = null;
  async function renderClub() {
    setBar(`<button type="button" class="btn btn--outline btn--sm" id="refreshSubs">${icon('refresh')}<span>Refresh</span></button>`);
    $('refreshSubs').addEventListener('click', () => { subscriptions = null; renderClub(); });
    if (!subscriptions) {
      $('content').innerHTML = '<div class="card"><div class="empty">Loading subscriptions…</div></div>';
      try { subscriptions = (await api('subscriptions')).subscriptions || []; } catch (err) { if (err.message !== 'Session ended') toast(err.message, true); return; }
      if (view !== 'club') return;
    }
    const club = catalog.club;
    if (!planDraft) planDraft = Object.entries(club.plans || {}).map(([id, p]) => ({ id, ...p }));
    const FREQ = { weekly: 'Weekly', fortnightly: 'Every 2 weeks', monthly: 'Monthly' };
    $('content').innerHTML = `
      <div class="notice">${icon('rose')}<span>Customers join on the <a href="club.html" target="_blank" rel="noopener">Flower Club page</a> (they need an account). With Stripe card payments on, they are charged automatically and each paid delivery appears in <strong>Orders</strong>. Otherwise the request comes to you on WhatsApp: arrange payment, then set it to <strong>Active</strong> here.</span></div>
      <div class="card">${subscriptions.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>Subscriber</th><th>Plan</th><th>Deliver to</th><th>Payment</th><th>Status</th><th></th></tr></thead>
        <tbody>${subscriptions.map((s) => `
          <tr data-sid="${esc(s.id)}">
            <td class="ref">${esc(s.customer.name)}<small>${esc(s.customer.phone || s.customer.email)}</small></td>
            <td data-label="Plan">${esc(s.planName)} · ${money(s.price)}<small>${esc(s.frequencyLabel)} from ${fmtDate(s.startDate)}</small></td>
            <td data-label="Deliver to">${esc(s.delivery.recipient)}<small>${esc([s.delivery.address1, s.delivery.city, s.delivery.postcode].filter(Boolean).join(', '))}</small></td>
            <td data-label="Payment">${s.payment === 'card' ? 'Card (Stripe)' : 'WhatsApp'}${s.cancelAtPeriodEnd ? '<small>Ends after this period</small>' : ''}</td>
            <td><select class="status-select st-${SUB_BADGE[s.status] || 'new'}" data-sstatus aria-label="Status">${Object.entries(SUB_LABELS).map(([k, v]) => `<option value="${k}"${k === s.status ? ' selected' : ''}>${v}</option>`).join('')}</select></td>
            <td><div class="row-actions">
              ${s.customer.phone ? `<a class="btn btn--wa btn--sm" target="_blank" rel="noopener" href="https://wa.me/${waNumber(s.customer.phone)}?text=${encodeURIComponent(`Hello ${s.customer.name}, about your Envie Roses Flower Club subscription ${s.id}:`)}">${icon('wa')}</a>` : ''}
              ${s.stripeSubscription && s.status !== 'cancelled' ? `<button type="button" class="btn btn--danger btn--sm" data-scancel>Cancel</button>` : `<button type="button" class="icon-btn icon-btn--danger" data-sdel aria-label="Delete">${icon('trash')}</button>`}
            </div></td>
          </tr>`).join('')}</tbody></table></div>` : `<div class="empty">${icon('rose')}<strong>No subscriptions yet</strong>They appear here when customers join the Flower Club.</div>`}</div>

      <div class="card">
        <div class="card__head"><h2>Plans</h2><label class="check"><input type="checkbox" id="clubOn"${club.enabled ? ' checked' : ''}> Flower Club open</label></div>
        <div class="card__body">
          <div class="field"><span>How often customers can choose</span><div class="radio-row">${Object.entries(FREQ).map(([k, v]) => `<label><input type="checkbox" data-freq="${k}"${club.frequencies.includes(k) ? ' checked' : ''}> ${v}</label>`).join('')}</div></div>
          <div class="addon-list">${planDraft.map((p, i) => `
            <div class="card addon-edit" data-pi="${i}">
              <button type="button" class="addon-edit__img" data-pimg="${i}" aria-label="Upload photo">${p.image ? `<img src="${esc(p.image)}" alt="">` : `${icon('upload')}<small>Photo</small>`}</button>
              <div class="addon-edit__fields">
                <div class="grid2">
                  <label class="field"><span>Plan name</span><input class="input" data-pf="name" value="${esc(p.name)}" maxlength="60"></label>
                  <label class="field"><span>Price per delivery <small>delivery included</small></span><div class="money"><input class="input" data-pf="price" inputmode="decimal" value="${p.price ? (p.price / 100).toFixed(2) : ''}"></div></label>
                </div>
                <label class="field"><span>Description</span><input class="input" data-pf="description" value="${esc(p.description)}" maxlength="300"></label>
                <div class="addon-edit__foot">
                  <label class="check"><input type="checkbox" data-pf="active"${p.active !== false ? ' checked' : ''}> Show on website</label>
                  <button type="button" class="btn btn--danger btn--sm" data-pdel="${i}">${icon('trash')} Delete</button>
                </div>
              </div>
            </div>`).join('')}</div>
          <div class="od-actions" style="margin-top:14px">
            <button type="button" class="btn btn--outline btn--sm" id="addPlan">${icon('plus')} Add plan</button>
            <button type="button" class="btn btn--gold btn--sm" id="savePlans">Save plans</button>
          </div>
          <div class="field" style="margin-top:18px"><span>Flower Club popup <small>a calendar-style popup advertising your plans</small></span>
            <div class="grid-loyalty">
              <label class="check"><input type="checkbox" id="popOn"${catalog.popup.enabled ? ' checked' : ''}> Show the popup</label>
              <label class="field"><span>Show after (seconds)</span><input class="input" id="popDelay" type="number" min="0" max="120" value="${catalog.popup.delay}"></label>
              <label class="field"><span>Where</span><select class="input" id="popPages"><option value="home"${catalog.popup.pages === 'home' ? ' selected' : ''}>Homepage only</option><option value="all"${catalog.popup.pages === 'all' ? ' selected' : ''}>Every page</option></select></label>
              <label class="field"><span>Show again after (days)</span><input class="input" id="popDays" type="number" min="1" max="60" value="${catalog.popup.everyDays}"></label>
            </div>
          </div>
          <p class="help" style="margin-top:10px">Price changes apply to new subscribers. Existing card subscribers keep the price they signed up at.</p>
          <input type="file" id="planFile" accept="image/jpeg,image/png,image/webp" hidden>
        </div>
      </div>`;

    document.querySelectorAll('[data-sstatus]').forEach((sel) => sel.addEventListener('change', async () => {
      const id = sel.closest('[data-sid]').dataset.sid;
      try {
        const s = await api(`subscriptions/${id}`, { method: 'PATCH', body: { status: sel.value } });
        subscriptions = subscriptions.map((x) => (x.id === id ? s : x));
        toast(`Subscription ${SUB_LABELS[s.status].toLowerCase()}.`);
        renderClub();
      } catch (err) { if (err.message !== 'Session ended') toast(err.message, true); }
    }));
    document.querySelectorAll('[data-scancel]').forEach((b) => b.addEventListener('click', async () => {
      const id = b.closest('[data-sid]').dataset.sid;
      if (!confirm('Cancel this subscription? Stripe stops charging the customer straight away.')) return;
      try {
        const s = await api(`subscriptions/${id}/cancel`, { method: 'POST' });
        subscriptions = subscriptions.map((x) => (x.id === id ? s : x));
        toast('Subscription cancelled.');
        renderClub();
      } catch (err) { if (err.message !== 'Session ended') toast(err.message, true); }
    }));
    document.querySelectorAll('[data-sdel]').forEach((b) => b.addEventListener('click', async () => {
      const id = b.closest('[data-sid]').dataset.sid;
      if (!confirm('Delete this subscription record?')) return;
      try {
        await api(`subscriptions/${id}`, { method: 'DELETE' });
        subscriptions = subscriptions.filter((x) => x.id !== id);
        renderClub();
      } catch (err) { if (err.message !== 'Session ended') toast(err.message, true); }
    }));

    const sync = () => document.querySelectorAll('[data-pi]').forEach((card) => {
      const p = planDraft[Number(card.dataset.pi)];
      card.querySelectorAll('[data-pf]').forEach((el) => {
        const k = el.dataset.pf;
        if (k === 'active') p.active = el.checked;
        else if (k === 'price') p.price = toPence(el.value);
        else p[k] = el.value;
      });
    });
    let target = null;
    document.querySelectorAll('[data-pimg]').forEach((b) => b.addEventListener('click', () => { sync(); target = Number(b.dataset.pimg); $('planFile').click(); }));
    $('planFile').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file || target === null) return;
      try { planDraft[target].image = await uploadImage(file, true); } catch (err) { if (err.message !== 'Session ended') toast(err.message, true); }
      renderClub();
    });
    document.querySelectorAll('[data-pdel]').forEach((b) => b.addEventListener('click', () => { sync(); planDraft.splice(Number(b.dataset.pdel), 1); renderClub(); }));
    $('addPlan').addEventListener('click', () => { sync(); planDraft.push({ id: '', name: '', description: '', image: '', price: NaN, active: true }); renderClub(); });
    $('savePlans').addEventListener('click', async () => {
      sync();
      const next = clone(catalog);
      const plans = {};
      for (const p of planDraft) {
        const name = String(p.name || '').trim();
        if (!name) { toast('Every plan needs a name.', true); return; }
        if (!Number.isInteger(p.price) || p.price < 100) { toast(`Enter a price for "${name}".`, true); return; }
        let id = p.id;
        if (!id) { const base = slugify(name); id = base; for (let n = 2; plans[id] || planDraft.some((x) => x !== p && x.id === id); n++) id = `${base}-${n}`; p.id = id; }
        plans[id] = { name, description: String(p.description || '').trim(), image: p.image || '', price: p.price, active: p.active !== false };
      }
      const frequencies = [...document.querySelectorAll('[data-freq]:checked')].map((x) => x.dataset.freq);
      if (!frequencies.length) { toast('Choose at least one delivery frequency.', true); return; }
      next.club = { enabled: $('clubOn').checked, frequencies, plans };
      next.popup = { enabled: $('popOn').checked, delay: Number($('popDelay').value), pages: $('popPages').value, everyDays: Number($('popDays').value) };
      if (await publish(next, 'Flower Club saved.')) { planDraft = null; renderClub(); }
    });
  }

  // ---------- Settings ----------
  function renderSettings() {
    setBar(`<button type="button" class="btn btn--gold btn--sm" id="saveSettingsTop">Save settings</button>`);
    const { shop, legal, social, payments } = catalog;
    const feeMode = shop.deliveryFee === null ? 'tbc' : shop.deliveryFee === 0 ? 'free' : 'fixed';
    const v = (x) => esc(x ?? '');
    $('content').innerHTML = `
      <form id="settingsForm" novalidate>
        <div class="settings-grid">
          <div class="card">
            <div class="card__head"><h2>Business &amp; contact</h2></div>
            <div class="card__body">
              <label class="field"><span>Shop name</span><input name="shop.name" value="${v(shop.name)}" maxlength="80"></label>
              <div class="grid2">
                <label class="field"><span>Phone</span><input name="shop.phone" value="${v(shop.phone)}" maxlength="30"></label>
                <label class="field"><span>WhatsApp number <small>digits only, e.g. 447464418817</small></span><input name="shop.whatsapp" value="${v(shop.whatsapp)}" inputmode="numeric" maxlength="15"></label>
              </div>
              <label class="field"><span>Email</span><input name="shop.email" type="email" value="${v(shop.email)}" maxlength="120"></label>
              <label class="field"><span>Location</span><input name="shop.location" value="${v(shop.location)}" maxlength="100"></label>
              <label class="field"><span>Opening hours <small>shown on the Contact page; leave empty to hide</small></span><input name="shop.hours" value="${v(shop.hours)}" maxlength="120" placeholder="e.g. Mon–Sat 9am–7pm, Sun 10am–4pm"></label>
            </div>
          </div>

          <div class="card">
            <div class="card__head"><h2>Delivery</h2></div>
            <div class="card__body">
              <div class="field"><span>Delivery charge</span>
                <div class="radio-row">
                  <label><input type="radio" name="feeMode" value="tbc"${feeMode === 'tbc' ? ' checked' : ''}> Confirm with customer</label>
                  <label><input type="radio" name="feeMode" value="free"${feeMode === 'free' ? ' checked' : ''}> Free</label>
                  <label><input type="radio" name="feeMode" value="fixed"${feeMode === 'fixed' ? ' checked' : ''}> Fixed charge</label>
                </div>
                <div class="money" id="feeWrap"${feeMode === 'fixed' ? '' : ' hidden'}><input class="input" name="feeAmount" inputmode="decimal" value="${feeMode === 'fixed' ? (shop.deliveryFee / 100).toFixed(2) : ''}" placeholder="9.95"></div>
              </div>
              <label class="field"><span>Earliest delivery date online</span>
                <select name="shop.minDeliveryDays">
                  ${[[0, 'Same day'], [1, 'Next day'], [2, 'In 2 days'], [3, 'In 3 days']].map(([n, l]) => `<option value="${n}"${Number(shop.minDeliveryDays) === n ? ' selected' : ''}>${l}</option>`).join('')}
                </select>
              </label>
            </div>
          </div>

          <div class="card">
            <div class="card__head"><h2>Payments</h2></div>
            <div class="card__body">
              <label class="check"><input type="checkbox" name="payments.whatsapp"${payments.whatsapp ? ' checked' : ''}> Order on WhatsApp</label>
              <label class="check"><input type="checkbox" name="payments.stripe"${payments.stripe ? ' checked' : ''}> Card, Apple Pay &amp; Google Pay (Stripe)</label>
              <p class="help" style="margin-top:8px">Only switch on card payments after adding your Stripe key in Netlify (see SETUP.md).</p>
            </div>
          </div>

          <div class="card">
            <div class="card__head"><h2>Social media</h2></div>
            <div class="card__body">
              <p class="help" style="margin-bottom:12px">Paste the full link to each profile. Icons only appear on your website when a link is added.</p>
              ${['instagram', 'facebook', 'tiktok', 'pinterest'].map((k) => `<label class="field"><span>${k[0].toUpperCase() + k.slice(1)}</span><input name="social.${k}" type="url" value="${v(social[k])}" placeholder="https://"></label>`).join('')}
            </div>
          </div>

          <div class="card">
            <div class="card__head"><h2>Legal details</h2></div>
            <div class="card__body">
              <p class="help" style="margin-bottom:12px">Shown in your footer and policies. Limited companies must show their registered name, number and office.</p>
              <label class="field"><span>Registered company name</span><input name="legal.companyName" value="${v(legal.companyName)}" placeholder="e.g. Envie Roses Ltd"></label>
              <div class="grid2">
                <label class="field"><span>Company number</span><input name="legal.companyNumber" value="${v(legal.companyNumber)}"></label>
                <label class="field"><span>Registered in</span><input name="legal.registeredIn" value="${v(legal.registeredIn)}"></label>
              </div>
              <label class="field"><span>Registered office address</span><input name="legal.registeredAddress" value="${v(legal.registeredAddress)}"></label>
              <div class="grid2">
                <label class="field"><span>VAT number</span><input name="legal.vatNumber" value="${v(legal.vatNumber)}" placeholder="If VAT registered"></label>
                <label class="field"><span>Policies last updated</span><input name="legal.updated" value="${v(legal.updated)}"></label>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card__head"><h2>Backup</h2></div>
            <div class="card__body">
              <p class="help" style="margin-bottom:12px">Download a copy of your products and settings, or restore a previous backup. Photos stay on the website.</p>
              <div class="od-actions">
                <button type="button" class="btn btn--outline btn--sm" id="downloadBackup">Download backup</button>
                <button type="button" class="btn btn--ghost btn--sm" id="restoreBackup">Restore backup</button>
              </div>
            </div>
          </div>
        </div>
        <p class="form-error" id="settingsError" role="alert" style="margin-top:16px"></p>
        <button type="submit" class="btn btn--gold" id="saveSettings">Save settings</button>
      </form>`;

    const sf = $('settingsForm');
    sf.querySelectorAll('[name="feeMode"]').forEach((r) => r.addEventListener('change', () => { $('feeWrap').hidden = sf.elements.feeMode.value !== 'fixed'; }));
    $('saveSettingsTop').addEventListener('click', () => sf.requestSubmit());
    sf.addEventListener('submit', saveSettings);
    $('downloadBackup').addEventListener('click', downloadBackup);
    $('restoreBackup').addEventListener('click', () => $('backupFile').click());
  }

  async function saveSettings(e) {
    e.preventDefault();
    const sf = $('settingsForm');
    const err = $('settingsError');
    err.textContent = '';
    const next = clone(catalog);
    sf.querySelectorAll('input[name*="."], select[name*="."]').forEach((el) => {
      const [group, key] = el.name.split('.');
      next[group][key] = el.type === 'checkbox' ? el.checked : el.value.trim();
    });
    next.shop.minDeliveryDays = Number(next.shop.minDeliveryDays);
    const mode = sf.elements.feeMode.value;
    if (mode === 'tbc') next.shop.deliveryFee = null;
    else if (mode === 'free') next.shop.deliveryFee = 0;
    else {
      const fee = toPence(sf.elements.feeAmount.value);
      if (!Number.isInteger(fee) || fee <= 0) { err.textContent = 'Enter the delivery charge, e.g. 9.95'; return; }
      next.shop.deliveryFee = fee;
    }
    $('saveSettings').disabled = true;
    const ok = await publish(next, 'Settings saved. Your website is updated.');
    $('saveSettings').disabled = false;
    if (!ok) err.textContent = 'Not saved. Please check the details above.';
  }

  function downloadBackup() {
    const blob = new Blob([JSON.stringify(catalog, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `envie-roses-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  $('backupFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch (err) {
      return toast('That file is not a valid backup.', true);
    }
    if (!confirm('Restore this backup? It will replace your current products and settings on the live website.')) return;
    if (await publish(data, 'Backup restored.')) render();
  });

  // ---------- Global events ----------
  document.addEventListener('click', (e) => {
    const goBtn = e.target.closest('[data-go]');
    if (goBtn) return go(goBtn.dataset.go);
    if (e.target.closest('[data-action="add-product"]')) openProduct(null);
  });
  document.querySelectorAll('.side__nav [data-view]').forEach((b) => b.addEventListener('click', () => go(b.dataset.view)));
  document.querySelectorAll('dialog').forEach((d) => {
    d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
    d.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => d.close()));
  });

  function openSide() { $('side').classList.add('is-open'); $('sideOverlay').classList.add('is-open'); document.body.classList.add('lock'); }
  function closeSide() { $('side').classList.remove('is-open'); $('sideOverlay').classList.remove('is-open'); document.body.classList.remove('lock'); }
  $('menuBtn').addEventListener('click', openSide);
  $('sideOverlay').addEventListener('click', closeSide);

  // ---------- Login ----------
  function logout(message) {
    token = null;
    try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ }
    catalog = null;
    orders = [];
    discounts = null;
    posts = null;
    customers = null;
    subscriptions = null;
    giftcards = null;
    document.querySelectorAll('dialog[open]').forEach((d) => d.close());
    $('app').hidden = true;
    $('login').hidden = false;
    $('loginError').textContent = message || '';
    $('loginPassword').value = '';
    $('loginPassword').focus();
  }
  $('logout').addEventListener('click', () => logout());

  async function start() {
    try {
      const [cat] = await Promise.all([api('catalog'), loadOrders(), loadReviews()]);
      catalog = cat;
    } catch (err) {
      if (err.message !== 'Session ended') logout(err.message);
      return;
    }
    $('login').hidden = true;
    $('app').hidden = false;
    go(location.hash.slice(1) || 'overview');
  }

  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('loginBtn');
    $('loginError').textContent = '';
    btn.disabled = true;
    btn.textContent = 'Logging in…';
    try {
      const data = await api('login', { method: 'POST', body: { password: $('loginPassword').value } });
      token = data.token;
      try { sessionStorage.setItem(TOKEN_KEY, token); } catch (err) { /* ignore */ }
      await start();
    } catch (err) {
      $('loginError').textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Log in';
    }
  });

  if (location.protocol === 'file:') {
    $('loginError').textContent = 'The dashboard works on your live website (or with "netlify dev"), not when opening the file directly.';
    $('loginBtn').disabled = true;
  } else if (token) {
    start();
  }
})();
