"use client";

interface LockedQuizEditBannerProps {
  hasAnySession: boolean;
  readOnly: boolean;
  duplicating: boolean;
  onEnableLockedEditing: () => void;
  onDuplicate: () => void;
}

export function LockedQuizEditBanner({
  hasAnySession,
  readOnly,
  duplicating,
  onEnableLockedEditing,
  onDuplicate,
}: LockedQuizEditBannerProps) {
  if (!hasAnySession) return null;

  return (
    <div
      className={[
        "mx-4 mt-3 flex flex-wrap items-center gap-3 rounded-md border px-4 py-3 text-[13px] text-bsy-ink md:mx-6",
        readOnly
          ? "border-bsy-warn/40 bg-bsy-warn/10"
          : "border-bsy-error/30 bg-bsy-error/10",
      ].join(" ")}
      data-testid="admin-quiz-locked-banner"
      role="status"
    >
      <span>
        {readOnly
          ? "החידון נעול לעריכה כי כבר התקיימו ממנו משחקים. אפשר לשכפל לעריכה בטוחה, או לפתוח עריכה אחרי אישור אזהרה."
          : "עריכה פתוחה לחידון שכבר יש לו משחקים. שינוי שאלות עשוי להשפיע על תוצאות משחקים קיימים."}
      </span>
      {readOnly ? (
        <button
          type="button"
          onClick={onEnableLockedEditing}
          className="ms-auto rounded-full border border-bsy-error bg-bsy-error px-4 py-1.5 text-[12px] font-bold text-white hover:opacity-90"
          data-testid="admin-quiz-force-edit-cta"
        >
          עריכה בכל זאת
        </button>
      ) : null}
      <button
        type="button"
        onClick={onDuplicate}
        disabled={duplicating}
        className={[
          "rounded-full border border-bsy-forest bg-bsy-forest px-4 py-1.5 text-[12px] font-bold text-bsy-paper hover:opacity-90 disabled:opacity-60",
          readOnly ? "" : "ms-auto",
        ].join(" ")}
        data-testid="admin-quiz-duplicate-cta"
      >
        {duplicating ? "משכפל…" : "שכפל לעריכה"}
      </button>
    </div>
  );
}
