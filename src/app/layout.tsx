import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomPlayer } from "@/components/layout/BottomPlayer";
import { Providers } from "@/components/providers/Providers";

export const metadata: Metadata = {
  title: "MelodyMix",
  description: "Hybrid Music Streaming Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex h-screen bg-background overflow-hidden selection:bg-accent selection:text-white">
        <Providers>
          <Sidebar />
          <main className="flex-1 relative overflow-y-auto pb-28 pt-16 md:pb-32 md:pt-0 scrollbar-themed">
            {children}
          </main>
          <BottomPlayer />
        </Providers>
      </body>
    </html>
  );
}
