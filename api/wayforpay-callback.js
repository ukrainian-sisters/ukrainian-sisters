// api/wayforpay-callback.js
// Vercel serverless function — receives WayForPay payment confirmations (serviceUrl),
// verifies the signature, emails the buyer + the shop, and replies "accept" to WayForPay.
//
// Environment variables (Vercel → Project → Settings → Environment Variables):
//   WFP_MERCHANT_ACCOUNT  – your WayForPay merchant account (login), e.g. "ukrainiansisters_com"
//   WFP_SECRET_KEY        – WayForPay secret key (never put this in the browser code)
//   RESEND_API_KEY        – API key from resend.com
//   MAIL_FROM             – e.g. "Ukrainian Sisters: The Brand <shop@ukrainiansisters.com>"
//   MERCHANT_EMAIL        – where new-order alerts go, e.g. your own inbox

const crypto = require('crypto');

const hmac = (str) =>
  crypto.createHmac('md5', process.env.WFP_SECRET_KEY).update(str, 'utf8').digest('hex');

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function readRaw(req) {
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === 'string' ? Buffer.from(c) : c);
  return Buffer.concat(chunks).toString('utf8');
}

// WayForPay sometimes posts plain JSON, sometimes the JSON as a form-encoded key ("{...}=").
function parsePayload(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch {}
  try {
    let decoded = decodeURIComponent(raw.replace(/\+/g, ' '));
    if (decoded.endsWith('=')) decoded = decoded.slice(0, -1);
    return JSON.parse(decoded);
  } catch {}
  return null;
}

function verifySignature(d) {
  const str = [
    d.merchantAccount, d.orderReference, d.amount, d.currency,
    d.authCode, d.cardPan, d.transactionStatus, d.reasonCode,
  ].join(';');
  const expected = hmac(str);
  const got = String(d.merchantSignature || '');
  return expected.length === got.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(got));
}

function acceptResponse(orderReference) {
  const time = Math.floor(Date.now() / 1000);
  return {
    orderReference,
    status: 'accept',
    time,
    signature: hmac(`${orderReference};accept;${time}`),
  };
}

function productRows(d) {
  if (!Array.isArray(d.products) || !d.products.length) return '';
  return d.products.map((p) =>
    `<tr><td style="padding:4px 12px 4px 0">${esc(p.name)}</td>` +
    `<td style="padding:4px 12px 4px 0">× ${esc(p.count)}</td>` +
    `<td style="padding:4px 0">${esc(p.price)} ${esc(d.currency)}</td></tr>`
  ).join('');
}

async function sendEmail({ to, subject, html, replyTo }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.MAIL_FROM,
      to: [to],
      subject,
      html,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

function buyerEmail(d) {
  const rows = productRows(d);
  const table = rows ? `<table style="border-collapse:collapse;margin:12px 0">${rows}</table>` : '';
  return `
  <div style="font-family:Georgia,serif;max-width:560px;color:#222;line-height:1.55">
    <h2 style="font-weight:normal">Дякуємо за замовлення! · Thank you for your order!</h2>
    <p>Ми отримали вашу оплату <b>${esc(d.amount)} ${esc(d.currency)}</b>.<br>
       Номер замовлення: <b>${esc(d.orderReference)}</b></p>
    ${table}
    <p>Ми зв'яжемося з вами щодо доставки найближчим часом.
       50% від кожного продажу підтримує місію БО «Українські Сестри».</p>
    <hr style="border:none;border-top:1px solid #ddd;margin:20px 0">
    <p>We've received your payment of <b>${esc(d.amount)} ${esc(d.currency)}</b>.<br>
       Order number: <b>${esc(d.orderReference)}</b></p>
    <p>We'll be in touch about delivery shortly.
       50% of every sale supports the mission of Ukrainian Sisters.</p>
    <p style="margin-top:24px">Ukrainian Sisters: The Brand<br>
       <a href="https://www.instagram.com/ukrainiansisters_thebrand/">@ukrainiansisters_thebrand</a></p>
  </div>`;
}

function merchantEmail(d) {
  const rows = productRows(d);
  return `
  <div style="font-family:Arial,sans-serif;max-width:560px;color:#222">
    <h3>Нове оплачене замовлення · ${esc(d.orderReference)}</h3>
    <p><b>Сума:</b> ${esc(d.amount)} ${esc(d.currency)}<br>
       <b>Статус:</b> ${esc(d.transactionStatus)}<br>
       <b>Email:</b> ${esc(d.email) || '—'}<br>
       <b>Телефон:</b> ${esc(d.phone) || '—'}<br>
       <b>Ім'я:</b> ${esc([d.clientFirstName, d.clientLastName].filter(Boolean).join(' ') || d.clientName) || '—'}<br>
       <b>Картка:</b> ${esc(d.cardPan)} (${esc(d.paymentSystem)})</p>
    ${rows ? `<table style="border-collapse:collapse">${rows}</table>`
           : '<p>Деталі товарів — у кабінеті WayForPay за номером замовлення.</p>'}
  </div>`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }

  let data;
  try {
    data = parsePayload(await readRaw(req));
  } catch {
    data = null;
  }
  if (!data && req.body) data = typeof req.body === 'object' ? req.body : parsePayload(req.body);

  if (!data || !data.orderReference) {
    res.status(400).send('Bad payload');
    return;
  }
  if (data.merchantAccount !== process.env.WFP_MERCHANT_ACCOUNT || !verifySignature(data)) {
    console.warn('WayForPay callback rejected: bad signature', data.orderReference);
    res.status(403).send('Invalid signature');
    return;
  }

  if (data.transactionStatus === 'Approved') {
    const jobs = [];
    if (data.email) {
      jobs.push(sendEmail({
        to: data.email,
        subject: `Замовлення ${data.orderReference} підтверджено · Order confirmed`,
        html: buyerEmail(data),
        replyTo: process.env.MERCHANT_EMAIL,
      }));
    }
    if (process.env.MERCHANT_EMAIL) {
      jobs.push(sendEmail({
        to: process.env.MERCHANT_EMAIL,
        subject: `💳 Нове замовлення ${data.orderReference} — ${data.amount} ${data.currency}`,
        html: merchantEmail(data),
        replyTo: data.email,
      }));
    }
    const results = await Promise.allSettled(jobs);
    results.forEach((r) => r.status === 'rejected' && console.error(r.reason));
  } else {
    console.log('WayForPay status', data.transactionStatus, data.orderReference, data.reason);
  }

  // Always acknowledge a valid callback, otherwise WayForPay keeps retrying.
  res.setHeader('Content-Type', 'application/json');
  res.status(200).send(JSON.stringify(acceptResponse(data.orderReference)));
};
