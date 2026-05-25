# Baseline — Overnight code-quality pass 2026-05-25

Reference snapshot captured before any refactor commits. Every later commit on
`feat/positioning-redesign` must keep these numbers at-or-below baseline.

## Repo

- Branch: `feat/positioning-redesign`
- Starting SHA: `ff5f24ad29a381b7f0fde8d4bae6028408ef9fd4`
- Working tree: clean
- Source files: 335 `.ts`/`.tsx` under `src/`
- Node deps: see `package.json` (Next 16.2.6 + Turbopack, React 19, TS 5, ESLint 9, Vitest 4)

## Verification snapshot

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` | 0 errors |
| `npm run lint` | 0 errors, 56 warnings |
| `npm run build` | Pass (compiled 4.1s, 45 routes prerendered) |
| `npm test` (vitest) | 154 passed across 8 files |
| Bundle size | Not surfaced by Next 16 Turbopack build (no per-route First Load JS table emitted). Not used as gate. |

## Lint warning composition

All 56 warnings are non-blocking. Dominant categories (from
`/tmp/lint-baseline.txt`):

- `react-hooks/set-state-in-effect` (the long-form Next 16 warning about
  setState inside useEffect). Concentrated in onboarding/group/profile state
  machines.
- A small number of `react-hooks/exhaustive-deps` and `@next/next/no-img-element`.

These are pre-existing and out of scope for this pass unless a refactor would
trivially remove them as a side effect.

## TypeScript error codes present

None. The baseline has zero TS errors. The rule for this pass is therefore
*strict*: any new TS error of any code is a regression and the offending
commit must be reverted.

## How to re-run the gate

```sh
npx tsc --noEmit
npm run lint
npm run build
npm test
```

A track's worktree must be green on all four before integration.
