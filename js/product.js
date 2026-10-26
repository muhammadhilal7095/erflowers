// Envie Roses — product page (product.html?id=<product id>)

(function () {
  const { products, shop } = window.ENVIE_CATALOG;
  const L = window.EnvieLayout;
  const { money, esc } = L;
  const $ = (id) => document.getElementById(id);
  const CATEGORIES = { boxes: 'Rose Boxes', bouquets: 'Bouquets', exclusive: 'Exclusive' };

  const id = new URLSearchParams(location.search).get('id') || '';
  const p = products[id];

  if (!p) {
    $('ppMain').hidden = true;
    $('ppMissing').hidden = false;
    $('reviews').hidden = true;
    $('related').hidden = true;
    document.title = `Product not found | ${shop.name}`;
    return;
  }

  // ---------- Page details ----------
  document.title = `${p.name} | ${shop.name}`;
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) metaDesc.content = p.description || metaDesc.content;
  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) ogTitle.content = document.title;
  const ogImage = document.querySelector('meta[property="og:image"]');
  if (ogImage) ogImage.content = p.image;

  $('ppCrumbs').innerHTML = `
    <a href="index.html">Home</a><span aria-hidden="true">/</span>
    <a href="shop.html">Shop</a><span aria-hidden="true">/</span>
    <a href="shop.html?c=${esc(p.category)}">${esc(CATEGORIES[p.category] || 'Roses')}</a><span aria-hidden="true">/</span>
    <span aria-current="page">${esc(p.name)}</span>`;
  $('ppCategory').textContent = CATEGORIES[p.category] || 'Envie Roses';
  $('ppName').textContent = p.name;
  $('ppDesc').textContent = p.description || '';
  const details = (p.details || p.description || '').split('\n').map((l) => l.trim()).filter(Boolean);
  $('ppDetails').innerHTML = details.map((l) => `<li>${esc(l)}</li>`).join('');

  // ---------- Gallery ----------
  const photos = [p.image, ...(p.gallery || [])].filter(Boolean);
  const track = $('galleryTrack');
  const thumbs = $('galleryThumbs');
  track.innerHTML = photos.map((src, i) => `
    <div class="gallery__slide"><img ${L.imgAttrs(src, '(max-width: 720px) 100vw, 50vw')} alt="${esc(p.name)}, photo ${i + 1} of ${photos.length}" width="1080" height="1080" decoding="async"${i ? ' loading="lazy"' : ' fetchpriority="high"'}></div>`).join('');
  thumbs.innerHTML = photos.map((src, i) => `
    <button type="button" class="gallery__thumb${i ? '' : ' is-active'}" role="tab" aria-selected="${i ? 'false' : 'true'}" aria-label="Photo ${i + 1}" data-slide="${i}"><img ${L.imgAttrs(src, '96px')} alt="" loading="lazy" decoding="async"></button>`).join('');
  const single = photos.length < 2;
  $('galPrev').hidden = single;
  $('galNext').hidden = single;
  thumbs.hidden = single;

  let current = 0;
  function markActive() {
    $('galCount').textContent = single ? '' : `${current + 1} / ${photos.length}`;
    thumbs.querySelectorAll('.gallery__thumb').forEach((t, i) => {
      t.classList.toggle('is-active', i === current);
      t.setAttribute('aria-selected', String(i === current));
    });
  }
  function showSlide(i) {
    current = (i + photos.length) % photos.length;
    track.scrollTo({ left: current * track.clientWidth, behavior: 'smooth' });
    markActive();
  }
  let scrollTimer;
  track.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      current = Math.round(track.scrollLeft / track.clientWidth);
      markActive();
    }, 60);
  }, { passive: true });
  $('galPrev').addEventListener('click', () => showSlide(current - 1));
  $('galNext').addEventListener('click', () => showSlide(current + 1));
  thumbs.addEventListener('click', (e) => {
    const t = e.target.closest('[data-slide]');
    if (t) showSlide(Number(t.dataset.slide));
  });
  track.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') showSlide(current + 1);
    if (e.key === 'ArrowLeft') showSlide(current - 1);
  });
  markActive();

  // ---------- Sizes and price ----------
  let optionId = p.options[0] ? p.options[0].id : null;
  let qty = 1;
  const option = () => p.options.find((o) => o.id === optionId);

  function renderPrice() {
    const onSale = L.saleActive(p);
    $('ppBadge').hidden = !onSale;
    if (onSale) $('ppBadge').textContent = `-${p.sale.percent}%`;

    if (p.enquire || !option()) {
      $('ppPrice').innerHTML = '<span class="pp__now">Price on request</span>';
      return;
    }
    const o = option();
    const now = L.unitPrice(p, o);
    $('ppPrice').innerHTML = onSale
      ? `<span class="pp__now">${money(now)}</span><s class="pp__was">${money(o.price)}</s><span class="pp__save">Save ${money(o.price - now)}</span>`
      : `<span class="pp__now">${money(o.price)}</span>`;
    $('ppVariants').innerHTML = p.options.map((v) => {
      const vp = L.unitPrice(p, v);
      return `<label class="variant">
        <input type="radio" name="ppVariant" value="${esc(v.id)}"${v.id === optionId ? ' checked' : ''}>
        <span><strong>${esc(v.label)}</strong><small>${money(vp)}${vp !== v.price ? ` <s>${money(v.price)}</s>` : ''}</small></span>
      </label>`;
    }).join('');
  }

  $('ppVariants').addEventListener('change', (e) => {
    optionId = e.target.value;
    renderPrice();
  });
  document.querySelectorAll('[data-ppqty]').forEach((b) => b.addEventListener('click', () => {
    qty = Math.max(1, Math.min(20, qty + Number(b.dataset.ppqty)));
    $('ppQty').textContent = qty;
  }));
  $('ppAdd').addEventListener('click', () => window.EnvieShop.add(id, optionId, qty));
  $('ppBuyNow').addEventListener('click', () => window.EnvieShop.buy(id, optionId, qty));

  if (p.enquire) {
    $('ppBuy').hidden = true;
    $('ppEnquire').hidden = false;
    $('ppEnquireBtn').dataset.enquire = p.name;
  }
  renderPrice();

  // ---------- Offer countdown ----------
  // The discount ends at the same moment on the site and at checkout
  let timer;
  const pad = (n) => String(n).padStart(2, '0');
  function tick() {
    if (!L.saleActive(p)) {
      $('ppOffer').hidden = true;
      clearInterval(timer);
      renderPrice();
      return;
    }
    const left = Date.parse(p.sale.endsAt) - Date.now();
    const s = Math.floor(left / 1000);
    $('cdDays').textContent = pad(Math.floor(s / 86400));
    $('cdHours').textContent = pad(Math.floor((s % 86400) / 3600));
    $('cdMins').textContent = pad(Math.floor((s % 3600) / 60));
    $('cdSecs').textContent = pad(s % 60);
  }
  if (L.saleActive(p)) {
    $('ppOffer').hidden = false;
    $('offerLabel').textContent = `${p.sale.label || 'Special Offer'}: ${p.sale.percent}% off`;
    const ends = new Date(p.sale.endsAt).toLocaleString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London'
    });
    $('offerEnds').textContent = `Ends ${ends} (UK time)`;
    tick();
    timer = setInterval(tick, 1000);
  }

  // ---------- Reviews ----------
  const stars = (rating, cls = '') => `<span class="rstars ${cls}" aria-label="${rating} out of 5 stars">${[1, 2, 3, 4, 5]
    .map((n) => `<svg class="${n <= Math.round(rating) ? 'is-on' : ''}"><use href="#i-star"/></svg>`).join('')}</span>`;
  const reviewDate = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  function renderReviews(data) {
    const { count, average, breakdown, reviews } = data;
    $('ppRating').innerHTML = count
      ? `${stars(average)} <span>${average.toFixed(1)} · ${count} review${count === 1 ? '' : 's'}</span>`
      : `${stars(0)} <span>Be the first to review</span>`;
    $('rvSummary').innerHTML = count ? `
      <p class="rv__avg">${average.toFixed(1)}</p>
      ${stars(average, 'rstars--lg')}
      <p class="rv__count">Based on ${count} review${count === 1 ? '' : 's'}</p>
      <ul class="rv__bars">${breakdown.map((n, i) => `
        <li><span>${5 - i}</span><svg><use href="#i-star"/></svg><span class="rv__bar"><span style="width:${count ? (n / count) * 100 : 0}%"></span></span><span>${n}</span></li>`).join('')}
      </ul>` : `
      <p class="rv__avg">—</p>
      ${stars(0, 'rstars--lg')}
      <p class="rv__count">No reviews yet</p>`;
    $('rvList').innerHTML = reviews.length ? reviews.map((r) => `
      <article class="rv-item">
        <header>${stars(r.rating)}<time datetime="${esc(r.createdAt)}">${reviewDate(r.createdAt)}</time></header>
        ${r.title ? `<h3>${esc(r.title)}</h3>` : ''}
        <p>${esc(r.text)}</p>
        <footer>${esc(r.name)}</footer>
      </article>`).join('') : `
      <div class="rv-empty">
        <svg><use href="#i-rose"/></svg>
        <p>No reviews yet for ${esc(p.name)}.</p>
        <a href="#rvForm" class="btn btn--outline btn--sm">Write the first review</a>
      </div>`;
    addStructuredData(data);
  }

  async function loadReviews() {
    const empty = { count: 0, average: 0, breakdown: [0, 0, 0, 0, 0], reviews: [] };
    if (location.protocol === 'file:') return renderReviews(empty);
    try {
      const res = await fetch(`/api/reviews?product=${encodeURIComponent(id)}`);
      renderReviews(res.ok ? await res.json() : empty);
    } catch (e) {
      renderReviews(empty);
    }
  }

  // Review form
  let rating = 0;
  const starBtns = document.querySelectorAll('#starInput [data-star]');
  function paintStars(n) {
    starBtns.forEach((b) => {
      const on = Number(b.dataset.star) <= n;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-checked', String(Number(b.dataset.star) === rating));
    });
  }
  starBtns.forEach((b) => {
    b.addEventListener('click', () => { rating = Number(b.dataset.star); paintStars(rating); });
    b.addEventListener('mouseenter', () => paintStars(Number(b.dataset.star)));
  });
  $('starInput').addEventListener('mouseleave', () => paintStars(rating));

  const rvForm = $('rvForm');
  rvForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('rvError');
    err.textContent = '';
    if (!rating) { err.textContent = 'Please choose a star rating.'; return; }
    if (!rvForm.checkValidity()) {
      rvForm.classList.add('was-validated');
      err.textContent = 'Please add your name and a few words about your roses.';
      return;
    }
    if (location.protocol === 'file:') { err.textContent = 'Reviews can be submitted on the live website.'; return; }
    const data = Object.fromEntries(new FormData(rvForm).entries());
    const btn = $('rvSubmit');
    btn.disabled = true;
    btn.textContent = 'Sending…';
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, rating, productId: id })
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || 'Your review could not be sent. Please try again.');
      rvForm.innerHTML = `
        <div class="rv-thanks">
          <svg><use href="#i-rose"/></svg>
          <h3 class="rv-form__title">Thank You for Your Review</h3>
          <p>Our team will check it shortly, and it will then appear on this page.</p>
        </div>`;
    } catch (ex) {
      err.textContent = ex.message;
      btn.disabled = false;
      btn.textContent = 'Submit Review';
    }
  });

  // ---------- Search engines ----------
  function addStructuredData(reviewData) {
    const prices = p.options.map((o) => L.unitPrice(p, o));
    const data = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: p.name,
      image: photos.map((src) => new URL(src, location.href).href),
      description: p.description,
      brand: { '@type': 'Brand', name: shop.name },
      sku: id
    };
    if (prices.length) {
      data.offers = {
        '@type': 'AggregateOffer',
        priceCurrency: 'GBP',
        lowPrice: (Math.min(...prices) / 100).toFixed(2),
        highPrice: (Math.max(...prices) / 100).toFixed(2),
        offerCount: prices.length,
        availability: 'https://schema.org/InStock'
      };
    }
    if (reviewData && reviewData.count) {
      data.aggregateRating = { '@type': 'AggregateRating', ratingValue: reviewData.average, reviewCount: reviewData.count };
    }
    let tag = document.getElementById('ppSchema');
    if (!tag) {
      tag = document.createElement('script');
      tag.type = 'application/ld+json';
      tag.id = 'ppSchema';
      document.head.appendChild(tag);
    }
    tag.textContent = JSON.stringify(data);
  }

  // ---------- Related products ----------
  const others = Object.keys(products).filter((k) => k !== id);
  const related = [...others.filter((k) => products[k].category === p.category), ...others.filter((k) => products[k].category !== p.category)].slice(0, 3);
  $('relatedGrid').innerHTML = related.map(L.productCard).join('');
  $('related').hidden = !related.length;

  // Keep the floating WhatsApp / back-to-top buttons from covering Buy Now
  if ('IntersectionObserver' in window) {
    const buyArea = p.enquire ? $('ppEnquire') : $('ppBuy');
    new IntersectionObserver(([entry]) => {
      document.body.classList.toggle('hide-floats', entry.isIntersecting);
    }).observe(buyArea);
  }

  loadReviews();
})();
