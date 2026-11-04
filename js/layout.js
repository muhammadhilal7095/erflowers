// Envie Roses — shared page layout (header, footer, cart, checkout).
// Every page calls EnvieLayout.top('<page>') right after <body> and
// EnvieLayout.bottom() after </main>, so the header and footer live in one place.

(function () {
  const { shop, legal, social, products } = window.ENVIE_CATALOG;
  const RULES = window.ENVIE_RULES;
  const { TAGS, PRICE_BANDS } = RULES;
  const images = window.ENVIE_CATALOG.images || {};
  const money = (pence) => '£' + (pence / 100).toFixed(2);
  const esc = (str) => String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tel = shop.phone.replace(/[^\d+]/g, '');

  // Insert HTML where the calling <script> tag sits (runs while the page is parsed, so no flash)
  function write(html) {
    const here = document.currentScript;
    if (here) here.insertAdjacentHTML('beforebegin', html);
    else document.body.insertAdjacentHTML('beforeend', html);
  }

  const ICONS = `
  <svg width="0" height="0" style="position:absolute" aria-hidden="true">
    <symbol id="i-phone" viewBox="0 0 24 24"><path fill="currentColor" d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></symbol>
    <symbol id="i-mail" viewBox="0 0 24 24"><path fill="currentColor" d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 4-8 5-8-5V6l8 5 8-5z"/></symbol>
    <symbol id="i-pin" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></symbol>
    <symbol id="i-facebook" viewBox="0 0 24 24"><path fill="currentColor" d="M14 8h3V4h-3c-2.8 0-4.5 1.9-4.5 4.6V11H7v4h2.5v9h4v-9h3l.5-4h-3.5V8.8c0-.5.3-.8.5-.8z"/></symbol>
    <symbol id="i-instagram" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" d="M7 2.5h10A4.5 4.5 0 0 1 21.5 7v10a4.5 4.5 0 0 1-4.5 4.5H7A4.5 4.5 0 0 1 2.5 17V7A4.5 4.5 0 0 1 7 2.5zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor"/></symbol>
    <symbol id="i-tiktok" viewBox="0 0 24 24"><path fill="currentColor" d="M16.6 3c.3 2.2 1.6 3.6 3.9 3.8v3.1a7 7 0 0 1-3.8-1.2v6.2A6.1 6.1 0 1 1 10.6 9v3.2a3 3 0 1 0 2.1 2.9V3z"/></symbol>
    <symbol id="i-pinterest" viewBox="0 0 24 24"><path fill="currentColor" d="M12.3 2C6.9 2 4 5.5 4 9.3c0 1.8 1 4 2.5 4.7.2.1.4 0 .4-.2l.3-1.4c0-.1 0-.3-.1-.4-.5-.6-.9-1.7-.9-2.8 0-2.7 2-5.2 5.5-5.2 3 0 5 2 5 4.9 0 3.3-1.7 5.6-3.9 5.6-1.2 0-2.1-1-1.8-2.2.3-1.5 1-3 1-4 0-.9-.5-1.7-1.5-1.7-1.2 0-2.2 1.3-2.2 3 0 1.1.4 1.8.4 1.8L7.3 19c-.4 1.7.1 4.3.1 4.6 0 .1.2.2.3.1.2-.2 2-2.8 2.5-4.6l.9-3.4c.5.9 1.8 1.6 3.2 1.6 4.2 0 7.2-3.8 7.2-8.6C21.5 5.3 17.7 2 12.3 2z"/></symbol>
    <symbol id="i-search" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></g></symbol>
    <symbol id="i-user" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></g></symbol>
    <symbol id="i-cart" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.5L22 7H6"/><circle cx="10" cy="21" r="1"/><circle cx="18" cy="21" r="1"/></g></symbol>
    <symbol id="i-arrow" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M5 12h14m-6-6 6 6-6 6"/></symbol>
    <symbol id="i-rose" viewBox="0 0 40 40"><g fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="20" cy="20" r="17"/><path d="M20 9c4 2 7 5 7 9.5S23.8 27 20 27s-7-3.5-7-8.5S16 11 20 9z"/><path d="M20 13c2.4 1.5 3.8 3.4 3.8 5.8 0 2.6-1.7 4.3-3.8 4.3s-3.8-1.7-3.8-4.3c0-2.4 1.4-4.3 3.8-5.8z"/><path d="M13 22c-2 2-2 6 1 8m13-8c2 2 2 6-1 8M20 27v5"/></g></symbol>
    <symbol id="i-diamond" viewBox="0 0 48 48"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M10 8h28l8 10-22 24L2 18z"/><path d="M2 18h44M17 8l-4 10 11 24 11-24-4-10M24 8l-7 10m7-10 7 10"/></g></symbol>
    <symbol id="i-truck" viewBox="0 0 48 48"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M3 10h26v24H3zM29 18h9l7 8v8H29z"/><circle cx="12" cy="36" r="4" fill="#f6f3ee"/><circle cx="36" cy="36" r="4" fill="#f6f3ee"/></g></symbol>
    <symbol id="i-shield" viewBox="0 0 48 48"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"><path d="M24 4 7 10v12c0 11 7.5 18.5 17 22 9.5-3.5 17-11 17-22V10z"/><path d="m16 24 6 6 11-12"/></g></symbol>
    <symbol id="i-heart" viewBox="0 0 48 48"><path fill="var(--heart-fill, none)" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" d="M24 41S5 29.5 5 16.5A9.5 9.5 0 0 1 24 12a9.5 9.5 0 0 1 19 4.5C43 29.5 24 41 24 41z"/></symbol>
    <symbol id="i-rings" viewBox="0 0 48 48"><g fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="18" cy="29" r="11"/><circle cx="30" cy="29" r="11"/><path d="m24 8-4 5h8z" stroke-linejoin="round"/></g></symbol>
    <symbol id="i-gift" viewBox="0 0 48 48"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M7 18h34v8H7zM10 26h28v16H10zM24 18v24"/><path d="M24 18c-3-6-11-8-11-3s8 3 11 3zm0 0c3-6 11-8 11-3s-8 3-11 3z"/></g></symbol>
    <symbol id="i-hearts" viewBox="0 0 48 48"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M20 40S5 31 5 20.5A7.5 7.5 0 0 1 20 17a7.5 7.5 0 0 1 15 3.5"/><path d="M33 43s-10-6-10-13a5 5 0 0 1 10-2.5 5 5 0 0 1 10 2.5c0 7-10 13-10 13z"/></g></symbol>
    <symbol id="i-sparkle" viewBox="0 0 48 48"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M24 5c1.5 10 4 12.5 14 14-10 1.5-12.5 4-14 14-1.5-10-4-12.5-14-14 10-1.5 12.5-4 14-14z"/><path d="M38 31c.7 4 1.6 5 5 5.6-3.4.6-4.3 1.6-5 5.4-.7-3.8-1.6-4.8-5-5.4 3.4-.6 4.3-1.6 5-5.6z"/></g></symbol>
    <symbol id="i-leaf" viewBox="0 0 48 48"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 40C8 20 20 8 41 7c0 21-12 33-33 33z"/><path d="M8 40 30 18"/></g></symbol>
    <symbol id="i-sun" viewBox="0 0 48 48"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="24" cy="24" r="8"/><path d="M24 4v6m0 28v6M4 24h6m28 0h6M9.9 9.9l4.2 4.2m19.8 19.8 4.2 4.2m0-28.2-4.2 4.2M14.1 33.9l-4.2 4.2"/></g></symbol>
    <symbol id="i-pen" viewBox="0 0 48 48"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M6 10h36v26H6z"/><path d="m6 10 18 14 18-14"/></g></symbol>
    <symbol id="i-box" viewBox="0 0 48 48"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M6 16 24 7l18 9v18l-18 9-18-9z"/><path d="m6 16 18 9 18-9M24 25v18"/></g></symbol>
    <symbol id="i-clock" viewBox="0 0 48 48"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="24" cy="24" r="18"/><path d="M24 13v11l7 5"/></g></symbol>
    <symbol id="i-whatsapp" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.4.8 3.2.7a2.8 2.8 0 0 0 1.8-1.3 2.3 2.3 0 0 0 .2-1.3c-.1-.1-.3-.2-.6-.3z"/></symbol>
    <symbol id="i-close" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" d="M6 6l12 12M18 6 6 18"/></symbol>
    <symbol id="i-lock" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></g></symbol>
    <symbol id="i-vase" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" d="M9 3h6M10 3v3c0 1.2-3.5 3-3.5 7.5S8.5 21 12 21s5.5-3 5.5-7.5S14 7.2 14 6V3"/></symbol>
    <symbol id="i-chocolate" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><rect x="3.5" y="6" width="17" height="12" rx="1.5"/><path d="M3.5 12h17M9.2 6v12M14.8 6v12"/></g></symbol>
    <symbol id="i-teddy" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="7.5" cy="5.5" r="2"/><circle cx="16.5" cy="5.5" r="2"/><circle cx="12" cy="9" r="4.2"/><ellipse cx="12" cy="17.5" rx="5" ry="4"/><circle cx="12" cy="17.5" r="1.6"/></g></symbol>
    <symbol id="i-balloon" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15.5C8 15.5 5.5 12 5.5 8.5a6.5 6.5 0 0 1 13 0c0 3.5-2.5 7-6.5 7z"/><path d="m11 17.5 1-2 1 2zM12 17.5c-1 1.5 1 2.5 0 4"/></g></symbol>
    <symbol id="i-candle" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><rect x="7" y="10" width="10" height="11" rx="1.5"/><path d="M12 3c1.6 2 2 3.3 0 5.2C10 6.3 10.4 5 12 3zM12 8.2V10"/></g></symbol>
    <symbol id="i-chevron" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="m6 9 6 6 6-6"/></symbol>
    <symbol id="i-star" viewBox="0 0 24 24"><path fill="currentColor" d="m12 2 3 6.6 7.2.7-5.4 4.8 1.6 7.1L12 17.5l-6.4 3.7 1.6-7.1L1.8 9.3 9 8.6z"/></symbol>
  </svg>`;

  const partnerCfg = window.ENVIE_CATALOG.affiliates || {};
  const partnerOn = partnerCfg.enabled === true;
  const partnerPay = partnerCfg.commission || 1000;
  const shortMoney = (p) => (p % 100 ? money(p) : '£' + p / 100);

  const NAV = [
    ['home', 'index.html', 'Home'],
    ['shop', 'shop.html', 'Shop'],
    ['gifts', 'gifts.html', 'Gifts'],
    ['finder', 'finder.html', 'Bouquet Finder'],
    ['blog', 'blog.html', 'Blog'],
    ['about', 'about.html', 'About Us'],
    ['contact', 'contact.html', 'Contact']
  ];

  // Big "Shop" menu: built from the product tags, so new tags appear automatically
  const megaCol = (title, links) => `
            <div class="mega__col">
              <p class="mega__title">${title}</p>
              <ul>${links.map(([href, label]) => `<li><a href="${href}">${esc(label)}</a></li>`).join('')}</ul>
            </div>`;
  function megaMenu() {
    const occ = Object.entries(TAGS.occasions).slice(0, 8);
    return `
          <div class="mega" id="megaShop">
            <div class="container mega__inner">
            ${megaCol('Shop', [['shop.html', 'All Roses'], ['shop.html?c=boxes', 'Rose Boxes'], ['shop.html?c=bouquets', 'Bouquets'], ['shop.html?c=exclusive', 'Exclusive'], ['club.html', 'Flower Club'], ['gift-cards.html', 'Gift Cards'], ['finder.html', 'Bouquet Finder']])}
            ${megaCol('By Occasion', [...occ.map(([k, v]) => [`shop.html?o=${k}`, v]), ['gifts.html', 'All occasions →']])}
            ${megaCol('By Colour', Object.entries(TAGS.colours).map(([k, v]) => [`shop.html?colour=${k}`, v]))}
            ${megaCol('By Flower', Object.entries(TAGS.flowers).map(([k, v]) => [`shop.html?flower=${k}`, v]))}
            ${megaCol('By Price', Object.entries(PRICE_BANDS).map(([k, v]) => [`shop.html?price=${k}`, v.label]))}
            ${megaCol('Who For', [...Object.entries(TAGS.recipients).map(([k, v]) => [`shop.html?for=${k}`, v]), ['weddings.html', 'Weddings'], ['sympathy.html', 'Sympathy'], ['corporate.html', 'Business']])}
            </div>
          </div>`;
  }
  const navItem = ([key, href, label], active) => {
    const isActive = key === active || (key === 'shop' && active === 'boxes');
    const a = `<a href="${href}"${isActive ? ' class="active" aria-current="page"' : ''}>${label}</a>`;
    if (key !== 'shop') return `<li>${a}</li>`;
    return `<li class="has-mega">${a}<button type="button" class="mega-toggle" aria-expanded="false" aria-controls="megaShop" aria-label="Show shop categories"><svg class="icon"><use href="#i-chevron"/></svg></button>${megaMenu()}</li>`;
  };

  const SOCIAL = [
    ['facebook', 'Facebook'],
    ['instagram', 'Instagram'],
    ['tiktok', 'TikTok'],
    ['pinterest', 'Pinterest']
  ];
  function socialList() {
    const items = SOCIAL.filter(([key]) => social[key]);
    if (!items.length) return '';
    return `<ul class="social">${items.map(([key, label]) =>
      `<li><a href="${esc(social[key])}" target="_blank" rel="noopener" aria-label="${label}"><svg class="icon"><use href="#i-${key}"/></svg></a></li>`).join('')}</ul>`;
  }

  const logo = `
        <a href="index.html" class="logo" aria-label="${esc(shop.name)} home">
          <svg class="logo__mark"><use href="#i-rose"/></svg>
          <span class="logo__name">Envie</span>
          <span class="logo__sub">Roses</span>
        </a>`;

  // Messages for the top bar, built from the live settings so they are always true
  function announcements() {
    const C = window.ENVIE_CATALOG;
    const d = C.delivery || {};
    const msgs = [];
    msgs.push(d.sameDayEnabled ? `Same-day delivery in selected areas: order by ${niceTime(d.sameDayCutoff)}` : 'UK delivery on the date you choose');
    const free = Object.values(C.addons || {}).find((x) => x.active !== false && x.price === 0);
    if (free) msgs.push(`Free ${esc(free.name.toLowerCase())} with any bouquet`);
    if (C.loyalty && C.loyalty.enabled) msgs.push(`Earn rewards with a free <a href="account.html#register">account</a>`);
    msgs.push('Hand-selected roses, arranged by hand in London');
    return msgs;
  }

  function top(active) {
    write(`
  <a href="#main" class="skip-link">Skip to content</a>
  ${ICONS}

  <div class="topbar">
    <div class="container topbar__inner">
      <ul class="topbar__links">
        <li><a href="track-order.html">Track order</a></li>
        <li><a href="delivery.html">Delivery</a></li>
        <li><a href="contact.html">Help</a></li>
      </ul>
      <div class="announce" aria-live="polite">
        ${announcements().map((m, i) => `<p class="announce__msg${i ? '' : ' is-active'}">${m}</p>`).join('')}
      </div>
      <ul class="topbar__contact">
        <li><a href="tel:${tel}"><svg class="icon"><use href="#i-phone"/></svg>${esc(shop.phone)}</a></li>
        <li><a href="#" data-enquire=""><svg class="icon"><use href="#i-whatsapp"/></svg>WhatsApp</a></li>
      </ul>
    </div>
  </div>

  <header class="header" id="header">
    <div class="container header__inner">
      <div class="header__left">
        <button class="burger" id="burger" aria-label="Open menu" aria-expanded="false" aria-controls="nav">
          <span></span><span></span><span></span>
        </button>
        <form class="hsearch" role="search" action="shop.html">
          <svg class="icon" aria-hidden="true"><use href="#i-search"/></svg>
          <input type="search" name="q" placeholder="Search roses, gifts…" aria-label="Search roses and gifts" autocomplete="off">
        </form>
      </div>
      ${logo}
      <div class="header__actions">
        ${partnerOn ? `<a href="partners.html" class="partner-btn"><span class="partner-btn__top">Become a Partner</span><span class="partner-btn__sub">Earn ${shortMoney(partnerPay)} per order</span></a>` : ''}
        <button type="button" aria-label="Search" class="icon-btn hact hact--search" id="searchOpen"><svg class="icon"><use href="#i-search"/></svg></button>
        <a href="account.html" class="acct-link hact hide-sm" id="accountLink" aria-label="Sign in or create an account"><svg class="icon"><use href="#i-user"/></svg><span class="hact__label acct-link__text" id="accountText">Sign in</span></a>
        <a href="wishlist.html" aria-label="Wishlist" class="wish-link hact" id="wishLink"><svg class="icon"><use href="#i-heart"/></svg><span class="hact__label">Saved</span><span class="cart__count wish-count" id="wishCount" hidden>0</span></a>
        <button type="button" aria-label="Bag, 0 items" class="cart icon-btn hact" id="cart"><svg class="icon"><use href="#i-cart"/></svg><span class="hact__label">Bag</span><span class="cart__count" id="cartCount">0</span></button>
      </div>
    </div>
    <div class="header__navbar">
      <div class="container">
        <nav class="nav" id="nav" aria-label="Main">
          <ul>
            ${NAV.map((item) => navItem(item, active)).join('')}
          </ul>
          <a href="account.html" class="nav__account" id="navAccount"><svg class="icon"><use href="#i-user"/></svg><span id="navAccountText">Sign in / Create account</span></a>
          ${partnerOn ? `<a href="partners.html" class="nav__partner">Become a Partner <small>Earn ${shortMoney(partnerPay)} per order</small></a>` : ''}
          <div class="nav__extra">
            <a href="tel:${tel}"><svg class="icon"><use href="#i-phone"/></svg>${esc(shop.phone)}</a>
            <a href="mailto:${esc(shop.email)}"><svg class="icon"><use href="#i-mail"/></svg>${esc(shop.email)}</a>
            ${socialList()}
          </div>
        </nav>
      </div>
    </div>
  </header>
  <div class="nav-overlay" id="navOverlay"></div>

  <div class="search" id="search" role="dialog" aria-modal="true" aria-label="Search" hidden>
    <button type="button" class="search__close" id="searchClose" aria-label="Close search"><span></span><span></span></button>
    <form class="search__form" role="search" action="shop.html">
      <label for="searchInput" class="kicker">What are you looking for?</label>
      <div class="search__field">
        <input type="search" name="q" id="searchInput" placeholder="Red roses, rose boxes, bouquets…" autocomplete="off">
        <svg class="icon"><use href="#i-search"/></svg>
      </div>
      <p class="search__hint">Popular: <a href="shop.html?c=boxes">Rose Boxes</a> · <a href="shop.html?c=bouquets">Bouquets</a> · <a href="shop.html?c=exclusive">Blue Roses</a></p>
    </form>
  </div>`);
  }

  // Small dark banner at the top of inner pages
  function pageHero({ title, kicker = '', intro = '', crumb }) {
    write(`
    <section class="page-hero grain">
      <div class="page-hero__media"><img ${imgAttrs(images.pageHero || 'images/page-hero.jpg', '100vw')} alt="" decoding="async"></div>
      <div class="container page-hero__content">
        <nav class="crumbs" aria-label="Breadcrumb"><a href="index.html">Home</a><span aria-hidden="true">/</span><span aria-current="page">${esc(crumb || title)}</span></nav>
        ${kicker ? `<p class="eyebrow">${esc(kicker)}</p>` : ''}
        <h1 class="page-hero__title">${esc(title)}</h1>
        ${intro ? `<p class="page-hero__intro">${esc(intro)}</p>` : ''}
      </div>
    </section>`);
  }

  // ---------- Responsive photos ----------
  // Built-in photos have small WebP versions in images/w/ (480, 800, 1200px).
  // Photos uploaded in the dashboard are resized by Netlify's image service.
  const WIDTHS = [480, 800, 1200];
  function srcset(src) {
    const m = /^images\/([\w.-]+)\.jpg$/.exec(src || '');
    if (m) return WIDTHS.map((w) => `images/w/${m[1]}-${w}.webp ${w}w`).join(', ');
    if (/^\/api\/image\/[\w-]+$/.test(src || '') && location.protocol !== 'file:') {
      return WIDTHS.map((w) => `/.netlify/images?url=${encodeURIComponent(src)}&w=${w}&fm=webp&q=75 ${w}w`).join(', ');
    }
    return '';
  }
  function imgAttrs(src, sizes) {
    const set = srcset(src);
    return `src="${esc(src)}"${set ? ` srcset="${esc(set)}" sizes="${sizes}"` : ''}`;
  }
  function setImg(img, src, sizes) {
    const set = srcset(src);
    if (set) { img.srcset = set; img.sizes = sizes; } else { img.removeAttribute('srcset'); }
    img.src = src;
  }
  const CARD_SIZES = '(max-width: 640px) 80vw, (max-width: 960px) 46vw, 400px';

  // ---------- Offers ----------
  // Same rules as the server (js/rules.js), so the price shown is the price charged
  const { saleActive, unitPrice } = RULES;
  const productUrl = (id) => `product.html?id=${encodeURIComponent(id)}`;

  // ---------- Wishlist and recently viewed (saved in this browser) ----------
  const readList = (key) => { try { return JSON.parse(localStorage.getItem(key) || '[]').filter((id) => products[id]); } catch (e) { return []; } };
  const writeList = (key, list) => { try { localStorage.setItem(key, JSON.stringify(list)); } catch (e) { /* storage unavailable */ } };
  const wishlist = {
    ids: () => readList('envie_wishlist'),
    has: (id) => readList('envie_wishlist').includes(id),
    toggle(id) {
      const list = readList('envie_wishlist');
      const on = !list.includes(id);
      writeList('envie_wishlist', on ? [id, ...list] : list.filter((x) => x !== id));
      return on;
    }
  };
  const recent = {
    ids: () => readList('envie_recent'),
    add(id) { writeList('envie_recent', [id, ...readList('envie_recent').filter((x) => x !== id)].slice(0, 8)); }
  };

  // ---------- Gift add-ons ----------
  function addonVisual(a) {
    return a.image
      ? `<img ${imgAttrs(a.image, '64px')} alt="" loading="lazy" decoding="async">`
      : `<svg class="addon__icon"><use href="#i-${esc(a.icon || 'gift')}"/></svg>`;
  }
  function addonChoice(a, checked) {
    return `
      <label class="addon${a.price === 0 ? ' addon--free' : ''}">
        <input type="checkbox" value="${esc(a.id)}" data-addon${checked ? ' checked' : ''}>
        <span class="addon__media">${addonVisual(a)}</span>
        <span class="addon__text"><strong>${esc(a.name)}</strong><small>${a.price === 0 ? 'Free' : '+' + money(a.price)}</small></span>
        <span class="addon__tick" aria-hidden="true"></span>
      </label>`;
  }

  function productCard(id) {
    const p = products[id];
    if (!p) return '';
    const onSale = saleActive(p);
    const cheapest = p.options.length ? p.options.reduce((a, b) => (a.price <= b.price ? a : b)) : null;
    const saved = wishlist.has(id);
    const action = p.enquire
      ? `<a href="#" class="btn btn--outline btn--sm" data-enquire="${esc(p.name)}"><svg class="icon"><use href="#i-whatsapp"/></svg> Enquire</a>`
      : `<button type="button" class="btn btn--gold btn--sm" data-buy>Buy Now <svg class="icon"><use href="#i-arrow"/></svg></button>`;
    let price = '<span>Price on request</span>';
    if (cheapest) {
      price = onSale
        ? `<span>From</span> ${money(unitPrice(p, cheapest))} <s>${money(cheapest.price)}</s>`
        : `<span>From</span> ${money(cheapest.price)}`;
    }
    return `
          <article class="product" data-product="${id}">
            <div class="product__img">
              <a href="${productUrl(id)}" class="product__link" tabindex="-1" aria-hidden="true"><img ${imgAttrs(p.image, CARD_SIZES)} alt="${esc(p.name)}" loading="lazy" decoding="async" width="1080" height="1080"></a>
              ${onSale ? `<span class="product__badge">-${p.sale.percent}%</span>` : ''}
              <button type="button" class="wish" aria-label="${saved ? 'Remove from wishlist' : 'Add to wishlist'}" aria-pressed="${saved}"><svg><use href="#i-heart"/></svg></button>
              ${p.enquire ? '' : '<button type="button" class="quick-add">Add to Bag</button>'}
            </div>
            <div class="product__body">
              <h3 class="product__name"><a href="${productUrl(id)}">${esc(p.name)}</a></h3>
              <p class="product__price">${price}</p>
              ${action}
            </div>
          </article>`;
  }

  function legalName() { return legal.companyName || shop.name; }
  function legalLine() {
    if (!legal.companyName || !legal.companyNumber) return '';
    let line = `${legal.companyName} is registered in ${legal.registeredIn}, company number ${legal.companyNumber}.`;
    if (legal.registeredAddress) line += ` Registered office: ${legal.registeredAddress}.`;
    if (legal.vatNumber) line += ` VAT number ${legal.vatNumber}.`;
    return line;
  }

  function bottom() {
    write(`
  <section class="newsletter grain">
    <div class="container newsletter__inner">
      <div class="newsletter__copy">
        <p class="eyebrow">The Envie Circle</p>
        <h2 class="newsletter__title">Be the First to Know</h2>
        <p>New collections, seasonal releases and members-only roses, delivered to your inbox.</p>
      </div>
      <form class="newsletter__form" id="newsletter" novalidate>
        <label for="nlEmail" class="sr-only">Email address</label>
        <input type="email" id="nlEmail" placeholder="Your email address" required autocomplete="email">
        <button type="submit" class="btn btn--gold">Subscribe</button>
        <p class="newsletter__msg" id="nlMsg" role="status" aria-live="polite"></p>
        <p class="newsletter__legal">We will only email you about Envie Roses. Unsubscribe at any time. See our <a href="privacy.html">Privacy Policy</a>.</p>
      </form>
    </div>
  </section>

  <footer class="footer">
    <div class="container footer__grid">
      <div class="footer__brand">
        ${logo}
        <p class="footer__tagline">Luxury. Emotion. Forever.</p>
        ${socialList()}
      </div>
      <div class="footer__col">
        <h4>Shop</h4>
        <ul>
          <li><a href="shop.html">Shop All Roses</a></li>
          <li><a href="shop.html?c=boxes">Rose Boxes</a></li>
          <li><a href="shop.html?c=bouquets">Bouquets</a></li>
          <li><a href="gifts.html">Gifts &amp; Occasions</a></li>
          <li><a href="club.html">Flower Club</a></li>
          <li><a href="gift-cards.html">Gift Cards</a></li>
          <li><a href="finder.html">Bouquet Finder</a></li>
          <li><a href="wishlist.html">Your Wishlist</a></li>
        </ul>
      </div>
      <div class="footer__col">
        <h4>Discover</h4>
        <ul>
          <li><a href="about.html">About Us</a></li>
          <li><a href="weddings.html">Weddings</a></li>
          <li><a href="sympathy.html">Sympathy Flowers</a></li>
          <li><a href="corporate.html">Corporate Flowers</a></li>
          <li><a href="partners.html">Partner Programme</a></li>
          <li><a href="blog.html">Blog</a></li>
          <li><a href="guarantee.html">Freshness Guarantee</a></li>
          <li><a href="delivery.html#areas">Delivery Areas</a></li>
          <li><a href="contact.html">Contact</a></li>
        </ul>
      </div>
      <div class="footer__col">
        <h4>Customer Care</h4>
        <ul>
          <li><a href="account.html">My Account</a></li>
          <li><a href="track-order.html">Track Your Order</a></li>
          <li><a href="delivery.html">Delivery Information</a></li>
          <li><a href="faq.html">FAQs</a></li>
          <li><a href="refunds.html">Refunds &amp; Returns</a></li>
          <li><a href="terms.html">Terms &amp; Conditions</a></li>
          <li><a href="privacy.html">Privacy Policy</a></li>
          <li><a href="cookies.html">Cookie Policy</a></li>
        </ul>
      </div>
      <div class="footer__col">
        <h4>Contact Us</h4>
        <ul class="footer__contact">
          <li><svg class="icon"><use href="#i-phone"/></svg><a href="tel:${tel}">${esc(shop.phone)}</a></li>
          <li><svg class="icon"><use href="#i-whatsapp"/></svg><a href="#" data-enquire="">WhatsApp us</a></li>
          <li><svg class="icon"><use href="#i-mail"/></svg><a href="mailto:${esc(shop.email)}">${esc(shop.email)}</a></li>
          <li><svg class="icon"><use href="#i-pin"/></svg><span>London, UK<br><small>Delivering across the UK</small></span></li>
        </ul>
      </div>
    </div>
    <div class="footer__bottom">
      <div class="container footer__bottom-inner">
        <p>© <span id="year">${new Date().getFullYear()}</span> ${esc(legalName())}. All rights reserved.</p>
        <ul class="payments" aria-label="Accepted payment methods">
          <li class="pay pay--visa" title="Visa">VISA</li>
          <li class="pay pay--mc" title="Mastercard"><svg viewBox="0 0 32 20" aria-label="Mastercard"><circle cx="12" cy="10" r="7" fill="#eb001b"/><circle cx="20" cy="10" r="7" fill="#f79e1b"/><path d="M16 4.3a7 7 0 0 1 0 11.4 7 7 0 0 1 0-11.4z" fill="#ff5f00"/></svg></li>
          <li class="pay pay--amex" title="American Express">AMEX</li>
          <li class="pay pay--apple" title="Apple Pay"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5a4.3 4.3 0 0 0-3.4-1.8c-1.4-.2-2.8.8-3.5.8s-1.8-.8-3-.8a4.5 4.5 0 0 0-3.8 2.3c-1.6 2.8-.4 7 1.2 9.2.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7 2-1.1 2.8-2.2a9.7 9.7 0 0 0 1.3-2.6 4 4 0 0 1-2.5-3.7zM14.1 5.8a4 4 0 0 0 .9-2.9 4.1 4.1 0 0 0-2.7 1.4 3.8 3.8 0 0 0-1 2.8 3.4 3.4 0 0 0 2.8-1.3z"/></svg>Pay</li>
          <li class="pay pay--gpay" title="Google Pay"><b>G</b>&nbsp;Pay</li>
        </ul>
        <ul class="footer__legal-links">
          <li><a href="privacy.html">Privacy</a></li>
          <li><a href="terms.html">Terms</a></li>
          <li><a href="cookies.html">Cookies</a></li>
        </ul>
      </div>
      ${legalLine() ? `<p class="container footer__company">${esc(legalLine())}</p>` : ''}
    </div>
  </footer>

  <dialog class="modal modal--product" id="productModal" aria-labelledby="pmName">
    <button type="button" class="modal__close" data-close aria-label="Close"><svg class="icon"><use href="#i-close"/></svg></button>
    <div class="pm">
      <div class="pm__img"><img id="pmImg" src="" alt=""></div>
      <div class="pm__body">
        <p class="kicker kicker--left">Envie Roses</p>
        <h2 class="pm__name" id="pmName"></h2>
        <p class="pm__price" id="pmPrice"></p>
        <p class="pm__desc" id="pmDesc"></p>
        <fieldset class="pm__field">
          <legend>Choose size</legend>
          <div class="pm__options" id="pmOptions"></div>
        </fieldset>
        <div class="pm__field">
          <span class="pm__label" id="pmQtyLabel">Quantity</span>
          <div class="qty" role="group" aria-labelledby="pmQtyLabel">
            <button type="button" data-qty="-1" aria-label="Decrease quantity">−</button>
            <output id="pmQty">1</output>
            <button type="button" data-qty="1" aria-label="Increase quantity">+</button>
          </div>
        </div>
        <div class="pm__field" id="pmAddonsWrap" hidden>
          <span class="pm__label">Add a gift</span>
          <div class="addons addons--compact" id="pmAddons"></div>
        </div>
        <div class="pm__actions">
          <button type="button" class="btn btn--outline" id="pmAdd">Add to Bag</button>
          <button type="button" class="btn btn--whatsapp" id="pmBuy"><svg class="icon"><use href="#i-whatsapp"/></svg> Buy Now on WhatsApp</button>
        </div>
        <ul class="pm__details">
          <li><svg class="icon"><use href="#i-truck"/></svg> Delivered across the UK on the date you choose</li>
          <li><svg class="icon"><use href="#i-pen"/></svg> Add a personal card message with your order</li>
          <li><svg class="icon"><use href="#i-whatsapp"/></svg> Order instantly on WhatsApp</li>
        </ul>
      </div>
    </div>
  </dialog>

  <dialog class="drawer" id="cartDrawer" aria-labelledby="cartTitle">
    <div class="drawer__head">
      <h2 id="cartTitle">Your Bag</h2>
      <button type="button" class="modal__close" data-close aria-label="Close bag"><svg class="icon"><use href="#i-close"/></svg></button>
    </div>
    <div class="drawer__body">
      <div id="cartItems"></div>
      <div class="drawer__extras" id="cartExtras" hidden></div>
    </div>
    <div class="drawer__foot" id="cartFoot">
      <div class="sum-row"><span>Subtotal</span><strong id="cartSubtotal">£0.00</strong></div>
      <p class="drawer__note" id="cartDeliveryNote"></p>
      <button type="button" class="btn btn--gold btn--block" id="cartCheckout">Checkout <svg class="icon"><use href="#i-arrow"/></svg></button>
      <button type="button" class="btn btn--link" data-close>Continue shopping</button>
    </div>
  </dialog>

  <dialog class="modal modal--checkout" id="checkoutModal" aria-labelledby="coTitle">
    <button type="button" class="modal__close" data-close aria-label="Close checkout"><svg class="icon"><use href="#i-close"/></svg></button>
    <form class="checkout" id="checkoutForm" novalidate>
      <div class="checkout__main">
        <h2 class="checkout__title" id="coTitle">Checkout</h2>

        <fieldset class="co-group">
          <legend>Your details</legend>
          <div class="co-grid">
            <label class="field field--full"><span>Full name *</span><input name="name" required autocomplete="name"></label>
            <label class="field"><span>Phone *</span><input name="phone" type="tel" required autocomplete="tel" pattern="[\\d\\s+\\-\\(\\)]{7,}" placeholder="07123 456789"></label>
            <label class="field"><span>Email *</span><input name="email" type="email" required autocomplete="email"></label>
          </div>
        </fieldset>

        <fieldset class="co-group">
          <legend>Delivery (UK addresses)</legend>
          <div class="co-grid">
            <label class="field field--full" id="coSavedWrap" hidden><span>Saved addresses</span><select id="coSaved"></select></label>
            <label class="field"><span>Recipient name *</span><input name="recipient" required></label>
            <label class="field"><span>Recipient phone</span><input name="recipientPhone" type="tel" pattern="[\\d\\s+\\-\\(\\)]{7,}"></label>
            <label class="field field--full"><span>Address *</span><input name="address1" required autocomplete="address-line1" placeholder="House number and street"></label>
            <label class="field field--full"><span class="sr-only">Address line 2</span><input name="address2" autocomplete="address-line2" placeholder="Flat, building (optional)"></label>
            <label class="field"><span>Town / City *</span><input name="city" required autocomplete="address-level2"></label>
            <label class="field"><span>Postcode *</span><input name="postcode" id="coPostcode" required autocomplete="postal-code" pattern="[A-Za-z]{1,2}[0-9][A-Za-z0-9]?\\s*[0-9][A-Za-z]{2}" title="A UK postcode, e.g. SW1A 1AA" placeholder="SW1A 1AA"></label>
            <p class="co-info field--full" id="coDeliveryInfo" role="status" aria-live="polite"></p>
            <label class="field"><span>Delivery date *</span><input name="date" type="date" required id="coDate"></label>
            <label class="field" id="coSlotWrap"><span>Delivery time</span><select name="slot" id="coSlot"></select></label>
          </div>
        </fieldset>

        <fieldset class="co-group co-join" id="coJoin" hidden>
          <legend>Your account <small>(optional)</small></legend>
          <label class="check-line co-join__tick"><input type="checkbox" id="coJoinOn"> <span><strong>Create an account</strong> to track this order, save your addresses<span id="coJoinPerk"></span>.</span></label>
          <div class="co-join__fields" id="coJoinFields" hidden>
            <label class="field"><span>Choose a password *</span><input type="password" id="coJoinPass" autocomplete="new-password" minlength="8" placeholder="At least 8 characters"></label>
            <p class="co-join__small">We&rsquo;ll use your name, email and phone from above. By creating an account you agree to our <a href="terms.html" target="_blank">Terms</a>.</p>
          </div>
        </fieldset>

        <fieldset class="co-group">
          <legend>Gift message</legend>
          <label class="field field--full"><span class="sr-only">Card message</span><textarea name="message" rows="3" maxlength="250" placeholder="Write the message for the card (optional)"></textarea></label>
          <label class="field field--full"><span>Notes for us</span><input name="notes" maxlength="200" placeholder="Delivery instructions, safe place… (optional)"></label>
        </fieldset>

        <fieldset class="co-group">
          <legend>Payment</legend>
          <div class="pay-options" id="payOptions">
            <label class="pay-option" data-method="stripe">
              <input type="radio" name="payment" value="stripe">
              <span class="pay-option__body">
                <strong>Card, Apple Pay or Google Pay</strong>
                <small>Pay securely now with Stripe. Your order is then sent to us on WhatsApp.</small>
              </span>
              <svg class="icon"><use href="#i-lock"/></svg>
            </label>
            <label class="pay-option" data-method="whatsapp">
              <input type="radio" name="payment" value="whatsapp">
              <span class="pay-option__body">
                <strong>Order on WhatsApp</strong>
                <small>Send your order to us on WhatsApp. We confirm availability and send a secure payment link or bank details.</small>
              </span>
              <svg class="icon"><use href="#i-whatsapp"/></svg>
            </label>
          </div>
        </fieldset>
        <p class="co-error" id="coError" role="alert"></p>
      </div>

      <aside class="checkout__summary">
        <h3>Order summary</h3>
        <div id="coItems"></div>
        <div class="sum-row"><span>Subtotal</span><span id="coSubtotal"></span></div>
        <div class="sum-row"><span>Delivery</span><span id="coDelivery"></span></div>
        <div class="sum-row sum-row--discount" id="coDiscountRow" hidden><span id="coDiscountLabel">Discount</span><span id="coDiscount"></span></div>
        <div class="sum-row sum-row--discount" id="coReferralRow" hidden><span>Friend&rsquo;s welcome offer</span><span id="coReferral"></span></div>
        <div class="sum-row sum-row--discount" id="coGiftRow" hidden><span id="coGiftLabel">Gift card</span><span id="coGift"></span></div>
        <div class="sum-row sum-row--discount" id="coPointsRow" hidden><span id="coPointsLabel">Points</span><span id="coPoints"></span></div>
        <label class="co-points" id="coPointsWrap" hidden><input type="checkbox" id="coUsePoints"> <span id="coPointsText"></span></label>
        <p class="co-account" id="coAccount"></p>
        <div class="co-discount">
          <label for="coCode" class="sr-only">Discount or gift card code</label>
          <input id="coCode" placeholder="Discount or gift card code" autocomplete="off" autocapitalize="characters" maxlength="30">
          <button type="button" class="btn btn--outline btn--sm" id="coApply">Apply</button>
        </div>
        <p class="co-discount__msg" id="coCodeMsg" role="status" aria-live="polite"></p>
        <div class="sum-row sum-row--total"><span id="coTotalLabel">Total</span><strong id="coTotal"></strong></div>
        <button type="submit" class="btn btn--gold btn--block" id="coSubmit">Place Order</button>
        <p class="co-terms">By placing your order you agree to our <a href="terms.html" target="_blank">Terms &amp; Conditions</a> and confirm you have read our <a href="privacy.html" target="_blank">Privacy Policy</a>. All prices in GBP.</p>
      </aside>
    </form>
  </dialog>

  <dialog class="modal modal--confirm" id="confirmModal" aria-labelledby="cfTitle">
    <button type="button" class="modal__close" data-close aria-label="Close"><svg class="icon"><use href="#i-close"/></svg></button>
    <div class="confirm">
      <svg class="confirm__icon"><use href="#i-rose"/></svg>
      <h2 id="cfTitle">Thank You</h2>
      <p class="confirm__ref">Order <strong id="cfRef"></strong></p>
      <p id="cfText"></p>
      <a href="#" class="btn btn--whatsapp btn--block" id="cfWhatsapp" target="_blank" rel="noopener"><svg class="icon"><use href="#i-whatsapp"/></svg> Send Order on WhatsApp</a>
      <a href="account.html" class="btn btn--link">View your orders</a>
    </div>
  </dialog>

  <div class="concierge" id="concierge" role="dialog" aria-modal="false" aria-labelledby="conciergeTitle" hidden>
    <div class="concierge__head">
      <span class="concierge__avatar"><svg><use href="#i-rose"/></svg></span>
      <span class="concierge__brand"><strong>${esc(shop.name)}</strong><small>Luxury florist · London</small></span>
      <button type="button" class="concierge__close" id="conciergeClose" aria-label="Close"><svg class="icon"><use href="#i-close"/></svg></button>
    </div>
    <div class="concierge__body">
      <p class="concierge__kicker">Same Day Delivery</p>
      <h2 class="concierge__title" id="conciergeTitle">Call Now for Same Day Delivery</h2>
      <p class="concierge__text">We&rsquo;ll create a bouquet to suit your budget and deliver it today. Our florists will guide you through every step.</p>
      <a href="#" class="concierge__btn concierge__btn--wa" id="conciergeWa" target="_blank" rel="noopener"><svg class="icon"><use href="#i-whatsapp"/></svg> Message on WhatsApp</a>
      <a href="#" class="concierge__btn concierge__btn--wacall" id="conciergeWaCall" target="_blank" rel="noopener"><svg class="icon"><use href="#i-phone"/></svg> Call on WhatsApp</a>
      <p class="concierge__hint">Opens our chat. Tap the call icon to ring us.</p>
      <a href="tel:${tel}" class="concierge__btn concierge__btn--call"><svg class="icon"><use href="#i-phone"/></svg> Call Now <span>${esc(shop.phone)}</span></a>
      <p class="concierge__note"><span class="concierge__dot" aria-hidden="true"></span> Fast response during business hours</p>
    </div>
  </div>
  <button type="button" class="wa-float" id="waFloat" aria-label="Contact us for same day delivery" aria-expanded="false" aria-controls="concierge">
    <svg class="wa-float__icon"><use href="#i-whatsapp"/></svg>
    <svg class="wa-float__close"><use href="#i-close"/></svg>
  </button>
  <button type="button" class="to-top" id="toTop" aria-label="Back to top"><svg class="icon"><use href="#i-arrow"/></svg></button>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>`);
  }

  // Fill shop/legal details into page content: <span data-shop="email"></span> etc.
  // "14:00" -> "2pm", "13:30" -> "1:30pm"
  function niceTime(hhmm) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
    if (!m) return hhmm;
    const h = Number(m[1]), h12 = h % 12 || 12;
    return `${h12}${m[2] === '00' ? '' : ':' + m[2]}${h < 12 ? 'am' : 'pm'}`;
  }
  // Header account link: "Sign in / Sign up", or "My Account" once logged in
  function accountLabel() {
    let name = '';
    try { if (localStorage.getItem('envie_account_token')) name = localStorage.getItem('envie_account_name') || 'My Account'; } catch (e) { /* ignore */ }
    const t = document.getElementById('accountText');
    const n = document.getElementById('navAccountText');
    const link = document.getElementById('accountLink');
    if (t) t.textContent = name ? (name === 'My Account' ? 'Account' : `Hi, ${name}`) : 'Sign in';
    if (n) n.textContent = name ? 'My Account' : 'Sign in / Create account';
    if (link) link.setAttribute('aria-label', name ? 'My account' : 'Sign in or create an account');
  }
  function fill() {
    accountLabel();
    const values = {
      name: shop.name,
      legalName: legalName(),
      phone: shop.phone,
      email: shop.email,
      location: shop.location,
      updated: legal.updated,
      companyNumber: legal.companyNumber,
      registeredAddress: legal.registeredAddress,
      vatNumber: legal.vatNumber,
      hours: shop.hours,
      deliveryFee: typeof shop.deliveryFee === 'number' ? (shop.deliveryFee === 0 ? 'free' : money(shop.deliveryFee)) : 'confirmed with your order',
      sameDayCutoff: niceTime((window.ENVIE_CATALOG.delivery || {}).sameDayCutoff),
      identity: legalLine() || `${shop.name} is based in ${shop.location}.`
    };
    document.querySelectorAll('[data-shop]').forEach((el) => {
      const v = values[el.dataset.shop];
      if (v) el.textContent = v;
      else if (el.hasAttribute('data-optional')) el.closest('[data-optional-wrap]')?.remove();
    });
    document.querySelectorAll('a[data-shop-href="email"]').forEach((a) => { a.href = `mailto:${shop.email}`; });
    document.querySelectorAll('a[data-shop-href="phone"]').forEach((a) => { a.href = `tel:${tel}`; });
    // Photos replaced from the dashboard
    document.querySelectorAll('img[data-img]').forEach((img) => {
      const url = images[img.dataset.img];
      if (url) setImg(img, url, img.sizes || '100vw');
    });
    document.querySelectorAll('[data-social]').forEach((el) => {
      const url = social[el.dataset.social];
      if (url) { el.href = url; el.target = '_blank'; el.rel = 'noopener'; }
      else el.remove();
    });
  }

  window.EnvieLayout = { accountLabel, top, bottom, pageHero, productCard, fill, money, esc, saleActive, unitPrice, productUrl, srcset, imgAttrs, setImg, wishlist, recent, addonChoice, addonVisual };
})();
