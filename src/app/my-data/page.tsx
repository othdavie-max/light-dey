import MyDataClient from "@/components/MyDataClient";

// A private page for the person using this phone: no reason for search engines to list it.
export const metadata = { title: "My data · Light Dey?", robots: { index: false, follow: false } };

export default function MyDataPage() {
  return <MyDataClient />;
}
