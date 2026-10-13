import { renderIcon } from "@/lib/appIcon";

// The small icon browsers show in tabs.
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return renderIcon(64);
}
