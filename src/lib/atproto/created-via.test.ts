// The signer must produce signatures that any verifier following the lexicon
// README can check. Verification here deliberately uses the README's own
// tools (@ipld/dag-cbor and multiformats), not the signer's @atproto/lex-cbor,
// so an encoding difference between the two would fail the test.
import { Secp256k1Keypair, verifySignature } from "@atproto/crypto";
import * as dagCbor from "@ipld/dag-cbor";
import { CID } from "multiformats/cid";
import { sha256 } from "multiformats/hashes/sha2";
import { describe, expect, it } from "vitest";
import { CREATED_VIA, createCreatedViaSigner } from "./created-via";

const repository = "did:plc:ewvi7nxzyoun6zhxrhs64oiz";

async function setup() {
  const keypair = await Secp256k1Keypair.create();
  const didKey = keypair.did();
  const key = `${didKey}#${didKey.slice("did:key:".length)}`;
  const signer = createCreatedViaSigner({ key, sign: (bytes) => keypair.sign(bytes) });
  return { didKey, key, signer };
}

/** The lexicon README's verification procedure for an inline signature. */
async function verify(
  record: Record<string, unknown> & { signatures: Array<Record<string, unknown>> },
  didKey: string,
  repositoryDid: string,
): Promise<boolean> {
  const entry = record.signatures.find((s) => s.$type === CREATED_VIA);
  if (!entry) return false;
  const { signatures: _all, ...withoutSignatures } = record;
  const { signature, ...sigMetadata } = entry;
  const bytes = dagCbor.encode({
    ...withoutSignatures,
    $sig: { ...sigMetadata, repository: repositoryDid },
  });
  const cid = CID.createV1(dagCbor.code, await sha256.digest(bytes));
  return verifySignature(didKey, cid.bytes, signature as Uint8Array);
}

// A profile with a blob reference, the case where JSON-form encoding would
// produce a different CID than the PDS stores.
const blob = CID.parse("bafkreibme22gw2h7y2h7tg2fhqotaqjucnbc24deqo72b6mkl2egezxhvy");
const makeProfile = () => ({
  $type: "app.certified.actor.profile",
  displayName: "Ma Earth",
  createdAt: "2026-11-09T12:00:00.000Z",
  avatar: {
    $type: "org.hypercerts.defs#smallImage",
    image: { $type: "blob", ref: blob, mimeType: "image/png", size: 1234 },
  },
});
const profile = makeProfile();

describe("createCreatedViaSigner", () => {
  it("produces a signature that verifies by the lexicon README procedure", async () => {
    const { didKey, key, signer } = await setup();
    const signed = await signer(profile, { repositoryDid: repository });
    expect(signed.signatures).toEqual([
      { $type: CREATED_VIA, key, signature: expect.any(Uint8Array) },
    ]);
    expect(await verify(signed, didKey, repository)).toBe(true);
  });

  it("binds the signature to the content and to the repository", async () => {
    const { didKey, signer } = await setup();
    const signed = await signer(profile, { repositoryDid: repository });
    expect(await verify({ ...signed, displayName: "Changed" }, didKey, repository)).toBe(false);
    expect(await verify(signed, didKey, "did:plc:someoneelse0000000000000")).toBe(false);
  });

  it("replaces an earlier createdVia signature and keeps others", async () => {
    const { didKey, signer } = await setup();
    const other = {
      $type: "app.certified.signature.defs#inline" as const,
      key: "did:key:zOther#zOther",
      signature: new Uint8Array([1, 2, 3]),
    };
    const once = await signer({ ...profile, signatures: [other] }, { repositoryDid: repository });
    const twice = await signer({ ...once, displayName: "Renamed" }, { repositoryDid: repository });
    const types = twice.signatures.map((s) => (s as { $type?: string }).$type);
    expect(types.filter((t) => t === CREATED_VIA)).toHaveLength(1);
    expect(twice.signatures).toContainEqual(other);
    expect(await verify(twice, didKey, repository)).toBe(true);
  });

  it("does not modify the record it is given", async () => {
    const { signer } = await setup();
    const input = makeProfile();
    await signer(input, { repositoryDid: repository });
    expect(input).toEqual(makeProfile());
  });
});
