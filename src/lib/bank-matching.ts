import { isRealDate } from "./dates";
import { formatMoney } from "./money";

const MAX_ROWS = 5000;

export type BankLine = {
  lineNumber: number;
  date: string;
  description: string;
  reference: string;
  amountPaise: number;
};

export type ParsedStatement = {
  lines: BankLine[];
  errors: { lineNumber: number; message: string }[];
  debitsSkipped: number;
};

/** Its message is safe to show to the user. */
export class BankStatementError extends Error {}

/** Reads an amount like "1,23,456.78" or "Rs. 500" into paise, without going through floating point. */
export function parseRupees(text: string): number | null {
  const cleaned = text.replace(/₹|rs\.?|inr|,|\s/gi, "");
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const paise = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(paise) ? paise : null;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Indian statements put the day first, so 01/02/2026 is 1 February. */
function parseDate(text: string): string | null {
  const value = text.trim();
  let year: string, month: string, day: string;
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match) {
    [, year, month, day] = match;
  } else if ((match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(value))) {
    [, day, month, year] = match;
  } else if ((match = /^(\d{1,2})[- ]([a-z]{3})[- ](\d{4})$/i.exec(value))) {
    const index = MONTHS.indexOf(match[2].toLowerCase());
    if (index < 0) return null;
    [day, month, year] = [match[1], String(index + 1), match[3]];
  } else {
    return null;
  }
  const date = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  return isRealDate(date) ? date : null;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  row.push(field);
  rows.push(row);
  return rows;
}

const COLUMNS = {
  date: ["date", "txn date", "transaction date", "tran date", "value date", "posting date"],
  description: ["description", "narration", "particulars", "details", "remarks"],
  reference: ["reference", "ref", "ref no", "reference no", "chq ref no", "cheque no", "utr"],
  credit: ["credit", "deposit", "deposit amt", "deposit amount", "credit amt", "credit amount", "cr"],
  debit: ["debit", "withdrawal", "withdrawal amt", "withdrawal amount", "debit amt", "debit amount", "dr"],
  amount: ["amount", "transaction amount", "txn amount"],
};

export function parseBankStatement(csv: string): ParsedStatement {
  const rows = parseCsv(csv.replace(/^﻿/, ""));
  const isBlank = (row: string[]) => row.every((cell) => cell.trim() === "");
  if (rows.every(isBlank)) throw new BankStatementError("This statement is empty.");

  const header = rows[0].map((cell) => cell.trim().toLowerCase().replace(/[.\s_]+/g, " ").trim());
  const find = (names: string[]) => header.findIndex((cell) => names.includes(cell));
  const columns = {
    date: find(COLUMNS.date),
    description: find(COLUMNS.description),
    reference: find(COLUMNS.reference),
    credit: find(COLUMNS.credit),
    debit: find(COLUMNS.debit),
    amount: find(COLUMNS.amount),
  };
  if (columns.date < 0) throw new BankStatementError("This statement needs a date column.");
  if (columns.credit < 0 && columns.amount < 0) {
    throw new BankStatementError("This statement needs a credit or amount column.");
  }

  const body = rows.slice(1);
  if (body.length > MAX_ROWS) throw new BankStatementError("Upload up to 5,000 rows at a time.");

  const result: ParsedStatement = { lines: [], errors: [], debitsSkipped: 0 };
  body.forEach((row, index) => {
    if (isBlank(row)) return;
    const lineNumber = index + 2;
    const cell = (column: number) => (column >= 0 ? (row[column] ?? "").trim() : "");

    const useCredit = columns.credit >= 0;
    const rawAmount = cell(useCredit ? columns.credit : columns.amount);
    const isDebit = useCredit
      ? rawAmount === "" || parseRupees(rawAmount) === 0
      : rawAmount.startsWith("-") || parseRupees(rawAmount) === 0;
    if (isDebit) {
      result.debitsSkipped += 1;
      return;
    }

    const date = parseDate(cell(columns.date));
    if (!date) {
      result.errors.push({ lineNumber, message: `Date isn't valid: ${cell(columns.date)}` });
      return;
    }
    const amountPaise = parseRupees(rawAmount);
    if (amountPaise === null) {
      result.errors.push({ lineNumber, message: `Amount isn't valid: ${rawAmount}` });
      return;
    }
    result.lines.push({
      lineNumber,
      date,
      description: cell(columns.description),
      reference: cell(columns.reference),
      amountPaise,
    });
  });
  return result;
}

export type OpenInvoice = { id: string; number: string; customerName: string; balancePaise: number };

export type MatchSuggestion = {
  lineNumber: number;
  invoiceId: string | null;
  confidence: "high" | "medium" | null;
  reason: string;
  alternatives: string[]; // invoices that fit equally well, for a person to choose between
};

function invoiceNumbersIn(text: string): Set<number> {
  return new Set([...text.matchAll(/INV[\s-]*0*(\d+)/gi)].map((match) => Number(match[1])));
}

const invoiceSerial = (number: string) => Number(/(\d+)$/.exec(number)?.[1] ?? NaN);
const words = (text: string) => ` ${text.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim()} `;

/**
 * Suggests an invoice for each statement line, for a person to confirm. Balances reduce as lines
 * are assigned, so two identical payments can't both be pointed at one balance.
 */
export function suggestMatches(lines: BankLine[], invoices: OpenInvoice[]): MatchSuggestion[] {
  const balances = new Map(invoices.map((invoice) => [invoice.id, invoice.balancePaise]));
  const left = (invoice: OpenInvoice) => balances.get(invoice.id) ?? 0;

  return lines.map((line) => {
    const noMatch = (reason: string, alternatives: string[] = []): MatchSuggestion => ({
      lineNumber: line.lineNumber, invoiceId: null, confidence: null, reason, alternatives,
    });
    const match = (invoice: OpenInvoice, confidence: "high" | "medium", reason: string): MatchSuggestion => {
      balances.set(invoice.id, left(invoice) - line.amountPaise);
      return { lineNumber: line.lineNumber, invoiceId: invoice.id, confidence, reason, alternatives: [] };
    };

    const text = `${line.description} ${line.reference}`;
    const mentioned = invoiceNumbersIn(text);
    const named = invoices.find((invoice) => mentioned.has(invoiceSerial(invoice.number)));
    if (named) {
      if (line.amountPaise === left(named)) return match(named, "high", "Invoice number and amount match");
      if (line.amountPaise < left(named)) return match(named, "medium", "Invoice number matches, part payment");
      return noMatch(`${named.number} only has ${formatMoney(left(named))} left to pay`);
    }

    const sameAmount = invoices.filter((invoice) => left(invoice) === line.amountPaise);
    const lineWords = words(text);
    const sameCustomer = sameAmount.filter((invoice) => {
      const name = words(invoice.customerName);
      return name.trim().length >= 3 && lineWords.includes(name);
    });
    if (sameCustomer.length === 1) return match(sameCustomer[0], "high", "Customer name and amount match");
    if (sameAmount.length === 1) return match(sameAmount[0], "medium", "Only this invoice has this amount");
    if (sameAmount.length > 1) {
      const options = sameCustomer.length > 1 ? sameCustomer : sameAmount;
      return noMatch("Several invoices have this amount", options.map((invoice) => invoice.id));
    }
    return noMatch("No matching invoice");
  });
}
