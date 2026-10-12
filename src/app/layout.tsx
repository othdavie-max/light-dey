import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// One variable font, so thin (300) through bold (800) cost a single download.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "Light Dey?",
  description: "Tell your neighbours. Two taps to report if light dey or not.",
};
export const viewport: Viewport = { themeColor: "#060a14", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body data-status="unknown" className="min-h-dvh">{children}</body>
    </html>
  );
}
