import { createHash } from "node:crypto";
import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { bankStatementLines, customers, invoices } from "@/db/schema";
import { type BankLine, type MatchSuggestion, type OpenInvoice, parseBankStatement, suggestMatches } from "./bank-matching";
import { PaymentError, recordPayment } from "./payments";

const INSERT_CHUNK = 500;

/** The same row in a re-uploaded file gets the same fingerprint, so it can't be imported twice. */
function fingerprints(lines: BankLine[]): string[] {
  const seen = new Map<string, number>();
  return lines.map((line) => {
    const key = JSON.stringify([line.date, line.amountPaise, line.description, line.reference]);
    const occurrence = seen.get(key) ?? 0;
    seen.set(key, occurrence + 1);
    return createHash("sha256").update(`${key}#${occurrence}`).digest("hex");
  });
}

/** Saves a statement's credits for matching. Throws BankStatementError if the file can't be read. Check the caller's role first. */
export async function importBankStatement(db: Db, input: { csv: string; actorId?: string }) {
  const parsed = parseBankStatement(input.csv);
  const prints = fingerprints(parsed.lines);

  let imported = 0;
  for (let start = 0; start < parsed.lines.length; start += INSERT_CHUNK) {
    const rows = await db
      .insert(bankStatementLines)
      .values(
        parsed.lines.slice(start, start + INSERT_CHUNK).map((line, offset) => ({
          fingerprint: prints[start + offset],
          bookedOn: line.date,
          description: line.description,
          reference: line.reference,
          amountPaise: line.amountPaise,
          importedBy: input.actorId,
        })),
      )
      .onConflictDoNothing({ target: bankStatementLines.fingerprint })
      .returning({ id: bankStatementLines.id });
    imported += rows.length;
  }

  return {
    imported,
    duplicates: parsed.lines.length - imported,
    debitsSkipped: parsed.debitsSkipped,
    errors: parsed.errors,
  };
}

export type BankSuggestion = Omit<MatchSuggestion, "lineNumber"> & {
  lineId: string;
  bookedOn: string;
  description: string;
  reference: string;
  amountPaise: number;
  invoiceNumber: string | null;
};

/** Confirmed invoices with money still owed, oldest due date first. */
export async function openInvoicesForMatching(db: Db): Promise<OpenInvoice[]> {
  return db
    .select({
      id: invoices.id,
      number: invoices.number,
      customerName: customers.name,
      balancePaise: sql<number>`${invoices.totalPaise} - ${invoices.paidPaise}`.mapWith(Number),
    })
    .from(invoices)
    .innerJoin(customers, eq(invoices.customerId, customers.id))
    .where(and(eq(invoices.status, "confirmed"), lt(invoices.paidPaise, invoices.totalPaise)))
    .orderBy(asc(invoices.dueDate), asc(invoices.id));
}

/** Everything still waiting for a decision, with a suggested invoice where there is one. */
export async function pendingBankSuggestions(db: Db): Promise<BankSuggestion[]> {
  const pending = await db
    .select()
    .from(bankStatementLines)
    .where(eq(bankStatementLines.status, "pending"))
    .orderBy(asc(bankStatementLines.bookedOn), asc(bankStatementLines.id))
    .limit(500);
  if (pending.length === 0) return [];

  const open = await openInvoicesForMatching(db);

  const suggestions = suggestMatches(
    pending.map((line, index) => ({
      lineNumber: index,
      date: line.bookedOn,
      description: line.description,
      reference: line.reference,
      amountPaise: line.amountPaise,
    })),
    open,
  );
  const numbers = new Map(open.map((invoice) => [invoice.id, invoice.number]));

  return pending.map((line, index) => {
    const { invoiceId, confidence, reason, alternatives } = suggestions[index];
    return {
      lineId: line.id,
      bookedOn: line.bookedOn,
      description: line.description,
      reference: line.reference,
      amountPaise: line.amountPaise,
      invoiceId,
      invoiceNumber: invoiceId ? (numbers.get(invoiceId) ?? null) : null,
      confidence,
      reason,
      alternatives,
    };
  });
}

/** A person confirms a line belongs to an invoice, which records the payment. Check the caller's role first. */
export async function confirmBankMatch(db: Db, input: { lineId: string; invoiceId: string; actorId?: string }) {
  return db.transaction(async (tx) => {
    const [line] = await tx
      .select()
      .from(bankStatementLines)
      .where(eq(bankStatementLines.id, input.lineId))
      .for("update");
    if (!line) throw new PaymentError("Statement line not found.");
    if (line.status !== "pending") throw new PaymentError("This statement line has already been handled.");

    const detail = [line.description, line.reference].filter(Boolean).join(" ");
    const payment = await recordPayment(tx, {
      invoiceId: input.invoiceId,
      method: "bank_transfer",
      amountPaise: line.amountPaise,
      paidOn: line.bookedOn,
      note: detail ? `Bank statement: ${detail}` : "Bank statement",
      actorId: input.actorId,
    });
    await tx
      .update(bankStatementLines)
      .set({ status: "matched", paymentId: payment.paymentId })
      .where(eq(bankStatementLines.id, input.lineId));
    return payment;
  });
}

/** Sets aside a line that isn't a customer payment, such as interest. Check the caller's role first. */
export async function ignoreBankLine(db: Db, input: { lineId: string }): Promise<void> {
  const rows = await db
    .update(bankStatementLines)
    .set({ status: "ignored" })
    .where(and(eq(bankStatementLines.id, input.lineId), inArray(bankStatementLines.status, ["pending"])))
    .returning({ id: bankStatementLines.id });
  if (rows.length === 0) throw new PaymentError("This statement line has already been handled.");
}
