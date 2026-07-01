import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Certified",
    short_name: "Certified",
    description: "Your identity, everywhere.",
    lang: "en",
    scope: "/",
    start_url: "/welcome",
    display: "standalone",
    orientation: "portrait",
    theme_color: "#f9f9f6",
    background_color: "#f9f9f6",
    icons: [
      {
        src: "/brand/brandmark/certified_brandmark_black_512.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/brandmark/certified_brandmark_black_512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
