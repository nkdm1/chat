import type { Metadata } from "next";
import { Geist_Mono, Inter_Tight } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { Providers } from "./providers";

const interTight = Inter_Tight({
  variable: "--font-inter-tight",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "chat", template: "%s · chat" },
  description: "Online chat with friends.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Reading the request makes every page dynamic, which the per-request CSP
  // nonce (set in proxy.ts) requires: Next adds it to its own scripts.
  await headers();
  return (
    <html lang="en" className={`${interTight.variable} ${geistMono.variable}`}>
      <body className="min-h-dvh">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
