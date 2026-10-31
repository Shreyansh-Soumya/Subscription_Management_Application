import { AccountBar } from "@/components/account-bar";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AccountBar />
      {children}
    </>
  );
}
