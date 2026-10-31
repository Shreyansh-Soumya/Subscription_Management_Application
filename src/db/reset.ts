import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { assertResetAllowed, clearAllData } from "./reset-data";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env first.");
assertResetAllowed(url, process.env.RESET_CONFIRM);

const client = postgres(url, { max: 1, prepare: false });
clearAllData(drizzle({ client, schema }))
  .then(() => console.log("All data cleared."))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => client.end());
