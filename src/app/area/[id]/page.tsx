import { Suspense } from "react";
import { notFound } from "next/navigation";
import AreaPageClient from "@/components/AreaPageClient";

export const metadata = { title: "Light Dey?" };

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
