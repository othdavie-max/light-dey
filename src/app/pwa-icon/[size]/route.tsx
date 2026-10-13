import { renderIcon } from "@/lib/appIcon";

// /pwa-icon/192, /pwa-icon/512 and /pwa-icon/maskable: the icons listed in the web app manifest.
export function generateStaticParams() {
  return [{ size: "192" }, { size: "512" }, { size: "maskable" }];
}

export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  if (size === "maskable") return renderIcon(512, true);
  if (size === "192") return renderIcon(192);
  if (size === "512") return renderIcon(512);
  return new Response("Not found", { status: 404 });
}
