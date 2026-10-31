# Brightloop

One system to run plans, subscriptions and recurring billing. Team plan: https://brightloop-plan.pages.dev/

## Get it running

```bash
npm install
cp .env.example .env
docker compose up -d
npm run db:migrate
npm run db:seed
npm run dev
```

Check your setup with `npm test`.

Seed logins are `admin@brightloop.test`, `staff@brightloop.test` and `customer@brightloop.test`, all with the password `Brightloop@123`. They work once login is built.

The daily job at `/api/cron/daily` closes ended plans and bills what is due. It refuses every call until `CRON_SECRET` is set, so production needs that value in Vercel.

To change the schema, ask Swayam first. Then edit `src/db/schema.ts` and run `npm run db:generate` and `npm run db:migrate`. Commit the new `drizzle/` files: production applies them automatically on deploy, so only add changes that old code can survive, such as new columns that are nullable or have defaults.

## Shared functions

Use these instead of writing your own version.

| Need | Use | File |
|---|---|---|
| Current time or date in business logic | `appNow(db)`, `appToday(db)` | `src/lib/clock.ts` |
| Date arithmetic | `addDays()`, `addPeriods()` | `src/lib/dates.ts` |
| Any invoice total, preview or tax | `computeInvoice()` | `src/lib/compute-invoice.ts` |
| Change a status | `transitionSubscription()`, `transitionInvoice()` | `src/lib/transition.ts` |
| Which statuses can come next, for buttons | `SUBSCRIPTION_NEXT`, `INVOICE_NEXT` | `src/lib/status.ts` |
| Show what the next invoice will be | `previewNextInvoice(db, subscriptionId)` | `src/lib/billing.ts` |
| Create invoices for everything due | `runBilling(db, { limit, cursor })` | `src/lib/billing.ts` |
| Move the time machine forward or back to today | `jumpToDate()`, `returnToRealDate()` | `src/lib/time-machine.ts` |
| Renew a subscription | `renewSubscription()` | `src/lib/lifecycle.ts` |
| A new subscription or invoice number | `nextNumber(db, "SUB")` | `src/lib/numbers.ts` |
| Show money, split or take a percentage | `formatMoney()`, `allocate()`, `percentOf()` | `src/lib/money.ts` |

The database client is `db` from `@/db`, and tables are in `@/db/schema`. Every shared function that takes `db` also accepts a transaction.

## Rules

- Never use `new Date()` for business logic. Use `appNow(db)`, or the time machine breaks.
- Store money as whole paise and percentages as basis points (1800 means 18%).
- Business dates are India dates as `YYYY-MM-DD` strings.
- Check roles and validate input on the server.
- Paginate lists on the server and calculate totals in the database.
