import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://arvex.live";
const ICON_V = "3"; // bump when icons change to bust caches

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "ARVEX Helping Plan — BSC Mainnet USDT",
  description:
    "ARVEX Helping Plan on BNB Smart Chain — $5 USDT join, global 4×6 matrix, directs, virtual IDs, and monthly royalty.",
  applicationName: "ARVEX",
  icons: {
    icon: [
      { url: `/favicon.ico?v=${ICON_V}`, sizes: "any" },
      { url: `/favicon-16x16.png?v=${ICON_V}`, sizes: "16x16", type: "image/png" },
      { url: `/favicon-32x32.png?v=${ICON_V}`, sizes: "32x32", type: "image/png" },
      { url: `/favicon.png?v=${ICON_V}`, sizes: "48x48", type: "image/png" },
      { url: `/icon-192.png?v=${ICON_V}`, sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: `/apple-icon.png?v=${ICON_V}`, sizes: "180x180", type: "image/png" }],
    shortcut: `/favicon.ico?v=${ICON_V}`,
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: "ARVEX Helping Plan",
    title: "ARVEX Helping Plan",
    description:
      "Together We Help, Together We Grow — $5 USDT join on BNB Smart Chain.",
    images: [
      {
        url: `/og-image.png?v=${ICON_V}`,
        width: 1200,
        height: 630,
        alt: "ARVEX Smart Contract",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ARVEX Helping Plan",
    description:
      "Together We Help, Together We Grow — $5 USDT join on BNB Smart Chain.",
    images: [`/og-image.png?v=${ICON_V}`],
  },
};

export const viewport: Viewport = {
  themeColor: "#070f0b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
