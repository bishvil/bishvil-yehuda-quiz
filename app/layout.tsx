import type { Metadata } from "next";
import { Heebo, Suez_One } from "next/font/google";

import "./globals.css";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  weight: ["300", "400", "500", "700", "800", "900"],
  variable: "--font-heebo",
  display: "swap",
});

const suezOne = Suez_One({
  subsets: ["hebrew", "latin"],
  weight: "400",
  variable: "--font-suez",
  display: "swap",
});

export const metadata: Metadata = {
  title: "בשביל יהודה — חידון",
  description: "חידון אינטראקטיבי לפעילות מורשת בשטח",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="he"
      dir="rtl"
      className={`${heebo.variable} ${suezOne.variable}`}
    >
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
