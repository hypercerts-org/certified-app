import { beforeEach, describe, expect, it, vi } from "vitest";

// A browser's cookie jar, standing in for next/headers.
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { value: jar.get(name) } : undefined),
    set: (name: string, value: string) => jar.set(name, value),
  }),
}));

const { beginSignIn, completeSignIn } = await import("./sign-in-state");

describe("binding a sign-in to its browser", () => {
  beforeEach(() => jar.clear());

  it("completes a sign-in started in this browser, once", async () => {
    const state = await beginSignIn("/explore");
    expect(await completeSignIn(state)).toBe("/explore");
    expect(await completeSignIn(state)).toBeNull();
  });

  it("refuses a callback for a sign-in started in another browser (login CSRF)", async () => {
    const attackers = await beginSignIn("/");
    jar.clear();
    await beginSignIn("/"); // the victim's own, unrelated sign-in
    expect(await completeSignIn(attackers)).toBeNull();
  });

  it("refuses a callback without app state", async () => {
    await beginSignIn("/");
    expect(await completeSignIn(null)).toBeNull();
  });
});
