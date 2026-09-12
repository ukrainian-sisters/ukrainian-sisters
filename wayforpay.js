const crypto = require('crypto');

const MERCHANT_ACCOUNT = 'ukrainian_sisters_vercel_app';
const MERCHANT_SECRET = '1be302b4bcdd809d4c762a8109140137bad41fa3';
const MERCHANT_DOMAIN = 'ukrainian-sisters.vercel.app';

function generateSignature(params) {
  const str = params.join(';');
  return crypto.createHmac('md5', MERCHANT_SECRET).update(str).digest('hex');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { name, email, phone, address, items, lang } = req.body;

    if (!items || !items.length) {
      return res.status(400).json({ error: 'No items in cart' });
    }

    const orderRef = 'US-' + Date.now();
    const orderDate = Math.floor(Date.now() / 1000);

    // Calculate amounts
    const isEur = items[0].price && items[0].price.includes('€');
    const EUR_TO_UAH = 44;

    const productNames = items.map(i => i.name);
    const productCounts = items.map(i => i.qty || 1);
    const productPrices = items.map(i => {
      const num = parseFloat((i.price || '0').replace(/[^0-9.]/g, ''));
      return isEur ? Math.round(num * EUR_TO_UAH) : num;
    });

    const totalAmount = productPrices.reduce((sum, price, idx) => {
      return sum + price * productCounts[idx];
    }, 0);

    // Generate signature
    // Format: merchantAccount;merchantDomainName;orderReference;orderDate;amount;currency;productName1;productCount1;productPrice1;...
    const sigParts = [
      MERCHANT_ACCOUNT,
      MERCHANT_DOMAIN,
      orderRef,
      orderDate,
      totalAmount,
      'UAH',
      ...productNames,
      ...productCounts,
      ...productPrices,
    ];
    const signature = generateSignature(sigParts.map(String));

    // Build WayForPay form data
    const formData = {
      merchantAccount: MERCHANT_ACCOUNT,
      merchantDomainName: MERCHANT_DOMAIN,
      merchantSignature: signature,
      orderReference: orderRef,
      orderDate: orderDate,
      amount: totalAmount,
      currency: 'UAH',
      orderTimeout: 49600,
      productName: productNames,
      productCount: productCounts,
      productPrice: productPrices,
      clientFirstName: name ? name.split(' ')[0] : '',
      clientLastName: name ? name.split(' ').slice(1).join(' ') : '',
      clientEmail: email || '',
      clientPhone: phone || '',
      deliveryCity: address || '',
      language: lang === 'en' ? 'EN' : 'UA',
      returnUrl: `https://${MERCHANT_DOMAIN}/${lang === 'en' ? 'the-brand/en' : 'the-brand'}?order=success`,
      serviceUrl: `https://${MERCHANT_DOMAIN}/api/wayforpay-callback`,
    };

    res.status(200).json({ formData });

  } catch (err) {
    console.error('WayForPay error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};
