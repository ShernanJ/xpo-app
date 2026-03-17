import type { Metadata } from "next";
import "./globals.css";
import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE, resolveMetadataBase } from "@/lib/seo";
import { Providers } from "@/components/providers";
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";

const inter = Inter({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  metadataBase: resolveMetadataBase(),
  title: {
    default: `${APP_NAME} | ${APP_TAGLINE}`,
    template: `%s | ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  keywords: [
    "X growth",
    "twitter growth",
    "creator analytics",
    "content strategy",
    "audience growth",
    "social media intelligence",
  ],
  alternates: {
    canonical: "/",
  },
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: APP_NAME,
    title: `${APP_NAME} | ${APP_TAGLINE}`,
    description: APP_DESCRIPTION,
    url: "/",
    images: [
      {
        url: "/og-image.png",
        alt: "Xpo Open Graph image",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: `${APP_NAME} | ${APP_TAGLINE}`,
    description: APP_DESCRIPTION,
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("font-sans", inter.variable)}>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
