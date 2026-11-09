// The application's record-signing key: who `createdVia` signatures name.
//
// Deployed, the key is a verification method in the app's own did:web
// document (/.well-known/did.json), so the DID names the application. In local
// loopback development there is no resolvable did:web (atproto does not allow
// IP hosts), so the key is referenced as a did:key.
//
// A signature is only as good as its key stays resolvable, so signing as a
// did:web needs an explicit, permanent identity, as on the current
// certified.app: CREATED_VIA_DID must equal did:web:<PUBLIC_URL host>, set
// explicitly. Preview deployments (*.vercel.app, VERCEL_* URLs) never sign:
// their documents disappear with them. Anything else fails closed, and writes
// fail rather than go out unsigned.
//
// CREATED_VIA_SIGNING_KEY is a secp256k1 private key in hex, generated once and
// kept; certified.app v2 must use the current certified.app key. Keys that
// signed before a rotation stay published through CREATED_VIA_RETIRED_KEYS
// ("fragment:publicKeyMultibase", comma-separated) for as long as their records
// exist.
import "server-only";

import { Secp256k1Keypair } from "@atproto/crypto";
import { oauthMode } from "@/lib/auth/config";
import { createCreatedViaSigner, type RecordSigner } from "./created-via";

const FRAGMENT = "created-via";

export type VerificationMethod = { id: string; publicKeyMultibase: string };

export type AppKey = {
  /** The DID that names the key's controller. */
  did: string;
  /** Full verification-method reference written into signatures. */
  keyId: string;
  /** Every key to publish: the current one first, then retired ones. */
  methods: VerificationMethod[];
  keypair: Secp256k1Keypair;
};

function canonicalDid(): string {
  // Also when a preview inherits production's PUBLIC_URL: branch code must not
  // sign as the production app.
  if (process.env.VERCEL_ENV === "preview") {
    throw new Error("Preview deployments don't sign records.");
  }
  const publicUrl = process.env.PUBLIC_URL?.trim();
  const configured = process.env.CREATED_VIA_DID?.trim();
  if (!publicUrl || !configured) {
    throw new Error("Record signing needs explicit PUBLIC_URL and CREATED_VIA_DID.");
  }
  const url = new URL(publicUrl);
  if (url.protocol !== "https:" || url.hostname.endsWith(".vercel.app")) {
    throw new Error("Record signing needs a permanent https PUBLIC_URL, not a preview host.");
  }
  // did:web encodes a port as %3A.
  const did = `did:web:${url.host.replace(":", "%3A")}`;
  if (configured !== did) throw new Error("CREATED_VIA_DID does not match PUBLIC_URL.");
  return did;
}

function retiredMethods(did: string): VerificationMethod[] {
  return (process.env.CREATED_VIA_RETIRED_KEYS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [fragment, publicKeyMultibase] = entry.split(":");
      if (!fragment || !publicKeyMultibase?.startsWith("z") || fragment === FRAGMENT) {
        throw new Error("CREATED_VIA_RETIRED_KEYS entries must be fragment:publicKeyMultibase.");
      }
      return { id: `${did}#${fragment}`, publicKeyMultibase };
    });
}

async function load(): Promise<AppKey> {
  const hex = process.env.CREATED_VIA_SIGNING_KEY?.trim().replace(/^0x/i, "");
  if (!hex || !/^[0-9a-f]{64}$/i.test(hex)) {
    throw new Error("CREATED_VIA_SIGNING_KEY must be a 32-byte secp256k1 private key in hex.");
  }
  const keypair = await Secp256k1Keypair.import(hex);
  const publicKeyMultibase = keypair.did().slice("did:key:".length);
  if (oauthMode().kind === "loopback") {
    const did = keypair.did();
    const keyId = `${did}#${publicKeyMultibase}`;
    return { did, keyId, methods: [{ id: keyId, publicKeyMultibase }], keypair };
  }
  const did = canonicalDid();
  const keyId = `${did}#${FRAGMENT}`;
  return {
    did,
    keyId,
    methods: [{ id: keyId, publicKeyMultibase }, ...retiredMethods(did)],
    keypair,
  };
}

let loading: Promise<AppKey> | undefined;

/** The key, loaded once per server instance. Throws when it isn't configured. */
export function getAppKey(): Promise<AppKey> {
  if (!loading) {
    loading = load();
    loading.catch(() => {
      loading = undefined;
    });
  }
  return loading;
}

/** The app's createdVia signer. Throws when signing isn't configured. */
export async function getRecordSigner(): Promise<RecordSigner> {
  const { keyId, keypair } = await getAppKey();
  return createCreatedViaSigner({ key: keyId, sign: (bytes) => keypair.sign(bytes) });
}
