"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="border border-rule-strong px-4 py-2.5 text-sm font-medium hover:bg-paper-deep">
      Print
    </button>
  );
}
