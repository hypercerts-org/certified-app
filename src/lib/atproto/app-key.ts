// The application's record-signing key: who `createdVia` signatures name.
//
// Deployed on https, the key is a verification method in the app's own
// did:web document (/.well-known/did.json), so the DID names the application.
// In local loopback development there is no resolvable did:web (atproto does
// not allow IP hosts), so the key is referenced as a did:key, which verifiers
// resolve without fetching anything.
//
// CREATED_VIA_SIGNING_KEY is a secp256k1 private key in hex, generated once and
// kept: verifiers check old records against the published key, so every key
// that ever signed must stay in the DID document while its records exist.
import "server-only";

import { Secp256k1Keypair } from "@atproto/crypto";
import { oauthMode } from "@/lib/auth/config";
import { createCreatedViaSigner, type RecordSigner } from "./created-via";

const FRAGMENT = "created-via";

export type AppKey = {
  /** The DID that names the key's controller. */
  did: string;
  /** Full verification-method reference written into signatures. */
  keyId: string;
  publicKeyMultibase: string;
  keypair: Secp256k1Keypair;
};

let loading: Promise<AppKey> | undefined;

async function load(): Promise<AppKey> {
  const hex = process.env.CREATED_VIA_SIGNING_KEY?.trim().replace(/^0x/i, "");
  if (!hex || !/^[0-9a-f]{64}$/i.test(hex)) {
    throw new Error("CREATED_VIA_SIGNING_KEY must be a 32-byte secp256k1 private key in hex.");
  }
  const keypair = await Secp256k1Keypair.import(hex);
  const didKey = keypair.did();
  const publicKeyMultibase = didKey.slice("did:key:".length);
  const mode = oauthMode();
  if (mode.kind === "loopback") {
    return { did: didKey, keyId: `${didKey}#${publicKeyMultibase}`, publicKeyMultibase, keypair };
  }
  // did:web encodes a port as %3A.
  const did = `did:web:${new URL(mode.publicUrl).host.replace(":", "%3A")}`;
  return { did, keyId: `${did}#${FRAGMENT}`, publicKeyMultibase, keypair };
}

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

/** The app's createdVia signer. Writes fail rather than go out unsigned. */
export async function getRecordSigner(): Promise<RecordSigner> {
  const { keyId, keypair } = await getAppKey();
  return createCreatedViaSigner({ key: keyId, sign: (bytes) => keypair.sign(bytes) });
}
