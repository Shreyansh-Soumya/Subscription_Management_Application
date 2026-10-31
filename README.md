# Brightloop

One system to run plans, subscriptions and recurring billing. Team plan: https://brightloop-plan.pages.dev/

## Get it running

You only need Docker:

```bash
docker compose up --build
```

The first run takes a few minutes. It installs dependencies, sets up the database and adds demo data, then the app runs at http://localhost:3000. Saved code changes reload on their own. If you pull a new dependency, restart with `docker compose restart app`.

| To do this | Run |
|---|---|
| Run the tests | `docker compose exec app npm test` |
| Run any other project command | `docker compose exec app npm run <command>` |
| Add a dependency | `docker compose exec app npm install <package>`, then restart the app |
| Open the database | `docker compose exec postgres psql -U brightloop` |
| Stop everything | `docker compose down` |
| Wipe the database and dependencies, then start fresh | `docker compose down -v` |

If port 3000 is taken, run `APP_PORT=3001 docker compose up` instead. On Windows, keep the repo inside WSL so code changes reload.

Seed logins are `admin@brightloop.test`, `staff@brightloop.test` and `customer@brightloop.test`, all with the password `Brightloop@123`. They work once login is built.

To change the schema, ask Swayam first. Then edit `src/db/schema.ts` and run `docker compose exec app npm run db:generate` and `docker compose exec app npm run db:migrate`.

## Shared functions

Use these instead of writing your own version.

| Need | Use | File |
|---|---|---|
| Current time or date in business logic | `appNow(db)`, `appToday(db)` | `src/lib/clock.ts` |
| Move the time machine | `setClockOffset(db, ms)` | `src/lib/clock.ts` |
| Date arithmetic | `addDays()`, `addPeriods()` | `src/lib/dates.ts` |
| Any invoice total, preview or tax | `computeInvoice()` | `src/lib/compute-invoice.ts` |
| Change a status | `transitionSubscription()`, `transitionInvoice()` | `src/lib/transition.ts` |
| Which statuses can come next, for buttons | `SUBSCRIPTION_NEXT`, `INVOICE_NEXT` | `src/lib/status.ts` |
| Show what the next invoice will be | `previewNextInvoice(db, subscriptionId)` | `src/lib/billing.ts` |
| Create invoices for everything due | `runBilling(db, { limit, cursor })` | `src/lib/billing.ts` |
| A new subscription or invoice number | `nextNumber(db, "SUB")` | `src/lib/numbers.ts` |
| Show money, split or take a percentage | `formatMoney()`, `allocate()`, `percentOf()` | `src/lib/money.ts` |

The database client is `db` from `@/db`, and tables are in `@/db/schema`. Every shared function that takes `db` also accepts a transaction.

## Rules

- Never use `new Date()` for business logic. Use `appNow(db)`, or the time machine breaks.
- Store money as whole paise and percentages as basis points (1800 means 18%).
- Business dates are India dates as `YYYY-MM-DD` strings.
- Check roles and validate input on the server.
- Paginate lists on the server and calculate totals in the database.
