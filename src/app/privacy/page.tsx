import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";
import { privacy } from "@/content/legal";

export const metadata: Metadata = {
  title: "Privacy Policy · Light Dey?",
  description: privacy.description,
  alternates: { canonical: "/privacy" },
  openGraph: { title: "Privacy Policy · Light Dey?", description: privacy.description, type: "article" },
};

export default function PrivacyPage() {
  return <LegalPage doc={privacy} />;
}
