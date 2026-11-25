# Vendored `@hypercerts-org/sdk`

`@hypercerts-org/sdk` is not published to npm yet. Until it is, `certified-app` installs a packed tarball from this directory (`"@hypercerts-org/sdk": "file:vendor/hypercerts-org-sdk-0.0.0.tgz"`).

## Updating the tarball

From a checkout of `hypercerts-org/sdk` on the target commit:

```bash
pnpm install
pnpm build
pnpm pack --pack-destination /path/to/certified-app/vendor
```

Then in `certified-app`, run `pnpm install` to refresh `pnpm-lock.yaml`, and verify:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Record the upstream commit SHA in the commit message when bumping this tarball.
