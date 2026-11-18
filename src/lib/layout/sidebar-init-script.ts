/*
 * The sidebar's remembered state, as the before-paint script reads it. No
 * "use client": the root layout (a server component) puts
 * SIDEBAR_INIT_SCRIPT in <head>. Taken from a "use client" module the
 * string would reach the browser as a client reference that resolves only
 * once the layout's client chunk has loaded; when it hadn't, <head>
 * suspended mid-hydration and the page failed to hydrate. sidebar-state.ts
 * (the hook) imports the key and attribute from here.
 */

/** Where the choice is kept (this browser only). */
export const SIDEBAR_STORAGE_KEY = "certified_sidebar"

/** `data-sidebar` on <html>. */
export const SIDEBAR_ATTR = "sidebar"

/** Inline script for <head> (root layout): apply the remembered state
 *  before first paint. */
export const SIDEBAR_INIT_SCRIPT = `try{if(localStorage.getItem(${JSON.stringify(
  SIDEBAR_STORAGE_KEY,
)})==="rail")document.documentElement.dataset.${SIDEBAR_ATTR}="rail"}catch(e){}`
