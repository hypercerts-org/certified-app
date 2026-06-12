"use client";

import { useEffect } from "react";
import { profileUrl } from "@/lib/urls"
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, MessageSquare, User, Settings, LayoutGrid, HelpCircle } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useProfile } from "@/hooks/use-profile";
import { useSession } from "@/hooks/use-session";
import { useOrg } from "@/lib/groups/org-context";
import { useOrgProfile } from "@/hooks/use-org-profile";
import { useFeedback } from "@/lib/feedback-context";
import Avatar from "@/components/ui/avatar";
import ThemeToggle from "@/components/ui/theme-toggle";
import Drawer from "@/components/ui/drawer";
import { getInitials } from "@/lib/utils/initials";

interface MobileSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function MobileSidebar({ isOpen, onClose }: MobileSidebarProps) {
  const pathname = usePathname();
  const { isAuthenticated, did } = useAuth();
  const { profile, avatarUrl } = useProfile();
  const { handle } = useSession();
  const { activeOrg } = useOrg();
  const { orgAvatarUrl } = useOrgProfile();
  const { openFeedback } = useFeedback();

  // Body-scroll lock, focus trap, Esc-to-close, backdrop-click, the
  // portal shell + slide animation, and `inert` on the off-canvas
  // panel all come from the <Drawer> primitive below.

  // Close on navigation. Intentionally not dependent on onClose: the
  // parent passes an inline arrow that re-creates each render, and we
  // only want this effect to fire when the URL actually changes.
  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // When acting as a group, the entire sidebar identity row (avatar,
  // name, handle) and the profile link should reflect the group the
  // user is currently acting as — not their personal identity. This
  // matches the navbar's behavior.
  const displayName = activeOrg
    ? activeOrg.displayName || activeOrg.handle
    : profile?.displayName;
  const displayHandle = activeOrg ? activeOrg.handle : handle;
  const displayAvatarUrl = activeOrg
    ? orgAvatarUrl || activeOrg.avatarUrl || undefined
    : avatarUrl || undefined;
  const displayInitials = activeOrg
    ? (activeOrg.displayName || activeOrg.handle || "?").slice(0, 2).toUpperCase()
    : getInitials(profile?.displayName, did);

  const handleFeedbackClick = () => {
    onClose();
    openFeedback();
  };

  // Resolve the Profile link straight to /profile/<handle> when we know
  // the handle, so clicking it skips the /profile redirect hop. When
  // acting as a group, point at the group's profile.
  const profileHref = displayHandle
    ? profileUrl(displayHandle)
    : "/profile";

  // Signed-out viewers get the public destinations only — Explore,
  // Apps and Help. Everything else (Home, Profile, Settings, Feedback)
  // requires a session, so those entries only render once signed in.
  const navLinks = isAuthenticated
    ? [
        { href: "/home", label: "Home", icon: Home },
        { href: "/explore", label: "Explore", icon: Search },
        { href: "/apps", label: "Apps", icon: LayoutGrid },
        { href: profileHref, label: "Profile", icon: User },
        { href: "/settings", label: "Settings", icon: Settings },
        { key: "feedback", label: "Feedback", icon: MessageSquare, onClick: handleFeedbackClick },
        { href: "/help", label: "Help", icon: HelpCircle },
      ]
    : [
        { href: "/explore", label: "Explore", icon: Search },
        { href: "/apps", label: "Apps", icon: LayoutGrid },
        { href: "/help", label: "Help", icon: HelpCircle },
      ];

  const legalLinks = [
    { href: "/about", label: "About" },
    { href: "/terms", label: "Terms" },
    { href: "/privacy", label: "Privacy" },
    { href: "/imprint", label: "Imprint" },
  ];

  return (
    <Drawer open={isOpen} onClose={onClose} side="left" ariaLabel="Navigation menu">
        {/* Section 1: Certified wordmark (top-left) + theme toggle
            (top-right), with the profile block (signed-in only)
            underneath. */}
        <div className="mobile-sidebar__section mobile-sidebar__section--profile">
          <div className="mobile-sidebar__section--brand">
            <Link
              href={isAuthenticated ? "/home" : "/welcome"}
              className="mobile-sidebar__wordmark"
              onClick={onClose}
              aria-label="Certified home"
            >
              <img
                src="/brand/wordmark/certified_wordmark_black.svg"
                alt="Certified"
                className="mobile-sidebar__wordmark-img"
              />
            </Link>
            <ThemeToggle variant="cycle" className="mobile-sidebar__theme" />
          </div>
          {isAuthenticated ? (
            <Link
              href={profileHref}
              className="mobile-sidebar__profile"
              onClick={onClose}
              aria-label={
                activeOrg ? `View ${displayName}'s profile` : "View your profile"
              }
            >
              <Avatar
                size="md"
                src={displayAvatarUrl}
                fallbackInitials={displayInitials}
              />
              <p className="mobile-sidebar__name">{displayName || "Anonymous"}</p>
              {displayHandle ? (
                <p className="mobile-sidebar__handle">@{displayHandle}</p>
              ) : null}
            </Link>
          ) : null}
        </div>

        {/* Section 2: Navigation */}
        <div className="mobile-sidebar__section">
          {navLinks.map((link) => {
            if ("onClick" in link && link.onClick) {
              return (
                <button
                  key={link.key || link.label}
                  className="mobile-sidebar__link"
                  onClick={link.onClick}
                >
                  <link.icon size={20} strokeWidth={1.5} />
                  {link.label}
                </button>
              );
            }
            const isActive = link.href === "/"
              ? pathname === "/"
              : pathname.startsWith(link.href!);
            return (
              <Link
                key={link.href}
                href={link.href!}
                className={`mobile-sidebar__link ${isActive ? "mobile-sidebar__link--active" : ""}`}
                onClick={onClose}
              >
                <link.icon size={20} strokeWidth={isActive ? 2 : 1.5} />
                {link.label}
              </Link>
            );
          })}
        </div>

        {/* Section 3: Legal */}
        <div className="mobile-sidebar__section mobile-sidebar__section--legal">
          {legalLinks.map((link, i) => (
            <span key={link.href}>
              {i > 0 && <span className="mobile-sidebar__legal-sep"> · </span>}
              <Link href={link.href} className="mobile-sidebar__legal-link" onClick={onClose}>
                {link.label}
              </Link>
            </span>
          ))}
        </div>
    </Drawer>
  );
}
