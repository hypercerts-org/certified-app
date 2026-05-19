// eslint.config.mjs — flat config compatible with ESLint 9.
//
// eslint-config-next 16 ships native flat-config exports under
// `eslint-config-next` (rules + Next.js plugins) and
// `eslint-config-next/core-web-vitals` (the same rules plus a few
// web-vitals lints). We use the latter to match the Next.js default.
//
// The previous config wrapped FlatCompat.extends("next/core-web-vitals",
// "next/typescript") which crashed with "Converting circular structure
// to JSON" on this Next.js version — the legacy compat layer was
// double-loading typescript-eslint. Using the native exports avoids it.

import nextConfig from "eslint-config-next/core-web-vitals";

export default [
  ...nextConfig,
  {
    ignores: [".next/", "node_modules/", "coverage/"],
  },
  {
    rules: {
      // `react-hooks/set-state-in-effect` (new in React 19's eslint plugin)
      // fires on a number of legitimate patterns we rely on:
      //   - async-fetch + cancellation flag with an explicit `setIsLoading(true)`
      //   - reset-on-dep-change (e.g. `if (!url) setBannerFailed(false)`)
      //   - the canonical SSR mount-sentinel `useEffect(() => setMounted(true), [])`
      // The React docs themselves still demonstrate (3) verbatim and there
      // is no clean automated migration. Until React Compiler is fully
      // adopted we keep the *hint* visible as a warning, but don't fail
      // CI on it. Real bugs in this category (forgotten cancellation,
      // infinite loops) still surface in dev.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];
