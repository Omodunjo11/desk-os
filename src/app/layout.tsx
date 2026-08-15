import type { Metadata } from "next";
import { Newsreader, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { DeskProvider } from "@/lib/store";
import Shell from "@/components/Shell";

const newsreader = Newsreader({
  subsets: ["latin"],
  weight: "variable",
  axes: ["opsz"],
  variable: "--font-newsreader",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Desk · Process OS",
  description: "Shift board for holds, Need more, and ranked queues. Overlay, not the system of record.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${newsreader.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        <DeskProvider>
          <Shell>{children}</Shell>
        </DeskProvider>
      </body>
    </html>
  );
}
