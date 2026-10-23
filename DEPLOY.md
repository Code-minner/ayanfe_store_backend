# Ayanfe Store: go-live checklist

Ship these three apps together:

1. `ayanfe_store_backend` (API)
2. `ayanfe_store_frontend` (shop)
3. `ayanfe_store_admin` (admin)

## 1. Backend

- Host on Railway, Render, Fly.io, or similar
- Copy `.env.example` → production env vars
- Set a strong `JWT_SECRET`
- Point `DATABASE_URL` at Neon (already used in this project)
- Set `CORS_ORIGIN` to your live shop + admin URLs (comma-separated)
- Set Cloudinary + ZeptoMail (OTP, orders, payment confirm, admin invite)
- Set bank details and optional Paystack live keys
- Set `ADMIN_APP_URL` to the live admin URL (used in invite emails)
- Deploy, then open `GET /api/health`

## 2. Storefront

- Host on Vercel (or similar)
- Set `NEXT_PUBLIC_API_URL=https://YOUR_API_HOST/api`
- Connect custom domain for the shop

## 3. Admin

- Host on Vercel (or similar)
- Same `NEXT_PUBLIC_API_URL` as the storefront
- Connect admin subdomain (example: `admin.your-store.com`)
- Sign in with an existing admin user, or invite one from Admins

## 4. Smoke test after deploy

- [ ] Shop loads products, categories, featured pagination
- [ ] Signup OTP email arrives
- [ ] Login works
- [ ] Bank transfer checkout + receipt upload
- [ ] Order appears in Admin → Payments
- [ ] Confirm payment emails customer (with product list) and updates My Orders
- [ ] Invite admin email arrives with temp password
- [ ] Customers list shows real users

## 5. What you still do manually

- Buy/connect domains and DNS
- Verify ZeptoMail sending domain
- Switch Paystack to live keys if you use Paystack
- Create the first admin if production DB is empty (`npm run seed` in backend, or invite after one admin exists)
