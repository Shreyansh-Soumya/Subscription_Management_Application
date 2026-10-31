import { CalendarClock } from "lucide-react";
import { formatDate } from "@/lib/format";

export function SimulatedDateBanner({ today }: { today: string }) {
  return (
    <p role="status" className="mb-5 flex items-center gap-2 border-[1.5px] border-due px-3 py-2 text-sm font-semibold text-due">
      <CalendarClock className="size-4 shrink-0" aria-hidden />
      Simulated date: {formatDate(today)}. The time machine has moved the whole app forward.
    </p>
  );
}
