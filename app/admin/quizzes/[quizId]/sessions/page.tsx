import { AdminShell } from "@/src/components/admin/AdminShell";

import { SessionsScreen } from "./sessions-screen";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ quizId: string }>;
}

export default async function AdminQuizSessionsPage({ params }: PageProps) {
  const { quizId } = await params;
  return (
    <AdminShell>
      <SessionsScreen quizId={quizId} />
    </AdminShell>
  );
}
