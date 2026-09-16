const crypto = require('crypto');
module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const PUB = process.env.LIQPAY_PUBLIC_KEY;
  const PRIV = process.env.LIQPAY_PRIVATE_KEY;
  if (!PUB || !PRIV) return res.status(500).json({ error: 'Keys not configured' });
  let b = req.body || {};
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch(e) { b = {}; } }
  const params = {
    public_key: PUB, version: '3', action: 'pay',
    amount: String(b.amount || '100'), currency: 'UAH',
    description: b.description || 'Донат - Українські сестри',
    order_id: b.order_id || ('us_' + Date.now()),
    language: 'uk',
    result_url: process.env.RESULT_URL || 'https://ukrainiansisters.com/',
  };
  const data = Buffer.from(JSON.stringify(params)).toString('base64');
  const sig = crypto.createHash('sha1').update(PRIV+data+PRIV).digest('base64');
  return res.status(200).json({ data, signature: sig });
};