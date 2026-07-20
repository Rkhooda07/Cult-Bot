import type { Metadata } from "next";
import { Bricolage_Grotesque, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

/**
 * Three roles, three faces. Bricolage carries headlines only — it has enough
 * character that using it for body copy would be exhausting. Inter stays
 * plain and quiet underneath it, and JetBrains Mono marks anything the user
 * would actually type.
 */
const display = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

/**
 * Absolute base for OG/Twitter image URLs — crawlers reject relative ones.
 *
 * Resolution order needs no configuration on Vercel: it reads the production
 * domain Vercel injects at build time. NEXT_PUBLIC_SITE_URL overrides it once
 * a custom domain is attached; the localhost value is only ever the local
 * dev fallback.
 */
// `||`, not `??` — an env var declared but left blank is an empty string, not
// undefined, and `new URL("")` throws at build time.
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

const TITLE = "CultBot — Developer productivity, gamified";
const DESCRIPTION =
  "A Discord bot that turns your server into a developer productivity system: todos, goals, focus sessions, habits, streaks, XP and guild leaderboards.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "Discord bot",
    "developer productivity",
    "pomodoro",
    "habit tracker",
    "GitHub streaks",
    "LeetCode",
    "gamification",
  ],
  // Icons and the OG image come from the app/ file conventions:
  // icon.svg, apple-icon.png, opengraph-image.png.
  openGraph: {
    type: "website",
    siteName: "CultBot",
    url: SITE_URL,
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    // Twitter falls back to og:image, so opengraph-image.png covers both.
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
