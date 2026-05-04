/**
 * Hebrew copy used at lifecycle decision points across the admin and host
 * surfaces. Centralised here so the same sentence is shown to the host on
 * the live screen banner (subtask D §3) and to the admin in the sessions
 * launch confirm (subtask D §2). Updating one place keeps the experience
 * consistent across roles.
 */

/** Helper sentence under the "צור סשן" form on the admin sessions surface. */
export const SESSION_CREATE_HELPER =
  "סשן חדש נוצר במצב ׳טיוטה׳. ניתן לקבוע מועד ולפרסם לאחר מכן.";

/** Confirm copy when an admin clicks "פרסם" / "התחל". */
export const SESSION_PUBLISH_CONFIRM =
  "ברגע הפרסום החידון פתוח להצטרפות באמצעות קוד הסשן. ניתן לעצור או לבטל את החידון בכל עת לפני התחלתו.";

/** Confirm copy when an admin/host clicks "התחל חידון". */
export const SESSION_START_CONFIRM =
  "התחלת החידון תפתח את השאלה הראשונה ותחל מד הזמן. לא ניתן לחזור למצב המתנה.";

/** Confirm copy when an admin/host clicks "סיים חידון". */
export const SESSION_END_CONFIRM =
  "סיום החידון יחתום את התוצאות. לא ניתן לפתוח אותו מחדש.";

/** Confirm copy when an admin clicks "חשב מחדש" on a session. */
export const SESSION_RESCORE_CONFIRM =
  "לחשב מחדש את הציונים של המשחק לפי הגדרות החידון העדכניות?";

/** 409 SCORES_LOCKED message — admin tried to edit a score field with answers present. */
export const ADMIN_QUESTION_SCORES_LOCKED_MESSAGE =
  "השדות שמשפיעים על הציון נעולים — קיימות תשובות שמורות. ניתן לאלץ עריכה ולחשב מחדש את הציונים.";

export function formatRescoreSummary(stats: {
  rescoredCount: number;
  participantsTouched: number;
  totalScoreDelta: number;
}): string {
  return `חישוב מחדש בוצע: ${stats.rescoredCount} תשובות, ${stats.participantsTouched} משתתפים, שינוי כולל ${stats.totalScoreDelta}.`;
}

export const LIFECYCLE_COPY = {
  createHelper: SESSION_CREATE_HELPER,
  publishConfirm: SESSION_PUBLISH_CONFIRM,
  startConfirm: SESSION_START_CONFIRM,
  endConfirm: SESSION_END_CONFIRM,
  rescoreConfirm: SESSION_RESCORE_CONFIRM,
} as const;
