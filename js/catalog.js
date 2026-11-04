// Envie Roses — shop settings and product catalogue.
// Used by the website (browser) AND the payment function (server), so prices
// are always checked on the server and cannot be changed by a visitor.
//
// Edit this file to change prices, products, contact details or payments.
// Prices are in pence (11900 = £119.00).

(function (root) {
  const CATALOG = {
    shop: {
      name: 'Envie Roses',
      currency: 'gbp',
      phone: '+44 7464 418817',
      // WhatsApp number in international format, digits only (no +, spaces or leading 0)
      whatsapp: '447464418817',
      email: 'info@envieroses.co.uk',
      location: 'London, United Kingdom',
      // Opening / reply hours shown on the Contact page, or '' to hide
      hours: '',
      // Delivery charge in pence, or null if you confirm it with each customer
      deliveryFee: null,
      // Earliest delivery: 1 = tomorrow
      minDeliveryDays: 1
    },

    // Legal details shown in the footer and policies. UK law requires a
    // limited company to show its registered name, number and office.
    // Leave blank anything that does not apply (e.g. vatNumber if not VAT registered).
    legal: {
      companyName: '',          // e.g. 'Envie Roses Ltd'
      companyNumber: '',        // e.g. '12345678'
      registeredIn: 'England and Wales',
      registeredAddress: '',    // full registered office address
      vatNumber: '',            // e.g. 'GB123456789'
      updated: '25 October 2026'
    },

    // Full profile links, or '' to hide the icon
    social: {
      instagram: '',
      facebook: '',
      tiktok: '',
      pinterest: ''
    },

    payments: {
      // Card / Apple Pay / Google Pay via Stripe.
      // Turn on only after deploying with STRIPE_SECRET_KEY (see SETUP.md).
      stripe: false,
      // Customer sends order on WhatsApp, you reply with a payment link or bank details
      whatsapp: true
    },

    // Delivery rules (all times UK). Postcode areas: "SW" = the whole SW area, "KW15" = that district only.
    delivery: {
      sameDayEnabled: true,
      sameDayCutoff: '14:00',          // order before this time for same-day delivery
      sameDayFee: null,                // pence; null = same as the normal delivery charge
      sameDayAreas: ['E', 'EC', 'N', 'NW', 'SE', 'SW', 'W', 'WC'],
      slots: ['Morning (9am – 1pm)', 'Afternoon (1pm – 5pm)', 'Evening (5pm – 9pm)'],
      // Areas where customers must message us instead of ordering online
      noDeliveryAreas: ['IM', 'JE', 'GY', 'HS', 'ZE', 'KW15', 'KW16', 'KW17', 'TR21', 'TR22', 'TR23', 'TR24', 'TR25'],
      closedDates: ['2026-12-25', '2026-12-26', '2027-01-01']
    },

    // Gifts customers can add to an order. price in pence (0 = free). icon is used until you upload a photo.
    addons: {
      'glass-vase': { name: 'Glass Vase', price: 0, icon: 'vase', image: '', description: 'A clear glass vase, so your roses are ready to display.', active: true },
      'luxury-chocolates': { name: 'Luxury Chocolates', price: 1299, icon: 'chocolate', image: '', description: 'A box of assorted luxury chocolates.', active: true },
      'teddy-bear': { name: 'Teddy Bear', price: 1499, icon: 'teddy', image: '', description: 'A soft, cuddly teddy bear.', active: true },
      'love-balloon': { name: 'Balloon', price: 999, icon: 'balloon', image: '', description: 'A helium heart balloon.', active: true },
      'scented-candle': { name: 'Scented Candle', price: 1699, icon: 'candle', image: '', description: 'A scented candle in a glass jar.', active: true }
    },

    // Towns and cities with their own delivery page (delivery-to.html?city=london)
    cities: ['London', 'Manchester', 'Birmingham', 'Leeds', 'Liverpool', 'Bristol', 'Sheffield', 'Leicester', 'Nottingham', 'Glasgow', 'Edinburgh', 'Cardiff'],

    // Loyalty points for customers with an account. pointValue is pence per point (1 = 100 points for £1 off).
    // Points are added when an order is marked Delivered in the dashboard.
    loyalty: {
      enabled: true,
      pointsPerPound: 1,     // points earned per £1 spent on flowers and gifts
      pointValue: 1,         // pence each point is worth
      minRedeem: 500,        // smallest number of points a customer can use
      maxPercent: 50,        // most of an order (%) that points can pay for
      signupBonus: 100       // points given when an account is created
    },

    // Refer a friend. The friend gets friendAmount (pence) off their first order of minSpend or more;
    // the customer who shared the link gets referrerPoints once that order is marked Delivered.
    referrals: {
      enabled: true,
      friendAmount: 1000,
      minSpend: 4000,
      referrerPoints: 1000,
      maxPerCustomer: 50
    },

    // Flower Club: regular deliveries. price in pence per delivery, delivery included.
    club: {
      enabled: true,
      frequencies: ['weekly', 'fortnightly', 'monthly'],
      plans: {
        signature: { name: 'The Signature', description: 'A hand-tied bouquet of seasonal roses, chosen by our florists.', image: 'images/product-5.jpg', price: 4500, active: true },
        luxe: { name: 'The Luxe', description: 'A fuller arrangement of premium roses and seasonal stems.', image: 'images/product-3.jpg', price: 6500, active: true },
        grand: { name: 'The Grand', description: 'Our most generous design: a statement box of luxury roses.', image: 'images/product-1.jpg', price: 9500, active: true }
      }
    },

    // Partner programme: commission (pence) per delivered order from a partner's link
    affiliates: { enabled: true, commission: 1000, cookieDays: 30, minPayout: 5000 },

    // Membership (membership.html): monthly plans with member prices. price in pence per month.
    // discount = % off flowers (not gifts); freeDeliveryOver = pence (0 = always free standard delivery);
    // monthlyBouquet = a standard bouquet each paid month. Free trial for new members.
    membership: {
      enabled: true,
      trialDays: 30,
      plans: {
        lover: {
          name: 'Flower Lover', price: 999, discount: 5, freeDeliveryOver: 4000, monthlyBouquet: false, popular: false, active: true,
          perks: ['5% off all flowers', 'Exclusive member offers', 'Birthday treat', 'Free delivery on orders over £40']
        },
        premium: {
          name: 'Flower Club Premium', price: 1999, discount: 10, freeDeliveryOver: 3000, monthlyBouquet: false, popular: true, active: true,
          perks: ['10% off all flowers', 'Free standard delivery on orders over £30', 'Exclusive member-only bouquets', 'Early access to new collections', 'Birthday and anniversary offers']
        },
        vip: {
          name: 'Flower Club VIP', price: 3999, discount: 15, freeDeliveryOver: 0, monthlyBouquet: true, popular: false, active: true,
          perks: ['One standard bouquet every month', 'Free standard UK delivery', '15% off additional flowers', 'Exclusive premium collections', 'Priority customer service', 'Special occasion reminders']
        }
      }
    },

    // Flower Club popup: shown as soon as the site opens (delay 0) on any page ('all') or the homepage only ('home'),
    // everyDays: 0 = every visit, or hide for that many days once closed
    popup: { enabled: true, delay: 0, pages: 'all', everyDays: 0 },

    // Gift cards: amounts in pence. Cards are issued from the dashboard once paid.
    giftCards: {
      enabled: true,
      amounts: [2500, 5000, 7500, 10000, 15000],
      months: 24              // how long a card can be used for
    },

    // Site photos you can replace from the dashboard. '' = use the built-in photo.
    images: {
      hero: '',
      blueBanner: '',
      bespoke: '',
      about: '',
      pageHero: '',
      insta1: '',
      insta2: '',
      insta3: '',
      insta4: '',
      insta5: ''
    },

    // category: 'boxes' | 'bouquets' | 'exclusive'. enquire: true = price on request (WhatsApp enquiry)
    // featured: true = shown in The Signature Line on the homepage
    // gallery: extra photos on the product page; details: one point per line
    // sale: { percent, label, endsAt } = a time-limited discount with a countdown
    // colours / flowers / occasions / recipients: tags used by the menus, filters and bouquet finder (see js/rules.js)
    // recipe: what's in the bouquet, one item per line. Size note: e.g. '30cm wide'
    products: {
      'red-50-boxed': {
        colours: ['red'],
        flowers: ['roses'],
        occasions: ['anniversary', 'love', 'valentines', 'birthday'],
        recipients: ['her', 'wife', 'girlfriend'],
        recipe: 'Red roses × 50',
        featured: true,
        name: '50 Luxury Red Roses Boxed',
        category: 'boxes',
        image: 'images/product-1.jpg',
        gallery: ['images/product-1-b.jpg', 'images/product-1-c.jpg'],
        details: 'Fifty premium red roses, hand-selected for colour and form.\nArranged by hand in our signature round black hatbox.\nAdd a personal card message at checkout.\nDelivered across the UK on the date you choose.',
        // Example offer: the countdown and discount end automatically at endsAt (UK time shown on site)
        sale: { percent: 15, label: 'Autumn Offer', endsAt: '2026-11-02T23:59:00Z' },
        description: 'Fifty hand-selected red roses, arranged by hand in our signature black hatbox. A timeless declaration of love.',
        options: [
          { id: 'standard', label: 'Standard', price: 11900 },
          { id: 'deluxe', label: 'Deluxe', price: 24900 }
        ]
      },
      'grand-couture': {
        colours: ['red'],
        flowers: ['roses'],
        occasions: ['anniversary', 'love', 'birthday', 'congratulations'],
        recipients: ['her', 'wife', 'girlfriend'],
        featured: true,
        name: 'The Grand Couture Roses',
        category: 'boxes',
        image: 'images/product-2.jpg',
        gallery: ['images/product-2-b.jpg', 'images/product-2-c.jpg'],
        details: 'Deep red and black roses arranged in a couture black and gold box.\nFinished by hand with delicate accents.\nAdd a personal card message at checkout.\nDelivered across the UK on the date you choose.',
        description: 'Our most dramatic creation: deep red and black roses set in a black and gold couture box, made to be remembered.',
        options: [
          { id: 'standard', label: 'Standard', price: 19900 },
          { id: 'deluxe', label: 'Deluxe', price: 44900 }
        ]
      },
      'imperial-romance': {
        colours: ['red'],
        flowers: ['roses'],
        occasions: ['love', 'anniversary', 'valentines', 'just-because'],
        recipients: ['her', 'girlfriend', 'wife'],
        featured: true,
        name: 'The Imperial Romance Bouquet',
        category: 'bouquets',
        image: 'images/product-3.jpg',
        gallery: ['images/product-3-b.jpg', 'images/product-3-c.jpg'],
        details: 'Red roses hand-tied into a lavish bouquet.\nWrapped in black paper for a modern, elegant finish.\nAdd a personal card message at checkout.\nDelivered across the UK on the date you choose.',
        description: 'A lavish hand-tied bouquet of red roses, wrapped in black for an elegant, modern finish.',
        options: [
          { id: 'standard', label: 'Standard', price: 8900 },
          { id: 'deluxe', label: 'Deluxe', price: 16900 }
        ]
      },
      'signature-square': {
        colours: ['red'],
        flowers: ['roses'],
        occasions: ['birthday', 'thank-you', 'just-because', 'congratulations'],
        recipients: ['her', 'mum', 'friend'],
        name: 'The Signature Square Box',
        category: 'boxes',
        image: 'images/product-4.jpg',
        gallery: ['images/product-4-b.jpg', 'images/product-4-c.jpg'],
        details: 'Velvet red roses with fresh green foliage.\nPresented in our square black keepsake box.\nAdd a personal card message at checkout.\nDelivered across the UK on the date you choose.',
        description: 'Velvet red roses with fresh green foliage, set in our square black keepsake box. Elegant, compact and easy to gift.',
        options: [
          { id: 'standard', label: 'Standard', price: 6900 },
          { id: 'deluxe', label: 'Deluxe', price: 9900 }
        ]
      },
      'heart-of-roses': {
        colours: ['red'],
        flowers: ['roses'],
        occasions: ['love', 'anniversary', 'valentines', 'wedding'],
        recipients: ['her', 'wife', 'girlfriend'],
        name: 'Heart of Roses',
        category: 'boxes',
        image: 'images/product-5.jpg',
        gallery: ['images/product-5-b.jpg', 'images/product-5-c.jpg'],
        details: 'Red roses arranged in a heart shape.\nPresented in black for a dramatic finish.\nPerfect for proposals and anniversaries.\nDelivered across the UK on the date you choose.',
        description: 'Red roses arranged in a striking heart, presented in black. Made for proposals, anniversaries and grand gestures.',
        options: [
          { id: 'standard', label: 'Standard', price: 15900 },
          { id: 'deluxe', label: 'Deluxe', price: 29900 }
        ]
      },
      'ivory-hatbox': {
        colours: ['red', 'white'],
        flowers: ['roses', 'gypsophila'],
        occasions: ['birthday', 'mothers-day', 'thank-you', 'just-because'],
        recipients: ['her', 'mum', 'friend'],
        name: 'The Ivory Hatbox',
        category: 'boxes',
        image: 'images/product-6.jpg',
        gallery: ['images/product-6-b.jpg', 'images/product-6-c.jpg'],
        details: 'Deep red roses framed with delicate gypsophila.\nPresented in an ivory hatbox tied with a red ribbon.\nAdd a personal card message at checkout.\nDelivered across the UK on the date you choose.',
        description: 'Deep red roses framed with delicate gypsophila in an ivory hatbox tied with a red ribbon. Romantic and refined.',
        options: [
          { id: 'standard', label: 'Standard', price: 7900 },
          { id: 'deluxe', label: 'Deluxe', price: 12900 }
        ]
      },
      'blue-roses': {
        colours: ['blue'],
        flowers: ['roses'],
        occasions: ['just-because', 'congratulations'],
        recipients: ['her', 'him', 'friend'],
        name: 'Quintessential Blue Roses',
        category: 'exclusive',
        image: 'images/product-7.jpg',
        gallery: ['images/product-7-b.jpg', 'images/product-7-c.jpg'],
        details: 'Rare blue roses, available to members on request.\nMessage us for availability, sizes and pricing.',
        description: 'Our rare blue roses, available exclusively for members. Message us for availability and pricing.',
        enquire: true,
        options: []
      }
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CATALOG;
  else root.ENVIE_CATALOG = CATALOG;
})(typeof self !== 'undefined' ? self : this);
