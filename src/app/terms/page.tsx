import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";
import { terms } from "@/content/legal";

export const metadata: Metadata = {
  title: "Terms of Use · Light Dey?",
  description: terms.description,
  alternates: { canonical: "/terms" },
  openGraph: { title: "Terms of Use · Light Dey?", description: terms.description, type: "article" },
};

export default function TermsPage() {
  return <LegalPage doc={terms} />;
}
