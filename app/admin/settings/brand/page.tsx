import { AdminShell } from "@/src/components/admin/AdminShell";

import { BrandSettingsScreen } from "./brand-settings-screen";

export const dynamic = "force-dynamic";

export default function AdminBrandSettingsPage() {
  return (
    <AdminShell>
      <BrandSettingsScreen />
    </AdminShell>
  );
}
