// "Also on": the other apps that show a project or an account, each a link
// with the app's icon, opening its page there (lib/also-on finds them).
// Records belong to their authors, not to one app, and this row says so: the
// same project, open in several places. Shows nothing when no other app has
// a page for it.

import { ArrowUpRight } from "lucide-react";
import { useId } from "react";
import { type AlsoOnLink, getAlsoOn } from "@/lib/also-on";

export function AlsoOnRow({ links, what }: { links: AlsoOnLink[]; what: string }) {
  const labelId = useId();
  if (links.length === 0) return null;
  return (
    <div className="also-on">
      <span id={labelId} className="also-on-label">
        Also on
      </span>
      <ul aria-labelledby={labelId}>
        {links.map((link) => (
          <li key={link.app}>
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="also-on-link"
              title={`See this ${what} on ${link.app}: ${link.about.toLowerCase()}`}
            >
              {/* biome-ignore lint/performance/noImgElement: a small static icon */}
              <img src={link.icon} alt="" width={20} height={20} className="also-on-icon" />
              <span className="also-on-name">{link.app}</span>
              {link.note && <span className="also-on-note">{link.note}</span>}
              <ArrowUpRight size={14} aria-hidden className="also-on-arrow" />
              <span className="visually-hidden"> (opens in a new tab)</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The apps that also show `subject` (a DID or a project's URI); `what` names it: "project". */
export async function AlsoOn({ subject, what }: { subject: string; what: string }) {
  return <AlsoOnRow links={await getAlsoOn(subject)} what={what} />;
}
