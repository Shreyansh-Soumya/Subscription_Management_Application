import { PGlite } from "@electric-sql/pglite";
import { verifyPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { AccountError, createStaffMember, ensureCustomerRecord } from "./accounts";

const { account, customers, events, user } = schema;
type TestDb = ReturnType<typeof drizzle<typeof schema>>;
let db: TestDb;

beforeEach(async () => {
  db = drizzle({ client: new PGlite(), schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
});

async function addUser(id: string, role: "admin" | "staff" | "customer", email = `${id}@t.test`) {
  await db.insert(user).values({ id, name: `Name ${id}`, email, role });
}

describe("ensureCustomerRecord", () => {
  it("creates a customer linked to a new customer login", async () => {
    await addUser("u1", "customer");
    await ensureCustomerRecord(db, { id: "u1", name: "Name u1", email: "u1@t.test", role: "customer" });
    const [row] = await db.select().from(customers);
    expect(row).toMatchObject({ userId: "u1", name: "Name u1", email: "u1@t.test" });
  });

  it("does nothing the second time", async () => {
    await addUser("u1", "customer");
    const input = { id: "u1", name: "N", email: "u1@t.test", role: "customer" };
    await ensureCustomerRecord(db, input);
    await ensureCustomerRecord(db, input);
    expect(await db.select().from(customers)).toHaveLength(1);
  });

  it("doesn't create one for staff or admins", async () => {
    await addUser("s1", "staff");
    await ensureCustomerRecord(db, { id: "s1", name: "N", email: "s1@t.test", role: "staff" });
    expect(await db.select().from(customers)).toHaveLength(0);
  });

  it("never attaches a new login to an existing customer just because the email matches", async () => {
    const [existing] = await db.insert(customers).values({ name: "Big Corp", email: "ceo@big.test" }).returning();
    await addUser("attacker", "customer", "ceo@big.test");
    await ensureCustomerRecord(db, { id: "attacker", name: "A", email: "ceo@big.test", role: "customer" });
    const [unchanged] = await db.select().from(customers).where(eq(customers.id, existing.id));
    expect(unchanged.userId).toBeNull();
    expect(await db.select().from(customers).where(eq(customers.userId, "attacker"))).toHaveLength(1);
  });
});

describe("createStaffMember", () => {
  const input = { name: "Sam Staff", email: "Sam@Brightloop.test", password: "Abcdefg1!", actorId: "admin1" };

  beforeEach(async () => {
    await addUser("admin1", "admin");
  });

  it("creates a staff login whose password works", async () => {
    const created = await createStaffMember(db, input);
    expect(created).toMatchObject({ email: "sam@brightloop.test", role: "staff" });
    const [row] = await db.select().from(account).where(eq(account.userId, created.id));
    expect(row.providerId).toBe("credential");
    expect(await verifyPassword({ hash: row.password!, password: "Abcdefg1!" })).toBe(true);
  });

  it("doesn't create a customer record", async () => {
    await createStaffMember(db, input);
    expect(await db.select().from(customers)).toHaveLength(0);
  });

  it("records who added them", async () => {
    await createStaffMember(db, input);
    const [event] = await db.select().from(events).where(eq(events.type, "staff_created"));
    expect(event.actorId).toBe("admin1");
    expect(JSON.stringify(event)).not.toContain("Abcdefg1!");
  });

  it("refuses an email that already has an account, in any letter case", async () => {
    await createStaffMember(db, input);
    await expect(createStaffMember(db, { ...input, email: "SAM@brightloop.TEST" })).rejects.toThrow("already has an account");
  });

  it("applies the password rules", async () => {
    await expect(createStaffMember(db, { ...input, password: "weak" })).rejects.toThrow(AccountError);
    expect(await db.select().from(user)).toHaveLength(1);
  });

  it("requires a name and a real email", async () => {
    await expect(createStaffMember(db, { ...input, name: "  " })).rejects.toThrow("Enter a name");
    await expect(createStaffMember(db, { ...input, email: "nope" })).rejects.toThrow("valid email");
  });
});
