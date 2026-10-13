import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import AreaPageClient from "@/components/AreaPageClient";
import { getPublicArea } from "@/lib/publicData";
import { previewMetadata } from "@/lib/previewMeta";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const n = Number(id);
  const area = Number.isInteger(n) && n > 0 ? await getPublicArea(n) : null;
  if (!area) return { title: "Light Dey?" };
  return previewMetadata(
    `Is there light in ${area.name}?`,
    `Live light status and hours of supply for ${area.name}${area.city ? `, ${area.city}` : ""} on Light Dey?`,
    `area=${n}&lang=en`,
    `/area/${n}`,
  );
}

export default function AreaPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={null}>
      <Inner params={params} />
    </Suspense>
  );
}

async function Inner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n) || n < 1) notFound();
  return <AreaPageClient id={n} />;
}
