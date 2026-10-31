import Link from "next/link";
import { requirePageRole } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DataTable, type TableColumn } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { FormField } from "@/components/app/form-field";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import type { SubscriptionStatus } from "@/lib/status";

/**
 * ISOLATED DEMONSTRATION PAGE — static mock data only.
 * No database access, no business logic. This route exists solely to show
 * feature owners how the shell and the UI kit compose. Delete freely.
 */

type DemoSubscription = {
  id: string;
  customer: string;
  plan: string;
  nextBilling: string;
  amount: string;
  status: SubscriptionStatus;
};

const DEMO_SUBSCRIPTIONS: DemoSubscription[] = [
  { id: "s1", customer: "Aarav Sharma", plan: "JEE 2027 · Morning", nextBilling: "1 Oct 2026", amount: "₹12,500", status: "active" },
  { id: "s2", customer: "Priya Nair", plan: "NEET 2026", nextBilling: "3 Oct 2026", amount: "₹6,000", status: "confirmed" },
  { id: "s3", customer: "Kabir Mehta", plan: "Class 10 Maths", nextBilling: "5 Oct 2026", amount: "₹2,400", status: "paused" },
  { id: "s4", customer: "Sana Qureshi", plan: "JEE 2027 · Evening", nextBilling: "—", amount: "₹45,000", status: "quotation" },
  { id: "s5", customer: "Rohan Das", plan: "Foundation · Class 9", nextBilling: "—", amount: "₹1,800", status: "closed" },
];

const DEMO_COLUMNS: TableColumn<DemoSubscription>[] = [
  {
    key: "customer",
    header: "Customer",
    cell: (row) => (
      <span className="grid leading-tight">
        <span className="text-[13px] font-semibold">{row.customer}</span>
        <span className="font-mono text-[10px] text-ink-soft">{row.plan}</span>
      </span>
    ),
  },
  {
    key: "nextBilling",
    header: "Next billing",
    cell: (row) => (
      <span className="num font-mono text-[13px]">{row.nextBilling}</span>
    ),
  },
  {
    key: "amount",
    header: "Amount",
    align: "right",
    cell: (row) => (
      <span className="num font-mono text-[13px] font-medium">{row.amount}</span>
    ),
  },
  {
    key: "status",
    header: "Status",
    align: "center",
    cell: (row) => <StatusBadge status={row.status} />,
  },
];

const METRICS = [
  { label: "Collected today", value: "₹35,750", meta: "UPI · Cash · Bank transfer" },
  { label: "This month", value: "₹4,82,300", meta: "vs ₹4,10,150 last month" },
  { label: "Outstanding", value: "₹3,39,000", meta: "42 invoices open" },
  { label: "Overdue", value: "₹1,86,400", meta: "17 invoices past due" },
];

const OVERDUE_BY_AGE = [
  { band: "1–30 days", amount: "₹2,10,000", share: 62 },
  { band: "31–60 days", amount: "₹95,000", share: 28 },
  { band: "60+ days", amount: "₹34,000", share: 10 },
];

function MetricCard({
  label,
  value,
  meta,
}: {
  label: string;
  value: string;
  meta: string;
}) {
  return (
    <div className="border-[1.5px] border-ink bg-sheet p-4 shadow-[3px_3px_0_var(--ink)]">
      <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-soft">
        {label}
      </p>
      <p className="num mt-2 font-mono text-[20px] font-semibold leading-none">
        {value}
      </p>
      <p className="num mt-1.5 font-mono text-[10px] text-ink-soft">{meta}</p>
    </div>
  );
}

export const instant = false;

export default async function DashboardPage() {
  await requirePageRole(["admin", "staff"]);
  return (
    <div className="relative">
      <span className="stamp-badge absolute -top-1 right-0 hidden text-stamp-red lg:inline-flex">
        Demo data
      </span>

      <PageHeader
        title="Dashboard"
        description="What came in today, how the month is going, and who is overdue. Demonstration page with static mock data."
      >
        <Button variant="outline-paper" asChild>
          <Link href="/subscriptions">View subscriptions</Link>
        </Button>
        <Button variant="stamp" asChild>
          <Link href="/payments">Add payment</Link>
        </Button>
      </PageHeader>

      <section aria-label="Today at a glance" className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {METRICS.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </section>

      <section aria-label="Subscriptions" className="mt-8 grid gap-6 [&>*]:min-w-0 lg:grid-cols-[1.6fr_1fr] lg:items-start">
        <div>
          <h2 className="headline text-[20px]">Subscriptions</h2>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-soft">
            Sample rows · every status tone
          </p>
          <div className="mt-3">
            <DataTable columns={DEMO_COLUMNS} rows={DEMO_SUBSCRIPTIONS} rowKey={(row) => row.id} />
          </div>
          <div className="mt-4">
            <h3 className="headline text-[16px]">Empty state</h3>
            <div className="mt-2">
              <DataTable
                columns={DEMO_COLUMNS}
                rows={[]}
                rowKey={(row) => row.id}
                emptyState={
                  <EmptyState
                    icon={undefined}
                    className="border-0 bg-transparent"
                    title="No payments recorded"
                    description="Payments will appear here as invoices are settled."
                    note="every rupee, accounted for"
                  />
                }
              />
            </div>
          </div>
        </div>

        <div className="grid gap-6">
          <div className="border-[1.5px] border-ink bg-sheet shadow-[3px_3px_0_var(--ink)]">
            <div className="flex items-end justify-between border-b-[1.5px] border-ink px-4 pt-3 pb-2">
              <p className="headline text-[18px]">Overdue by age</p>
              <p className="num font-mono text-[10px] text-ink-soft">MOCK</p>
            </div>
            <ul className="grid gap-2.5 p-4">
              {OVERDUE_BY_AGE.map((band) => (
                <li key={band.band} className="grid grid-cols-[76px_1fr_80px] items-center gap-2 font-mono text-[11px]">
                  <span className="text-ink-soft">{band.band}</span>
                  <span className="h-2.5 border border-ink/30">
                    <span className="block h-full bg-stamp-red" style={{ width: `${band.share}%` }} />
                  </span>
                  <span className="num text-right font-medium">{band.amount}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="border-[1.5px] border-ink bg-sheet p-4 shadow-[3px_3px_0_var(--ink)]">
            <p className="headline text-[18px]">Form controls</p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-soft">
              Presentation only · not wired
            </p>
            <div className="mt-4 grid gap-4">
              <FormField label="Customer name" htmlFor="demo-customer" required hint="Shown on invoices and receipts.">
                <Input id="demo-customer" placeholder="e.g. Aarav Sharma" />
              </FormField>
              <FormField label="Billing frequency" htmlFor="demo-frequency">
                <Select>
                  <SelectTrigger id="demo-frequency" className="w-full">
                    <SelectValue placeholder="Pick a frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Notes" htmlFor="demo-notes" error="Demonstration error message.">
                <Textarea id="demo-notes" rows={2} placeholder="Internal notes…" />
              </FormField>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
