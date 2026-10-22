/**
 * Stylelint — enforces the CLAUDE.md design-system hard rules only.
 *
 * Deliberately no `extends`: this config is a guardrail for tokens, not a
 * formatter. Font-size, letter-spacing and motion durations are documented
 * in DESIGN.md but NOT enforced here.
 *
 * Run: npm run lint:css
 *
 * Rules:
 *   1. No raw hex / rgb / rgba / hsl / hsla / named colors
 *      (tokens.css + landing.css are exempt via `overrides`).
 *   2. box-shadow is `var(--shadow-*)` or `none` (same exemption).
 *   3. z-index is `var(--z-*)` (optionally `calc(var(--z-*) +/- n)`),
 *      `auto`, or `0`. Local raises use `var(--z-local-raise)`.
 *   4. border-radius is `var(--radius)`, `var(--radius-pill)`, `999px`,
 *      `50%`, `0`, `inherit` — alone or combined per corner.
 *   5. Width media features are the 800 / 1100 / 1300 breakpoints only
 *      (min-width: X, max-width: X-1). Non-width features are unrestricted.
 */

const RADIUS_VALUE = String.raw`(?:var\(--radius(?:-pill)?\)|999px|50%|0|inherit)`;
const RADIUS = new RegExp(`^${RADIUS_VALUE}(?:\\s+${RADIUS_VALUE}){0,3}$`);

const SHADOW_VAR = String.raw`var\(--shadow-[a-z0-9-]+\)`;
const SHADOW = [new RegExp(`^${SHADOW_VAR}(?:\\s*,\\s*${SHADOW_VAR})*$`), "none"];

const Z_INDEX = [
  /^var\(--z-[a-z0-9-]+\)$/,
  /^calc\(var\(--z-[a-z0-9-]+\)\s*[-+]\s*\d+\)$/,
  "auto",
  "0",
];

const RADIUS_PROPS = [
  "border-radius",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-left-radius",
  "border-bottom-right-radius",
  "border-start-start-radius",
  "border-start-end-radius",
  "border-end-start-radius",
  "border-end-end-radius",
];

const radiusAllowList = Object.fromEntries(RADIUS_PROPS.map((p) => [p, [RADIUS]]));

/** @type {import('stylelint').Config} */
const config = {
  reportDescriptionlessDisables: true,
  reportInvalidScopeDisables: true,
  reportNeedlessDisables: true,
  rules: {
    // Rule 1 — colors come from tokens.
    "color-no-hex": true,
    "color-named": "never",
    "function-disallowed-list": ["rgb", "rgba", "hsl", "hsla", "hwb", "lab", "lch", "oklab", "oklch"],

    "declaration-property-value-allowed-list": {
      // Rule 2 — shadows.
      "box-shadow": SHADOW,
      // Rule 3 — z-index.
      "z-index": Z_INDEX,
      // Rule 4 — radii.
      ...radiusAllowList,
    },

    // Rule 5 — canonical breakpoints only.
    "media-feature-name-value-allowed-list": {
      "min-width": ["800px", "1100px", "1300px"],
      "max-width": ["799px", "1099px", "1299px"],
    },
    "media-feature-name-disallowed-list": [
      ["width", "height", "min-height", "max-height", "device-width", "min-device-width", "max-device-width"],
      { message: (name) => `Media feature "${name}" is not allowed; use min-width/max-width at 800/1100/1300 (CLAUDE.md rule 3)` },
    ],
  },
  overrides: [
    {
      // Token source files may hold raw color and shadow values.
      files: ["src/app/styles/tokens.css", "src/app/styles/landing.css"],
      rules: {
        "color-no-hex": null,
        "color-named": null,
        "function-disallowed-list": null,
        "declaration-property-value-allowed-list": {
          "z-index": Z_INDEX,
          ...radiusAllowList,
        },
      },
    },
  ],
};

export default config;
