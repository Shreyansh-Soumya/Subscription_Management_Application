const dateFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Shows a business date ("2026-11-01") as "1 Nov 2026". */
export function formatDate(day: string): string {
  return dateFormat.format(new Date(`${day}T00:00:00Z`));
}

/** "1 invoice", "5,000 invoices". */
export function countOf(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count.toLocaleString("en-IN")} ${count === 1 ? singular : pluralForm}`;
}
