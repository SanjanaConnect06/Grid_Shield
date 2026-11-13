import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Providers } from "@/components/providers";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "GRID SHIELD – Cyber Secure Smart Grid",
  description: "AI-powered smart-grid cybersecurity platform: detect the attack, locate the threat, protect the grid.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

// Applied before hydration so the saved theme never flashes. Dark is the default.
const themeScript = `try{var t=localStorage.getItem('gridshield-theme');document.documentElement.classList.toggle('dark',t!=='light');}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-app text-fg antialiased">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
