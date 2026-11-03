# MMS Jersey

Jersey ordering for MMS parents. The school preloads every player with their name, class, number and size.
Parents find their child, check the details, pay by UPI, QR or bank transfer, upload the payment
screenshot and get an order ID. Admins verify or reject each screenshot, record cash paid at the
office, manage the player list, and change the price, sizes and payment details without any code changes.

Built with TanStack Start, React, Tailwind and Supabase. It uses free tools only, with no payment gateway.

## Pages

| URL | Who | What |
| --- | --- | --- |
| `/` | Parents | Landing page and the four-step order form |
| `/status` | Parents | Orders placed on this device, with live payment status |
| `/admin` | Admins | Orders, payment checks, cash, players and sizes, settings |
| `/reset-password` | Admins | Set a new password from the reset email |

## Database

Everything lives in a separate `jersey` schema (see `supabase/migrations`), so it can share a Supabase
project with other apps without touching their tables. The `jersey` schema is not exposed to the
REST API. The browser only calls the `public.jersey_*` functions, which validate every input.
Admin functions also check the `jersey.admin_users` allow-list. Payment screenshots go to the
private `jersey-proofs` storage bucket. Parents can upload to it, and only admins can view it.

### Setup

1. In the Supabase SQL editor, run `supabase/migrations/20261027130000_jersey_schema.sql`. It is safe to run more than once.
2. Create the admin login in Authentication → Users (email and password), then add it to the allow-list:
   ```sql
   INSERT INTO jersey.admin_users (email) VALUES ('admin@example.com');
   ```
3. Copy `.env.example` to `.env` and fill in the project URL and publishable key
   (Project Settings → API). On Vercel, add the same two variables.
4. Sign in at `/admin` and fill in **Settings** (price, sizes, UPI ID, bank details). Then add the
   players under **Players & sizes**. You can paste them straight from Excel, one per line:
   `name, class, number, size[, name to print]`.

## Jersey photo

Put the official jersey image in `public/` and set `OFFICIAL_JERSEY_IMAGE` in `src/lib/jersey.ts`
(for example `"/jersey-official.png"`). Until then, the app shows a drawn jersey.

## Development

```sh
bun install
bun run dev
```
