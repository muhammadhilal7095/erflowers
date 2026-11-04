// Envie Roses — My Account page (account.html)
// Log in / create account / reset password, then orders, Flower Club, points, addresses and details.

(function () {
  const $ = (id) => document.getElementById(id);
  const { money, esc } = window.EnvieLayout;
  const CATALOG = window.ENVIE_CATALOG;
  const KEY = 'envie_account_token';
  const getToken = () => { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } };
  const setToken = (t) => { try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch (e) { /* private mode */ } };
  const date = (d, opts = { day: 'numeric', month: 'long', year: 'numeric' }) => (d ? new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('en-GB', opts) : '');
  const STATUS = {
    new: 'Received', 'awaiting-payment': 'Waiting for payment', confirmed: 'Confirmed', paid: 'Paid',
    'out-for-delivery': 'Out for delivery', delivered: 'Delivered', cancelled: 'Cancelled',
    pending: 'Being set up', active: 'Active', paused: 'Paused', 'past-due': 'Payment problem'
  };
  let data = null;

  async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch('/api/account/' + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(getToken() ? { Authorization: 'Bearer ' + getToken() } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    const out = await res.json().catch(() => ({}));
    if (res.status === 401 && path === 'me') { setToken(''); throw Object.assign(new Error('logged out'), { auth: true }); }
    if (!res.ok) throw new Error(out.error || 'Something went wrong. Please try again.');
    return out;
  }

  // ---------- Logged out ----------
  function showTab(name) {
    document.querySelectorAll('.auth__tabs [data-tab]').forEach((b) => { const on = b.dataset.tab === name; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', on); });
    document.querySelectorAll('.auth__form').forEach((f) => { f.hidden = f.dataset.pane !== name; });
    $('authBox').querySelector('.auth__tabs').hidden = name === 'reset' || name === 'forgot';
    const first = document.querySelector(`.auth__form[data-pane="${name}"] input`);
    if (first) first.focus({ preventScroll: true });
  }
  document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

  function formHandler(form, run) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = form.querySelector('.form-error');
      const btn = form.querySelector('button[type="submit"]');
      err.textContent = '';
      if (!form.checkValidity()) { err.textContent = 'Please complete the fields above.'; form.querySelector(':invalid').focus(); return; }
      btn.disabled = true;
      try {
        await run(Object.fromEntries(new FormData(form).entries()), form);
      } catch (ex) {
        err.textContent = ex.message;
      } finally {
        btn.disabled = false;
      }
    });
  }
  formHandler($('loginForm'), async (v) => { const r = await api('login', { method: 'POST', body: v }); setToken(r.token); await start(); });
  formHandler($('registerForm'), async (v) => { const r = await api('register', { method: 'POST', body: v }); setToken(r.token); await start(); });
  formHandler($('forgotForm'), async (v, f) => {
    const r = await api('forgot', { method: 'POST', body: v });
    f.querySelector('.form-ok').innerHTML = r.emailed
      ? 'If that email has an account, a reset link is on its way. Please check your inbox.'
      : `Please <a href="#" data-enquire="resetting my account password">message us on WhatsApp</a> from the phone number on your account and we&rsquo;ll send you a reset link.`;
  });
  formHandler($('resetForm'), async (v) => {
    const token = (location.hash.match(/reset=([\w.-]+)/) || [])[1];
    const r = await api('reset', { method: 'POST', body: { token, password: v.password } });
    setToken(r.token);
    history.replaceState(null, '', location.pathname);
    await start();
  });

  const ly = CATALOG.loyalty || {};
  if (ly.enabled) {
    $('perkText').textContent = `Earn ${ly.pointsPerPound} point${ly.pointsPerPound === 1 ? '' : 's'} for every £1 you spend${ly.signupBonus ? `, plus ${ly.signupBonus} welcome points` : ''}. ${Math.round(100 / ly.pointValue)} points = £1 off.`;
  } else $('perkText').hidden = true;

  // ---------- Logged in ----------
  function section() {
    const want = (location.hash.slice(1) || 'overview').split('=')[0];
    return ['overview', 'orders', 'subscriptions', 'points', 'addresses', 'details'].includes(want) ? want : 'overview';
  }

  const orderCard = (o) => `
    <article class="order-card">
      <header class="order-card__head">
        <div><span class="order-card__label">Order</span><strong>${esc(o.id)}</strong></div>
        <div><span class="order-card__label">Placed</span>${date(o.createdAt)}</div>
        <div><span class="order-card__label">${o.giftCardOrder ? 'Gift card' : 'Delivery'}</span>${o.giftCardOrder ? 'Sent by us' : o.quick || !o.delivery.date ? 'Arranged on WhatsApp' : date(o.delivery.date, { weekday: 'short', day: 'numeric', month: 'short' })}</div>
        <div><span class="order-card__label">Total</span>${money(o.total || 0)}</div>
        <span class="order-card__status st-${esc(o.status)}">${esc(STATUS[o.status] || o.status)}</span>
      </header>
      <ul class="order-card__items">${o.lines.map((l) => `<li><span>${l.qty} &times; ${esc(l.name)} <small>(${esc(l.label)})</small></span><span>${l.total ? money(l.total) : 'Free'}</span></li>`).join('')}</ul>
      <footer class="order-card__foot">
        <span>${o.points ? `${o.points.used} points used. ` : ''}${o.pointsAwarded ? `${o.pointsAwarded} points earned.` : ''}${o.delivery.recipient ? ` To ${esc(o.delivery.recipient)}, ${esc(o.delivery.postcode)}` : ''}</span>
        ${o.delivery.postcode && o.status !== 'cancelled' ? `<a href="track-order.html?order=${encodeURIComponent(o.id)}&postcode=${encodeURIComponent(o.delivery.postcode)}" class="btn btn--outline btn--sm">Track</a>` : ''}
      </footer>
    </article>`;

  const subCard = (s) => `
    <article class="order-card">
      <header class="order-card__head">
        <div><span class="order-card__label">Plan</span><strong>${esc(s.planName)}</strong></div>
        <div><span class="order-card__label">How often</span>${esc(s.frequencyLabel)}</div>
        <div><span class="order-card__label">Price</span>${money(s.price)} per delivery</div>
        <div><span class="order-card__label">First delivery</span>${date(s.startDate, { day: 'numeric', month: 'short', year: 'numeric' })}</div>
        <span class="order-card__status st-${esc(s.status)}">${esc(STATUS[s.status] || s.status)}${s.cancelAtPeriodEnd ? ' (ending)' : ''}</span>
      </header>
      <footer class="order-card__foot">
        <span>To ${esc(s.delivery.recipient)}, ${esc(s.delivery.city)} ${esc(s.delivery.postcode)} · Ref ${esc(s.id)}</span>
        ${s.payment === 'whatsapp' ? `<a href="#" class="btn btn--outline btn--sm" data-enquire="my Flower Club subscription ${esc(s.id)}">Change or pause</a>` : ''}
      </footer>
    </article>`;

  function render() {
    const sec = section();
    const c = data.customer;
    $('acctName').textContent = c.name.split(' ')[0];
    document.querySelectorAll('.acct__nav a').forEach((a) => a.classList.toggle('is-on', a.dataset.sec === sec));
    const pv = ly.pointValue || 1;
    const main = $('acctMain');
    const club = new URLSearchParams(location.search).get('club') === 'success';

    if (sec === 'overview') {
      main.innerHTML = `
        <div class="acct-cards">
          ${ly.enabled ? `<a href="#points" class="acct-card"><span>Loyalty points</span><strong>${c.points}</strong><small>Worth ${money(c.points * pv)}</small></a>` : ''}
          <a href="#orders" class="acct-card"><span>Orders</span><strong>${data.orders.length}</strong><small>${data.orders[0] ? 'Latest ' + date(data.orders[0].createdAt) : 'None yet'}</small></a>
          <a href="#subscriptions" class="acct-card"><span>Flower Club</span><strong>${data.subscriptions.filter((s) => s.status === 'active').length}</strong><small>Active subscriptions</small></a>
        </div>
        ${data.orders[0] ? `<h2 class="acct__h">Latest order</h2>${orderCard(data.orders[0])}` : `<div class="orders__empty"><svg><use href="#i-rose"/></svg><p>You haven&rsquo;t ordered yet.</p><a href="shop.html" class="btn btn--gold">Shop the Collection</a></div>`}`;
    }
    if (sec === 'orders') {
      main.innerHTML = `<h2 class="acct__h">Your orders</h2>` + (data.orders.length ? data.orders.map(orderCard).join('')
        : `<div class="orders__empty"><svg><use href="#i-rose"/></svg><p>No orders yet.</p><a href="shop.html" class="btn btn--gold">Shop the Collection</a></div>`)
        + `<p class="orders__note">Orders appear here when you&rsquo;re logged in at checkout.</p>`;
    }
    if (sec === 'subscriptions') {
      main.innerHTML = `${club ? '<p class="notice-ok">Welcome to the Flower Club! Your subscription is being set up.</p>' : ''}
        <h2 class="acct__h">Flower Club</h2>
        ${data.subscriptions.length ? data.subscriptions.map(subCard).join('') : `<div class="orders__empty"><svg><use href="#i-rose"/></svg><p>Fresh roses, delivered regularly.</p><a href="club.html" class="btn btn--gold">Join the Flower Club</a></div>`}
        ${data.billing ? '<button type="button" class="btn btn--outline btn--sm" id="billing">Manage card payments or cancel</button>' : ''}
        ${data.subscriptions.length ? '<p class="orders__note"><a href="club.html">Start another subscription</a></p>' : ''}`;
      const b = $('billing');
      if (b) b.addEventListener('click', async () => {
        b.disabled = true;
        try { location.href = (await api('portal', { method: 'POST' })).url; } catch (e) { alert(e.message); b.disabled = false; }
      });
    }
    if (sec === 'points') {
      main.innerHTML = `
        <h2 class="acct__h">Loyalty points</h2>
        <div class="acct-cards"><div class="acct-card"><span>Your balance</span><strong>${c.points}</strong><small>Worth ${money(c.points * pv)}</small></div></div>
        ${ly.enabled ? `<ul class="acct-rules">
          <li>Earn <strong>${ly.pointsPerPound} point${ly.pointsPerPound === 1 ? '' : 's'} for every £1</strong> spent on flowers and gifts, added when your order is delivered.</li>
          <li><strong>${Math.round(100 / pv)} points = £1 off.</strong> Use ${ly.minRedeem} points or more at checkout, for up to ${ly.maxPercent}% of an order.</li>
          <li>Log in before you check out to earn and use points.</li></ul>` : '<p>Our loyalty scheme is paused at the moment. Your points are safe.</p>'}
        <h3 class="acct__h3">History</h3>
        ${c.pointsLog.length ? `<ul class="points-log">${c.pointsLog.map((p) => `<li><span>${esc(p.reason)}<small>${date(p.at)}</small></span><strong class="${p.change > 0 ? 'is-plus' : 'is-minus'}">${p.change > 0 ? '+' : ''}${p.change}</strong></li>`).join('')}</ul>` : '<p class="orders__note">No points yet.</p>'}`;
    }
    if (sec === 'addresses') {
      const list = c.addresses;
      main.innerHTML = `
        <h2 class="acct__h">Saved addresses</h2>
        <p class="orders__note">Choose a saved address at checkout instead of typing it again.</p>
        <div class="addr-list">${list.map((a, i) => `
          <div class="addr"><strong>${esc(a.label || a.recipient)}</strong><span>${esc([a.recipient, a.address1, a.address2, a.city, a.postcode].filter(Boolean).join(', '))}</span>
          <button type="button" class="btn btn--link" data-del="${i}">Remove</button></div>`).join('') || '<p>No saved addresses yet.</p>'}</div>
        <form class="acct-form" id="addrForm" novalidate>
          <h3 class="acct__h3">Add an address</h3>
          <div class="co-grid">
            <label class="field"><span>Label <small>e.g. Home, Mum</small></span><input name="label" maxlength="40"></label>
            <label class="field"><span>Recipient name *</span><input name="recipient" required maxlength="100"></label>
            <label class="field field--full"><span>Address *</span><input name="address1" required maxlength="150"></label>
            <label class="field field--full"><span class="sr-only">Address line 2</span><input name="address2" maxlength="150" placeholder="Flat, building (optional)"></label>
            <label class="field"><span>Town / City *</span><input name="city" required maxlength="80"></label>
            <label class="field"><span>Postcode *</span><input name="postcode" required maxlength="10" pattern="[A-Za-z]{1,2}[0-9][A-Za-z0-9]?\\s*[0-9][A-Za-z]{2}"></label>
            <label class="field"><span>Recipient phone</span><input name="phone" type="tel" maxlength="30"></label>
          </div>
          <p class="form-error" role="alert"></p>
          <button type="submit" class="btn btn--gold btn--sm">Save address</button>
        </form>`;
      const save = async (addresses) => { data.customer = (await api('me', { method: 'PUT', body: { addresses } })).customer; render(); };
      main.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => save(c.addresses.filter((_, i) => i !== Number(b.dataset.del)))));
      formHandler($('addrForm'), async (v) => {
        if (list.length >= 10) throw new Error('You can save up to 10 addresses.');
        await save([...c.addresses, v]);
      });
    }
    if (sec === 'details') {
      main.innerHTML = `
        <h2 class="acct__h">My details</h2>
        <form class="acct-form" id="detailsForm" novalidate>
          <div class="co-grid">
            <label class="field"><span>Full name</span><input name="name" required maxlength="100" value="${esc(c.name)}"></label>
            <label class="field"><span>Phone</span><input name="phone" type="tel" maxlength="30" value="${esc(c.phone)}"></label>
            <label class="field field--full"><span>Email</span><input value="${esc(c.email)}" disabled></label>
          </div>
          <p class="form-error" role="alert"></p><p class="form-ok" role="status"></p>
          <button type="submit" class="btn btn--gold btn--sm">Save details</button>
        </form>
        <form class="acct-form" id="passForm" novalidate>
          <h3 class="acct__h3">Change password</h3>
          <div class="co-grid">
            <label class="field"><span>Current password</span><input name="current" type="password" required autocomplete="current-password"></label>
            <label class="field"><span>New password</span><input name="password" type="password" required minlength="8" autocomplete="new-password"></label>
          </div>
          <p class="form-error" role="alert"></p><p class="form-ok" role="status"></p>
          <button type="submit" class="btn btn--outline btn--sm">Change password</button>
        </form>
        <p class="orders__note">To change your email or close your account, please <a href="contact.html">contact us</a>.</p>`;
      formHandler($('detailsForm'), async (v, f) => {
        data.customer = (await api('me', { method: 'PUT', body: v })).customer;
        f.querySelector('.form-ok').textContent = 'Saved.';
        $('acctName').textContent = data.customer.name.split(' ')[0];
      });
      formHandler($('passForm'), async (v, f) => {
        setToken((await api('password', { method: 'POST', body: v })).token);
        f.reset();
        f.querySelector('.form-ok').textContent = 'Password changed. You have been logged out on other devices.';
      });
    }
    $('acctMain').focus({ preventScroll: true });
  }

  function deviceOrders() {
    const orders = window.EnvieShop.orders();
    const box = $('deviceOrders');
    box.hidden = !orders.length;
    if (!orders.length) return;
    box.innerHTML = `<h2 class="acct__h">Orders on this device</h2><p class="orders__note">Placed on this device without logging in.</p>` +
      orders.map((o) => `
        <article class="order-card">
          <header class="order-card__head">
            <div><span class="order-card__label">Order</span><strong>${esc(o.id)}</strong></div>
            <div><span class="order-card__label">Placed</span>${date(o.createdAt)}</div>
            <div><span class="order-card__label">Total</span>${money(o.total)}</div>
            <span class="order-card__status ${o.paid ? 'is-paid' : ''}">${o.paid ? 'Paid by card' : 'Sent on WhatsApp'}</span>
          </header>
          <ul class="order-card__items">${o.lines.map((l) => `<li><span>${l.qty} &times; ${esc(l.name)} <small>(${esc(l.label)})</small></span><span>${money(l.total)}</span></li>`).join('')}</ul>
          <footer class="order-card__foot"><span></span>
            <a href="${window.EnvieShop.waLink(window.EnvieShop.orderText(o, o.paid))}" target="_blank" rel="noopener" class="btn btn--outline btn--sm"><svg class="icon"><use href="#i-whatsapp"/></svg> Resend on WhatsApp</a>
          </footer>
        </article>`).join('');
  }

  async function start() {
    $('acct').removeAttribute('aria-busy');
    if (location.protocol === 'file:') {
      $('authBox').hidden = false;
      $('authBox').innerHTML = '<p>Accounts work on the live website.</p>';
      deviceOrders();
      return;
    }
    if (/reset=/.test(location.hash)) { $('authBox').hidden = false; $('acctApp').hidden = true; showTab('reset'); return; }
    if (getToken()) {
      try {
        data = await api('me');
        $('authBox').hidden = true;
        $('deviceOrders').hidden = true;
        $('acctApp').hidden = false;
        render();
        return;
      } catch (e) { /* logged out or offline */ }
    }
    $('acctApp').hidden = true;
    $('authBox').hidden = false;
    showTab('login');
    deviceOrders();
  }

  window.addEventListener('hashchange', () => { if (data && !$('acctApp').hidden) { render(); window.scrollTo({ top: $('acct').offsetTop - 100 }); } });
  $('logout').addEventListener('click', () => { setToken(''); data = null; history.replaceState(null, '', location.pathname); start(); });
  $('acctMain').tabIndex = -1;
  start();
})();
