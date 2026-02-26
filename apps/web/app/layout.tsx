import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stanley for X",
  description: "Growth intelligence engine for X creators",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
