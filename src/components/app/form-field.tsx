import { Label } from "@/components/ui/label";
import type { ReactNode } from "react";

type FormFieldProps = {
  label: string;
  htmlFor?: string;
  /** Control(s): Input, Textarea, Select, … */
  children: ReactNode;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
};

export function FormField({
  label,
  htmlFor,
  children,
  error,
  hint,
  required = false,
  className,
}: FormFieldProps) {
  return (
    <div className={className ?? "grid gap-1.5"}>
      <Label
        htmlFor={htmlFor}
        className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-soft"
      >
        {label}
        {required ? <span className="text-stamp-red"> *</span> : null}
      </Label>
      {children}
      {error ? (
        <p className="font-mono text-[11px] text-stamp-red">{error}</p>
      ) : hint ? (
        <p className="text-[12px] text-ink-soft">{hint}</p>
      ) : null}
    </div>
  );
}
