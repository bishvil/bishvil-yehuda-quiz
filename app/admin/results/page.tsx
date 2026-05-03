import { AdminShell } from "@/src/components/admin/AdminShell";

import { ResultsListScreen } from "./results-list-screen";

export const dynamic = "force-dynamic";

export default function AdminResultsPage() {
  return (
    <AdminShell>
      <ResultsListScreen />
    </AdminShell>
  );
}
