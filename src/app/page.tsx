import fs from "fs";
import path from "path";
import HomeClient from "@/components/landing/home-client";

const PARTNERS_DIR = path.join(process.cwd(), "public", "assets", "partners");
const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".svg", ".webp"];

function getPartnerLogos(): string[] {
  try {
    const files = fs.readdirSync(PARTNERS_DIR);
    return files
      .filter((file) => {
        const ext = path.extname(file).toLowerCase();
        return ALLOWED_EXTENSIONS.includes(ext) && !file.startsWith(".");
      })
      .sort()
      .map((file) => `/assets/partners/${file}`);
  } catch {
    return [];
  }
}

export default function Home() {
  const partnerLogos = getPartnerLogos();
  return <HomeClient partnerLogos={partnerLogos} />;
}
