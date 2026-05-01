import { AdminShell } from "@/src/components/admin/AdminShell";

import { QuizListScreen } from "./quiz-list-screen";

export const dynamic = "force-dynamic";

export default function AdminQuizzesPage() {
  return (
    <AdminShell>
      <QuizListScreen />
    </AdminShell>
  );
}
