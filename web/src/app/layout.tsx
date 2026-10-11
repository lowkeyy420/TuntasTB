import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next } from "next/font/google";
import { copy } from "@/copy/family.id";
import { colors } from "@/design/tokens";
import "./globals.css";

// Downloaded at build time and served from this app's own origin: no request
// to a font CDN at runtime. Chosen for letterforms that stay distinct for
// older eyes and in glare.
const atkinson = Atkinson_Hyperlegible_Next({
  variable: "--font-atkinson",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// Neutral default: bystander-visible titles never name the illness.
export const metadata: Metadata = {
  title: copy.appName,
  description: copy.description,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: colors.primary,
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className={atkinson.variable}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
