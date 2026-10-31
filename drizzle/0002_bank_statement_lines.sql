CREATE TYPE "public"."bank_line_status" AS ENUM('pending', 'matched', 'ignored');--> statement-breakpoint
CREATE TABLE "bank_statement_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fingerprint" text NOT NULL,
	"booked_on" date NOT NULL,
	"description" text NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"amount_paise" integer NOT NULL,
	"status" "bank_line_status" DEFAULT 'pending' NOT NULL,
	"payment_id" uuid,
	"imported_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_statement_lines_fingerprint_unique" UNIQUE("fingerprint")
);
--> statement-breakpoint
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_imported_by_user_id_fk" FOREIGN KEY ("imported_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bank_statement_lines_status_idx" ON "bank_statement_lines" USING btree ("status","booked_on");