import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Certified",
    short_name: "Certified",
    description: "Your identity, everywhere.",
    start_url: "/welcome",
    display: "standalone",
    theme_color: "#f9f9f6",
    background_color: "#f9f9f6",
    icons: [
      {
        src: "/assets/certified_brandmark_black.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/assets/certified_brandmark_black.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
