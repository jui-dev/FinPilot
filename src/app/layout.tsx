import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, Noto_Sans_Bengali } from "next/font/google";
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

export const metadata: Metadata = {
  title: { default: "FinPilot", template: "%s · FinPilot" },
  description:
    "Personal finance: where your money stands, why it changed, and what is actually free.",
};

export const viewport: Viewport = {
  themeColor: "#f6f4f1",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en-BD" className={`${hanken.variable} ${bengali.variable}`}>
      <body>{children}</body>
    </html>
  );
}
