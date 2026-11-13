// judgment-001: `prompt` is forwarded into client.authorize and shapes the
// external OAuth authorization request, but the request body is untrusted.
// Coerce anything outside the allowlist to undefined (silent — no 400) so a
// caller can't slip in prompt=none / select_account / consent. Kept outside
// `route.ts`: a Next.js route module may only export handlers and config.
export function coercePrompt(prompt: unknown): "login" | "create" | undefined {
  return prompt === "login" || prompt === "create" ? prompt : undefined
}
