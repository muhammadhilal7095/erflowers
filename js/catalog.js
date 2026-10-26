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
    products: {
      'red-50-boxed': {
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
