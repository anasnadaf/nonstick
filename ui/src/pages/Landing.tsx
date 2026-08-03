import { useState } from "react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";

import { ThemeToggle } from "@/components/ThemeProvider";
import Wordmark from "@/components/Wordmark";
import HeroCanvas from "@/components/three/HeroCanvas";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const REPO = "https://github.com/anasnadaf/nonstick";

const PIPELINE = [
  {
    n: "01",
    title: "Guardrails",
    body: "Injection heuristics and size limits run before a single token is spent.",
  },
  {
    n: "02",
    title: "Semantic cache",
    body: "A near-identical question short-circuits here and never reaches the model.",
    aside: "hit → cached answer",
  },
  {
    n: "03",
    title: "Agent loop",
    body: "LangGraph binds search_documents, tavily_search, and whatever MCP servers you declared in mcp_servers.json.",
  },
  {
    n: "04",
    title: "Citations",
    body: "Every [n] resolves back to the exact chunk it was drawn from — page number included.",
  },
  {
    n: "05",
    title: "Scrub & stream",
    body: "Credentials redacted, answer cached, tokens streamed to the client over SSE.",
  },
];

const STACK: [string, string][] = [
  ["API", "FastAPI · SSE streaming chat"],
  ["Agent", "LangGraph tool-calling loop"],
  ["Model", "LiteLLM Router → Bedrock, OpenAI, Gemini"],
  ["Vectors", "pgvector, with a FAISS fallback for zero-infra local mode"],
  ["Isolation", "every chunk scoped to (user_id, notebook_id)"],
  ["Observability", "MLflow GenAI tracing · Prometheus metrics"],
];

const DEMO_CITATIONS = [
  {
    ref: 1,
    filename: "hnsw-indexes.pdf",
    page: 4,
    snippet:
      "Hierarchical navigable small world graphs trade a bounded loss of recall for a large constant-factor speedup over exhaustive search.",
  },
  {
    ref: 2,
    filename: "pgvector-notes.md",
    page: null,
    snippet:
      "Setting ivfflat.probes higher recovers recall at the cost of latency; the default of 1 is rarely what you want in production.",
  },
];

function SectionLabel({ n, children }: { n: string; children: string }) {
  return (
    <div className="mb-8 flex items-baseline gap-3 border-b border-rule pb-3">
      <span className="label text-copper">{n}</span>
      <span className="label">{children}</span>
    </div>
  );
}

/** The [n] chip demo, wired for real so the interaction sells itself. */
function CitationDemo() {
  const [active, setActive] = useState<number | null>(null);

  return (
    <div className="grid gap-8 lg:grid-cols-12">
      <div className="lg:col-span-7">
        <p className="text-[15px] leading-[1.75] text-foreground">
          Approximate nearest-neighbour search is what keeps retrieval fast as a
          notebook grows. HNSW graphs give up a small, bounded amount of recall
          in exchange for a large constant-factor speedup{" "}
          <button
            type="button"
            className="cite-chip"
            data-active={active === 1}
            onMouseEnter={() => setActive(1)}
            onMouseLeave={() => setActive(null)}
            onClick={() => setActive(active === 1 ? null : 1)}
          >
            1
          </button>
          . On pgvector specifically, the default probe count is conservative —
          raising it trades latency back for recall{" "}
          <button
            type="button"
            className="cite-chip"
            data-active={active === 2}
            onMouseEnter={() => setActive(2)}
            onMouseLeave={() => setActive(null)}
            onClick={() => setActive(active === 2 ? null : 2)}
          >
            2
          </button>
          .
        </p>
        <p className="label mt-5">Hover a marker →</p>
      </div>

      <div className="flex flex-col gap-3 lg:col-span-5">
        {DEMO_CITATIONS.map((c) => (
          <figure
            key={c.ref}
            className={cn(
              "border-l-2 py-1 pl-4 transition-colors duration-200",
              active === c.ref
                ? "border-copper"
                : "border-rule-strong opacity-60",
            )}
          >
            <figcaption className="label mb-1.5 flex items-center gap-2">
              <span className="text-copper">[{c.ref}]</span>
              <span className="truncate normal-case tracking-normal">
                {c.filename}
              </span>
              {c.page && <span className="tnum">p.{c.page}</span>}
            </figcaption>
            <blockquote className="text-[13px] leading-relaxed text-ink-muted">
              {c.snippet}
            </blockquote>
          </figure>
        ))}
      </div>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="grain relative min-h-full overflow-x-hidden">
      <header className="relative z-10 flex items-center gap-5 border-b border-rule px-5 py-3 sm:px-8">
        <Wordmark />
        <span className="flex-1" />
        <a
          href={REPO}
          target="_blank"
          rel="noreferrer"
          className="label transition-colors hover:text-copper-deep"
        >
          Source
        </a>
        <ThemeToggle />
        <Link
          to="/notebooks"
          className="label transition-colors hover:text-copper-deep"
        >
          Notebooks
        </Link>
      </header>

      {/* ---------------------------------------------------------- hero */}
      <section className="relative border-b border-rule">
        {/* Bleeds off the right edge; sits behind the type on small screens. */}
        <div className="pointer-events-none absolute inset-y-0 right-0 w-full opacity-40 lg:w-[58%] lg:opacity-100">
          <HeroCanvas interactive />
        </div>

        <div className="relative mx-auto grid max-w-[1180px] grid-cols-12 px-5 py-20 sm:px-8 lg:py-32">
          <div className="col-span-12 lg:col-span-7">
            <p className="label mb-6 flex items-center gap-3">
              <span className="inline-block h-px w-8 bg-copper" />
              Agentic RAG, cited by construction
            </p>

            <h1 className="text-display max-w-[11ch] font-display font-semibold text-balance">
              Research that answers back.
            </h1>

            <p className="mt-8 max-w-[46ch] text-[17px] leading-[1.65] text-ink-muted">
              Upload your corpus into a notebook. Ask in plain language. Every
              claim comes back carrying a citation you can open — down to the
              page it was pulled from.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Button size="lg" asChild>
                <Link to="/notebooks">
                  Start reading <ArrowRight />
                </Link>
              </Button>
              <Button variant="link" size="lg" asChild>
                <a href={REPO} target="_blank" rel="noreferrer">
                  Read the source <ArrowUpRight />
                </a>
              </Button>
            </div>
          </div>
        </div>

        {/* Colophon strip — the masthead metadata of a print issue. */}
        <div className="relative mx-auto flex max-w-[1180px] flex-wrap gap-x-10 gap-y-2 border-t border-rule px-5 py-4 sm:px-8">
          {[
            ["Edition", "v2.0"],
            ["Retrieval", "pgvector"],
            ["Agent", "LangGraph"],
            ["Provider", "any, via LiteLLM"],
          ].map(([k, v]) => (
            <div key={k} className="flex items-baseline gap-2">
              <span className="label">{k}</span>
              <span className="font-mono text-[11px] text-foreground">{v}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------ pipeline */}
      <section className="border-b border-rule px-5 py-20 sm:px-8 lg:py-28">
        <div className="mx-auto max-w-[1180px]">
          <SectionLabel n="01">What happens to a question</SectionLabel>

          <ol className="grid gap-px bg-rule sm:grid-cols-2 lg:grid-cols-5">
            {PIPELINE.map((step) => (
              <li key={step.n} className="bg-background p-6">
                <span className="label tnum text-copper">{step.n}</span>
                <h3 className="mt-3 mb-2 font-display text-lg font-semibold">
                  {step.title}
                </h3>
                <p className="text-[13px] leading-relaxed text-ink-muted">
                  {step.body}
                </p>
                {step.aside && (
                  <p className="label mt-3 border-t border-rule pt-3 text-copper">
                    {step.aside}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ------------------------------------------------------ citations */}
      <section className="border-b border-rule px-5 py-20 sm:px-8 lg:py-28">
        <div className="mx-auto max-w-[1180px]">
          <SectionLabel n="02">Cited by construction</SectionLabel>
          <CitationDemo />
        </div>
      </section>

      {/* ---------------------------------------------------------- stack */}
      <section className="border-b border-rule px-5 py-20 sm:px-8 lg:py-28">
        <div className="mx-auto max-w-[1180px]">
          <SectionLabel n="03">Built on</SectionLabel>

          <dl className="max-w-[760px]">
            {STACK.map(([k, v]) => (
              <div
                key={k}
                className="flex flex-col gap-1 border-b border-rule py-4 sm:flex-row sm:items-baseline sm:gap-8"
              >
                <dt className="label shrink-0 sm:w-40">{k}</dt>
                <dd className="text-[14px] leading-relaxed text-foreground">
                  {v}
                </dd>
              </div>
            ))}
          </dl>

          <p className="mt-8 max-w-[52ch] text-[13px] leading-relaxed text-ink-muted">
            The model strings alone decide the provider, so moving from OpenAI to
            Bedrock is a change to two environment variables — not a change to
            any code.
          </p>
        </div>
      </section>

      {/* --------------------------------------------------------- footer */}
      <footer className="px-5 py-12 sm:px-8">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-baseline justify-between gap-4">
          <Wordmark />
          <p className="label max-w-[42ch]">
            A modernised rebuild of the 2024 original — Flask, LangChain,
            GPT-3.5, FAISS
          </p>
          <a
            href={REPO}
            target="_blank"
            rel="noreferrer"
            className="label transition-colors hover:text-copper-deep"
          >
            github ↗
          </a>
        </div>
      </footer>
    </div>
  );
}
