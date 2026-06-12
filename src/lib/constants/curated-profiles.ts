/**
 * Profiles featured in the landing page's "Explore" section. Real
 * accounts from the live network, resolved server-side at render time
 * (ISR) via buildProfilePayload; the fallback fields below render
 * whenever resolution fails or a profile field is empty, so the
 * section never looks broken.
 *
 * Taglines are grounded in each organization's own activity records
 * on the network (their certs profiles carry no description yet).
 * Swap entries freely — DIDs are stable across handle changes.
 */
export const CURATED_PROFILES = [
  {
    did: "did:plc:pktwukejt6bnubpkhldnaeyc", // bees-and-trees-uga.certified.one
    fallbackName: "Bees and Trees Uganda",
    tagline: "Environmental education with smallholder farmers in the Mt. Elgon region of Uganda.",
  },
  {
    did: "did:plc:7zu5w6ofrl6ha5ooykapptwe", // brave-earth-p3he.certified.one
    fallbackName: "Tierra Valiente (Brave Earth)",
    tagline: "Food sovereignty and community resilience in San Juan, Costa Rica.",
  },
  {
    did: "did:plc:uuvfp7xadcud56pjxbka26lc", // rifai-sicilia.certified.one
    fallbackName: "Rifai Sicilia",
    tagline: "Regenerating Sicilian ecology through bioregional commons development.",
  },
] as const;

export type CuratedProfile = (typeof CURATED_PROFILES)[number];
