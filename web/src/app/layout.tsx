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

export const metadata: Metadata = {
  title: "CultBot — Developer productivity, gamified",
  description:
    "A Discord bot that turns your server into a developer productivity system: todos, goals, focus sessions, habits, streaks, XP and leaderboards.",
  icons: { icon: "/cultbot-icon.svg" },
  openGraph: {
    title: "CultBot — Developer productivity, gamified",
    description:
      "Todos, goals, focus sessions and habits — tracked with streaks, XP and leaderboards, all inside Discord.",
    images: ["/cultbot-wordmark.png"],
  },
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
