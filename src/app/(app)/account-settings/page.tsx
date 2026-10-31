import { PageHeader } from "@/components/app/page-header";
import { requirePageRole } from "@/lib/permissions";
import { ChangePasswordForm } from "./change-password-form";

export const instant = false;

export default async function AccountSettingsPage() {
  const user = await requirePageRole(["customer"]);
  return (
    <>
      <PageHeader title="Account settings" />
      <dl className="mt-6 grid max-w-md grid-cols-2 gap-3 border-t-[1.5px] border-ink pt-3 text-[15px]">
        <div><dt className="text-[13px] text-ink-soft">Name</dt><dd className="mt-0.5 font-medium break-words">{user.name}</dd></div>
        <div><dt className="text-[13px] text-ink-soft">Email</dt><dd className="mt-0.5 font-medium break-words">{user.email}</dd></div>
      </dl>
      <ChangePasswordForm />
    </>
  );
}
