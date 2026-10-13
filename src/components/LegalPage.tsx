import Link from "next/link";
import type { Doc } from "@/content/legal";
import { appConfig } from "../../config/app.config";

// Turns the plain text in src/content/legal.ts into readable HTML: **bold**, "- " bullets, and clickable web addresses.
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|https?:\/\/[^\s)]+)/g).filter(Boolean);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("**")) return <strong key={i} className="font-semibold">{p.slice(2, -2)}</strong>;
        if (p.startsWith("http")) {
          const clean = p.replace(/[.,;]+$/, "");
          return <span key={i}><a href={clean} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2" style={{ color: "var(--on)" }}>{clean}</a>{p.slice(clean.length)}</span>;
        }
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

function Lines({ lines }: { lines: string[] }) {
  const out: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) {
      out.push(<ul key={`u${out.length}`} className="my-3 list-disc space-y-2 pl-5">{bullets.map((b, i) => <li key={i}><Inline text={b} /></li>)}</ul>);
      bullets = [];
    }
  };
  lines.forEach((l, i) => {
    if (l.startsWith("- ")) bullets.push(l.slice(2));
    else { flush(); out.push(<p key={`p${i}`} className="my-3"><Inline text={l} /></p>); }
  });
  flush();
  return <>{out}</>;
}

export default function LegalPage({ doc, updated = true }: { doc: Doc; updated?: boolean }) {
  return (
    <main className="mx-auto max-w-2xl px-5 pb-24 pt-5">
      <nav aria-label="Back" className="mb-6">
        <Link href="/" className="press panel inline-flex min-h-12 items-center gap-2 rounded-full px-4 text-[15px]">← Light Dey?</Link>
      </nav>

      <h1 className="text-[34px] font-light leading-tight tracking-tight">{doc.title}</h1>
      {updated && <p className="mt-1 text-sm text-muted">Version {appConfig.legal.version}</p>}

      {doc.summaryEn && (
        <section className="panel mt-6 rounded-3xl p-5" aria-label="Short version">
          <h2 className="text-[17px] font-medium">The short version</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px] leading-relaxed">
            {doc.summaryEn.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
          {doc.summaryPcm && (
            <details className="mt-4" lang="pcm">
              <summary className="cursor-pointer text-[15px] font-medium" style={{ color: "var(--on)" }}>Short version for Pidgin</summary>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px] leading-relaxed">
                {doc.summaryPcm.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </details>
          )}
        </section>
      )}

      {doc.blocks.length > 4 && (
        <nav aria-label="Contents" className="mt-6 text-[15px]">
          <ol className="space-y-1.5 text-muted">
            {doc.blocks.map((b) => <li key={b.id}><a href={`#${b.id}`} className="underline underline-offset-2">{b.heading}</a></li>)}
          </ol>
        </nav>
      )}

      <div className="mt-8 text-[16px] leading-relaxed">
        {doc.blocks.map((b) => (
          <section key={b.id} id={b.id} className="scroll-mt-6 border-t pt-6 first:border-t-0" style={{ borderColor: "var(--panel-border)" }}>
            <h2 className="mt-2 text-[22px] font-medium tracking-tight">{b.heading}</h2>
            <Lines lines={b.text} />
          </section>
        ))}
      </div>

      <footer className="mt-12 flex flex-wrap gap-x-5 gap-y-2 border-t pt-6 text-[15px]" style={{ borderColor: "var(--panel-border)" }}>
        <Link href="/about" className="underline underline-offset-2">How it works</Link>
        <Link href="/privacy" className="underline underline-offset-2">Privacy</Link>
        <Link href="/terms" className="underline underline-offset-2">Terms</Link>
        <Link href="/my-data" className="underline underline-offset-2">My data</Link>
      </footer>
    </main>
  );
}
