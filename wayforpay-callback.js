const crypto = require('crypto');

const MERCHANT_SECRET = '1be302b4bcdd809d4c762a8109140137bad41fa3';

function generateSignature(params) {
  const str = params.join(';');
  return crypto.createHmac('md5', MERCHANT_SECRET).update(str).digest('hex');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  try {
    const data = req.body;

    // Verify signature from WayForPay
    const sigParts = [
      data.merchantAccount,
      data.orderReference,
      data.amount,
      data.currency,
      data.authCode,
      data.cardPan,
      data.transactionStatus,
      data.reasonCode,
    ];
    const expectedSig = generateSignature(sigParts.map(String));

    if (data.merchantSignature !== expectedSig) {
      return res.status(400).json({ error: 'Invalid signature' });
    }

    // Respond to WayForPay
    const responseSig = generateSignature([
      data.orderReference,
      'accept',
      Math.floor(Date.now() / 1000),
    ].map(String));

    res.status(200).json({
      orderReference: data.orderReference,
      status: 'accept',
      time: Math.floor(Date.now() / 1000),
      signature: responseSig,
    });

  } catch (err) {
    console.error('Callback error:', err);
    res.status(500).end();
  }
};
