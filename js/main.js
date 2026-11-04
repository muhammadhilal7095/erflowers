// Envie Roses — interactions

(function () {
  const header = document.getElementById('header');
  const burger = document.getElementById('burger');
  const nav = document.getElementById('nav');
  const overlay = document.getElementById('navOverlay');

  // Mobile menu
  function setMenu(open) {
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    nav.classList.toggle('is-open', open);
    overlay.classList.toggle('is-open', open);
    document.body.classList.toggle('no-scroll', open);
  }

  burger.addEventListener('click', () => {
    setMenu(burger.getAttribute('aria-expanded') !== 'true');
  });
  overlay.addEventListener('click', () => setMenu(false));
  nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setMenu(false);
  });
  window.matchMedia('(min-width: 961px)').addEventListener('change', (e) => {
    if (e.matches) setMenu(false);
  });

  // Header shadow on scroll
  const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 10);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Reveal on scroll
  const revealTargets = document.querySelectorAll(
    '.section-head, .feature, .product, .banner__content, .insta-item, .about__content, .review, .occasion, .step, .care__intro, .faq, .bespoke__content'
  );
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const el = entry.target;
          el.classList.add('is-visible');
          io.unobserve(el);
          // Hand transitions back to the element's own hover styles
          setTimeout(() => {
            el.classList.remove('reveal', 'is-visible');
            el.style.transitionDelay = '';
          }, 1300);
        }
      });
    }, { threshold: 0.12 });
    // Anything people tap only fades in (never moves), so a quick tap always lands on the button
    const interactive = '.product, .occasion, .faq, .banner__content, .about__content, .care__intro, .bespoke__content';
    revealTargets.forEach((el, i) => {
      el.classList.add('reveal');
      if (el.matches(interactive)) el.classList.add('reveal--fade');
      else el.style.transitionDelay = (i % 5) * 80 + 'ms';
      io.observe(el);
    });
  }

  // Toast
  const toast = document.getElementById('toast');
  let toastTimer;
  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2600);
  }
  window.envieToast = showToast;

  // Wishlist (saved in this browser; every heart for the same product stays in step)
  const W = window.EnvieLayout && window.EnvieLayout.wishlist;
  function renderWishCount() {
    const el = document.getElementById('wishCount');
    if (!el || !W) return;
    const n = W.ids().length;
    el.textContent = n;
    el.hidden = !n;
  }
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.wish');
    if (!btn || !W) return;
    const holder = btn.closest('[data-product]');
    const id = btn.dataset.product || (holder && holder.dataset.product);
    if (!id) return;
    const on = W.toggle(id);
    document.querySelectorAll(`[data-product="${CSS.escape(id)}"] .wish, .wish[data-product="${CSS.escape(id)}"]`).forEach((b) => {
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', on ? 'Remove from wishlist' : 'Add to wishlist');
    });
    renderWishCount();
    showToast(on ? 'Saved to your wishlist' : 'Removed from your wishlist');
    document.dispatchEvent(new CustomEvent('envie:wishlist', { detail: { id, on } }));
  });
  renderWishCount();

  // Postcode checker (product and delivery pages): same rules as checkout
  const R = window.ENVIE_RULES;
  const CAT = window.ENVIE_CATALOG;
  const niceDay = (ymd, today) => {
    const label = new Date(ymd + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    return ymd === R.addDays(today, 1) ? `tomorrow, ${label}` : label;
  };
  document.querySelectorAll('form[data-postcode-check]').forEach((form) => {
    const input = form.querySelector('input');
    const out = form.querySelector('.pc-check__result');
    try { input.value = localStorage.getItem('envie_postcode') || ''; } catch (e) { /* ignore */ }
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = R.deliveryQuote(CAT, { postcode: input.value });
      out.className = 'pc-check__result';
      if (!q.ok) { out.textContent = q.error; out.classList.add('is-error'); return; }
      try { localStorage.setItem('envie_postcode', q.postcode); } catch (err) { /* ignore */ }
      const fee = typeof CAT.shop.deliveryFee === 'number' ? (CAT.shop.deliveryFee === 0 ? ' Delivery is free.' : ` Delivery is £${(CAT.shop.deliveryFee / 100).toFixed(2)}.`) : '';
      const left = q.cutoffMinutesLeft >= 60 ? `${Math.floor(q.cutoffMinutesLeft / 60)}h ${q.cutoffMinutesLeft % 60}m` : `${q.cutoffMinutesLeft} minutes`;
      if (q.sameDayPossible) {
        out.textContent = `Good news! Same-day delivery to ${q.outward} is available. Order within ${left} for delivery today.${fee}`;
        out.classList.add('is-good');
      } else if (q.sameDayArea) {
        out.textContent = `Same-day orders for ${q.outward} have closed for today (order by ${CAT.delivery.sameDayCutoff}). Earliest delivery: ${niceDay(q.earliest, q.today)}.${fee}`;
      } else {
        out.textContent = `We deliver to ${q.outward}. Earliest delivery: ${niceDay(q.earliest, q.today)}.${fee}`;
        out.classList.add('is-good');
      }
    });
  });

  // Shop menu: hover/focus opens it on desktop; the arrow button opens it in the phone menu
  document.querySelectorAll('.mega-toggle').forEach((t) => t.addEventListener('click', () => {
    const open = t.getAttribute('aria-expanded') !== 'true';
    t.setAttribute('aria-expanded', String(open));
    t.closest('.has-mega').classList.toggle('is-open', open);
  }));
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    document.querySelectorAll('.has-mega.is-open').forEach((li) => {
      li.classList.remove('is-open');
      li.querySelector('.mega-toggle').setAttribute('aria-expanded', 'false');
    });
  });

  // Search overlay
  const search = document.getElementById('search');
  const searchInput = document.getElementById('searchInput');
  const searchOpen = document.getElementById('searchOpen');
  function setSearch(open) {
    if (open) {
      search.hidden = false;
      requestAnimationFrame(() => search.classList.add('is-open'));
      document.body.classList.add('no-scroll');
      setTimeout(() => searchInput.focus(), 50);
    } else if (!search.hidden) {
      search.classList.remove('is-open');
      document.body.classList.remove('no-scroll');
      setTimeout(() => { search.hidden = true; }, 300);
      searchOpen.focus();
    }
  }
  searchOpen.addEventListener('click', () => setSearch(true));
  document.getElementById('searchClose').addEventListener('click', () => setSearch(false));
  search.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setSearch(false)));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setSearch(false);
  });

  // Newsletter
  const form = document.getElementById('newsletter');
  const email = document.getElementById('nlEmail');
  const msg = document.getElementById('nlMsg');
  if (form) form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!email.validity.valid) {
      msg.className = 'newsletter__msg is-error';
      msg.textContent = 'Please enter a valid email address.';
      email.focus();
      return;
    }
    msg.className = 'newsletter__msg is-success';
    msg.textContent = 'Thank you, you are now part of the Envie Circle.';
    form.reset();
  });

  // Back to top
  const toTop = document.getElementById('toTop');
  window.addEventListener('scroll', () => {
    toTop.classList.toggle('is-visible', window.scrollY > 700);
  }, { passive: true });
  toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  // Announcement rotator
  const msgs = document.querySelectorAll('.announce__msg');
  if (msgs.length > 1 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    let current = 0;
    setInterval(() => {
      const prev = msgs[current];
      current = (current + 1) % msgs.length;
      prev.classList.remove('is-active');
      prev.classList.add('is-leaving');
      msgs[current].classList.remove('is-leaving');
      msgs[current].classList.add('is-active');
      setTimeout(() => prev.classList.remove('is-leaving'), 700);
    }, 4000);
  }

  // Shop and legal details in page content
  if (window.EnvieLayout) window.EnvieLayout.fill();

  // ---------- Referral links (?ref=CODE): remembered for 30 days ----------
  (function () {
    const params = new URLSearchParams(location.search);
    const code = (params.get('ref') || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 20);
    if (!code) return;
    try { localStorage.setItem('envie_ref', JSON.stringify({ code, at: Date.now() })); } catch (e) { /* private mode */ }
    params.delete('ref');
    const q = params.toString();
    history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash);
  })();
})();
