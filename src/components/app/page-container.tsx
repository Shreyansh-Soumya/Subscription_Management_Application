import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageContainerProps = {
  children: ReactNode;
  className?: string;
};

export function PageContainer({ children, className }: PageContainerProps) {
  return (
    <div
      className={cn("mx-auto w-full max-w-[1120px] flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8", className)}
    >
      {children}
    </div>
  );
}
