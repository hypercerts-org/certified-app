"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@hypercerts-org/ui-react";
import { ArrowUpRight, CircleHelp } from "lucide-react";
import { useState } from "react";

// Help, until there are help pages of our own: where answers already live.
const LINKS = [
  { label: "Documentation", href: "https://docs.hypercerts.org" },
  {
    label: "Report a problem",
    href: "https://github.com/hypercerts-org/certified-app/issues/new",
  },
  { label: "About Hypercerts", href: "https://hypercerts.org" },
];

export function HelpMenu() {
  const [open, setOpen] = useState(false);
  return (
    <Popover kind="navigation" open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="workspace-nav-item">
        <CircleHelp size={20} strokeWidth={1.5} aria-hidden />
        Help
      </PopoverTrigger>
      <PopoverContent label="Help" className="menu-panel">
        <ul className="menu-list">
          {LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="menu-row"
                onClick={() => setOpen(false)}
              >
                <span className="menu-row-text">{link.label}</span>
                <ArrowUpRight size={16} aria-hidden />
                <span className="visually-hidden"> (opens in a new tab)</span>
              </a>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
