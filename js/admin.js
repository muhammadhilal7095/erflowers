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
  const VIEWS = { overview: 'Overview', orders: 'Orders', products: 'Products', reviews: 'Reviews', images: 'Site Images', settings: 'Settings' };
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
    if (location.hash !== `#${view}`) history.replaceState(null, '', `#${view}`);
    document.querySelectorAll('.side__nav [data-view]').forEach((b) => b.classList.toggle('is-active', b.dataset.view === view));
    $('viewTitle').textContent = VIEWS[view];
    closeSide();
    render();
    window.scrollTo(0, 0);
  }

  function render() {
    ({ overview: renderOverview, orders: renderOrders, products: renderProducts, reviews: renderReviews, images: renderImages, settings: renderSettings })[view]();
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
          <td data-label="Delivery">${o.quick ? 'On WhatsApp' : `${fmtDate(o.delivery?.date, { weekday: 'short', day: 'numeric', month: 'short' })}<small>${esc(o.delivery?.postcode)}</small>`}</td>
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
        <div class="od-lines"><li style="display:flex;justify-content:space-between"><span>Delivery</span><span>${typeof o.deliveryFee === 'number' ? money(o.deliveryFee) : 'To confirm'}</span></li></div>
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
        <p><strong>${fmtDate(d.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</strong></p>
      </div>`}
      ${o.message ? `<div class="od-section"><h3>Card message</h3><p class="od-quote">${esc(o.message)}</p></div>` : ''}
      ${o.notes ? `<div class="od-section"><h3>Notes</h3><p>${esc(o.notes)}</p></div>` : ''}
      <div class="od-section"><button type="button" class="btn btn--danger btn--sm" id="odDelete">${icon('trash')} Delete order</button></div>`;
    $('odBody').querySelector('select[data-status]').addEventListener('change', (e) => setStatus(o.id, e.target.value));
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

  function sizeRow(label = '', price = '') {
    const row = document.createElement('div');
    row.className = 'size-row';
    row.innerHTML = `
      <input class="input" data-size="label" placeholder="e.g. Standard" maxlength="40" value="${esc(label)}" aria-label="Size name">
      <div class="money"><input class="input" data-size="price" inputmode="decimal" placeholder="0.00" value="${esc(price)}" aria-label="Price in pounds"></div>
      <button type="button" class="icon-btn icon-btn--danger" aria-label="Remove size">${icon('trash')}</button>`;
    row.querySelector('button').addEventListener('click', () => row.remove());
    $('pdSizes').appendChild(row);
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
    form.elements.saleOn.checked = Boolean(p.sale);
    form.elements.saleLabel.value = p.sale ? p.sale.label || '' : '';
    form.elements.salePercent.value = p.sale ? p.sale.percent : '';
    form.elements.saleEnds.value = p.sale ? toLocalInput(p.sale.endsAt) : '';
    syncOffer();
    form.elements.featured.checked = Boolean(p.featured);
    form.elements.enquire.checked = Boolean(p.enquire);
    $('pdSizes').innerHTML = '';
    (p.options.length ? p.options : [{ label: 'Standard', price: '' }]).forEach((o) => sizeRow(o.label, o.price === '' ? '' : (o.price / 100).toFixed(2)));
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
        options.push({ id: slugify(label), label, price });
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
