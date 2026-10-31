import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { db } from "@/db";
import { appToday } from "@/lib/clock";
import { addDays } from "@/lib/dates";
import { PaymentError, recordPayment } from "@/lib/payments";
import { authorizeRoute } from "@/lib/permissions";
import { TransitionError } from "@/lib/transition";
import { POST } from "./route";

// The route reads the session through next/headers, which only exists inside a
// real request scope — stub the auth boundary and drive it per test instead.
vi.mock("@/lib/permissions", () => ({
  authorizeRoute: vi.fn(),
}));

// Run the route's real query and payment logic against an in-memory database.
vi.mock("@/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const schema = await import("@/db/schema");
  const client = new PGlite();
  const database = drizzle({ client, schema });
  await migrate(database, { migrationsFolder: "./drizzle" });
  return { db: database };
});

// recordPayment stays real; the spy only injects a TransitionError for the one
// branch that is unreachable through real data paths (defensive mapping).
vi.mock("@/lib/payments", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payments")>();
  return { ...actual, recordPayment: vi.fn(actual.recordPayment) };
});

const { customers, events, invoices, payments, plans, subscriptions, user } = schema;
const adminId = "user-admin-1";
let today = "";

beforeEach(async () => {
  vi.mocked(authorizeRoute).mockReset();
  await db.delete(payments);
  await db.delete(invoices);
  await db.delete(subscriptions);
  await db.delete(plans);
  await db.delete(customers);
  await db.delete(events);
  await db.delete(user);
  await db.insert(user).values({ id: adminId, name: "Ada Admin", email: "admin@brightloop.test", role: "admin" });
  today = await appToday(db);
});

function allow(user: { id: string; role: string }) {
  vi.mocked(authorizeRoute).mockResolvedValue({
    user: { id: user.id, name: "Ada Admin", email: "admin@brightloop.test", role: user.role },
  } as Awaited<ReturnType<typeof authorizeRoute>>);
}

function deny(status: 401 | 403) {
  vi.mocked(authorizeRoute).mockResolvedValue({
    response: Response.json(
      { error: status === 401 ? "Log in to continue." : "You don't have access to this." },
      { status },
    ),
  } as Awaited<ReturnType<typeof authorizeRoute>>);
}

async function seedOpenInvoice({ number = "INV-TEST-1", totalPaise = 100000 } = {}) {
  const [customer] = await db.insert(customers).values({ name: "Rao Traders", email: "rao@brightloop.test" }).returning();
  const [plan] = await db.insert(plans).values({ name: "M", pricePaise: 1, frequency: "monthly" }).returning();
  const [subscription] = await db
    .insert(subscriptions)
    .values({ number: "SUB-1", customerId: customer.id, planId: plan.id, status: "active", startDate: "2026-01-01" })
    .returning();
  const [invoice] = await db
    .insert(invoices)
    .values({
      number,
      subscriptionId: subscription.id,
      customerId: customer.id,
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      issueDate: "2026-01-01",
      dueDate: "2026-01-31",
      subtotalPaise: totalPaise,
      totalPaise,
      status: "confirmed",
      breakdown: {},
    })
    .returning();
  return invoice;
}

function call(body: unknown): Promise<Response> {
  // POST always returns a Response at runtime; the `undefined` in its inferred
  // type is a TS artifact of authorizeRoute's optional-cross-property union
  // ("response" in access keeps the member where response is only optional).
  return POST(
    new Request("http://localhost/api/payments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  ) as Promise<Response>;
}

const base = { method: "upi", amountPaise: 40000, paidOn: "" };

describe("POST /api/payments", () => {
  it("returns 401 for unauthenticated requests", async () => {
    deny(401);
    const response = await call({ ...base, invoiceNumber: "INV-TEST-1", paidOn: today });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Log in to continue." });
  });

  it("returns 403 for wrong-role requests", async () => {
    deny(403);
    const response = await call({ ...base, invoiceNumber: "INV-TEST-1", paidOn: today });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "You don't have access to this." });
  });

  it("returns 400 with the first issue message for an invalid payload", async () => {
    allow({ id: adminId, role: "admin" });
    const response = await call({ method: "upi", amountPaise: 100, paidOn: today });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Provide exactly one of invoiceId or invoiceNumber." });
  });

  it("returns 404 when the invoice reference cannot be resolved", async () => {
    allow({ id: adminId, role: "admin" });
    const response = await call({ ...base, invoiceNumber: "INV-MISSING", paidOn: today });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Invoice not found." });
  });

  it("returns a safe 400 when recordPayment refuses an overpayment", async () => {
    allow({ id: adminId, role: "admin" });
    const invoice = await seedOpenInvoice({ totalPaise: 100000 });
    const response = await call({ ...base, invoiceNumber: invoice.number, amountPaise: 100001, paidOn: today });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("more than the");
    expect(await db.select().from(payments)).toHaveLength(0);
  });

  it("records a partial payment and reports the remaining balance", async () => {
    allow({ id: adminId, role: "admin" });
    const invoice = await seedOpenInvoice();
    const response = await call({ ...base, invoiceNumber: invoice.number, paidOn: today });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { paymentId: string; status: string; balancePaise: number };
    expect(body.status).toBe("confirmed");
    expect(body.balancePaise).toBe(60000);
    expect(typeof body.paymentId).toBe("string");

    const [payment] = await db.select().from(payments).where(eq(payments.invoiceId, invoice.id));
    expect(payment).toMatchObject({ amountPaise: 40000, paidOn: today, recordedBy: adminId });
    const [reloaded] = await db.select().from(invoices).where(eq(invoices.id, invoice.id));
    expect(reloaded.paidPaise).toBe(40000);
    expect(reloaded.status).toBe("confirmed");
  });

  it("moves the invoice to paid once the full amount is recorded", async () => {
    allow({ id: adminId, role: "admin" });
    const invoice = await seedOpenInvoice();
    await call({ ...base, invoiceNumber: invoice.number, amountPaise: 40000, paidOn: today });
    const response = await call({ ...base, invoiceNumber: invoice.number, amountPaise: 60000, paidOn: today });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string; balancePaise: number };
    expect(body.status).toBe("paid");
    expect(body.balancePaise).toBe(0);

    const [reloaded] = await db.select().from(invoices).where(eq(invoices.id, invoice.id));
    expect(reloaded.status).toBe("paid");
    const timeline = await db.select().from(events).where(eq(events.entityId, invoice.subscriptionId));
    expect(timeline.some((event) => event.type === "payment_recorded")).toBe(true);
  });

  it("rejects a future payment date through the service", async () => {
    allow({ id: adminId, role: "admin" });
    const invoice = await seedOpenInvoice();
    const response = await call({
      ...base,
      invoiceNumber: invoice.number,
      paidOn: addDays(today, 1),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "The payment date can't be in the future." });
  });

  it("maps a TransitionError to a safe 400", async () => {
    allow({ id: adminId, role: "admin" });
    await seedOpenInvoice();
    vi.mocked(recordPayment).mockRejectedValueOnce(new TransitionError("This invoice can't be transitioned."));
    const response = await call({ ...base, invoiceNumber: "INV-TEST-1", paidOn: today });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "This invoice can't be transitioned." });
  });

  it("keeps PaymentError class identity for instanceof mapping", () => {
    const error = new PaymentError("Enter an amount above zero.");
    expect(error instanceof PaymentError).toBe(true);
  });
});
