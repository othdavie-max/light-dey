import AdminClient from "@/components/AdminClient";

// Not for the public: kept out of search engines. Access is enforced on the server (see /api/admin).
export const metadata = { title: "Admin · Light Dey?", robots: { index: false, follow: false } };

export default function AdminPage() {
  return <AdminClient />;
}
