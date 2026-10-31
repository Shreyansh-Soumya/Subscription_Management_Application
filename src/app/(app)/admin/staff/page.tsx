import { requirePageRole } from "@/lib/permissions";
import { StaffForm } from "./staff-form";

export const instant = false;

export default async function StaffPage() {
  await requirePageRole(["admin"]);
  return (
    <main className="mx-auto w-full max-w-md px-4 py-12">
      <h1 className="text-3xl font-bold text-gray-900">Add a staff member</h1>
      <p className="mt-2 text-gray-600">Staff handle day-to-day work with limited access.</p>
      <StaffForm />
    </main>
  );
}
