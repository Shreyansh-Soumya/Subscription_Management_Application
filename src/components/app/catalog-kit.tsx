"use client";

import Link from "next/link";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export function ResultBanner({ error, notice }: { error?: string; notice?: string }) {
  return (
    <>
      {error ? (
        <p role="alert" className="border-[1.5px] border-stamp-red bg-sheet p-3 text-sm text-stamp-red">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="border-[1.5px] border-paid bg-sheet p-3 text-sm text-paid">
          {notice}
        </p>
      ) : null}
    </>
  );
}

export function CheckboxField({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex items-start gap-2 text-sm">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 accent-[var(--stamp)]"
      />
      <span>
        {label}
        {hint ? <span className="block text-[12px] text-ink-soft">{hint}</span> : null}
      </span>
    </label>
  );
}

export function ConfirmDelete({
  title,
  description,
  onCancel,
  onConfirm,
}: {
  /** The dialog is open whenever a title is given. */
  title: string | null;
  description: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={title !== null} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function PageLinks({ path, page, total, pageSize }: { path: string; page: number; total: number; pageSize: number }) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink-soft">
      <span className="num">
        {total.toLocaleString("en-IN")} in total · page {page} of {lastPage}
      </span>
      <span className="flex gap-2">
        {page > 1 ? (
          <Button asChild variant="outline-paper" size="sm">
            <Link href={`${path}?page=${page - 1}`}>Previous</Link>
          </Button>
        ) : null}
        {page < lastPage ? (
          <Button asChild variant="outline-paper" size="sm">
            <Link href={`${path}?page=${page + 1}`}>Next</Link>
          </Button>
        ) : null}
      </span>
    </nav>
  );
}
