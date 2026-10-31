import { connection } from "next/server";
import { db } from "@/db";
import { appToday } from "@/lib/clock";

export async function GET() {
  await connection(); // Runs on every request, never at build time.
  try {
    return Response.json({ status: "ok", appToday: await appToday(db) });
  } catch (error) {
    console.error("Health check failed", error);
    return Response.json({ status: "database_unreachable" }, { status: 503 });
  }
}
