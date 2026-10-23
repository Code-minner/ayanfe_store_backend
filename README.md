# Ayanfe Store API

Express + Prisma + **Neon Postgres**, with **Cloudinary** receipts and **Zoho ZeptoMail**.

## 1. Neon

1. Open [Neon Console](https://console.neon.tech) → your project → **Connection details**
2. Copy the **full** `DATABASE_URL` (must end like `.neon.tech/neondb?sslmode=require`)
3. Paste into `.env` as `DATABASE_URL` (and optionally `DIRECT_URL` = non-pooler URL)

## 2. ZeptoMail

Already wired via:

- `ZEPTOMAIL_HOST`
- `ZEPTOMAIL_TOKEN`
- `ZEPTOMAIL_FROM_EMAIL` / `ZEPTOMAIL_FROM_NAME`
- `ADMIN_EMAIL` (store notification inbox)

## 3. Cloudinary

From Cloudinary dashboard → API Keys, set:

```
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

Receipts upload to folder `ayanfe/receipts`.

## Run

```bash
copy .env.example .env
npm install
npm run db:generate
npm run db:push
npm run seed
npm run dev
```

API: `http://localhost:4000/api`

Admin seed: `admin@ayanfestore.com` / `admin1234`

## Production

See [DEPLOY.md](./DEPLOY.md) for the go-live checklist (API + shop + admin).
