import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { loadBigSeed } from "./big-seed-data";
import { assertResetAllowed } from "./reset-data";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env first.");
// Thousands of rows on a shared database should be as deliberate as a reset.
assertResetAllowed(url, process.env.RESET_CONFIRM);

const client = postgres(url, { max: 1, prepare: false });
const started = Date.now();
loadBigSeed(drizzle({ client, schema }))
  .then((result) => {
    console.log(`Added ${result.subscriptions} subscriptions and ${result.invoices} past invoices in ${Math.round((Date.now() - started) / 1000)}s. They all bill on ${result.billingDate}.`);
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => client.end());
