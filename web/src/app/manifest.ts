import type { MetadataRoute } from "next";
import { copy } from "@/copy/family.id";

/**
 * Neutral PWA manifest. Served at /manifest.webmanifest.
 * Name and short name are "Pengingat Harian". It must never contain
 * "TB", "TBC", "tuberkulosis" or "TuntasTB".
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: copy.appName,
    short_name: copy.shortName,
    description: copy.description,
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0d9488",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
