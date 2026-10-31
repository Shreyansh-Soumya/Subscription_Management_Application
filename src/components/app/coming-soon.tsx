import Link from "next/link";
import { Stamp } from "@/components/portal/stamp";
import { Button } from "@/components/ui/button";

/** For pages planned but not built yet: says so plainly, and points to where that work happens today. */
export function ComingSoon({
  title,
  description,
  links,
}: {
  title: string;
  description: string;
  links: { href: string; label: string }[];
}) {
  return (
    <div className="max-w-2xl">
      <Stamp tone="quotation" className="text-[13px]">Coming later</Stamp>
      <h1 className="headline mt-5 text-[46px] sm:text-[64px]">{title}</h1>
      <p className="mt-4 text-[16px] leading-relaxed text-ink-soft">{description}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        {links.map((link, index) => (
          <Button key={link.href} asChild variant={index === 0 ? "default" : "outline"}>
            <Link href={link.href}>{link.label}</Link>
          </Button>
        ))}
      </div>
    </div>
  );
}
