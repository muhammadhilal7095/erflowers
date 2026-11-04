// Envie Roses — Flower Club popup (a calendar page you can flip to the next plan).
// Settings: catalog.popup { enabled, delay (seconds), pages ('home' | 'all'), everyDays }
// Shown every time the site is opened (everyDays 0), or hidden for `everyDays` after it's closed. Never on checkout, account or club pages.

(function () {
  const C = window.ENVIE_CATALOG;
  const L = window.EnvieLayout;
  if (!C || !L) return;
  const cfg = C.popup || {};
  const club = C.club || {};
  const plans = Object.entries(club.plans || {}).filter(([, p]) => p.active !== false);
  if (!cfg.enabled || !club.enabled || !plans.length) return;

  const page = location.pathname.split('/').pop() || 'index.html';
  const isHome = page === '' || page === 'index.html' || page === 'index';
  if (cfg.pages === 'home' && !isHome) return;
  if (/^(club|account|admin|track-order|gift-cards)(\.html)?$/.test(page.replace(/\.html$/, '')) || /checkout=/.test(location.search)) return;

  // everyDays 0 = every visit (closed only for this browser tab's visit); otherwise hidden for that many days
  const KEY = 'envie_popup_closed';
  const days = Number(cfg.everyDays ?? 0);
  const memory = () => (days > 0 ? window.localStorage : window.sessionStorage);
  try {
    const last = Number(memory().getItem(KEY) || 0);
    if (last && (days === 0 || Date.now() - last < days * 86400000)) return;
  } catch (e) { /* storage blocked: still show it once on this page */ }
  const remember = () => { try { memory().setItem(KEY, String(Date.now())); } catch (e) { /* ignore */ } };

  const { money, esc } = L;
  const FREQ = { weekly: 'weekly', fortnightly: 'every 2 weeks', monthly: 'monthly' };
  const often = (club.frequencies || []).map((f) => FREQ[f]).filter(Boolean);
  const oftenText = often.length > 1 ? `${often.slice(0, -1).join(', ')} or ${often[often.length - 1]}` : often[0] || 'regular';
  let index = 0;

  const dayParts = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return {
      wd: d.toLocaleDateString('en-GB', { weekday: 'short' }),
      day: d.getDate(),
      mon: d.toLocaleDateString('en-GB', { month: 'short' })
    };
  };

  function pageHtml(i) {
    const [id, p] = plans[i % plans.length];
    const d = dayParts(i);
    return `
      <div class="cpop__media">
        ${p.image ? `<img ${L.imgAttrs(p.image, '(max-width: 520px) 90vw, 440px')} alt="${esc(p.name)}" decoding="async">` : ''}
        <span class="cpop__date" aria-label="${esc(d.wd)} ${d.day} ${esc(d.mon)}"><b>${esc(d.wd)}</b><strong>${d.day}</strong><small>${esc(d.mon)}</small></span>
        <span class="cpop__ribbon">${esc(p.name)}</span>
        <span class="cpop__note">Example design</span>
      </div>
      <div class="cpop__price">
        <strong>${money(p.price)}</strong>
        <span><b>per delivery</b><em>UK delivery included</em></span>
      </div>
      <h3 class="cpop__title">Fresh roses, on repeat</h3>
      <ul class="cpop__list">
        <li>Delivered ${esc(oftenText)}, designed fresh each time</li>
        <li>Pause, skip or cancel any time</li>
        <li>Keep them for yourself, or send them as a gift</li>
      </ul>
      <a href="club.html?plan=${encodeURIComponent(id)}#join" class="btn btn--gold btn--block cpop__cta">Join the Flower Club</a>
      <p class="cpop__small">No minimum term. Cancel before your next payment.</p>`;
  }

  const wrap = document.createElement('div');
  wrap.className = 'cpop';
  wrap.hidden = true;
  wrap.innerHTML = `
    <div class="cpop__backdrop" data-cpop-close></div>
    <div class="cpop__card" role="dialog" aria-modal="true" aria-labelledby="cpopHead">
      <header class="cpop__head">
        <h2 id="cpopHead">The Envie Flower Club</h2>
        <button type="button" class="cpop__close" data-cpop-close aria-label="Close"><svg class="icon"><use href="#i-close"/></svg></button>
      </header>
      <div class="cpop__rings" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div>
      <div class="cpop__page" id="cpopPage" aria-live="polite">${pageHtml(0)}</div>
      ${plans.length > 1 ? `<button type="button" class="cpop__flip" id="cpopFlip">Flip to tomorrow <svg class="icon"><use href="#i-arrow"/></svg></button>` : ''}
      <span class="cpop__curl" aria-hidden="true"></span>
    </div>`;
  document.body.appendChild(wrap);

  let lastFocus = null;
  function open() {
    // Wait if the customer is busy with the bag, checkout or another dialog
    if (document.querySelector('dialog[open], .drawer.is-open, .search.is-open, .nav.is-open')) { setTimeout(open, 8000); return; }
    lastFocus = document.activeElement;
    wrap.hidden = false;
    requestAnimationFrame(() => wrap.classList.add('is-open'));
    document.body.classList.add('cpop-lock');
    wrap.querySelector('.cpop__cta').focus({ preventScroll: true });
  }
  function close() {
    remember();
    wrap.classList.remove('is-open');
    document.body.classList.remove('cpop-lock');
    setTimeout(() => { wrap.hidden = true; }, 300);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  wrap.addEventListener('click', (e) => {
    if (e.target.closest('[data-cpop-close]')) close();
    if (e.target.closest('.cpop__cta')) remember();
  });
  document.addEventListener('keydown', (e) => {
    if (wrap.hidden) return;
    if (e.key === 'Escape') close();
    if (e.key === 'Tab') { // keep focus inside the popup
      const items = [...wrap.querySelectorAll('a[href], button:not([disabled])')];
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  // Flip the calendar page to the next plan
  const flip = document.getElementById('cpopFlip');
  if (flip) flip.addEventListener('click', () => {
    const pg = document.getElementById('cpopPage');
    pg.classList.add('is-flipping');
    setTimeout(() => {
      index = (index + 1) % plans.length;
      pg.innerHTML = pageHtml(index);
      flip.innerHTML = `${index === plans.length - 1 ? 'Back to today' : 'Flip to tomorrow'} <svg class="icon"><use href="#i-arrow"/></svg>`;
      pg.classList.remove('is-flipping');
      pg.classList.add('is-landing');
      setTimeout(() => pg.classList.remove('is-landing'), 400);
    }, 260);
  });

  setTimeout(open, Math.max(0, Number(cfg.delay ?? 0)) * 1000);
})();
