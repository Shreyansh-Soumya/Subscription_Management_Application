import type { ReactNode } from "react";

type PageContainerProps = {
  children: ReactNode;
  className?: string;
};

export function PageContainer({ children, className }: PageContainerProps) {
  return (
    <div
      className={
        className ??
        "mx-auto w-full max-w-[1120px] flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8"
      }
    >
      {children}
    </div>
  );
}
