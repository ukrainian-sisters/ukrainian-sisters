// api/liqpay.js — Vercel Serverless Function
const crypto = require('crypto');

module.exports = function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const PUBLIC_KEY  = process.env.LIQPAY_PUBLIC_KEY;
  const PRIVATE_KEY = process.env.LIQPAY_PRIVATE_KEY;

  if (!PUBLIC_KEY || !PRIVATE_KEY) {
    return res.status(500).json({ error: 'LiqPay keys not configured in environment variables' });
  }

  const { amount, description, order_id } = req.body || {};

  const params = {
    public_key:  PUBLIC_KEY,
    version:     '3',
    action:      'pay',
    amount:      String(amount || '100'),
    currency:    'UAH',
    description: description || 'Донат — Українські сестри',
    order_id:    order_id || ('us_' + Date.now()),
    language:    'uk',
    result_url:  process.env.RESULT_URL || 'https://ukrainiansisters.com/',
  };

  const data = Buffer.from(JSON.stringify(params)).toString('base64');
  const signature = crypto
    .createHash('sha1')
    .update(PRIVATE_KEY + data + PRIVATE_KEY)
    .digest('base64');

  return res.status(200).json({ data, signature });
};
