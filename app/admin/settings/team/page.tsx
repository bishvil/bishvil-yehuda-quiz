import { AdminShell } from "@/src/components/admin/AdminShell";

import { TeamSettingsScreen } from "./team-settings-screen";

export const dynamic = "force-dynamic";

export default function AdminTeamSettingsPage() {
  return (
    <AdminShell>
      <TeamSettingsScreen />
    </AdminShell>
  );
}
