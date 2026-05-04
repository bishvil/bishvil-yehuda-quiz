"use client";

import { AdminImageUploadControl } from "./upload-control";

interface QuestionImageMeta {
  path?: string;
  width?: number;
  height?: number;
}

interface QuestionImageUploaderProps {
  value: string | null;
  onChange: (url: string | null, meta?: QuestionImageMeta) => void;
  disabled?: boolean;
}

const QUESTION_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

const QUESTION_IMAGE_OPTIMIZER = {
  maxBytes: 2 * 1024 * 1024,
  maxLongSide: 2400,
} as const;

export function QuestionImageUploader({
  value,
  onChange,
  disabled,
}: QuestionImageUploaderProps) {
  return (
    <AdminImageUploadControl
      value={value}
      onChange={onChange}
      endpoint="/api/admin/uploads/question-image"
      title="תמונת שאלה"
      help="גררו תמונה לכאן או לחצו לבחירה מהמחשב."
      buttonText="בחירת תמונה"
      replaceText="החלפת תמונה"
      removeText="הסרת תמונה"
      externalUrlLabel="שימוש בכתובת חיצונית"
      externalUrlPlaceholder="https://.../photo.jpg"
      maxBytes={2 * 1024 * 1024}
      allowedMimeTypes={QUESTION_IMAGE_MIME_TYPES}
      allowedLabel="PNG, JPG, WEBP"
      previewAlt="תצוגה מקדימה של תמונת השאלה"
      disabled={disabled}
      optimizer={QUESTION_IMAGE_OPTIMIZER}
    />
  );
}
