import { PageHeader } from "@/components/app/page-header";
import { db } from "@/db";
import { getClockState } from "@/lib/clock";
import { formatDate } from "@/lib/format";
import { requirePageRole } from "@/lib/permissions";
import { TimeMachineForm } from "./time-machine-form";

export const instant = false;

export default async function TimeMachinePage() {
  await requirePageRole(["admin"]);
  const clock = await getClockState(db);

  return (
    <>
      <PageHeader
        title="Time machine"
        description="Move the whole app forward to see what happens on a later date. Plans that have ended close themselves. Billing still waits for you to run it."
      />
      <p className="mt-6 text-sm text-ink-soft">
        The app&apos;s date is <strong className="text-ink">{formatDate(clock.today)}</strong>
        {clock.isSimulated ? " (simulated)." : " (the real date)."}
      </p>
      <TimeMachineForm today={clock.today} isSimulated={clock.isSimulated} />
    </>
  );
}
