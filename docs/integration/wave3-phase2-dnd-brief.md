# Wave 3 Phase 2 DnD Integration Brief

This brief is for the integration tail subtask. The DnD dependencies,
reorder hook, sortable wrappers, and unit/component tests are already shipped
outside the editor screen:

- `src/hooks/useQuestionReorder.ts`
- `src/components/admin/SortableQuestionList.tsx`
- `src/components/admin/SortableQuestionCard.tsx`
- `tests/unit/admin/question-reorder.test.tsx`
- `tests/unit/admin/sortable-question-components.test.tsx`

Do not re-implement the DnD sensors in the editor. Wire these files into the
existing question state and keep the existing debounced quiz auto-save as the
only persistence path.

## 1. Editor Imports

File: `app/admin/quizzes/[quizId]/quiz-editor-screen.tsx`

Add near the existing admin component imports:

```tsx
import { SortableQuestionCard } from "@/src/components/admin/SortableQuestionCard";
import { SortableQuestionList } from "@/src/components/admin/SortableQuestionList";
import { useQuestionReorder } from "@/src/hooks/useQuestionReorder";
```

## 2. Replace The Local Move Callback

Replace the current `moveQuestion` callback around lines 248-263:

```tsx
const moveQuestion = useCallback((clientId: string, dir: -1 | 1) => {
  setQuestions((prev) => {
    const idx = prev.findIndex((q) => q.clientId === clientId);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= prev.length) return prev;
    const next = [...prev];
    const [moved] = next.splice(idx, 1);
    if (!moved) return prev;
    next.splice(target, 0, moved);
    const renumbered = next.map((q, i) => ({ ...q, ordinal: i + 1 }));
    setActiveIndex(target);
    return renumbered;
  });
}, []);
```

With the shared hook:

```tsx
const { reorderQuestion } = useQuestionReorder({
  questions,
  onSave: setQuestions,
  onActiveIndexChange: setActiveIndex,
});
```

This updates local question state in the new order. The existing
`useDebouncedAutoSave({ value: quizSaveValue, save: saveQuiz })` observes
`questions`, so no new API route or explicit save call is needed.

## 3. Wrap The Question List

Replace the current list mapping around lines 370-392:

```tsx
<ul className="flex flex-col gap-2">
  {questions.map((q, i) => (
    <li key={q.clientId}>
      <QuestionRow
        question={q}
        index={i}
        active={i === activeIndex && mobileView !== "edit"}
        onSelect={() => {
          setActiveIndex(i);
          setMobileView("edit");
        }}
        onMoveUp={i === 0 ? undefined : () => moveQuestion(q.clientId, -1)}
        onMoveDown={
          i === questions.length - 1
            ? undefined
            : () => moveQuestion(q.clientId, 1)
        }
      />
    </li>
  ))}
</ul>
```

With:

```tsx
<SortableQuestionList
  items={questions.map((q) => q.clientId)}
  onReorder={reorderQuestion}
  className="flex flex-col gap-2"
>
  {questions.map((q, i) => (
    <SortableQuestionCard key={q.clientId} id={q.clientId}>
      <QuestionRow
        question={q}
        index={i}
        active={i === activeIndex && mobileView !== "edit"}
        onSelect={() => {
          setActiveIndex(i);
          setMobileView("edit");
        }}
      />
    </SortableQuestionCard>
  ))}
</SortableQuestionList>
```

The wrapper renders a `div`, not a `ul`, because the sortable card contains a
handle sibling next to the existing question row. If semantic list markup is
required later, pass `role="list"` / `role="listitem"` support through the
standalone components in a follow-up.

## 4. Remove The Arrow Buttons

Remove `onMoveUp` and `onMoveDown` from the `QuestionRow` props and delete the
two-arrow control block at the start of `QuestionRow`.

Decision: remove the old up/down arrows rather than keep a duplicate reorder
affordance. Keyboard users still have a first-class path through dnd-kit:
focus the Hebrew-labeled drag handle, press Space or Enter to pick up, use the
arrow keys to move, press Space or Enter to drop, or Esc to cancel. The handle
already exposes the Hebrew tooltip:

```tsx
title="שינוי סדר: רווח או Enter לבחירה, חצים להזזה, Esc לביטול"
```

After deleting the arrows, `QuestionRow` should start directly with the
existing full-width edit button.

## 5. Persistence And Active Selection

No persistence API changes are needed.

Expected flow:

1. `SortableQuestionList` receives dnd-kit `onDragEnd`.
2. `reorderQuestion(active.id, over?.id)` computes `arrayMove` and dense
   ordinals through `useQuestionReorder`.
3. `setQuestions(nextQuestions)` updates local editor state.
4. Existing debounced auto-save serializes the questions array in order through
   the current PUT payload builder.
5. `setActiveIndex(nextIndex)` keeps the moved question selected.

Do not add a reorder-specific route or mutate the question-save API contract.

## 6. E2E After Editor Wiring

After the integration tail mounts the components, add or extend
`tests/e2e/admin-reorder.spec.ts` with keyboard-sensor coverage. Use keyboard
reorder rather than mouse drag:

```ts
test("admin can reorder questions with the keyboard sensor", async ({ page }) => {
  await page.goto("/admin/quizzes");
  // Create/open a quiz using the same fixture strategy as admin-smoke.
  // Ensure at least two questions exist.

  const handles = page.getByRole("button", {
    name: "גרירת שאלה לשינוי סדר",
  });

  const firstPrompt = await page
    .getByTestId("admin-question-row")
    .first()
    .textContent();

  await handles.first().focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Space");

  await expect(page.getByTestId("admin-save-status")).toContainText("נשמר");
  await page.reload();
  await expect(page.getByTestId("admin-question-row").nth(1)).toContainText(
    firstPrompt ?? "",
  );
});
```

If `QuestionRow` does not yet expose `data-testid="admin-question-row"`, add it
in the integration tail while editing that file. Do not use a Playwright mouse
drag for the main assertion; it is brittle against dnd-kit layout measurement
in CI.

## 7. Visual Verification

Because this subtask was explicitly forbidden from editing the editor screen,
browser verification for the live admin editor must happen in the integration
tail after the JSX above is applied.

Recommended visual check at `http://instance-neo:3002/admin/quizzes/[quizId]`:

- Verify each question row has a separate drag handle and the row body remains
  clickable for editing.
- Verify `dir="rtl"` inheritance does not mirror or drift the drag transform.
- Verify mouse drag moves a row vertically without horizontal jump.
- Verify touch activation waits for the 250ms hold / 5px tolerance.
- Verify keyboard path: Tab to handle, Space/Enter pick up, ArrowDown move,
  Space/Enter drop, Esc cancel.
- Verify reload preserves the new order after the save indicator reports saved.
