# Dawn Radio

## Git workflow

- Work directly on `main` in this checkout. Commit to `main` and push to `origin main`.
- Several agents may edit this checkout at the same time. Commit only the files you changed, and leave other uncommitted changes as they are.
- Every push to `main` deploys to production at https://dawn-radio.pages.dev (Cloudflare Pages). Run `pnpm build` and confirm it passes before pushing.

## Tooling

- Package manager: pnpm (`pnpm install`, `pnpm dev`, `pnpm build`, `pnpm lint`).

## Versions and the changelog

The radio shows returning listeners what changed since their last visit. The list lives in `src/changelog/changelog.json`, newest release first. Each release records the last commit it covers, so the next release starts right after it.

Bump the version when the user asks for it:

1. Run `pnpm changes` to list every commit since the last release.
2. Run `pnpm bump minor` (or `patch`, `major`, or an exact `x.y.z`). This adds a release at the current `HEAD` commit and sets the same version in `package.json`.
3. Write the new release's `notes` in `changelog.json` for every language in `languages`. Cover everything in the commit list, written for listeners: short plain lines about what they can see, hear, or do, using in-world words (channel, log, transmission). Group small fixes into one line.
4. Run `pnpm build` (it checks the changelog), then commit `src/changelog/changelog.json` and `package.json` as `Release vX.Y.Z` and push.
