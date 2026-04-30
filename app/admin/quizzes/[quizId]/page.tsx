import { AdminShell } from "@/src/components/admin/AdminShell";

import { QuizEditorScreen } from "./quiz-editor-screen";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ quizId: string }>;
}

export default async function AdminQuizEditorPage({ params }: PageProps) {
  const { quizId } = await params;
  return (
    <AdminShell>
      <QuizEditorScreen quizId={quizId} />
    </AdminShell>
  );
}
