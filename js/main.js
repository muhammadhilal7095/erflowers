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

  // Wishlist
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.wish');
    if (!btn) return;
    const on = btn.getAttribute('aria-pressed') !== 'true';
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', on ? 'Remove from wishlist' : 'Add to wishlist');
    showToast(on ? 'Saved to your wishlist' : 'Removed from your wishlist');
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
})();
