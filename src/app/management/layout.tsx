import { NavSidebar } from "@/components/nav-sidebar";

export default function ManagementLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen">
      <NavSidebar />
      <main className="flex-1 overflow-auto bg-background px-10 py-8">{children}</main>
    </div>
  );
}
