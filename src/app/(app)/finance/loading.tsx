import { Skeleton } from "@/components/ui/skeleton";

export default function FinanceLoading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="border-[1.5px] border-ink bg-sheet p-4 shadow-[3px_3px_0_var(--ink)]"
          >
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-7 w-32" />
            <Skeleton className="mt-2 h-3 w-40" />
          </div>
        ))}
      </div>

      <div className="border-[1.5px] border-ink bg-sheet p-4 shadow-[3px_3px_0_var(--ink)]">
        <Skeleton className="h-10 w-full" />
      </div>

      <div className="border-[1.5px] border-ink bg-sheet p-6 shadow-[3px_3px_0_var(--ink)]">
        <div className="space-y-3">
          <Skeleton className="h-8 w-full" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
