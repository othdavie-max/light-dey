import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";
import { about } from "@/content/legal";

export const metadata: Metadata = {
  title: "How Light Dey? works",
  description: about.description,
  alternates: { canonical: "/about" },
  openGraph: { title: "How Light Dey? works", description: about.description, type: "article" },
};

export default function AboutPage() {
  return <LegalPage doc={about} updated={false} />;
}
