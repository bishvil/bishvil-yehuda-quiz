"use client";

import { useCallback, useEffect, useState } from "react";

import { AdminTopBar } from "@/src/components/admin/AdminTopBar";
import {
  AdminCard,
  BrandSwatch,
  CardActions,
  CardEyebrow,
  CardTitle,
  PrimaryAction,
  StatusChip,
  type MenuItem,
} from "@/src/components/admin/cards";
import { PrimaryButton } from "@/src/components/participant/PrimaryButton";
import {
  archiveAdminQuiz,
  createAdminQuiz,
  duplicateAdminQuiz,
  hardDeleteAdminQuiz,
  isAdminApiError,
  listAdminQuizzes,
  unarchiveAdminQuiz,
  type AdminQuizListItem,
} from "@/src/lib/admin/api-client";
import { GAME_MODE_LABELS } from "@/src/lib/constants";
import type { ParticipantBrand } from "@/src/lib/participant/brands";

const DEFAULT_QUIZ_TITLE = "חידון חדש";

type LoadStatus = "idle" | "loading" | "ready" | "error";

interface QuizListScreenProps {
  brands: ParticipantBrand[];
  defaultBrandId: string;
}

export function QuizListScreen({ brands, defaultBrandId }: QuizListScreenProps) {
  const [quizzes, setQuizzes] = useState<AdminQuizListItem[]>([]);
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setStatus((prev) => (prev === "ready" ? prev : "loading"));
      const body = await listAdminQuizzes();
      if (cancelled) return;
      if (isAdminApiError(body)) {
        setStatus("error");
        setErrorMessage(body.message);
        return;
      }
      setQuizzes(body.quizzes);
      setStatus("ready");
      setErrorMessage(null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCreate = useCallback(async () => {
    setCreating(true);
    setErrorMessage(null);
    const body = await createAdminQuiz({
      brandId: defaultBrandId,
      title: DEFAULT_QUIZ_TITLE,
      defaultGameMode: "sync",
    });
    setCreating(false);
    if (isAdminApiError(body)) {
      setErrorMessage(body.message);
      return;
    }
    // Optimistic prepend then navigate.
    setQuizzes((prev) => [body.quiz, ...prev]);
    if (typeof window !== "undefined") {
      window.location.href = `/admin/quizzes/${body.quiz.id}`;
    }
  }, [defaultBrandId]);

  const handleArchive = useCallback(async (quizId: string) => {
    if (
      typeof window !== "undefined" &&
      !window.confirm("לארכב את החידון? משחקים פעילים ימשיכו לרוץ.")
    ) {
      return;
    }
    const body = await archiveAdminQuiz(quizId);
    if (isAdminApiError(body)) {
      setErrorMessage(body.message);
      return;
    }
    setQuizzes((prev) =>
      prev.map((q) =>
        q.id === quizId ? { ...q, archivedAt: body.archivedAt } : q,
      ),
    );
  }, []);

  const handleHardDelete = useCallback(async (quizId: string) => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "למחוק לצמיתות? פעולה זו אינה הפיכה. החידון וכל התחנות שלו יימחקו.",
      )
    ) {
      return;
    }
    const body = await hardDeleteAdminQuiz(quizId);
    if (isAdminApiError(body)) {
      setErrorMessage(body.message);
      return;
    }
    setQuizzes((prev) => prev.filter((q) => q.id !== quizId));
  }, []);

  const handleDuplicate = useCallback(async (quizId: string) => {
    setErrorMessage(null);
    const body = await duplicateAdminQuiz(quizId);
    if (isAdminApiError(body)) {
      setErrorMessage(body.message);
      return;
    }
    if (typeof window !== "undefined") {
      window.location.href = `/admin/quizzes/${body.quiz.id}`;
    }
  }, []);

  const handleUnarchive = useCallback(async (quizId: string) => {
    const body = await unarchiveAdminQuiz(quizId);
    if (isAdminApiError(body)) {
      setErrorMessage(body.message);
      return;
    }
    setQuizzes((prev) =>
      prev.map((q) =>
        q.id === quizId ? { ...q, archivedAt: null } : q,
      ),
    );
  }, []);

  const visible = showArchived
    ? quizzes
    : quizzes.filter((q) => q.archivedAt === null);

  return (
    <>
      <AdminTopBar
        crumbs={[{ label: "החידונים שלי" }]}
        tools={
          <>
            <label className="flex items-center gap-2 text-[12px] text-bsy-stone-700">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(event) => setShowArchived(event.target.checked)}
                className="h-4 w-4 accent-bsy-forest"
              />
              <span>הצג מאורכבים</span>
            </label>
            <PrimaryButton
              onClick={handleCreate}
              disabled={creating}
              withArrow
              variant="primary"
              data-testid="admin-create-quiz"
            >
              {creating ? "יוצר…" : "חידון חדש"}
            </PrimaryButton>
          </>
        }
      />

      <section className="flex-1 px-4 py-6 md:px-8">
        {errorMessage ? (
          <div className="mb-4 rounded-md border border-bsy-error/30 bg-bsy-error/10 px-4 py-2 text-[13px] text-bsy-error">
            {errorMessage}
          </div>
        ) : null}

        {status === "loading" && quizzes.length === 0 ? (
          <Skeleton />
        ) : visible.length === 0 ? (
          <EmptyState onCreate={handleCreate} creating={creating} />
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((quiz) => (
              <li key={quiz.id}>
                <QuizCard
                  quiz={quiz}
                  brands={brands}
                  onArchive={() => handleArchive(quiz.id)}
                  onUnarchive={() => handleUnarchive(quiz.id)}
                  onHardDelete={() => handleHardDelete(quiz.id)}
                  onDuplicate={() => handleDuplicate(quiz.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function Skeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="h-[180px] animate-pulse rounded-[12px] border border-bsy-stone-100 bg-[color:var(--bsy-paper-card)]"
        />
      ))}
    </div>
  );
}

function EmptyState({
  onCreate,
  creating,
}: {
  onCreate: () => void;
  creating: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-[12px] border border-dashed border-bsy-stone-200 bg-[color:var(--bsy-paper-card)] px-6 py-16 text-center">
      <div>
        <h2 className="font-[var(--font-display)] text-2xl text-bsy-brown">
          אין חידונים עדיין
        </h2>
        <p className="mt-1 text-[13px] text-bsy-stone-700">
          התחילו ביצירת חידון חדש — תוכלו להוסיף תחנות בעמוד העריכה.
        </p>
      </div>
      <PrimaryButton onClick={onCreate} withArrow disabled={creating}>
        {creating ? "יוצר…" : "צור חידון ראשון"}
      </PrimaryButton>
    </div>
  );
}

function QuizCard({
  quiz,
  brands,
  onArchive,
  onUnarchive,
  onHardDelete,
  onDuplicate,
}: {
  quiz: AdminQuizListItem;
  brands: ParticipantBrand[];
  onArchive: () => void;
  onUnarchive: () => void;
  onHardDelete: () => void;
  onDuplicate: () => void;
}) {
  const archived = quiz.archivedAt !== null;
  const sessionCount = quiz.sessionCount ?? 0;
  const canHardDelete = archived && sessionCount === 0;
  const locked = sessionCount > 0;
  const brand = brands.find((b) => b.id === quiz.brandId);
  const brandName = brand?.name ?? quiz.brandId;
  const questionCount = quiz.questionCount;

  const menu: MenuItem[] = [
    {
      key: "sessions",
      label: "משחקים שלי",
      href: `/admin/quizzes/${quiz.id}/sessions`,
    },
    {
      key: "duplicate",
      label: "שכפל",
      onClick: onDuplicate,
      title: "צור עותק זמין לעריכה",
    },
  ];
  if (archived) {
    menu.push({ key: "unarchive", label: "שחזר", onClick: onUnarchive });
    menu.push({
      key: "hard-delete",
      label: "מחק לצמיתות",
      onClick: onHardDelete,
      destructive: true,
      disabled: !canHardDelete,
      title: canHardDelete ? undefined : "לא ניתן למחוק חידון עם משחקים",
    });
  } else {
    menu.push({
      key: "archive",
      label: "ארכוב",
      onClick: onArchive,
      destructive: true,
    });
  }

  const eyebrowParts = [GAME_MODE_LABELS[quiz.defaultGameMode], brandName];

  return (
    <AdminCard
      tone={archived ? "muted" : "default"}
      data-testid="admin-quiz-card"
    >
      <div className="flex items-start justify-between gap-3">
        <BrandSwatch name={brandName} color={brand?.primary} />
        {archived ? <StatusChip status="archived" /> : null}
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <CardEyebrow>{eyebrowParts.join(" · ")}</CardEyebrow>
        <CardTitle>{quiz.title}</CardTitle>
        <p className="m-0 text-[12.5px] text-bsy-stone-700">
          {typeof questionCount === "number" ? (
            <>
              <span className="font-bold text-bsy-brown" dir="ltr">
                {questionCount}
              </span>
              <span className="px-1">תחנות</span>
            </>
          ) : (
            <span>—</span>
          )}
          {sessionCount > 0 ? (
            <>
              <span className="px-1.5 text-bsy-stone-200">·</span>
              <span className="font-bold text-bsy-brown" dir="ltr">
                {sessionCount}
              </span>
              <span className="px-1">משחקים</span>
            </>
          ) : null}
        </p>
      </div>

      <div className="mt-auto">
        <CardActions
          primary={
            <PrimaryAction href={`/admin/quizzes/${quiz.id}`}>
              {locked ? "צפייה" : "עריכה"}
            </PrimaryAction>
          }
          menu={menu}
        />
      </div>
    </AdminCard>
  );
}
