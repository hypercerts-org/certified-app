// Types for the parts of capture.mjs that tests import.
export function isPrivateAddress(address: string): boolean
export function dominantColours(pixels: ArrayLike<number>, max?: number): { hex: string; share: number }[]
export function looksLikeBotCheck(title: string, text: string): boolean
export function imageStats(pixels: ArrayLike<number>): { average: string; busy: number }
