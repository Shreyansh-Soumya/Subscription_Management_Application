# Brightloop UI Kit — usage guide (Task 01)

The shared app shell and UI kit for Brightloop. Visual language: Feedesk-derived
(cream paper canvas, ink borders, hard offset shadows, stamp-style badges,
Archivo + IBM Plex Mono). Tokens are the frozen baseline in `src/app/globals.css`
— customize through tokens and component variants, never ad-hoc colors.

**The kit implements no authentication.** `AppShell` props are presentation-only.
It renders fully without an authenticated user (signed-out placeholders).

---

## 1. Adopting the shell directly in a feature layout (recommended)

Each feature owner renders `<AppShell>` in **their own** layout. Nothing outside
their feature folder is touched.

```tsx
// src/app/products/layout.tsx  (owned by the Products feature owner)
import { AppShell } from "@/components/app/app-shell";

export default function ProductsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell role="admin">{children}</AppShell>;
}
```

Then a plain page renders inside the shell:

```tsx
// src/app/products/page.tsx
import { PageHeader } from "@/components/app/page-header";
import { PageContainer } from "@/components/app/page-container";

export default function ProductsPage() {
  return (
    <PageContainer>
      <PageHeader title="Products" description="Catalogue of coaching products." />
      {/* …feature content… */}
    </PageContainer>
  );
}
```

> The demo at `src/app/dashboard/` shows this exact pattern (signed-out, with
> mock data). It is a demonstration route and can be deleted once real
> dashboards exist.

### Passing the signed-in user (when auth lands)

`role` and `user` are **display-only props**. The auth owner (or feature owner)
resolves them in *their* layout and passes values in — Task 01 resolves nothing:

```tsx
<AppShell
  role="staff"
  user={{ name: "Riya Sen", email: "staff@brightloop.test", image: null }}
>
```

- `role` missing → sidebar shows the workspace logo and a sign-in placeholder,
  no nav groups.
- `user` missing → footer shows “Not signed in”; header shows no avatar.

---

## 2. Shared route-group layout (only when coordinated)

A route group can host one shared `<AppShell>` layout for several routes:

```
src/app/(app)/
├── layout.tsx        ← <AppShell role={...}>{children}</AppShell>
├── products/page.tsx
└── plans/page.tsx
```

**Important:** a route-group layout only wraps routes **physically inside that
group**. It never automatically wraps routes outside it — `/subscriptions` or
`/dashboard` (outside `(app)`) will NOT pick it up. Adopting this pattern is an
explicit coordination decision with every feature owner whose routes move into
the group, and each moved route must actually live inside the folder.

---

## 3. Components

All application components live in `src/components/app/`; shadcn primitives in
`src/components/ui/`. Compose the primitives; do not restyle their internals.

### PageContainer

Content width/padding wrapper (`max-w-[1120px]`, responsive gutters).

| Prop | Type | Notes |
|---|---|---|
| `children` | `ReactNode` | page content |
| `className?` | `string` | override the default wrapper classes |

### PageHeader

| Prop | Type | Notes |
|---|---|---|
| `title` | `string` | rendered in the condensed `.headline` style |
| `description?` | `string` | supporting line, `text-ink-soft` |
| `children?` | `ReactNode` | **slot:** action buttons on the trailing edge |
| `className?` | `string` | override the flex layout |

```tsx
<PageHeader title="Invoices" description="All issued invoices.">
  <Button asChild><Link href="/invoices/new">New invoice</Link></Button>
</PageHeader>
```

### DataTable

Feedesk table treatment around the shadcn `Table`: mono uppercase header row,
1.5px ink rule under the header, hairline rows, right-aligned `num` money,
built-in loading skeleton and empty slot.

| Prop | Type | Notes |
|---|---|---|
| `columns` | `TableColumn<T>[]` | `{ key, header, align?, className?, cell(row) }` |
| `rows` | `T[]` | page of data (paginate server-side per README) |
| `rowKey` | `(row: T) => string` | stable React key |
| `isLoading?` | `boolean` | renders skeleton rows |
| `emptyState?` | `ReactNode` | **slot:** usually `<EmptyState …/>` |
| `className?` | `string` | override the outer border/box |

```tsx
const columns: TableColumn<Invoice>[] = [
  { key: "number", header: "No.", cell: (r) => <span className="num font-mono">{r.number}</span> },
  { key: "total", header: "Total", align: "right", cell: (r) => <span className="num font-mono">{formatMoney(r.totalPaise)}</span> },
  { key: "status", header: "Status", align: "center", cell: (r) => <StatusBadge status={r.status} /> },
];

<DataTable columns={columns} rows={invoices} rowKey={(r) => r.id}
           isLoading={!invoices}
           emptyState={<EmptyState icon={ReceiptText} title="No invoices yet"
                                   description="Invoices appear when a subscription is billed." />} />
```

### StatusBadge

Maps subscription/invoice statuses (imported from `@/lib/status`) to token
tones: `active`/`paid` → paid green, `quotation`/`paused` → due orange,
`confirmed` → stamp purple, `cancelled` → stamp-red, `draft`/`closed` → neutral.

```tsx
<StatusBadge status={subscription.status} />
```

### EmptyState

| Prop | Type | Notes |
|---|---|---|
| `icon?` | `LucideIcon` | lucide icon above the title |
| `title` | `string` | short headline |
| `description?` | `string` | supporting copy |
| `note?` | `string` | handwritten (Kalam) annotation — the only approved use of the hand font |
| `action?` | `ReactNode` | **slot:** usually a `Button` |
| `className?` | `string` | override the dashed box |

```tsx
<EmptyState icon={Users} title="No customers yet"
            description="Add your first customer to get started."
            note="it only takes a minute"
            action={<Button asChild><Link href="/customers/new">Add customer</Link></Button>} />
```

### FormField

Label + control + hint/error line, matching the mono micro-label treatment.

| Prop | Type | Notes |
|---|---|---|
| `label` | `string` | mono uppercase label |
| `htmlFor?` | `string` | id of the control |
| `children` | `ReactNode` | the control (`Input`, `Textarea`, `Select`, …) |
| `error?` | `string` | stamp-red error line (replaces hint) |
| `hint?` | `string` | muted helper line |
| `required?` | `boolean` | adds a stamp-red asterisk |
| `className?` | `string` | override the grid |

```tsx
<FormField label="Due date" htmlFor="due" required error={errors.due}>
  <Input id="due" type="date" name="due" />
</FormField>
```

### Buttons (extended variants)

`src/components/ui/button.tsx` adds two token-based variants to the shadcn set:

- `variant="stamp"` — purple CTA (`bg-stamp`, hover `bg-ink`), per the Feedesk CTA treatment.
- `variant="outline-paper"` — 1.5px ink border on sheet, hover `paper-deep`.

```tsx
<Button variant="stamp">Save</Button>
<Button variant="outline-paper">Cancel</Button>
```

---

## 4. Design tokens

Full reference: `src/app/globals.css` (`:root` block, frozen baseline). Utilities
generated from tokens: `bg-paper`, `bg-paper-deep`, `bg-sheet`, `text-ink`,
`text-ink-soft`, `border-rule`, `border-rule-strong`, `text-stamp`,
`bg-stamp-red`, `text-paid`, `text-due`, plus fonts `font-sans` (Archivo),
`font-mono` (IBM Plex Mono), `font-hand` (Kalam).

Custom utility classes: `.num` (tabular numerals — use on all money/counts),
`.headline` (condensed uppercase display), `.hand` (Kalam), `.stamp-badge`
(stamp treatment). Structural borders use `border-[1.5px] border-ink`; hard
offset shadows: `shadow-[3px_3px_0_var(--ink)]`.

The app is **light-only** (Feedesk is light-only); the `dark:` variant is
disabled by design.

## 5. Navigation configuration

`src/lib/navigation.ts` exports `NAVIGATION: Record<Role, NavGroup[]>` and
`navigationForRole(role)`. It is a **pure presentation config — not
authorization**. Roles are enforced server-side by feature owners (README
conventions). Sidebar rendering: `AppSidebar` consumes it via the `role` prop.
