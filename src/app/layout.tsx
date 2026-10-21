import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Domain2Revenue AI", template: "%s · Domain2Revenue AI" },
  description: "Domain, website and growth opportunities backed by evidence.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
