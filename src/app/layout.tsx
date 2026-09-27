import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, Noto_Sans_Bengali, Source_Serif_4 } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-hanken",
});

// Only the Bengali block (for ৳, U+09F3) is ever requested from this face.
const bengali = Noto_Sans_Bengali({
  subsets: ["bengali"],
  display: "swap",
  variable: "--font-bengali",
});

// The wordmark's face; nothing else is set in it.
const serif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["700"],
  display: "swap",
  variable: "--font-serif",
});

export const metadata: Metadata = {
  title: { default: "FinPilot", template: "%s · FinPilot" },
  description:
    "Personal finance: where your money stands, why it changed, and what is actually free.",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en-BD" className={`${hanken.variable} ${bengali.variable} ${serif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
