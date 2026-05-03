import { AdminShell } from "@/src/components/admin/AdminShell";

import { ActiveSessionsScreen } from "./active-sessions-screen";

export const dynamic = "force-dynamic";

export default function AdminActiveSessionsPage() {
  return (
    <AdminShell>
      <ActiveSessionsScreen />
    </AdminShell>
  );
}
