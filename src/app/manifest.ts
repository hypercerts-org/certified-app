import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Certified",
    short_name: "Certified",
    description: "Your identity, everywhere.",
    start_url: "/welcome",
    // "browser" makes the app non-installable, so the browser stops showing the
    // PWA "install" prompt in the address bar (it would confuse users during the
    // redesign). Set back to "standalone" to re-enable installability.
    display: "browser",
    theme_color: "#f9f9f6",
    background_color: "#f9f9f6",
    icons: [
      {
        src: "/assets/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/assets/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
