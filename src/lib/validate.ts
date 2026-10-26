// Input validation for public query parameters. Route handlers and embeds
// accept only bounded, well-formed values; nothing is passed upstream raw.

export function isDid(value: string): boolean {
  return /^did:(plc|web):[a-zA-Z0-9._:%-]{1,200}$/.test(value)
}

export function isAtUri(value: string): boolean {
  return /^at:\/\/did:(plc|web):[a-zA-Z0-9._:%-]+\/[a-zA-Z0-9.]+\/[a-zA-Z0-9._:~-]{1,512}$/.test(value)
}

export function cursorParam(value: string | null): string | undefined {
  return value && value.length <= 512 ? value : undefined
}
