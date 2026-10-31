import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description?: string;
  /** Action buttons / controls rendered on the trailing edge. */
  children?: ReactNode;
  className?: string;
};

export function PageHeader({
  title,
  description,
  children,
  className,
}: PageHeaderProps) {
  return (
    <div className={className ?? "flex flex-wrap items-end justify-between gap-3"}>
      <div className="min-w-0">
        <h1 className="headline text-[26px] sm:text-[32px]">{title}</h1>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-soft">
            {description}
          </p>
        ) : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}
