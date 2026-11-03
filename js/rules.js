// Envie Roses — shared shop rules: prices, add-ons, UK delivery and discount codes.
// Used by the website (browser) AND the server, so what a customer sees is exactly
// what the server charges. Times are UK time (Europe/London).

(function (root) {
  // ---------- Product tags (for menus, filters and the bouquet finder) ----------
  const TAGS = {
    colours: { red: 'Red', pink: 'Pink', white: 'White', yellow: 'Yellow', orange: 'Orange', purple: 'Purple', blue: 'Blue', mixed: 'Mixed' },
    flowers: { roses: 'Roses', lilies: 'Lilies', peonies: 'Peonies', tulips: 'Tulips', sunflowers: 'Sunflowers', orchids: 'Orchids', hydrangeas: 'Hydrangeas', gypsophila: 'Gypsophila', carnations: 'Carnations' },
    occasions: {
      anniversary: 'Anniversary', birthday: 'Birthday', love: 'Love & Romance', valentines: "Valentine's Day",
      'mothers-day': "Mother's Day", congratulations: 'Congratulations', 'thank-you': 'Thank You',
      'get-well': 'Get Well Soon', 'new-baby': 'New Baby', wedding: 'Wedding', sympathy: 'Sympathy', 'just-because': 'Just Because'
    },
    recipients: { her: 'For Her', him: 'For Him', mum: 'For Mum', wife: 'For Wife', girlfriend: 'For Girlfriend', friend: 'For a Friend' }
  };
  const PRICE_BANDS = {
    'under-50': { label: 'Under £50', min: 0, max: 4999 },
    '50-100': { label: '£50 – £100', min: 5000, max: 10000 },
    '100-200': { label: '£100 – £200', min: 10001, max: 20000 },
    '200-plus': { label: '£200+', min: 20001, max: Infinity }
  };

  // ---------- Prices ----------
  function saleActive(product, now = Date.now()) {
    const s = product && product.sale;
    return Boolean(s && s.percent > 0 && Date.parse(s.endsAt) > now);
  }
  function unitPrice(product, option, now = Date.now()) {
    return saleActive(product, now) ? Math.round((option.price * (100 - product.sale.percent)) / 100) : option.price;
  }
  function fromPrice(product) {
    if (!product || product.enquire || !product.options || !product.options.length) return null;
    return Math.min(...product.options.map((o) => unitPrice(product, o)));
  }
  const activeAddons = (catalog) =>
    Object.entries(catalog.addons || {}).filter(([, a]) => a && a.active !== false).map(([id, a]) => ({ id, ...a }));

  // ---------- UK time ----------
  function londonParts(ms) {
    const parts = {};
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(ms)).forEach((p) => { parts[p.type] = p.value; });
    return parts;
  }
  const todayUK = (now = Date.now()) => { const p = londonParts(now); return `${p.year}-${p.month}-${p.day}`; };
  const minutesNowUK = (now = Date.now()) => { const p = londonParts(now); return Number(p.hour) * 60 + Number(p.minute); };
  function addDays(ymd, n) {
    const [y, m, d] = ymd.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d + n));
    return t.toISOString().slice(0, 10);
  }
  const toMinutes = (hhmm) => { const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };

  // ---------- UK postcodes ----------
  // Returns "SW1A 1AA" style, or null when it isn't a full UK postcode
  function normalizePostcode(input) {
    const raw = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!/^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$/.test(raw)) return null;
    return `${raw.slice(0, -3)} ${raw.slice(-3)}`;
  }
  // An area list entry like "SW" matches the whole area; "KW15" matches that district only
  function inAreas(list, outward) {
    const area = (outward.match(/^[A-Z]+/) || [''])[0];
    return (list || []).some((entry) => {
      const e = String(entry).toUpperCase().trim();
      return e && (/\d/.test(e) ? e === outward : e === area);
    });
  }

  // ---------- Delivery ----------
  // Works out the earliest date, same-day availability and fee for a postcode (and date, if given)
  function deliveryQuote(catalog, { postcode, date, now = Date.now() } = {}) {
    const shop = catalog.shop || {};
    const d = catalog.delivery || {};
    const closed = new Set(d.closedDates || []);
    const today = todayUK(now);
    const pc = postcode ? normalizePostcode(postcode) : null;
    const quote = { ok: true, postcode: pc, outward: pc ? pc.split(' ')[0] : '', today };

    if (postcode && !pc) return { ...quote, ok: false, error: 'Please enter a full UK postcode, for example SW1A 1AA.' };
    if (pc && inAreas(d.noDeliveryAreas, quote.outward)) {
      return { ...quote, ok: false, blocked: true, error: `We can't take online orders for ${quote.outward} yet. Please message us on WhatsApp and we'll do our best to arrange delivery.` };
    }

    const cutoff = toMinutes(d.sameDayCutoff);
    const minutesLeft = cutoff === null ? 0 : cutoff - minutesNowUK(now);
    quote.sameDayArea = Boolean(d.sameDayEnabled && pc && inAreas(d.sameDayAreas, quote.outward));
    quote.sameDayPossible = quote.sameDayArea && minutesLeft > 0 && !closed.has(today);
    quote.cutoffMinutesLeft = quote.sameDayPossible ? minutesLeft : 0;

    let earliest = quote.sameDayPossible ? today : addDays(today, Math.max(1, Number(shop.minDeliveryDays) || 0));
    for (let i = 0; i < 30 && closed.has(earliest); i++) earliest = addDays(earliest, 1);
    quote.earliest = earliest;
    quote.closedDates = [...closed];

    if (date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ...quote, ok: false, error: 'Please choose a delivery date.' };
      if (date < earliest) return { ...quote, ok: false, error: date === today ? 'Same-day delivery is not available for this postcode or time. Please choose a later date.' : 'Please choose a later delivery date.' };
      if (closed.has(date)) return { ...quote, ok: false, error: 'We are closed on that date. Please choose another day.' };
      if (date > addDays(today, 120)) return { ...quote, ok: false, error: 'Please choose a date within the next 4 months.' };
      quote.date = date;
      quote.sameDay = date === today;
    }

    const standard = typeof shop.deliveryFee === 'number' ? shop.deliveryFee : null;
    quote.fee = quote.sameDay && typeof d.sameDayFee === 'number' ? d.sameDayFee : standard;
    return quote;
  }

  // ---------- Discount codes ----------
  const cleanCode = (code) => String(code || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 30);
  // def: { code, type: 'percent'|'fixed'|'free-delivery', value, minSpend, endsAt, active }
  function applyDiscount(def, merchandise, deliveryFee, now = Date.now()) {
    if (!def || def.active === false) return { ok: false, error: 'That code is not valid.' };
    if (def.endsAt && Date.parse(def.endsAt) < now) return { ok: false, error: 'That code has expired.' };
    if (def.minSpend && merchandise < def.minSpend) return { ok: false, error: `That code needs a spend of £${(def.minSpend / 100).toFixed(2)} or more.` };
    let amount = 0;
    if (def.type === 'percent') amount = Math.round((merchandise * Math.min(100, def.value)) / 100);
    else if (def.type === 'fixed') amount = Math.min(def.value, merchandise);
    else if (def.type === 'free-delivery') amount = typeof deliveryFee === 'number' ? deliveryFee : 0;
    const label = def.type === 'percent' ? `${def.value}% off` : def.type === 'fixed' ? `£${(def.value / 100).toFixed(2)} off` : 'Free delivery';
    return { ok: true, code: def.code, amount, label, freeDelivery: def.type === 'free-delivery' };
  }

  const RULES = {
    TAGS, PRICE_BANDS, saleActive, unitPrice, fromPrice, activeAddons,
    todayUK, minutesNowUK, addDays, normalizePostcode, inAreas, deliveryQuote, cleanCode, applyDiscount
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = RULES;
  else root.ENVIE_RULES = RULES;
})(typeof self !== 'undefined' ? self : this);
