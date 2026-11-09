// Server-side error logging that never prints an error's cause or stack:
// atproto errors attach the upstream request there, including DPoP proofs and
// access tokens. Messages are kept, with anything shaped like a JWT removed.
export function logError(prefix: string, err: unknown, extra?: Record<string, unknown>) {
  const { name, message } = err instanceof Error ? err : { name: typeof err, message: String(err) };
  console.error(prefix, {
    name,
    message: message.replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "<jwt>"),
    ...extra,
  });
}
