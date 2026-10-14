import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import InviteCapture from "@/components/InviteCapture";
import ErrorReporter from "@/components/ErrorReporter";
import { appConfig } from "../../config/app.config";

// One variable font, so thin (300) through bold (800) cost a single download.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? appConfig.siteUrl),
  title: "Light Dey?",
  description: "Tell your neighbours. Two taps to report if light dey or not.",
  applicationName: "Light Dey?",
  appleWebApp: { capable: true, title: "Light Dey?", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  openGraph: { siteName: "Light Dey?", type: "website", title: "Light Dey?", description: "Is there light in your area? Tell your neighbours.", images: [{ url: "/api/card?lang=en", width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image" },
};
export const viewport: Viewport = { themeColor: "#060a14", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        {/* Apply the saved theme before the first paint so there is no dark/light flash. */}
        <script dangerouslySetInnerHTML={{ __html: "try{document.documentElement.dataset.theme=localStorage.getItem('ld_theme')||'dark'}catch(e){}" }} />
      </head>
      <body data-status="unknown" className="min-h-dvh">
        {children}
        <ServiceWorkerRegister />
        <InviteCapture />
        <ErrorReporter />
      </body>
    </html>
  );
}
