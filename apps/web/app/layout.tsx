import type { Metadata } from "next";
import "./globals.css";
import { APP_DESCRIPTION, APP_NAME, resolveMetadataBase } from "@/lib/seo";
import { Providers } from "@/components/providers";

const FAVICON_VERSION = "20260304-1";

export const metadata: Metadata = {
  metadataBase: resolveMetadataBase(),
  title: {
    default: APP_NAME,
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
  icons: {
    icon: `/xpo-logo.ico?v=${FAVICON_VERSION}`,
    shortcut: `/xpo-logo.ico?v=${FAVICON_VERSION}`,
    apple: `/xpo-logo.ico?v=${FAVICON_VERSION}`,
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
    title: APP_NAME,
    description: APP_DESCRIPTION,
    url: "/",
    images: [
      {
        url: "/xpo-logo.svg",
        alt: "Stanley for X logo",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: APP_NAME,
    description: APP_DESCRIPTION,
    images: ["/xpo-logo.svg"],
  },
};

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
