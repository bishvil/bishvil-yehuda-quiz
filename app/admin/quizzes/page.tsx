import { AdminShell } from "@/src/components/admin/AdminShell";

import { QuizListScreen } from "./quiz-list-screen";

export const dynamic = "force-dynamic";

/**
 * `/admin/quizzes` — Wave 2 admin landing. Auth is enforced by middleware
 * (`PROTECTED_ADMIN_PATH_PREFIX`). All payloads come from
 * `/api/admin/quizzes` which already returns `Cache-Control: private,
 * no-store`; the client also passes `cache: "no-store"`.
 */
export default function AdminQuizzesPage() {
  return (
    <AdminShell>
      <QuizListScreen />
    </AdminShell>
  );
}
