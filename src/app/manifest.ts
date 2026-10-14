import type { MetadataRoute } from "next";

// What makes the app installable ("Add to Home Screen") and how it looks once installed.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Light Dey?",
    short_name: "Light Dey?",
    description: "Is there light in your area? Report in two taps and tell your neighbours.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#060a14",
    theme_color: "#060a14",
    lang: "en",
    categories: ["utilities", "lifestyle"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
