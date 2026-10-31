import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// All money columns are whole paise. All *_on and *_date columns are India dates (YYYY-MM-DD).

export const roleEnum = pgEnum("role", ["admin", "staff", "customer"]);
export const billingFrequencyEnum = pgEnum("billing_frequency", ["daily", "weekly", "monthly", "yearly"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "draft",
  "quotation",
  "confirmed",
  "active",
  "paused",
  "closed",
]);
export const invoiceStatusEnum = pgEnum("invoice_status", ["draft", "confirmed", "paid", "cancelled"]);
export const discountKindEnum = pgEnum("discount_kind", ["percent", "fixed"]);
export const discountScopeEnum = pgEnum("discount_scope", ["product", "subscription"]);
export const paymentMethodEnum = pgEnum("payment_method", ["bank_transfer", "upi", "card", "cash", "cheque"]);

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/* Better Auth tables. Table and column names follow its Drizzle adapter defaults. */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: roleEnum("role").notNull().default("customer"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/* Customers */

export const customers = pgTable(
  "customers",
  {
    id: id(),
    userId: text("user_id")
      .unique()
      .references(() => user.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    address: text("address"),
    createdAt: createdAt(),
  },
  (t) => [index("customers_name_idx").on(t.name)],
);

/* Catalogue */

export const products = pgTable("products", {
  id: id(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  salesPricePaise: integer("sales_price_paise").notNull(),
  costPricePaise: integer("cost_price_paise").notNull().default(0),
  notes: text("notes"),
  isAddon: boolean("is_addon").notNull().default(false),
  createdAt: createdAt(),
});

export const productVariants = pgTable(
  "product_variants",
  {
    id: id(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    attribute: text("attribute").notNull(), // for example "Brand"
    value: text("value").notNull(), // for example "Odoo"
    extraPricePaise: integer("extra_price_paise").notNull().default(0),
  },
  (t) => [uniqueIndex("product_variants_unique").on(t.productId, t.attribute, t.value)],
);

export const taxRules = pgTable("tax_rules", {
  id: id(),
  name: text("name").notNull(),
  rateBps: integer("rate_bps").notNull(), // 1800 means 18%
  active: boolean("active").notNull().default(true),
});

export const productTaxes = pgTable(
  "product_taxes",
  {
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    taxRuleId: uuid("tax_rule_id")
      .notNull()
      .references(() => taxRules.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.productId, t.taxRuleId] })],
);

export const plans = pgTable("plans", {
  id: id(),
  name: text("name").notNull(),
  pricePaise: integer("price_paise").notNull(),
  frequency: billingFrequencyEnum("frequency").notNull(),
  minQuantity: integer("min_quantity").notNull().default(1),
  availableFrom: date("available_from", { mode: "string" }),
  availableTo: date("available_to", { mode: "string" }),
  autoClose: boolean("auto_close").notNull().default(false),
  canCloseEarly: boolean("can_close_early").notNull().default(true),
  canPause: boolean("can_pause").notNull().default(true),
  canRenew: boolean("can_renew").notNull().default(true),
  createdAt: createdAt(),
});

export const discounts = pgTable(
  "discounts",
  {
    id: id(),
    name: text("name").notNull(),
    kind: discountKindEnum("kind").notNull(),
    value: integer("value").notNull(), // basis points when percent, paise when fixed
    scope: discountScopeEnum("scope").notNull(),
    minPurchasePaise: integer("min_purchase_paise").notNull().default(0),
    minQuantity: integer("min_quantity").notNull().default(0),
    startsOn: date("starts_on", { mode: "string" }).notNull(),
    endsOn: date("ends_on", { mode: "string" }).notNull(),
    usageLimit: integer("usage_limit"), // null means unlimited
    usageCount: integer("usage_count").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [check("discounts_dates_ordered", sql`${t.startsOn} <= ${t.endsOn}`)],
);

export const discountProducts = pgTable(
  "discount_products",
  {
    discountId: uuid("discount_id")
      .notNull()
      .references(() => discounts.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.discountId, t.productId] })],
);

/* Quotation templates */

export const quotationTemplates = pgTable("quotation_templates", {
  id: id(),
  name: text("name").notNull(),
  planId: uuid("plan_id")
    .notNull()
    .references(() => plans.id),
  validityDays: integer("validity_days").notNull(),
  notes: text("notes"),
  createdAt: createdAt(),
});

export const quotationTemplateLines = pgTable("quotation_template_lines", {
  id: id(),
  templateId: uuid("template_id")
    .notNull()
    .references(() => quotationTemplates.id, { onDelete: "cascade" }),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id),
  variantId: uuid("variant_id").references(() => productVariants.id),
  quantity: integer("quantity").notNull().default(1),
});

/* Subscriptions */

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: id(),
    number: text("number").notNull().unique(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id),
    templateId: uuid("template_id").references(() => quotationTemplates.id),
    status: subscriptionStatusEnum("status").notNull().default("draft"),
    startDate: date("start_date", { mode: "string" }).notNull(),
    expiryDate: date("expiry_date", { mode: "string" }),
    quoteValidUntil: date("quote_valid_until", { mode: "string" }),
    paymentTermsDays: integer("payment_terms_days").notNull().default(30),
    nextBillingDate: date("next_billing_date", { mode: "string" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("subscriptions_status_billing_idx").on(t.status, t.nextBillingDate),
    index("subscriptions_customer_idx").on(t.customerId),
    index("subscriptions_expiry_idx").on(t.expiryDate),
  ],
);

export const subscriptionLines = pgTable(
  "subscription_lines",
  {
    id: id(),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    variantId: uuid("variant_id").references(() => productVariants.id),
    description: text("description").notNull(),
    quantity: integer("quantity").notNull(),
    unitPricePaise: integer("unit_price_paise").notNull(),
  },
  (t) => [index("subscription_lines_subscription_idx").on(t.subscriptionId)],
);

export const subscriptionLineTaxes = pgTable(
  "subscription_line_taxes",
  {
    lineId: uuid("line_id")
      .notNull()
      .references(() => subscriptionLines.id, { onDelete: "cascade" }),
    taxRuleId: uuid("tax_rule_id")
      .notNull()
      .references(() => taxRules.id),
  },
  (t) => [primaryKey({ columns: [t.lineId, t.taxRuleId] })],
);

// Attaches a whole-subscription discount to one subscription.
export const subscriptionDiscounts = pgTable(
  "subscription_discounts",
  {
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),
    discountId: uuid("discount_id")
      .notNull()
      .references(() => discounts.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.subscriptionId, t.discountId] })],
);

/* Invoices and payments */

export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    number: text("number").notNull().unique(),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    status: invoiceStatusEnum("status").notNull().default("draft"),
    periodStart: date("period_start", { mode: "string" }).notNull(),
    periodEnd: date("period_end", { mode: "string" }).notNull(),
    issueDate: date("issue_date", { mode: "string" }).notNull(),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    subtotalPaise: integer("subtotal_paise").notNull(),
    discountPaise: integer("discount_paise").notNull().default(0),
    taxPaise: integer("tax_paise").notNull().default(0),
    totalPaise: integer("total_paise").notNull(),
    paidPaise: integer("paid_paise").notNull().default(0),
    breakdown: jsonb("breakdown").notNull(), // the computeInvoice() result, shown by "why this amount"
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // The guarantee against double billing. A cancelled invoice frees its period to be billed again.
    uniqueIndex("invoices_one_per_period")
      .on(t.subscriptionId, t.periodStart)
      .where(sql`${t.status} <> 'cancelled'`),
    index("invoices_status_due_idx").on(t.status, t.dueDate),
    index("invoices_customer_idx").on(t.customerId),
    index("invoices_issue_date_idx").on(t.issueDate),
  ],
);

export const invoiceLines = pgTable(
  "invoice_lines",
  {
    id: id(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id),
    description: text("description").notNull(),
    quantity: integer("quantity").notNull(),
    unitPricePaise: integer("unit_price_paise").notNull(),
    subtotalPaise: integer("subtotal_paise").notNull(),
    discountPaise: integer("discount_paise").notNull().default(0),
    taxPaise: integer("tax_paise").notNull().default(0),
    totalPaise: integer("total_paise").notNull(),
  },
  (t) => [index("invoice_lines_invoice_idx").on(t.invoiceId)],
);

export const payments = pgTable(
  "payments",
  {
    id: id(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id),
    method: paymentMethodEnum("method").notNull(),
    amountPaise: integer("amount_paise").notNull(),
    paidOn: date("paid_on", { mode: "string" }).notNull(),
    note: text("note"),
    recordedBy: text("recorded_by").references(() => user.id),
    createdAt: createdAt(),
  },
  (t) => [
    index("payments_invoice_idx").on(t.invoiceId),
    index("payments_paid_on_idx").on(t.paidOn),
    check("payments_amount_positive", sql`${t.amountPaise} > 0`),
  ],
);

/* Shared infrastructure */

// Written by transition() and logEvent(). The subscription timeline reads from here.
export const events = pgTable(
  "events",
  {
    id: id(),
    entityType: text("entity_type").notNull(), // "subscription" or "invoice"
    entityId: uuid("entity_id").notNull(),
    type: text("type").notNull(), // for example "status_changed" or "payment_recorded"
    fromStatus: text("from_status"),
    toStatus: text("to_status"),
    note: text("note"),
    actorId: text("actor_id").references(() => user.id),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(), // app time, from appNow()
    meta: jsonb("meta"),
  },
  (t) => [index("events_entity_idx").on(t.entityType, t.entityId, t.occurredAt)],
);

// One row only: how far the time machine has moved the app ahead of real time.
export const appClock = pgTable("app_clock", {
  id: integer("id").primaryKey().default(1),
  offsetMs: bigint("offset_ms", { mode: "number" }).notNull().default(0),
});

export const numberCounters = pgTable("number_counters", {
  prefix: text("prefix").primaryKey(), // "SUB" or "INV"
  lastValue: integer("last_value").notNull().default(0),
});
