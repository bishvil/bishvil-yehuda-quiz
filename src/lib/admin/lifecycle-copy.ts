/**
 * Hebrew copy used at lifecycle decision points across the admin and host
 * surfaces. Centralised here so the same sentence is shown to the host on
 * the live screen banner (subtask D §3) and to the admin in the sessions
 * launch confirm (subtask D §2). Updating one place keeps the experience
 * consistent across roles.
 */

/** Helper sentence under the "צור משחק" action on the admin sessions surface. */
export const SESSION_CREATE_HELPER =
  "יצירת משחק תפתח קוד הצטרפות. המשתתפים יוכלו להצטרף, והחידון יתחיל רק מלוח המנחה.";

/** Confirm copy when an admin clicks "פרסם" / "התחל". */
export const SESSION_PUBLISH_CONFIRM =
  "ליצור משחק חדש? לאחר היצירה יופיע קוד הצטרפות ותוכלו לפתוח את לוח המנחה. החידון לא מתחיל עד שלוחצים ׳התחל חידון׳.";

/** Confirm copy when an admin/host clicks "התחל חידון". */
export const SESSION_START_CONFIRM =
  "התחלת החידון תפתח את השאלה הראשונה ותחל מד הזמן. לא ניתן לחזור למצב המתנה.";

/** Confirm copy when an admin/host clicks "סיים חידון". */
export const SESSION_END_CONFIRM =
  "סיום החידון יחתום את התוצאות. לא ניתן לפתוח אותו מחדש.";

export const LIFECYCLE_COPY = {
  createHelper: SESSION_CREATE_HELPER,
  publishConfirm: SESSION_PUBLISH_CONFIRM,
  startConfirm: SESSION_START_CONFIRM,
  endConfirm: SESSION_END_CONFIRM,
} as const;
