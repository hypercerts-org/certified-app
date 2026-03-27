"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import { useNavbarVariant } from "@/lib/navbar-context";
import { useProfile } from "@/hooks/use-profile";
import { useSession } from "@/hooks/use-session";
import Avatar from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils/initials";
import { useOrg } from "@/lib/organizations/org-context";
import { useOrgProfile } from "@/hooks/use-org-profile";
import { Menu, X, ChevronDown, LogOut } from "lucide-react";

const PERSONAL_NAV_LINKS = [
  { href: "/", label: "Profile" },
  { href: "/organizations", label: "Groups" },
  { href: "/connected-apps", label: "Apps" },
  { href: "/settings", label: "Settings" },
];

const ORG_NAV_LINKS = [
  { href: "/", label: "Profile" },
  { href: "/connected-apps", label: "Apps" },
  { href: "/settings", label: "Settings" },
];

const Navbar: React.FC = () => {
  const { isLoading, isAuthenticated, did, openSignIn, signOut } = useAuth();
  const { variant } = useNavbarVariant();
  const { profile, avatarUrl } = useProfile();
  const { handle } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const { activeOrg, organizations, switchOrg } = useOrg();
  const { orgAvatarUrl } = useOrgProfile();

  const ROLE_ORDER: Record<string, number> = { owner: 0, admin: 1, member: 2 };
  const sortedOrgs = useMemo(() => {
    return [...organizations].sort((a, b) => {
      if (a.accepted !== b.accepted) return a.accepted ? -1 : 1;
      const roleA = ROLE_ORDER[a.role] ?? 3;
      const roleB = ROLE_ORDER[b.role] ?? 3;
      if (roleA !== roleB) return roleA - roleB;
      const nameA = (a.displayName || a.handle).toLowerCase();
      const nameB = (b.displayName || b.handle).toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [organizations]);
  const switcherRef = useRef<HTMLDivElement>(null);
  const mobileSwitcherRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close dropdowns on navigation
  useEffect(() => {
    setDropdownOpen(false);
    setSwitcherOpen(false);
  }, [pathname]);

  // Close account switcher on outside click
  useEffect(() => {
    if (!switcherOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const inDesktop = switcherRef.current?.contains(target);
      const inMobile = mobileSwitcherRef.current?.contains(target);
      const inSheet = sheetRef.current?.contains(target);
      const inBackdrop = (target as Element).classList?.contains("bottom-sheet__backdrop");
      if (!inDesktop && !inMobile && !inSheet && !inBackdrop) {
        setSwitcherOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [switcherOpen]);

  // Lock body scroll when bottom sheet is open (mobile only)
  useEffect(() => {
    if (switcherOpen && window.innerWidth <= 768) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [switcherOpen]);

  // Bottom sheet drag handle + expand/collapse/dismiss
  const sheetRef = useRef<HTMLDivElement>(null);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const dragStartY = useRef(0);
  const isDragging = useRef(false);

  // Reset expanded state when sheet closes
  useEffect(() => {
    if (!switcherOpen) setSheetExpanded(false);
  }, [switcherOpen]);

  const onHandleTouchStart = useCallback((e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
    isDragging.current = true;
    if (sheetRef.current) {
      sheetRef.current.style.transition = "none";
    }
  }, []);

  const onHandleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current || !sheetRef.current) return;
    e.preventDefault();
    const dy = e.touches[0].clientY - dragStartY.current;
    // Dragging down: translate sheet down (only positive values)
    // Dragging up: no transform needed, we'll expand on release
    if (dy > 0) {
      sheetRef.current.style.transform = `translateY(${dy}px)`;
    }
  }, []);

  const onHandleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current || !sheetRef.current) return;
    isDragging.current = false;
    const dy = e.changedTouches[0].clientY - dragStartY.current;
    sheetRef.current.style.transition = "transform 0.3s ease-out, max-height 0.3s ease-out";
    sheetRef.current.style.transform = "translateY(0)";

    if (dy > 80) {
      // Swiped down far enough — dismiss
      sheetRef.current.style.transform = "translateY(100%)";
      setTimeout(() => setSwitcherOpen(false), 250);
    } else if (dy < -40) {
      // Swiped up — expand to full height
      setSheetExpanded(true);
    } else if (dy > 20 && sheetExpanded) {
      // Small swipe down while expanded — collapse back
      setSheetExpanded(false);
    }
  }, [sheetExpanded]);

  // Derive display state from org context
  const navLinks = activeOrg ? ORG_NAV_LINKS : PERSONAL_NAV_LINKS;
  const displayName = activeOrg
    ? (activeOrg.displayName || activeOrg.handle)
    : profile?.displayName;
  const avatarInitials = activeOrg
    ? (activeOrg.displayName || activeOrg.handle || "O").slice(0, 2).toUpperCase()
    : getInitials(profile?.displayName, did);
  const displayAvatarUrl = activeOrg ? (orgAvatarUrl || undefined) : (avatarUrl || undefined);

  // Don't render navbar while auth is loading — prevents white flash
  if (isLoading) return null;

  const isTransparent = !isAuthenticated && variant === "transparent";

  const navClasses = [
    "navbar",
    isAuthenticated ? "navbar--default" : (isTransparent ? "navbar--transparent" : "navbar--default"),
    scrolled ? "navbar--scrolled" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/" || pathname === "/settings/edit-profile";
    return pathname.startsWith(href);
  };

  return (
    <nav className={navClasses}>
      <div className="navbar__inner">
        <Link href="/" className="navbar__logo">
          <img src="/assets/certified_wordmark_black_green.png" alt="Certified" className="navbar__logo-img" />
        </Link>

        {isAuthenticated ? (
          <>
            {/* Desktop: nav links */}
            <div className="navbar__app-links">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`navbar__app-link ${isActive(link.href) ? "navbar__app-link--active" : ""}`}
                >
                  {link.label}
                </Link>
              ))}
            </div>

            {/* Desktop: account switcher + sign out */}
            <div className="navbar__user">
              <div className="account-switcher" ref={switcherRef}>
                <button
                  className="account-switcher__trigger"
                  onClick={() => setSwitcherOpen(!switcherOpen)}
                  aria-label="Switch account"
                >
                  <Avatar size="sm" src={displayAvatarUrl} fallbackInitials={avatarInitials} />
                  <ChevronDown size={14} />
                </button>
                {switcherOpen && (
                  <div className="account-switcher__menu">
                    {/* User section */}
                    <p className="account-switcher__section-label">User</p>
                    <div className="account-switcher__user-row">
                      <button
                        className={`account-switcher__item ${!activeOrg ? "account-switcher__item--active" : ""}`}
                        onClick={() => { switchOrg(null); setSwitcherOpen(false); router.push("/"); }}
                      >
                        <Avatar
                          src={avatarUrl || undefined}
                          alt={profile?.displayName || "Personal"}
                          size="sm"
                          fallbackInitials={getInitials(profile?.displayName || handle || "?")}
                        />
                        <div>
                          <p className="account-switcher__item-name">
                            {profile?.displayName || "Personal"}
                          </p>
                          <p className="account-switcher__item-handle">@{handle}</p>
                        </div>
                      </button>
                      <button
                        className="account-switcher__signout"
                        onClick={(e) => { e.stopPropagation(); signOut(); }}
                        title="Sign out"
                      >
                        <LogOut size={16} />
                      </button>
                    </div>

                    {organizations.length > 0 && (
                      <>
                        <div className="account-switcher__divider" />
                        <p className="account-switcher__section-label">Groups</p>
                        {sortedOrgs.map((org) => (
                          <button
                            key={org.groupDid}
                            className={`account-switcher__item ${activeOrg?.groupDid === org.groupDid ? "account-switcher__item--active" : ""}`}
                            onClick={() => {
                              switchOrg(org);
                              setSwitcherOpen(false);
                              router.push("/");
                            }}
                          >
                            <Avatar
                              src={org.avatarUrl}
                              alt={org.displayName || org.handle}
                              size="sm"
                              fallbackInitials={(org.displayName || org.handle).slice(0, 2)}
                            />
                            <div>
                              <p className="account-switcher__item-name">
                                {org.displayName || org.handle}
                              </p>
                              <p className="account-switcher__item-handle">{org.role}</p>
                            </div>
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Mobile: avatar + hamburger, right-aligned */}
            <div className="navbar__mobile-actions">
              <div className="navbar__mobile-switcher" ref={mobileSwitcherRef}>
                <button
                  className="navbar__mobile-avatar"
                  onClick={() => { setSwitcherOpen(!switcherOpen); setDropdownOpen(false); }}
                  aria-label="Switch account"
                >
                  <Avatar size="sm" src={displayAvatarUrl} fallbackInitials={avatarInitials} />
                </button>
              {switcherOpen && createPortal(
                <>
                  <div className="bottom-sheet__backdrop" onClick={() => setSwitcherOpen(false)} />
                  <div
                    className={`bottom-sheet ${sheetExpanded ? "bottom-sheet--expanded" : ""}`}
                    ref={sheetRef}
                  >
                    <div
                      className="bottom-sheet__handle"
                      onTouchStart={onHandleTouchStart}
                      onTouchMove={onHandleTouchMove}
                      onTouchEnd={onHandleTouchEnd}
                    />
                    <div className="bottom-sheet__content">
                      <p className="account-switcher__section-label">User</p>
                      <div className="account-switcher__user-row">
                        <button
                          className={`account-switcher__item ${!activeOrg ? "account-switcher__item--active" : ""}`}
                          onClick={() => { switchOrg(null); setSwitcherOpen(false); router.push("/"); }}
                        >
                          <Avatar
                            src={avatarUrl || undefined}
                            alt={profile?.displayName || "Personal"}
                            size="sm"
                            fallbackInitials={getInitials(profile?.displayName || handle || "?")}
                          />
                          <div>
                            <p className="account-switcher__item-name">
                              {profile?.displayName || "Personal"}
                            </p>
                            <p className="account-switcher__item-handle">@{handle}</p>
                          </div>
                        </button>
                        <button
                          className="account-switcher__signout"
                          onClick={(e) => { e.stopPropagation(); signOut(); }}
                          title="Sign out"
                        >
                          <LogOut size={16} />
                        </button>
                      </div>

                      {organizations.length > 0 && (
                        <>
                          <div className="account-switcher__divider" />
                          <p className="account-switcher__section-label">Groups</p>
                          {sortedOrgs.map((org) => (
                            <button
                              key={org.groupDid}
                              className={`account-switcher__item ${activeOrg?.groupDid === org.groupDid ? "account-switcher__item--active" : ""}`}
                              onClick={() => {
                                switchOrg(org);
                                setSwitcherOpen(false);
                                router.push("/");
                              }}
                            >
                              <Avatar
                                src={org.avatarUrl}
                                alt={org.displayName || org.handle}
                                size="sm"
                                fallbackInitials={(org.displayName || org.handle).slice(0, 2)}
                              />
                              <div>
                                <p className="account-switcher__item-name">
                                  {org.displayName || org.handle}
                                </p>
                                <p className="account-switcher__item-handle">{org.role}</p>
                              </div>
                            </button>
                          ))}
                        </>
                      )}


                    </div>
                  </div>
                </>,
                document.body
              )}
              </div>

              {/* Mobile: hamburger */}
              <button
                className="navbar__hamburger"
                onClick={() => { setDropdownOpen(!dropdownOpen); setSwitcherOpen(false); }}
                aria-label={dropdownOpen ? "Close menu" : "Open menu"}
              >
                {dropdownOpen ? <X size={22} /> : <Menu size={22} />}
              </button>
            </div>

            {/* Mobile: nav dropdown */}
            <div className={`navbar__dropdown ${dropdownOpen ? "navbar__dropdown--open" : ""}`}>
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`navbar__dropdown-link ${isActive(link.href) ? "navbar__dropdown-link--active" : ""}`}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </>
        ) : (
          <div className="navbar__right">
            <button
              onClick={openSignIn}
              className="navbar__signin"
            >
              <img src="/assets/sign_in_black_small.svg" alt="Sign in" className="navbar__signin-img" />
            </button>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
