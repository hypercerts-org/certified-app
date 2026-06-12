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
    did: "did:plc:3y55aw6kplu5caauknqy2etx", // nature-for-mangrov.certified.one
    fallbackName: "Nature for Mangroves",
    tagline: "Restoring mangrove forests — and the livelihoods they hold up — in Sierra Leone.",
  },
  {
    did: "did:plc:6cwyx6ivt4oi7aasxqpylawg", // earth-guardia-99nn.certified.one
    fallbackName: "Earth Guardians",
    tagline: "Roots, canopy, and community — restoring the Tagba rainforest.",
  },
  {
    did: "did:plc:kpi5b3kbhu3gx5sg22gyxi56", // mangaroa-farm-q7hs.certified.one
    fallbackName: "Mangaroa Farms",
    tagline: "Building food systems and native forests in Mangaroa, Aotearoa.",
  },
] as const;

export type CuratedProfile = (typeof CURATED_PROFILES)[number];
