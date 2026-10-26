# Envie Roses: shop setup

## How ordering works

1. A customer picks a product size and quantity, then taps **Add to Bag** or **Buy Now**.
2. At checkout they enter their details, the delivery address and date, and an optional card message.
3. They choose how to pay:
   - **Order on WhatsApp** (on by default). WhatsApp opens with the full order already written, addressed to the shop's number, and the customer taps Send. You reply with a payment link or bank details.
   - **Card, Apple Pay or Google Pay** (off until Stripe is set up). The customer pays on Stripe's secure page. After paying they come back to the site and tap a button to send the order to you on WhatsApp.

Every order has a reference such as `ER-261025-AB12`. The same reference appears in WhatsApp and in Stripe.

## Your dashboard (`/admin`)

Manage the website without touching any code. Log in at **yourdomain.co.uk/admin**.

| Section | What you can do |
|---|---|
| **Overview** | See new orders, open orders, and this month's orders and sales at a glance |
| **Orders** | See every website order, both WhatsApp and card. Change its status (New, Confirmed, Paid, Out for delivery, Delivered, Cancelled), open its full details, and message the customer on WhatsApp, call them or email them. |
| **Products** | Add, edit, delete and reorder products. Set sizes and prices, or mark a product as price on request. Star products to show them on the homepage. Upload the main photo plus up to 8 gallery photos, write product details, and run a time-limited offer with a countdown. |
| **Reviews** | Approve (publish), reject or delete customer reviews. New reviews never appear on the website until you publish them. |
| **Site Images** | Replace the homepage hero, banners, About photo, page banner and Instagram photos, or reset any of them to the original |
| **Settings** | Change your contact details, WhatsApp number, opening hours, delivery charge and earliest delivery date, turn payment methods on or off, add social links and legal details, and download or restore a backup |

- **Changes go live immediately.** Every save updates the live website straight away.
- **Product photos** are cropped to 1080 × 1080 automatically. Upload any shape and the centre is kept.
- **Your data is stored safely.** Products, settings, photos and orders are kept in Netlify's secure storage (Netlify Blobs). `js/catalog.js` holds the starting products and is used until you first save in the dashboard.

### Setting up the dashboard (one time)

The dashboard runs on Netlify, the same as card payments.

1. **Deploy from Git.** Put the site on Netlify by connecting a GitHub repository; the dashboard needs a Git deploy. Drag-and-drop uploads don't include the server code the dashboard relies on.
2. **Set your password.** In Netlify, go to **Site configuration → Environment variables**. Add `ADMIN_PASSWORD` with a long, strong password that only you know.
3. **Redeploy the site, then log in** at `/admin`.

To change the password, update `ADMIN_PASSWORD` and redeploy. Anyone still logged in is signed out. A login lasts 12 hours, or until the browser tab is closed.

### Testing locally

Run `npm install`, then `ADMIN_PASSWORD=yourpassword npx netlify dev`. Open http://localhost:8888/admin. Changes made locally are saved in a `.netlify` folder on your computer, not on the live site.

## Product pages, offers and reviews

- **Product page:** clicking any product opens its own page (`product.html?id=...`). It shows a photo gallery, sizes and prices, the offer countdown, product details, delivery information, customer reviews and related products.
- **Offers:** set a discount % and an end date and time (UK time) on a product. The site shows the reduced price, the original price crossed out and a live countdown. At the end time the discount stops automatically on the site and at checkout.
  - UK consumer law (CMA guidance and the DMCC Act 2024) treats fake urgency and misleading "was" prices as unfair practices. Only run genuine offers, use a "was" price you genuinely charged, and don't restart a countdown just to create pressure.
- **Reviews:** customers can rate products and write a review on the product page. Reviews wait in the dashboard until you publish them.
  - Under the DMCC Act 2024, fake reviews are banned, and you must not hide genuine negative reviews in a way that misleads customers.
  - The three testimonials on the homepage (Sarah M., James T., Emily R.) came from the original design. Replace them with real customer reviews before launch.

## Pages

| Page | File |
|---|---|
| Home | `index.html` |
| Shop (all products, with filters and search) | `shop.html` (`?c=boxes`, `?c=bouquets`, `?c=exclusive`, `?q=search`, `?o=Occasion`) |
| Gifts & Occasions | `gifts.html` |
| About Us | `about.html` |
| Contact | `contact.html` |
| Delivery Information | `delivery.html` |
| FAQs | `faq.html` |
| Order History (orders placed on that device) | `account.html` |
| Dashboard (password protected) | `admin.html` (also at `/admin`) |
| Privacy Policy, Terms & Conditions, Refunds & Returns, Cookie Policy | `privacy.html`, `terms.html`, `refunds.html`, `cookies.html` |
| Page not found | `404.html` |

The header, footer, bag and checkout are shared by every page and live in `js/layout.js`, so you only need to change them once.

## Before going live: UK legal details

UK law (the Companies Act 2006 and the Electronic Commerce Regulations 2002) requires your website to show who you are.

- **Required for everyone:** fill in the `legal` section of `js/catalog.js`.
- **If you trade as a limited company:** add your registered company name, company number and registered office address. These then appear automatically in the footer, the Terms and the Privacy Policy.
- **If you are VAT registered:** add your VAT number.

The policies are written for a UK online florist. Have them checked by a qualified adviser before you rely on them, especially:
- the cancellation timings in `refunds.html`
- the delivery areas in `delivery.html`

## Starting settings: `js/catalog.js`

Once the dashboard is set up, change these in **Settings** and **Products** instead. This file only supplies the starting values.

| Setting | What it does |
|---|---|
| `shop.whatsapp` | The number orders go to. Use digits only in international format, e.g. `447464418817`. |
| `shop.deliveryFee` | A delivery charge in pence (e.g. `995` for £9.95), `0` for free, or `null` to confirm it with each customer. |
| `shop.minDeliveryDays` | The earliest delivery date that can be chosen. `1` means tomorrow. |
| `products` | Product names, images, descriptions, category (`boxes`, `bouquets`, `exclusive`), sizes and prices, in pence (e.g. `11900` for £119.00). Set `enquire: true` for price-on-request items. New products appear on the Shop page automatically. |
| `shop.hours` | Opening hours shown on the Contact page. Leave empty to hide them. |
| `social` | Links to your Instagram, Facebook, TikTok and Pinterest profiles. Each icon only appears once its link is filled in. |
| `legal` | Your company name, number, registered office and VAT number. |
| `payments.stripe` | Set to `true` only after finishing the card-payment steps below. |

## Turning on card payments (Stripe + Netlify)

Card payments need a small server function, so the site has to be hosted on Netlify. A free plan is fine.

1. **Create a Stripe account** at stripe.com and complete the business verification.
2. **Put the site on Netlify.** Upload this folder to a GitHub repository and import it into Netlify. `netlify.toml` already holds the configuration.
3. **Add your Stripe key in Netlify.** Go to Site configuration → Environment variables and add `STRIPE_SECRET_KEY` with your Stripe secret key.
   - Use the `sk_test_...` key first to test.
   - Switch to `sk_live_...` when you're ready to take real payments.
4. **Turn on card payments on the site.** In `js/catalog.js`, set `payments.stripe: true` and redeploy.
5. **Run a test payment** using Stripe's test card `4242 4242 4242 4242`, any future expiry date and any CVC.
6. **Turn on Apple Pay and Google Pay.** In the Stripe Dashboard, go to Settings → Payment methods and enable them.

### Checking paid orders

**Always check that the money has arrived in the Stripe Dashboard (Payments) before preparing an order.** The WhatsApp message alone isn't proof of payment.

Each payment in Stripe shows:
- the order reference
- the items
- the customer's details
- the delivery address and date
- the card message

## Testing locally

Opening `index.html` lets you test the bag and WhatsApp ordering. Card payments only work on the Netlify site, because they need the server function.
