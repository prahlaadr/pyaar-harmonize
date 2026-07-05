import type { Metadata, Viewport } from "next";
import { Karma } from "next/font/google";
import Link from "next/link";
import "./globals.css";

// Karma — display serif (Google Fonts). No italic; emphasis is weight + color.
const karma = Karma({
  variable: "--font-karma",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

// General Sans — body sans (Fontshare CDN), loaded via <link> in <head>.

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e8dfc8" }, // Kasavu cream
    { media: "(prefers-color-scheme: dark)", color: "#3d3d3a" }, // Charcoal
  ],
};

// Default = light (Kasavu cream). Only go dark when the user explicitly chooses
// it. We ignore prefers-color-scheme so the brand register lands first.
const themeInitScript = `(function(){try{if(localStorage.getItem('theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}})();`;

export const metadata: Metadata = {
  metadataBase: new URL("https://harmonize.pyaarproject.org"),
  title: {
    default: "pyaar harmonize · healthcare data harmonization",
    template: "%s · pyaar harmonize",
  },
  description:
    "pyaar harmonize turns messy healthcare data into analytics-ready, standardized data. A growing suite of vocabulary and data-quality harmonizers, starting with drug-name normalization via RxNorm.",
  applicationName: "pyaar harmonize",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${karma.variable} h-full antialiased`}
      style={{ ["--font-general" as string]: '"General Sans", system-ui, sans-serif' }}
      suppressHydrationWarning
    >
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=general-sans@300,400,500,600,700&display=swap"
        />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <header className="border-b border-border">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 md:px-8">
            <Link href="/" className="flex items-baseline gap-2">
              <span className="font-serif-display text-xl lowercase text-foreground">
                pyaar <span className="text-accent">harmonize</span>
              </span>
            </Link>
            <nav className="flex items-center gap-5 text-sm text-secondary">
              <Link href="/drug-names" className="hover:text-foreground transition-colors">
                Drug names
              </Link>
              <a
                href="https://pyaarproject.org"
                className="hover:text-foreground transition-colors"
              >
                pyaar project ↗
              </a>
            </nav>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-border px-4 py-8 md:px-8">
          <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 text-sm text-muted sm:flex-row">
            <p>
              pyaar harmonize · a{" "}
              <a
                href="https://pyaarproject.org"
                className="hover:text-foreground transition-colors"
              >
                pyaar project
              </a>{" "}
              tool
            </p>
            <p className="text-xs">
              Built on open healthcare standards · working toward the{" "}
              <a
                href="https://thetuvaproject.com"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors"
              >
                Tuva Project
              </a>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
