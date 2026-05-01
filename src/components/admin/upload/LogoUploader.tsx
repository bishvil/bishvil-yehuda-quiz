"use client";

import { AdminImageUploadControl } from "./upload-control";

interface LogoUploaderProps {
  value: string | null;
  onChange: (url: string | null) => void;
  disabled?: boolean;
}

const LOGO_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
] as const;

export function LogoUploader({ value, onChange, disabled }: LogoUploaderProps) {
  return (
    <AdminImageUploadControl
      value={value}
      onChange={onChange}
      endpoint="/api/admin/uploads/logo"
      title="לוגו ייעודי"
      help="גררו קובץ לכאן או לחצו לבחירה מהמחשב."
      buttonText="בחירת לוגו"
      replaceText="החלפת לוגו"
      removeText="הסרת לוגו"
      maxBytes={512 * 1024}
      allowedMimeTypes={LOGO_MIME_TYPES}
      allowedLabel="PNG, JPG, WEBP, SVG"
      previewAlt="תצוגה מקדימה של הלוגו"
      disabled={disabled}
    />
  );
}
