import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import type { Db } from "@/db";
import { account, customers, events, user } from "@/db/schema";
import { appNow } from "./clock";
import { passwordProblem } from "./password";

/** Its message is safe to show to the user. */
export class AccountError extends Error {}

const SYSTEM_ENTITY_ID = "00000000-0000-0000-0000-000000000000";

/**
 * Gives a customer login its own customer record, so the portal has something to show.
 * It never links to an existing record by email: signup doesn't prove someone owns that address,
 * so that would let anyone claim another customer's invoices.
 */
export async function ensureCustomerRecord(
  db: Db,
  input: { id: string; name: string; email: string; role?: string | null },
): Promise<void> {
  if (input.role && input.role !== "customer") return;
  await db
    .insert(customers)
    .values({ userId: input.id, name: input.name, email: input.email })
    .onConflictDoNothing({ target: customers.userId });
}

/** Admin only: adds a member of staff. Check the caller's role before calling this. */
export async function createStaffMember(
  db: Db,
  input: { name: string; email: string; password: string; actorId: string },
): Promise<{ id: string; name: string; email: string; role: "staff" }> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name) throw new AccountError("Enter a name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AccountError("Enter a valid email address.");
  const problem = passwordProblem(input.password);
  if (problem) throw new AccountError(problem);

  const password = await hashPassword(input.password);
  const id = randomUUID();

  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(user)
      .values({ id, name, email, role: "staff", emailVerified: true })
      .onConflictDoNothing({ target: user.email })
      .returning({ id: user.id });
    if (inserted.length === 0) throw new AccountError("This email already has an account.");

    await tx.insert(account).values({ id: randomUUID(), accountId: id, providerId: "credential", userId: id, password });
    await tx.insert(events).values({
      entityType: "system",
      entityId: SYSTEM_ENTITY_ID,
      type: "staff_created",
      note: `Added ${email} as staff`,
      actorId: input.actorId,
      occurredAt: await appNow(tx),
    });
  });
  return { id, name, email, role: "staff" };
}
