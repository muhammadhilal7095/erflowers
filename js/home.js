// Envie Roses — homepage sections built from the live catalogue (index.html)

(function () {
  const C = window.ENVIE_CATALOG;
  const R = window.ENVIE_RULES;
  const L = window.EnvieLayout;
  const { products } = C;
  const { esc, money } = L;
  const ids = Object.keys(products);
  const from = (id) => R.fromPrice(products[id]);
  const $ = (id) => document.getElementById(id);
  const root = $('homeRows');

  // ---------- Quick answers at the top ----------
  const d = C.delivery || {};
  if (!d.sameDayEnabled) {
    $('homeSameDay').textContent = 'Choose your delivery date';
    $('homeSameDayText').textContent = 'Pick the day and time slot at checkout.';
  }
  const freeGift = Object.values(C.addons || {}).find((a) => a.active !== false && a.price === 0);
  if (freeGift) {
    $('homeGiftTitle').textContent = `Free ${freeGift.name.toLowerCase()}`;
    $('homeGiftText').textContent = `Add a free ${freeGift.name.toLowerCase()} to any bouquet, plus optional gifts.`;
  }
  if (C.payments.stripe) document.querySelectorAll('.h-faq__card').forEach((el) => { el.hidden = false; });

  // ---------- Product rows ----------
  // Up to 7 products, then a tile that links to the rest
  function row(title, list, link, moreLabel) {
    if (list.length < 2) return '';
    const shown = list.slice(0, 7);
    return `
      <section class="section h-row">
        <div class="container">
          <div class="h-head"><h2 class="h-title">${esc(title)} <span class="h-count">${list.length}</span></h2><a href="${link}" class="h-more">View all <svg class="icon"><use href="#i-arrow"/></svg></a></div>
          <div class="h-grid">
            ${shown.map(L.productCard).join('')}
            <a href="${link}" class="h-tile-more">
              <span class="h-tile-more__n">${list.length}</span>
              <span class="h-tile-more__t">${esc(moreLabel)}</span>
              <span class="h-tile-more__go">View all <svg class="icon"><use href="#i-arrow"/></svg></span>
            </a>
          </div>
        </div>
      </section>`;
  }
  const featured = ids.filter((id) => products[id].featured);
  const best = [...featured, ...ids.filter((id) => !products[id].featured)];
  const byCat = (c) => ids.filter((id) => products[id].category === c);
  const priced = ids.filter((id) => from(id) !== null);
  const band = (b) => priced.filter((id) => from(id) >= R.PRICE_BANDS[b].min && from(id) <= R.PRICE_BANDS[b].max);
  const luxury = [...new Set([...byCat('exclusive'), ...priced.filter((id) => from(id) >= 15000)])];

  const tpl = (id) => { const t = $(id); return t ? t.innerHTML : ''; };
  root.innerHTML = [
    row('Best Sellers', best, 'shop.html', 'roses to choose from'),
    tpl('tplClub'),
    tpl('tplReviews'),
    row('New In', [...ids].reverse(), 'shop.html', 'new designs'),
    tpl('tplInsta'),
    row('Rose Boxes', byCat('boxes'), 'shop.html?c=boxes', 'rose boxes'),
    tpl('tplPrice'),
    row('Luxury Roses', luxury, 'shop.html?c=exclusive', 'luxury designs'),
    tpl('tplOccasions'),
    row('Bouquets', byCat('bouquets'), 'shop.html?c=bouquets', 'bouquets'),
    row('£50 – £100', band('50-100'), 'shop.html?price=50-100', 'roses in this range'),
    tpl('tplRecipients'),
    tpl('tplFlowers')
  ].join('');

  // ---------- Flower Club price ----------
  const plans = Object.values((C.club && C.club.plans) || {}).filter((p) => p.active !== false);
  if (C.club && C.club.enabled && plans.length) $('clubFrom').textContent = `from ${money(Math.min(...plans.map((p) => p.price)))}`;
  else document.querySelectorAll('.h-promo').forEach((el) => el.remove());

  // ---------- Shop by price ----------
  const signs = ['£', '££', '£££', '££££'];
  $('priceGrid').innerHTML = Object.entries(R.PRICE_BANDS).map(([k, b], i) => {
    const n = band(k).length;
    return `<a href="shop.html?price=${k}" class="h-price__card"><span class="h-price__sign">${signs[i] || '£'}</span><strong>${esc(b.label)}</strong><small>${n ? `${n} design${n === 1 ? '' : 's'}` : 'Shop'}</small></a>`;
  }).join('');

  // ---------- Picture tiles (photos come from products that match) ----------
  const photoFor = (test, i) => {
    const match = ids.find((id) => test(products[id])) || ids[i % ids.length];
    return products[match] ? products[match].image : '';
  };
  const tile = (href, label, img) => `
    <a href="${href}" class="h-tile">
      <span class="h-tile__label">${esc(label)}</span>
      ${img ? `<img ${L.imgAttrs(img, '(max-width: 640px) 50vw, 25vw')} alt="" loading="lazy" decoding="async">` : ''}
    </a>`;
  const OCC = ['birthday', 'anniversary', 'love', 'valentines', 'mothers-day', 'congratulations', 'thank-you', 'sympathy'];
  $('occasionGrid').innerHTML = OCC.map((k, i) => tile(`shop.html?o=${k}`, R.TAGS.occasions[k], photoFor((p) => (p.occasions || []).includes(k), i))).join('');
  $('recipientGrid').innerHTML = Object.entries(R.TAGS.recipients).map(([k, v], i) => `
    <a href="shop.html?for=${k}" class="h-person">
      <span class="h-person__img">${(() => { const img = photoFor((p) => (p.recipients || []).includes(k), i + 2); return img ? `<img ${L.imgAttrs(img, '120px')} alt="" loading="lazy" decoding="async">` : ''; })()}</span>
      <span>${esc(v)}</span>
    </a>`).join('');
  const SWATCH = { red: '#b3122a', pink: '#e8a0b4', white: '#f4f1ea', yellow: '#f2cf4a', orange: '#ee8a3c', purple: '#7d4b9e', blue: '#3a62b0', mixed: 'conic-gradient(#b3122a, #e8a0b4, #f2cf4a, #3a62b0, #b3122a)' };
  $('flowerGrid').innerHTML =
    Object.entries(R.TAGS.flowers).map(([k, v]) => `<a href="shop.html?flower=${k}" class="h-chip"><svg class="icon"><use href="#i-rose"/></svg>${esc(v)}</a>`).join('') +
    Object.entries(R.TAGS.colours).map(([k, v]) => `<a href="shop.html?colour=${k}" class="h-chip"><span class="h-chip__dot" style="background:${SWATCH[k]}"></span>${esc(v)}</a>`).join('');

  // ---------- UK delivery ----------
  const slug = (c) => c.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const pages = new Set((C.cities || []).map(slug));
  const city = (c) => (pages.has(slug(c)) ? `<a href="delivery-to.html?city=${slug(c)}">${esc(c)}</a>` : esc(c));
  const UK = [
    ['england', 'England-wide', ['London', 'Manchester', 'Birmingham', 'Leeds', 'Liverpool', 'Bristol', 'Sheffield', 'Leicester', 'Nottingham']],
    ['scotland', 'Scotland-wide', ['Glasgow', 'Edinburgh', 'Aberdeen', 'Dundee', 'Inverness']],
    ['wales', 'Wales-wide', ['Cardiff', 'Swansea', 'Newport', 'Wrexham']],
    ['ni', 'Northern Ireland', ['Belfast', 'Derry', 'Lisburn', 'Newry']]
  ];
  $('ukGrid').innerHTML = UK.map(([k, title, cities]) => `
    <div class="h-uk__card h-uk__card--${k}">
      <h3>${title}</h3>
      <p class="h-uk__label">Popular places</p>
      <p>${cities.map(city).join(', ')}</p>
    </div>`).join('');

  // ---------- Reviews: only real, approved reviews from the website ----------
  function stars(n) { return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n); }
  if (location.protocol !== 'file:') {
    fetch('/api/reviews?latest=1').then((r) => (r.ok ? r.json() : null)).then((data) => {
      if (!data || !data.reviews || !data.reviews.length) return;
      const box = $('homeReviews');
      box.hidden = false;
      $('reviewSummary').innerHTML = `<strong>${data.average.toFixed(1)}</strong> <span class="h-stars" aria-hidden="true">${stars(Math.round(data.average))}</span> average from ${data.count} review${data.count === 1 ? '' : 's'} on our website`;
      $('reviewTrack').innerHTML = data.reviews.map((r) => `
        <figure class="h-review">
          <span class="h-stars" aria-label="${r.rating} out of 5 stars">${stars(r.rating)}</span>
          ${r.title ? `<p class="h-review__title">${esc(r.title)}</p>` : ''}
          <blockquote>${esc(r.text.length > 220 ? r.text.slice(0, 217) + '…' : r.text)}</blockquote>
          <figcaption>${esc(r.name)} · <a href="${L.productUrl(r.productId)}">${esc(r.productName)}</a></figcaption>
        </figure>`).join('');
    }).catch(() => {});
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-scroll]');
    if (!b) return;
    const track = b.closest('section').querySelector('.h-scroll');
    track.scrollBy({ left: Number(b.dataset.scroll) * track.clientWidth * 0.8, behavior: 'smooth' });
  });

  // Photos, prices and links inside the new sections
  L.fill();
})();
