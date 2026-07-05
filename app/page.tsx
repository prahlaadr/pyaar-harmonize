import Link from "next/link";

type Tool = {
  name: string;
  standard: string;
  blurb: string;
  href?: string;
  status: "live" | "soon";
};

// Tiles map to the Tuva Project's vocabulary-normalization + data-quality
// surface. Drug names (RxNorm) is live; the rest trace Tuva's code systems.
const TOOLS: Tool[] = [
  {
    name: "Drug Name Normalization",
    standard: "RxNorm",
    blurb:
      "Map brand names, abbreviations, and misspellings to a single generic ingredient and RxCUI. Upload a CSV, get a standardized column back.",
    href: "/drug-names",
    status: "live",
  },
  {
    name: "NDC Crosswalk",
    standard: "NDC → RxNorm",
    blurb: "Resolve raw National Drug Codes to ingredients and RxCUIs for claims and pharmacy data.",
    status: "soon",
  },
  {
    name: "Diagnosis Normalization",
    standard: "ICD-10-CM",
    blurb: "Clean and validate diagnosis codes, map descriptions to codes, and bridge legacy ICD-9.",
    status: "soon",
  },
  {
    name: "Procedure Codes",
    standard: "CPT · HCPCS",
    blurb: "Standardize procedure and service codes across claims sources into one vocabulary.",
    status: "soon",
  },
  {
    name: "Lab Harmonization",
    standard: "LOINC",
    blurb: "Align lab result names and units to LOINC so results are comparable across systems.",
    status: "soon",
  },
  {
    name: "Clinical Terms",
    standard: "SNOMED CT",
    blurb: "Normalize clinical concepts and conditions to SNOMED for downstream analytics.",
    status: "soon",
  },
  {
    name: "Provider Identity",
    standard: "NPI · Taxonomy",
    blurb: "Resolve provider identifiers and taxonomy codes into clean, deduplicated entities.",
    status: "soon",
  },
  {
    name: "Data Quality Checks",
    standard: "Tuva-style",
    blurb: "Profile input data for completeness, conformance, and plausibility before it hits your model.",
    status: "soon",
  },
];

const PIPELINE = [
  "Raw data",
  "Data quality",
  "Vocabulary normalization",
  "Core data model",
  "Data marts",
];

export default function Home() {
  return (
    <div className="px-4 md:px-8">
      {/* Hero */}
      <section className="mx-auto max-w-3xl pt-16 pb-14 md:pt-24">
        <span className="text-xs font-medium uppercase tracking-[0.25em] text-accent">
          Healthcare data harmonization
        </span>
        <h1 className="font-serif-display mt-5 text-4xl leading-[1.05] text-foreground md:text-6xl">
          Turn messy healthcare data into <em>analytics-ready</em> data.
        </h1>
        <p className="mt-6 max-w-2xl text-base leading-relaxed text-secondary md:text-lg">
          pyaar harmonize is a growing suite of harmonizers that standardize the
          vocabularies healthcare data is built on, RxNorm, ICD-10, CPT, LOINC,
          SNOMED, and more. It starts where the mess usually does: drug names.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/drug-names"
            className="focus-ring inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-accent px-6 py-3 text-sm font-medium uppercase tracking-wider text-accent-foreground transition-colors hover:opacity-90"
          >
            Try drug-name normalization →
          </Link>
          <a
            href="https://thetuvaproject.com"
            target="_blank"
            rel="noopener noreferrer"
            className="focus-ring inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-border px-6 py-3 text-sm font-medium uppercase tracking-wider text-foreground transition-colors hover:bg-foreground/5"
          >
            About the Tuva Project ↗
          </a>
        </div>
      </section>

      {/* Tuva alignment */}
      <section className="mx-auto max-w-3xl border-t border-border py-12">
        <div className="rounded-xl border border-border bg-surface p-6 md:p-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
            Built to plug into the Tuva Project
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-secondary md:text-base">
            The open-source{" "}
            <a
              href="https://thetuvaproject.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
            >
              Tuva Project
            </a>{" "}
            turns raw claims and clinical data into a common data model through
            data quality, vocabulary normalization, and analytics-ready data
            marts. pyaar harmonize builds the same normalization primitives as
            small, browser-first tools, aligned with Tuva&apos;s vocabularies and
            data-quality principles. The goal: to become a{" "}
            <em>trusted partner in the Tuva ecosystem</em>.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-2 text-xs text-muted">
            {PIPELINE.map((step, i) => (
              <span key={step} className="flex items-center gap-2">
                <span
                  className={
                    step === "Vocabulary normalization"
                      ? "rounded border border-accent px-2 py-1 font-medium text-accent"
                      : "rounded border border-border px-2 py-1"
                  }
                >
                  {step}
                </span>
                {i < PIPELINE.length - 1 && <span className="text-border">→</span>}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Tools grid */}
      <section className="mx-auto max-w-5xl border-t border-border py-14">
        <h2 className="font-serif-display text-2xl text-foreground md:text-3xl">
          The harmonizers
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-secondary md:text-base">
          One tool per vocabulary. Drug names is live now, the rest are on the way.
        </p>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map((tool) => {
            const inner = (
              <>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-muted">
                    {tool.standard}
                  </span>
                  {tool.status === "live" ? (
                    <span className="rounded-full bg-accent-secondary/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-green">
                      Live
                    </span>
                  ) : (
                    <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted">
                      Coming soon
                    </span>
                  )}
                </div>
                <h3 className="mt-3 text-lg font-semibold text-foreground">{tool.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-secondary">{tool.blurb}</p>
                {tool.status === "live" && (
                  <span className="mt-4 inline-block text-sm font-medium text-accent">
                    Open tool →
                  </span>
                )}
              </>
            );

            return tool.href ? (
              <Link
                key={tool.name}
                href={tool.href}
                className="focus-ring group rounded-xl border border-accent bg-surface p-5 transition-colors hover:bg-surface-alt"
              >
                {inner}
              </Link>
            ) : (
              <div
                key={tool.name}
                className="rounded-xl border border-border p-5 opacity-75"
              >
                {inner}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
