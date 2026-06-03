# Ukrainian Sisters — Website

## Deploy to Vercel in 3 steps

### Step 1 — Push to GitHub
Upload the contents of this folder to a new GitHub repository.

### Step 2 — Deploy on Vercel
- vercel.com → Add New Project → Import GitHub repo
- Framework Preset: **Other**
- Root Directory: `.` (default)
- Click **Deploy**

### Step 3 — Add Environment Variables
Vercel Dashboard → Your Project → **Settings → Environment Variables**

| Variable | Value |
|---|---|
| `LIQPAY_PUBLIC_KEY` | `i31849357741` |
| `LIQPAY_PRIVATE_KEY` | *(your LiqPay private key)* |
| `RESULT_URL` | `https://your-domain.vercel.app/` |

After saving → click **Redeploy**.

---

## File structure
```
/
├── index.html          Main page
├── about.html          About us
├── projects.html       Projects + LiqPay donate buttons
├── news.html           News & media
├── help.html           How to help + LiqPay donate widget
├── transparency.html   Transparency reports, awards, gallery
├── vercel.json         Routing config
├── .env.example        Environment variable reference
└── api/
    └── liqpay.js       Serverless function — generates LiqPay signature
```

## LiqPay payments
- The private key is stored **only** in Vercel environment variables — never in code
- `/api/liqpay` generates a secure SHA1 signature server-side
- Payments open in a new tab via LiqPay checkout (Visa, Mastercard, Apple Pay, Google Pay)
