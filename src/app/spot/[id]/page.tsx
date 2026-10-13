import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import SpotPageClient from "@/components/SpotPageClient";
import { getPublicSpot } from "@/lib/publicData";
import { previewMetadata } from "@/lib/previewMeta";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const spot = UUID.test(id) ? await getPublicSpot(id) : null;
  if (!spot) return { title: "Light Dey?" };
  return previewMetadata(
    `Is there light in ${spot.name}?`,
    `See the live light status for ${spot.name}${spot.city ? `, ${spot.city}` : ""} on Light Dey? Reported by neighbours, updated all day.`,
    `spot=${id}&lang=en`,
    `/spot/${id}`,
  );
}

export default function SpotPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={null}>
      <Inner params={params} />
    </Suspense>
  );
}

async function Inner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  return <SpotPageClient id={id} />;
}
