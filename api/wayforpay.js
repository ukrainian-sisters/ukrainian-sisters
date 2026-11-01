// api/wayforpay.js
// Prepares a signed WayForPay payment for the cart.
//
// What changed from the previous version:
//  - The secret key is no longer written in the code. It is read from Vercel
//    Environment Variables (the same ones the confirmation function uses).
//  - Prices come from the catalogue below, not from the buyer's browser,
//    so nobody can change a price before paying.
//  - English cart pays in EUR (the price shown on the page), Ukrainian cart in UAH.
//
// Environment variables (Vercel → Settings → Environment Variables):
//   WFP_MERCHANT_ACCOUNT  – WayForPay merchant login (currently ukrainian_sisters_vercel_app)
//   WFP_SECRET_KEY        – WayForPay secret key
//   WFP_EN_CURRENCY       – optional: "EUR" (default) or "UAH" if EUR isn't enabled in WayForPay

const crypto = require('crypto');

const MERCHANT_DOMAIN = 'ukrainian-sisters.vercel.app';

// Catalogue — update here when a model or price changes.
const CATALOGUE = {
  '001': { ua: 'Жінка Жінці Дім',        en: 'WOMAN TO WOMAN IS A HOME', uah: 4550, eur: 99 },
  '002': { ua: 'КОХАНА — ТІЛЕСНА',       en: 'LOVED — NUDE',             uah: 3550, eur: 79 },
  '003': { ua: 'КОХАНА — НІЧ',           en: 'LOVED — DARK',             uah: 3550, eur: 79 },
  '004': { ua: 'СОНЯШНИК — НЕБО',        en: 'SUNFLOWER SKY',            uah: 3550, eur: 79 },
  '005': { ua: 'СОНЯШНИК — СНІГ',        en: 'SUNFLOWER SNOW',           uah: 3550, eur: 79 },
  '006': { ua: 'КОХАНА — ДОТИК ТІЛЕСНА', en: 'LOVED TOUCH NUDE',         uah: 3550, eur: 79 },
  '007': { ua: 'КОХАНА — ДОТИК НІЧ',     en: 'LOVED TOUCH DARK',         uah: 3550, eur: 79 },
  '008': { ua: 'КОХАНА — ДОВГА НІЧ',     en: 'LOVED LONG DARK',          uah: 4550, eur: 99 },
};

const EUR_TO_UAH = 44; // only used if WFP_EN_CURRENCY is set to UAH

function sign(parts) {
  return crypto
    .createHmac('md5', process.env.WFP_SECRET_KEY)
    .update(parts.map(String).join(';'), 'utf8')
    .digest('hex');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!process.env.WFP_MERCHANT_ACCOUNT || !process.env.WFP_SECRET_KEY) {
    console.error('WayForPay: WFP_MERCHANT_ACCOUNT / WFP_SECRET_KEY not set');
    return res.status(500).json({ error: 'Payment is not configured' });
  }

  try {
    const { name, email, phone, address, items, lang } = req.body || {};
    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: 'No items in cart' });
    }

    const isEn = lang === 'en';
    const enCurrency = (process.env.WFP_EN_CURRENCY || 'EUR').toUpperCase();
    const currency = isEn ? enCurrency : 'UAH';

    const productNames = [];
    const productCounts = [];
    const productPrices = [];

    for (const item of items) {
      const p = CATALOGUE[String(item.num)];
      if (!p) return res.status(400).json({ error: `Unknown product ${item.num}` });
      const qty = Math.max(1, Math.min(20, parseInt(item.qty, 10) || 1));
      let price;
      if (!isEn) price = p.uah;
      else if (currency === 'EUR') price = p.eur;
      else price = Math.round(p.eur * EUR_TO_UAH);
      productNames.push(isEn ? p.en : p.ua);
      productCounts.push(qty);
      productPrices.push(price);
    }

    const amount = productPrices.reduce((s, price, i) => s + price * productCounts[i], 0);
    const orderReference = 'US-' + Date.now();
    const orderDate = Math.floor(Date.now() / 1000);
    const merchantAccount = process.env.WFP_MERCHANT_ACCOUNT;

    const merchantSignature = sign([
      merchantAccount, MERCHANT_DOMAIN, orderReference, orderDate, amount, currency,
      ...productNames, ...productCounts, ...productPrices,
    ]);

    const formData = {
      merchantAccount,
      merchantDomainName: MERCHANT_DOMAIN,
      merchantSignature,
      orderReference,
      orderDate,
      amount,
      currency,
      orderTimeout: 86400,
      productName: productNames,
      productCount: productCounts,
      productPrice: productPrices,
      clientFirstName: name ? name.split(' ')[0] : '',
      clientLastName: name ? name.split(' ').slice(1).join(' ') : '',
      clientEmail: email || '',
      clientPhone: phone || '',
      deliveryCity: address || '',
      language: isEn ? 'EN' : 'UA',
      returnUrl: `https://${MERCHANT_DOMAIN}/${isEn ? 'the-brand/en' : 'the-brand'}?order=success`,
      serviceUrl: `https://${MERCHANT_DOMAIN}/api/wayforpay-callback`,
    };

    res.status(200).json({ formData });
  } catch (err) {
    console.error('WayForPay error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};
