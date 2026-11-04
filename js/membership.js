// Envie Roses — Membership page (membership.html)
// Shows the plans, then the exact price and dates before anyone joins.

(function () {
  const C = window.ENVIE_CATALOG;
  const L = window.EnvieLayout;
  const S = window.EnvieShop;
  const { money, esc } = L;
  const cfg = C.membership || {};
  const $ = (id) => document.getElementById(id);
  const plans = Object.entries(cfg.plans || {}).filter(([, p]) => p.active !== false);
  const days = Number(cfg.trialDays || 0);
  const longDate = (d) => d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const ordinal = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');

  if (!cfg.enabled || !plans.length) { $('closed').hidden = false; return; }

  // Account status: logged in? already a member? free trial already used?
  let me = null;
  const token = S.accountToken();
  const ready = token && location.protocol !== 'file:'
    ? fetch('/api/account/me', { headers: S.authHeaders() }).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((d) => { me = d; })
    : Promise.resolve();

  let joinPlan = '';
  const trialFor = () => (days && !(me && me.customer.trialUsed) ? days : 0);

  function trialCopy() {
    const t = trialFor();
    $('trialBadge').hidden = !t;
    $('trialText').textContent = `First ${t} days free`;
    $('stepTrial').textContent = t
      ? `New members get their first ${t} days free. We show you the exact date your first payment is due before you join.`
      : 'Your first monthly payment is taken when you join, then on the same day each month.';
    $('faqTrial').textContent = t
      ? `New members pay nothing for the first ${t} days and get all the benefits of their plan. Your card is saved when you join. If you don't cancel before the trial ends, the monthly price is charged on the date we show you, then every month after that. Cancel before then and you won't pay anything. One free trial per customer.`
      : 'You have already had a free trial, so your first monthly payment is taken when you join.';
  }

  function drawPlans() {
    const current = me && me.membership && me.membership.active ? me.membership.planId : '';
    $('plans').innerHTML = plans.map(([id, p]) => `
      <article class="mplan${p.popular ? ' mplan--popular' : ''}${current === id ? ' mplan--current' : ''}">
        ${p.popular ? '<span class="mplan__flag">Most popular</span>' : ''}
        <h2 class="mplan__name">${esc(p.name)}</h2>
        <p class="mplan__price"><strong>${money(p.price)}</strong><span>/month</span></p>
        <p class="mplan__trial">${trialFor() ? `${trialFor()} days free, then ${money(p.price)} a month` : 'Billed monthly, cancel any time'}</p>
        <ul class="mplan__perks">${(p.perks || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
        ${current === id
          ? '<a href="account.html#membership" class="btn btn--outline btn--block">Your current plan</a>'
          : `<button type="button" class="btn ${p.popular ? 'btn--gold' : 'btn--outline'} btn--block" data-plan="${esc(id)}">${trialFor() ? 'Start free trial' : 'Join now'}</button>`}
      </article>`).join('');
  }

  function openJoin(id) {
    const p = cfg.plans[id];
    const t = trialFor();
    const first = new Date();
    first.setDate(first.getDate() + t);
    $('join').hidden = false;
    $('joinTitle').textContent = `Join ${p.name}`;
    $('joinSummary').innerHTML = `
      <div class="mship__row"><span>Today</span><strong>${t ? '£0.00' : money(p.price)}</strong></div>
      ${t ? `<div class="mship__row"><span>Free trial ends</span><strong>${longDate(first)}</strong></div>` : ''}
      <div class="mship__row"><span>Then</span><strong>${money(p.price)} every month</strong></div>
      <p class="mship__disclose">${t
        ? `Your first payment of <strong>${money(p.price)}</strong> will be taken on <strong>${longDate(first)}</strong>, then on the ${ordinal(first.getDate())} of each month until you cancel. Cancel before ${first.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })} and you won&rsquo;t pay anything.`
        : `You&rsquo;ll pay <strong>${money(p.price)}</strong> today, then on the ${ordinal(first.getDate())} of each month until you cancel.`}
      ${p.monthlyBouquet ? ' Your monthly bouquet starts with your first paid month.' : ''}</p>`;

    if (!token || !me) {
      $('joinBody').innerHTML = `
        <p class="mship__login">You need a free account to join, so you can see your membership and cancel any time.</p>
        <div class="mship__login-btns">
          <a href="account.html#register" class="btn btn--gold">Create an account</a>
          <a href="account.html" class="btn btn--outline">Log in</a>
        </div>
        <p class="mship__small">Then come back to this page to join.</p>`;
    } else if (me.membership && (me.membership.active || me.membership.status === 'pending')) {
      $('joinBody').innerHTML = `<p class="mship__login">You already have a membership (${esc(me.membership.planName)}). To change plan, <a href="#" data-enquire="changing my membership plan">message us</a> or manage it in <a href="account.html#membership">My Account</a>.</p>`;
    } else {
      $('joinBody').innerHTML = `
        <label class="check-line"><input type="checkbox" id="joinAgree"> <span>I understand that my membership renews automatically at ${money(p.price)} a month until I cancel${t ? `, starting ${longDate(first)}` : ''}, and I agree to the <a href="#terms-list">membership terms</a>.</span></label>
        <button type="submit" class="btn btn--gold btn--block" id="joinBtn">${t ? `Start my ${t}-day free trial` : `Join for ${money(p.price)} a month`}</button>
        <p class="mship__small">${C.payments.stripe ? 'You&rsquo;ll enter your card on our secure payment page (Stripe).' : 'We&rsquo;ll confirm your membership and payment with you on WhatsApp.'}</p>`;
    }
    joinPlan = id;
    $('joinError').textContent = '';
    $('join').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-plan]');
    if (b) openJoin(b.dataset.plan);
  });

  $('joinForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('joinError');
    err.textContent = '';
    const agree = $('joinAgree');
    if (!agree || !agree.checked) { err.textContent = 'Please tick the box to confirm you understand how billing works.'; return; }
    const id = joinPlan;
    const btn = $('joinBtn');
    btn.disabled = true;
    try {
      const res = await fetch('/api/membership/join', { method: 'POST', headers: { 'Content-Type': 'application/json', ...S.authHeaders() }, body: JSON.stringify({ planId: id, agree: true }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Something went wrong. Please try again.');
      if (d.url) { location.href = d.url; return; }
      const p = cfg.plans[id];
      S.openWhatsApp(S.waLink([
        `*Membership - ${C.shop.name}*`, '',
        `I'd like to join: ${p.name} (${money(p.price)} a month)${d.trialDays ? `, starting with the ${d.trialDays}-day free trial` : ''}.`,
        `Name: ${me.customer.name}`, `Email: ${me.customer.email}`, ...(me.customer.phone ? [`Phone: ${me.customer.phone}`] : []), '',
        'Please send me the details to set up payment.'
      ].join('\n')));
      location.href = 'account.html?member=requested#membership';
    } catch (ex) {
      err.textContent = ex.message;
      btn.disabled = false;
    }
  });

  document.querySelector('.mship__terms ul').id = 'terms-list';
  trialCopy();
  drawPlans();
  ready.then(() => {
    trialCopy();
    drawPlans();
    const want = new URLSearchParams(location.search).get('plan');
    if (want && cfg.plans[want]) openJoin(want);
  });
})();
