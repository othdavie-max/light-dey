import Link from "next/link";

export const metadata = { title: "Page not found · Light Dey?" };

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-5 text-center">
      <p className="text-[56px] font-light leading-none">404</p>
      <h1 className="mt-4 text-[22px] font-medium">We could not find that page</h1>
      <p className="mt-2 text-[15px] text-muted">E don miss road. The link may be old or mistyped.</p>
      <Link href="/" className="press panel mt-6 inline-flex min-h-12 items-center rounded-2xl px-6 text-[16px] font-medium">Go to home</Link>
      <Link href="/explore" className="press mt-2 inline-flex min-h-12 items-center px-6 text-[15px] text-muted underline">Find an area</Link>
    </main>
  );
}
