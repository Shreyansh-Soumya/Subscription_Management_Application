import { requirePageRole } from "@/lib/permissions";
import { StaffForm } from "./staff-form";

export const instant = false;

export default async function StaffPage() {
  await requirePageRole(["admin"]);
  return (
    <main className="mx-auto w-full max-w-md px-4 py-12">
      <h1 className="headline text-[34px] sm:text-[44px]">Add a staff member</h1>
      <p className="mt-2 text-ink-soft">Staff handle day-to-day work with limited access.</p>
      <StaffForm />
    </main>
  );
}
