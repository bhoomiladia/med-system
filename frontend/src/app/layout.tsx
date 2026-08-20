import type { Metadata } from "next";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "MedSavings — Prescription Savings Platform",
  description:
    "Upload your prescription and discover how much you can save by switching to equivalent generic medicines. Verified compositions, real prices, transparent sources.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-[#F8FAFB] text-slate-800 antialiased font-[Inter,system-ui,sans-serif]">
        {/* Navigation */}
        <nav className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <a href="/" className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-700 shadow-sm">
                <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </div>
              <span className="text-lg font-bold text-teal-800">
                MedSavings
              </span>
            </a>
            <div className="flex items-center gap-6 text-sm">
              <a
                href="/"
                className="text-slate-500 hover:text-teal-700 transition-colors font-medium"
              >
                Upload
              </a>
              <a
                href="/history"
                className="text-slate-500 hover:text-teal-700 transition-colors font-medium"
              >
                History
              </a>
              <a
                href="/analytics"
                className="text-teal-700 bg-teal-50 px-3 py-1.5 rounded-lg border border-teal-200 hover:bg-teal-100 transition-colors font-semibold flex items-center gap-1.5"
              >
                <span className="h-2 w-2 rounded-full bg-teal-600 animate-pulse"></span>
                ML & Clustering
              </a>
              <a
                href="/sources"
                className="text-slate-500 hover:text-teal-700 transition-colors font-medium"
              >
                Data Sources
              </a>
            </div>
          </div>
        </nav>

        <main className="mx-auto max-w-6xl px-6 py-8">
          {children}
        </main>

        {/* Medical Disclaimer Footer */}
        <footer className="border-t border-slate-200 bg-white mt-12">
          <div className="mx-auto max-w-6xl px-6 py-6">
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 mb-6">
              <p className="text-xs text-amber-700 font-medium mb-1">Medical Disclaimer</p>
              <p className="text-xs text-slate-600 leading-relaxed">
                This is a price comparison tool, not medical advice. Generic substitution should always be confirmed
                with a licensed healthcare professional, especially for combination medicines and prescription drugs.
                Prices shown are estimates based on available data and may vary.
              </p>
            </div>
            <p className="text-center text-xs text-slate-400">
              © {new Date().getFullYear()} MedSavings — For informational purposes only
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
