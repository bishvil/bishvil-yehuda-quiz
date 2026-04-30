import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bishvil Yehuda Quiz",
  description: "Live multiplayer quiz — baseline.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
