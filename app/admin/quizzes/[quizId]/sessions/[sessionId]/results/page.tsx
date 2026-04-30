import { AdminShell } from "@/src/components/admin/AdminShell";

import { ResultsScreen } from "./results-screen";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ quizId: string; sessionId: string }>;
}

export default async function AdminResultsPage({ params }: PageProps) {
  const { quizId, sessionId } = await params;
  return (
    <AdminShell>
      <ResultsScreen quizId={quizId} sessionId={sessionId} />
    </AdminShell>
  );
}
