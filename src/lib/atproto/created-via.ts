// `app.certified.signature.defs#createdVia`: the application that wrote a
// record version signs it inline. It means "written through this
// application", not that the application vouches for the content.
//
// The signer follows the SDK record-signing spec's RecordSigner contract, so
// it can be handed to the Hypercerts SDK once that does the writing. The
// procedure is the lexicon README's: the signed bytes are the CID of the record
// without `signatures`, with a temporary `$sig` (the entry without its
// signature, plus the repository that will hold the record) inserted.
import { cidForLex } from "@atproto/lex-cbor";
import type { List } from "@hypercerts-org/lexicon/app/certified/signature/defs";

export const CREATED_VIA = "app.certified.signature.defs#createdVia";

type Signature = List[number];

export type SignableRecord = { $type: string; signatures?: List };
// An intersection, not Omit<T, "signatures">: Omit drops every known key of a
// type with an index signature, such as a generic LexMap record.
export type SignedRecord<T> = T & { signatures: List };

export type RecordSigner = <T extends SignableRecord>(
  record: T,
  context: { repositoryDid: string },
) => Promise<SignedRecord<T>>;

export type CreatedViaSignerOptions = {
  /** Full DID verification-method reference of the application's key. */
  key: string;
  /** ECDSA over SHA-256 of the given bytes, raw r,s, low-S (as @atproto/crypto signs). */
  sign: (bytes: Uint8Array) => Promise<Uint8Array>;
};

function isCreatedVia(entry: Signature): boolean {
  return "$type" in entry && entry.$type === CREATED_VIA;
}

/**
 * Returns a signer that attaches this application's `createdVia` signature,
 * replacing any earlier one and keeping other signatures. The record must be
 * in the lex data model (blob links as CIDs, bytes as Uint8Array), exactly as
 * it will be written: any later change to it invalidates the signature.
 */
export function createCreatedViaSigner({ key, sign }: CreatedViaSignerOptions): RecordSigner {
  return async (record, { repositoryDid }) => {
    const { signatures = [], ...unsigned } = record;
    const entry = { $type: CREATED_VIA, key } as const;
    const cid = await cidForLex({ ...unsigned, $sig: { ...entry, repository: repositoryDid } });
    const signature = await sign(cid.bytes);
    const signed = {
      ...unsigned,
      signatures: [...signatures.filter((s) => !isCreatedVia(s)), { ...entry, signature }],
    };
    // A rest spread of a generic loses its type; the value is T with signatures.
    return signed as unknown as SignedRecord<typeof record>;
  };
}
