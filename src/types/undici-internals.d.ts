// Deep imports used by src/lib/security/ssrf.ts to avoid undici's index,
// which replaces the process-wide fetch dispatcher on load.
declare module "undici/lib/dispatcher/agent.js" {
  const Agent: typeof import("undici").Agent
  export default Agent
}
declare module "undici/lib/core/connect.js" {
  const buildConnector: typeof import("undici").buildConnector
  export default buildConnector
}
