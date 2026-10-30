import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Schibsted_Grotesk, Young_Serif } from "next/font/google";
import "./globals.css";

const display = Young_Serif({ weight: "400", subsets: ["latin"], variable: "--f-display" });
const ui = Schibsted_Grotesk({ subsets: ["latin"], variable: "--f-ui" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--f-mono" });

export const metadata: Metadata = { title: "Abita", description: "Progetti di case in pianta e in 3D, disegnati con Claude", robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function Radice({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className={`${display.variable} ${ui.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
