import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stanley for X",
  description: "Growth intelligence engine for X creators",
};

import { Providers } from "@/components/providers";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
