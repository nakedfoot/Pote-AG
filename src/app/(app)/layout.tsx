import Sidebar from "@/components/Sidebar";
import { requireUser } from "@/lib/auth";
import { logout } from "../actions/auth";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  return (
    <div className="min-h-screen md:flex">
      <Sidebar user={user} logoutAction={logout} />
      <main className="min-w-0 flex-1 p-3 sm:p-4 md:p-6">{children}</main>
    </div>
  );
}
