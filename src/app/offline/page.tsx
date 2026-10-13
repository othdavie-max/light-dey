import OfflineNotice from "@/components/OfflineNotice";

export const metadata = { title: "No network · Light Dey?" };

// Shown by the service worker when a page was never saved and there is no network.
export default function OfflinePage() {
  return <OfflineNotice />;
}
