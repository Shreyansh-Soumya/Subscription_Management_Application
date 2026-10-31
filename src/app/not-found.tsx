import Link from "next/link";
import { Stamp } from "@/components/portal/stamp";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-4 py-10">
      <div className="max-w-xl">
        <Stamp tone="due" className="text-[13px]">Not found</Stamp>
        <h1 className="headline mt-5 text-[46px] sm:text-[64px]">We can&apos;t find that page.</h1>
        <p className="mt-4 text-[16px] leading-relaxed text-ink-soft">The link may be out of date.</p>
        <Button asChild className="mt-6"><Link href="/">Go to your home page</Link></Button>
      </div>
    </main>
  );
}
