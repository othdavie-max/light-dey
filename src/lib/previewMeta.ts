import type { Metadata } from "next";

/** Title, description and picture for a link preview (WhatsApp, X, Facebook, Telegram…). */
export function previewMetadata(title: string, description: string, cardQuery: string, path: string): Metadata {
  const image = { url: `/api/card?${cardQuery}`, width: 1200, height: 630, alt: title };
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path, siteName: "Light Dey?", type: "website", images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}
