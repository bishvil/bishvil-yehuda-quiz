"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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
import { GAME_MODE_LABELS, type GameMode } from "@/src/lib/constants";
import type { ParticipantBrand } from "@/src/lib/participant/brands";

const DEFAULT_QUIZ_TITLE = "חידון חדש";

type LoadStatus = "idle" | "loading" | "ready" | "error";
type StatusFilter = "active" | "archived" | "all";
type ModeFilter = "all" | GameMode;
type BrandFilter = "all" | string;
type SortKey = "newest" | "oldest" | "title";

const STATUS_FILTERS: ReadonlyArray<{ key: StatusFilter; label: string }> = [
  { key: "active", label: "פעילים" },
  { key: "archived", label: "מאורכבים" },
  { key: "all", label: "הכל" },
];

const SORT_OPTIONS: ReadonlyArray<{ key: SortKey; label: string }> = [
  { key: "newest", label: "חדשים תחילה" },
  { key: "oldest", label: "ישנים תחילה" },
  { key: "title", label: "לפי שם (א״ב)" },
];

// Strip Hebrew niqqud + cantillation marks and lowercase so "תּוֹרָה" matches "תורה".
function normalize(text: string): string {
  return text.normalize("NFKD").replace(/[֑-ׇ]/g, "").toLowerCase().trim();
}

interface QuizListScreenProps {
  brands: ParticipantBrand[];
  defaultBrandId: string;
}

export function QuizListScreen({ brands, defaultBrandId }: QuizListScreenProps) {
  const [quizzes, setQuizzes] = useState<AdminQuizListItem[]>([]);
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [brandFilter, setBrandFilter] = useState<BrandFilter>("all");
  const [modeFilter, setModeFilter] = useState<ModeFilter>("all");
  const [sort, setSort] = useState<SortKey>("newest");

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

  const visible = useMemo(() => {
    const normQuery = normalize(query);
    const filtered = quizzes.filter((q) => {
      if (statusFilter === "active" && q.archivedAt !== null) return false;
      if (statusFilter === "archived" && q.archivedAt === null) return false;
      if (brandFilter !== "all" && q.brandId !== brandFilter) return false;
      if (modeFilter !== "all" && q.defaultGameMode !== modeFilter) return false;
      if (normQuery && !normalize(q.title).includes(normQuery)) return false;
      return true;
    });
    const sorted = [...filtered];
    if (sort === "newest") {
      sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } else if (sort === "oldest") {
      sorted.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    } else {
      sorted.sort((a, b) => a.title.localeCompare(b.title, "he"));
    }
    return sorted;
  }, [quizzes, query, statusFilter, brandFilter, modeFilter, sort]);

  const filtersActive =
    query.trim() !== "" ||
    statusFilter !== "active" ||
    brandFilter !== "all" ||
    modeFilter !== "all" ||
    sort !== "newest";

  const resetFilters = useCallback(() => {
    setQuery("");
    setStatusFilter("active");
    setBrandFilter("all");
    setModeFilter("all");
    setSort("newest");
  }, []);

  const noResults =
    quizzes.length > 0 && visible.length === 0 && status === "ready";

  return (
    <>
      <AdminTopBar
        crumbs={[{ label: "החידונים שלי" }]}
        tools={
          <PrimaryButton
            onClick={handleCreate}
            disabled={creating}
            withArrow
            variant="primary"
            data-testid="admin-create-quiz"
          >
            {creating ? "יוצר…" : "חידון חדש"}
          </PrimaryButton>
        }
      />

      <section className="flex-1 px-4 py-6 md:px-8">
        {quizzes.length > 0 ? (
          <FilterBar
            query={query}
            onQueryChange={setQuery}
            statusFilter={statusFilter}
            onStatusChange={setStatusFilter}
            brandFilter={brandFilter}
            onBrandChange={setBrandFilter}
            modeFilter={modeFilter}
            onModeChange={setModeFilter}
            sort={sort}
            onSortChange={setSort}
            brands={brands}
            resultCount={visible.length}
            totalCount={quizzes.length}
            filtersActive={filtersActive}
            onReset={resetFilters}
          />
        ) : null}

        {errorMessage ? (
          <div className="mb-4 rounded-md border border-bsy-error/30 bg-bsy-error/10 px-4 py-2 text-[13px] text-bsy-error">
            {errorMessage}
          </div>
        ) : null}

        {status === "loading" && quizzes.length === 0 ? (
          <Skeleton />
        ) : quizzes.length === 0 ? (
          <EmptyState onCreate={handleCreate} creating={creating} />
        ) : noResults ? (
          <NoResultsState onReset={resetFilters} />
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

interface FilterBarProps {
  query: string;
  onQueryChange: (value: string) => void;
  statusFilter: StatusFilter;
  onStatusChange: (value: StatusFilter) => void;
  brandFilter: BrandFilter;
  onBrandChange: (value: BrandFilter) => void;
  modeFilter: ModeFilter;
  onModeChange: (value: ModeFilter) => void;
  sort: SortKey;
  onSortChange: (value: SortKey) => void;
  brands: ParticipantBrand[];
  resultCount: number;
  totalCount: number;
  filtersActive: boolean;
  onReset: () => void;
}

function FilterBar({
  query,
  onQueryChange,
  statusFilter,
  onStatusChange,
  brandFilter,
  onBrandChange,
  modeFilter,
  onModeChange,
  sort,
  onSortChange,
  brands,
  resultCount,
  totalCount,
  filtersActive,
  onReset,
}: FilterBarProps) {
  const [expanded, setExpanded] = useState(false);
  const advancedActive =
    statusFilter !== "active" ||
    brandFilter !== "all" ||
    modeFilter !== "all" ||
    sort !== "newest";

  if (!expanded) {
    return (
      <div
        className="mb-6 flex items-center gap-2 rounded-full border border-bsy-stone-100 bg-[color:var(--bsy-paper-card)] px-2 py-1.5 shadow-[0_1px_0_rgba(74,63,38,0.04)]"
        data-testid="admin-quiz-filter-bar"
        data-state="collapsed"
      >
        <div className="relative flex-1">
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-bsy-stone-400"
          >
            <SearchIcon />
          </span>
          <input
            type="search"
            inputMode="search"
            enterKeyHint="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            aria-label="חיפוש לפי שם החידון"
            placeholder="חיפוש…"
            className="h-9 w-full rounded-full bg-transparent px-3 pr-9 text-[14px] text-bsy-brown outline-none placeholder:text-bsy-stone-400 focus:bg-white focus:ring-2 focus:ring-bsy-forest/20"
            data-testid="admin-quiz-search"
          />
          {query ? (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              aria-label="נקה חיפוש"
              className="absolute inset-y-0 left-1.5 my-auto flex h-6 w-6 items-center justify-center rounded-full text-bsy-stone-500 transition hover:bg-bsy-stone-100 hover:text-bsy-brown"
            >
              <CloseIcon />
            </button>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-expanded={false}
          aria-controls="admin-quiz-filter-panel"
          className="relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-bsy-stone-100 bg-white px-3 text-[12.5px] font-bold text-bsy-stone-700 transition hover:border-bsy-stone-200 hover:text-bsy-brown"
          data-testid="admin-quiz-filter-toggle"
        >
          <FilterIcon />
          <span>סינון</span>
          {advancedActive ? (
            <span
              aria-label="סינון פעיל"
              className="absolute -top-0.5 -left-0.5 h-2 w-2 rounded-full bg-bsy-forest"
            />
          ) : null}
        </button>

        <span
          className="hidden shrink-0 px-1 text-[12px] text-bsy-stone-700 sm:inline"
          aria-live="polite"
        >
          <span className="font-bold text-bsy-brown" dir="ltr">
            {resultCount}
          </span>
          <span className="px-1">/</span>
          <span className="font-bold text-bsy-brown" dir="ltr">
            {totalCount}
          </span>
        </span>
      </div>
    );
  }

  return (
    <div
      id="admin-quiz-filter-panel"
      className="relative mb-6 rounded-[14px] border border-bsy-stone-100 bg-[color:var(--bsy-paper-card)] px-4 py-3 shadow-[0_1px_0_rgba(74,63,38,0.04)] md:px-5"
      data-testid="admin-quiz-filter-bar"
      data-state="expanded"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[12px] font-bold uppercase tracking-wide text-bsy-stone-500">
          חיפוש וסינון
        </span>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          aria-expanded={true}
          aria-controls="admin-quiz-filter-panel"
          aria-label="כווץ סינון"
          title="כווץ"
          className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-[12px] font-bold text-bsy-stone-500 transition hover:bg-bsy-stone-100 hover:text-bsy-brown"
          data-testid="admin-quiz-filter-collapse"
        >
          <ChevronUpIcon />
          <span>כווץ</span>
        </button>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-bsy-stone-400"
          >
            <SearchIcon />
          </span>
          <input
            type="search"
            inputMode="search"
            enterKeyHint="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            aria-label="חיפוש לפי שם החידון"
            placeholder="חיפוש לפי שם החידון…"
            className="h-11 w-full rounded-full border border-bsy-stone-100 bg-white px-4 pr-10 text-[15px] text-bsy-brown outline-none transition placeholder:text-bsy-stone-400 focus:border-bsy-forest focus:ring-2 focus:ring-bsy-forest/20 md:h-10 md:text-[14px]"
            data-testid="admin-quiz-search"
          />
          {query ? (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              aria-label="נקה חיפוש"
              className="absolute inset-y-0 left-2 my-auto flex h-7 w-7 items-center justify-center rounded-full text-bsy-stone-500 transition hover:bg-bsy-stone-100 hover:text-bsy-brown"
            >
              <CloseIcon />
            </button>
          ) : null}
        </div>

        <div
          role="group"
          aria-label="סינון לפי סטטוס"
          className="flex w-full items-stretch rounded-full border border-bsy-stone-100 bg-white p-1 md:inline-flex md:w-auto md:items-center"
          data-testid="admin-quiz-filter-status"
        >
          {STATUS_FILTERS.map((opt) => {
            const active = statusFilter === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => onStatusChange(opt.key)}
                aria-pressed={active}
                className={
                  "flex-1 rounded-full px-3.5 py-2 text-[13px] font-bold transition md:flex-none md:py-1.5 md:text-[12.5px] " +
                  (active
                    ? "bg-bsy-forest text-white shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                    : "text-bsy-stone-700 hover:text-bsy-brown")
                }
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3 md:flex md:flex-wrap md:items-center">
        <FilterSelect
          label="מותג"
          value={brandFilter}
          onChange={(value) => onBrandChange(value)}
          data-testid="admin-quiz-filter-brand"
        >
          <option value="all">כל המותגים</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </FilterSelect>

        <FilterSelect
          label="מצב"
          value={modeFilter}
          onChange={(value) => onModeChange(value as ModeFilter)}
          data-testid="admin-quiz-filter-mode"
        >
          <option value="all">כל המצבים</option>
          <option value="sync">{GAME_MODE_LABELS.sync}</option>
          <option value="async">{GAME_MODE_LABELS.async}</option>
        </FilterSelect>

        <FilterSelect
          label="מיון"
          value={sort}
          onChange={(value) => onSortChange(value as SortKey)}
          data-testid="admin-quiz-sort"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.key} value={opt.key}>
              {opt.label}
            </option>
          ))}
        </FilterSelect>

        <div className="col-span-full mt-1 flex items-center justify-between gap-3 border-t border-bsy-stone-100 pt-2 text-[12px] text-bsy-stone-700 sm:mt-2 md:ms-auto md:mt-0 md:border-none md:pt-0">
          <span>
            <span className="font-bold text-bsy-brown" dir="ltr">
              {resultCount}
            </span>
            <span className="px-1">מתוך</span>
            <span className="font-bold text-bsy-brown" dir="ltr">
              {totalCount}
            </span>
            <span className="px-1">חידונים</span>
          </span>
          {filtersActive ? (
            <button
              type="button"
              onClick={onReset}
              className="rounded-full border border-bsy-stone-200 px-3 py-1.5 text-[12px] font-bold text-bsy-stone-700 transition hover:border-bsy-forest hover:text-bsy-forest md:py-1"
            >
              נקה סינון
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

interface FilterSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  "data-testid"?: string;
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
  ...rest
}: FilterSelectProps) {
  return (
    <label className="group flex w-full items-center gap-1.5 rounded-full border border-bsy-stone-100 bg-white py-1.5 ps-3 pe-1 text-[13px] text-bsy-stone-700 transition focus-within:border-bsy-forest focus-within:ring-2 focus-within:ring-bsy-forest/20 hover:border-bsy-stone-200 md:inline-flex md:w-auto md:py-1 md:text-[12.5px]">
      <span className="font-bold text-bsy-brown">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 flex-1 cursor-pointer appearance-none bg-transparent py-1 pe-6 ps-1 text-[13px] text-bsy-brown outline-none md:flex-none md:text-[12.5px]"
        data-testid={rest["data-testid"]}
      >
        {children}
      </select>
      <ChevronIcon className="pointer-events-none -ms-6 text-bsy-stone-500 transition group-hover:text-bsy-brown" />
    </label>
  );
}

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 6l12 12M18 6l-12 12" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 5h18M6 12h12M10 19h4" />
    </svg>
  );
}

function ChevronUpIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m6 15 6-6 6 6" />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function NoResultsState({ onReset }: { onReset: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-[12px] border border-dashed border-bsy-stone-200 bg-[color:var(--bsy-paper-card)] px-6 py-12 text-center">
      <div>
        <h2 className="font-[var(--font-display)] text-2xl text-bsy-brown">
          לא נמצאו חידונים
        </h2>
        <p className="mt-1 text-[13px] text-bsy-stone-700">
          נסו לשנות את החיפוש או את הסינון.
        </p>
      </div>
      <button
        type="button"
        onClick={onReset}
        className="rounded-full border border-bsy-stone-200 px-4 py-1.5 text-[13px] font-bold text-bsy-stone-700 transition hover:border-bsy-forest hover:text-bsy-forest"
      >
        נקה סינון
      </button>
    </div>
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
