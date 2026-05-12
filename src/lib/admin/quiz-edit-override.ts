export const LOCKED_QUIZ_EDIT_HEADER = "x-bsy-locked-quiz-edit";

export function hasLockedQuizEditOverride(request: Request): boolean {
  return request.headers.get(LOCKED_QUIZ_EDIT_HEADER) === "true";
}
