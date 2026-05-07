import { Suspense } from "react";

import UpdatePasswordForm from "./update-password-form";

export default function UpdatePasswordPage() {
  return (
    <div
      dir="rtl"
      className="flex min-h-screen items-center justify-center px-5 py-12"
      style={{ background: "var(--bsy-paper)" }}
    >
      <div
        className="w-full"
        style={{
          maxWidth: "440px",
          background: "var(--color-bg-elevated)",
          borderRadius: "var(--radius-xl)",
          boxShadow: "var(--shadow-lg)",
          padding: "clamp(1.5rem, 5vw, 2.5rem)",
          border: "1px solid var(--bsy-stone-100)",
        }}
      >
        <h1
          className="font-display mb-4"
          style={{
            fontSize: "clamp(1.4rem, 4.5vw, 1.75rem)",
            color: "var(--bsy-brown)",
            textAlign: "center",
          }}
        >
          עדכון סיסמה
        </h1>
        <Suspense
          fallback={
            <p style={{ textAlign: "center", color: "var(--bsy-stone-700)" }}>
              טוען…
            </p>
          }
        >
          <UpdatePasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
