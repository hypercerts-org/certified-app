// "Also on": the other apps that show a project or an account, each a link
// with the app's icon, opening its page there. Records belong to their
// authors, not to one app, and this row says so: the same project, open in
// several places. Shows nothing when no other app has a page for it.

import { ArrowUpRight } from "lucide-react";
import { useId } from "react";
import { getAccountPlatformLinks, getProjectPlatformLinks } from "@/lib/hypercerts/platform-links";
import { PLATFORMS, type PlatformLink } from "@/lib/platforms";

function PlatformLinksView({ links, what }: { links: PlatformLink[]; what: string }) {
  const labelId = useId();
  if (links.length === 0) return null;
  return (
    <div className="platform-links">
      <span id={labelId} className="platform-links-label">
        Also on
      </span>
      <ul aria-labelledby={labelId}>
        {links.map((link) => {
          const platform = PLATFORMS[link.platform];
          return (
            <li key={link.platform}>
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="platform-link"
                title={`See this ${what} on ${platform.name}: ${platform.about.toLowerCase()}`}
              >
                {/* biome-ignore lint/performance/noImgElement: a small static icon */}
                <img
                  src={platform.icon}
                  alt=""
                  width={20}
                  height={20}
                  className="platform-link-icon"
                />
                <span className="platform-link-name">{platform.name}</span>
                {link.note && <span className="platform-link-note">{link.note}</span>}
                <ArrowUpRight size={14} aria-hidden className="platform-link-arrow" />
                <span className="visually-hidden"> (opens in a new tab)</span>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The apps that also show this project. */
export async function ProjectPlatformLinks({ uri }: { uri: string }) {
  return <PlatformLinksView links={await getProjectPlatformLinks(uri)} what="project" />;
}

/** The apps that also show this account. */
export async function AccountPlatformLinks({
  did,
  organization,
}: {
  did: string;
  organization: boolean;
}) {
  return (
    <PlatformLinksView
      links={await getAccountPlatformLinks(did)}
      what={organization ? "organization" : "profile"}
    />
  );
}
