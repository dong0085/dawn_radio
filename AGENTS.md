# Dawn Radio

## Git workflow

- Work directly on `main` in this checkout. Commit to `main` and push to `origin main`.
- Several agents may edit this checkout at the same time. Commit only the files you changed, and leave other uncommitted changes as they are.
- Every push to `main` deploys to production at https://dawn-radio.pages.dev (Cloudflare Pages). Run `pnpm build` and confirm it passes before pushing.

## Tooling

- Package manager: pnpm (`pnpm install`, `pnpm dev`, `pnpm build`, `pnpm lint`).
