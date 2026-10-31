import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { EmptyState } from "./empty-state";

export type TableColumn<T> = {
  key: string;
  header: string;
  align?: "left" | "center" | "right";
  className?: string;
  cell: (row: T) => ReactNode;
};

type DataTableProps<T> = {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  isLoading?: boolean;
  /** Shown when `rows` is empty and not loading. */
  emptyState?: ReactNode;
  className?: string;
};

const ALIGN: Record<NonNullable<TableColumn<never>["align"]>, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

const LOADING_ROWS = 5;

/**
 * Application-level wrapper around the shadcn Table implementing the
 * Feedesk table treatment: mono uppercase headers over a 1.5px ink rule,
 * hairline row separators, h-12 rows.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  isLoading = false,
  emptyState,
  className,
}: DataTableProps<T>) {
  return (
    <div className={className ?? "overflow-x-auto border-[1.5px] border-ink bg-sheet"}>
      <Table>
        <TableHeader>
          <TableRow className="border-b-[1.5px] border-ink hover:bg-transparent">
            {columns.map((column) => (
              <TableHead
                key={column.key}
                className={cn(
                  "h-9 px-3 font-mono text-[11px] font-normal uppercase tracking-[0.1em] text-ink-soft",
                  ALIGN[column.align ?? "left"],
                  column.className,
                )}
              >
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: LOADING_ROWS }).map((_, rowIndex) => (
              <TableRow key={`loading-${rowIndex}`} className="h-12 hover:bg-transparent">
                {columns.map((column) => (
                  <TableCell key={column.key} className="px-3">
                    <Skeleton className="h-4 w-full max-w-28" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columns.length} className="p-0">
                {emptyState ?? (
                  <EmptyState
                    className="border-0 bg-transparent"
                    title="Nothing here yet"
                  />
                )}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={rowKey(row)} className="h-12 border-b border-rule">
                {columns.map((column) => (
                  <TableCell
                    key={column.key}
                    className={cn("px-3", ALIGN[column.align ?? "left"], column.className)}
                  >
                    {column.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
