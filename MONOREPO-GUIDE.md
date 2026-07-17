# TACA LMS Frontend — Monorepo Guide

A reference guide for how this Turborepo + pnpm workspace is structured and how to work with it day to day.

---

## 1. Repo structure

```text
taca-lms-frontend/
  apps/
    marketing/       → public marketing site (domain.com)
    dashboard/       → admin + student dashboard (app.domain.com)
  packages/
    assets/         → shared image/static assets (@repo/assets)
    ui/              → shared React component library (@repo/ui)
    eslint-config/   → shared ESLint config (@repo/eslint-config)
    typescript-config/ → shared tsconfigs (@repo/typescript-config)
  pnpm-workspace.yaml
  turbo.json
  package.json       → root: repo-wide scripts + dev tooling only
```

- `apps/*` are deployable Next.js applications.
- `packages/*` are internal shared packages consumed by the apps.
- `pnpm-workspace.yaml` includes `apps/*` and `packages/*`, so any new folder there is picked up automatically — no config change needed when adding an app or package.

## 2. Apps: marketing vs dashboard

| App              | Purpose                    | Domain           | Local port |
| ---------------- | -------------------------- | ---------------- | ---------- |
| `apps/marketing` | Public marketing site      | `domain.com`     | 3001       |
| `apps/dashboard` | Admin + student dashboards | `app.domain.com` | 3000       |

- Ports are configured in each app's `package.json` under `scripts.dev` (e.g. `next dev --port 3000`). Ports only matter locally; they have no effect on production domains.
- In Vercel, create **two projects from the same repo**: one with root directory `apps/marketing` (domain `domain.com`), one with `apps/dashboard` (domain `app.domain.com`).
- Inside `apps/dashboard`, both roles live under one app using routes:
  - `app.domain.com/admin` → admin dashboard
  - `app.domain.com/student` → student dashboard
  - Protect each role with middleware + server-side authorization, not just hidden navigation or client-side checks.
- If auth cookies must work across both sites, scope them to `.domain.com`; otherwise keep auth scoped to `app.domain.com`.

## 3. Renaming an app (what we did: docs → marketing, web → dashboard)

When renaming an app folder, also update:

1. The folder name itself (`apps/docs` → `apps/marketing`)
2. `"name"` in that app's `package.json`
3. Any in-app references (paths, `appName` props, etc.)
4. Root `README.md` (descriptions and `--filter=` examples)
5. Run `pnpm install` to regenerate `pnpm-lock.yaml`
6. Update Vercel project root directories if already deployed

Verify nothing is stale:

```sh
pnpm check-types
pnpm lint
pnpm build
```

## 4. Installing packages

### For a specific app

Use `--filter <package-name>` (the `name` field of that app's `package.json`):

```sh
pnpm add axios --filter dashboard
pnpm add zod --filter marketing
pnpm add -D vitest --filter dashboard      # dev dependency
```

Or `cd` into the app and run `pnpm add` there.

### At the workspace root (repo-wide dev tooling only)

Use `-w` (`--workspace-root`) for tooling used by the whole monorepo — like `prettier`, `turbo`, `typescript`:

```sh
pnpm add -D -w eslint
```

**Do not** install runtime libraries (like `axios`) with `-w`. Apps may resolve them by accident through hoisting, but they aren't declared dependencies, so isolated builds (e.g. Vercel) can fail.

### Internal workspace packages

Use the `workspace:` protocol via `--workspace`:

```sh
pnpm add @repo/ui --filter dashboard --workspace
```

This adds `"@repo/ui": "workspace:*"` to the app's `package.json`.

### Rule of thumb

| What                                           | How                                         |
| ---------------------------------------------- | ------------------------------------------- |
| App runtime dependency (`axios`, `zod`, …)     | `pnpm add <pkg> --filter <app>`             |
| Repo-wide dev tooling (`prettier`, `turbo`, …) | `pnpm add -D -w <pkg>`                      |
| Internal shared package (`@repo/*`)            | `pnpm add <pkg> --filter <app> --workspace` |

## 5. Sharing a runtime library across both apps (e.g. axios)

**Option A (default): add it to each app that imports it.** pnpm stores one physical copy, so this doesn't duplicate downloads:

```sh
pnpm add axios --filter marketing --filter dashboard
```

Keep versions in sync with a **catalog** in `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
catalog:
  axios: ^1.7.9
```

```sh
pnpm add axios@catalog: --filter marketing --filter dashboard
```

**Option B (best long-term): wrap it in an internal package.** Create e.g. `packages/api-client` that owns `axios` plus interceptors/base URL/auth headers. Apps import `@repo/api-client` and never import `axios` directly.

## 6. Sharing helper functions

Create a shared package under `packages/` — for example `packages/utils`:

```text
packages/utils/
  src/
    format-date.ts
  index.ts
  package.json
```

`packages/utils/package.json`:

```json
{
  "name": "@repo/utils",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./index.ts",
    "./format-date": "./src/format-date.ts"
  }
}
```

Add to both apps:

```sh
pnpm add @repo/utils --workspace --filter marketing --filter dashboard
```

Use it:

```ts
import { formatDate } from "@repo/utils";
```

Notes:

- **You don't create a `repo` folder.** `@repo` is just the npm package-name namespace; the package physically lives at `packages/utils`.
- Keep shared helpers framework-independent when possible; separate browser-only and server-only helpers.
- Never copy-paste helpers between apps or import files directly across app boundaries.

## 7. Tailwind CSS (v4, central setup) — done

Tailwind v4 is CSS-first: **no `tailwind.config.js`**. Theme tokens live in one shared CSS file in `packages/ui`, and both apps import it. Change a token once → both apps update.

### 7.1 What is installed where

```sh
# apps compile the CSS, so they get the PostCSS plugin
pnpm add -D tailwindcss @tailwindcss/postcss --filter dashboard --filter marketing

# the shared package owns the tokens
pnpm add -D tailwindcss --filter @repo/ui
```

### 7.2 PostCSS config in each app

`apps/dashboard/postcss.config.mjs` and `apps/marketing/postcss.config.mjs` (identical):

```js
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
```

### 7.3 Central token file

`packages/ui/src/styles/globals.css` is the single source of truth for design tokens:

```css
@import "tailwindcss";

@source "../**/*.{ts,tsx}";
@source "../../../../apps/**/*.{ts,tsx}";

@theme {
  --color-background: #ffffff;
  --color-foreground: #171717;
}

@layer base {
  body {
    background-color: var(--color-background);
    color: var(--color-foreground);
  }
}
```

- `@theme` tokens become Tailwind utilities (`--color-background` → `bg-background`).
- `@source` tells Tailwind which files to scan for class names (the shared package and both apps).

It is exported from `packages/ui/package.json`:

```json
"exports": {
  "./globals.css": "./src/styles/globals.css",
  "./*": "./src/*.tsx"
}
```

### 7.4 Apps consume the shared CSS

Both `apps/*/app/globals.css` contain just:

```css
@import "@repo/ui/globals.css";
```

(`layout.tsx` already imports `./globals.css`, so nothing else changes.)

### 7.5 App-specific styles and overrides

An app can add its own styles **below the import** — they only affect that app:

```css
@import "@repo/ui/globals.css";

/* dashboard-only token */
@theme {
  --color-sidebar: #0f172a;
}

/* override a shared token for this app only */
@theme {
  --color-background: #f8fafc;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: 240px 1fr;
}
```

Keep the `@import` on the first line so overrides come after it.

Rule of thumb:

| Style                   | Where                                          |
| ----------------------- | ---------------------------------------------- |
| Shared across both apps | `packages/ui/src/styles/globals.css`           |
| One app only            | that app's `app/globals.css`, below the import |

## 8. Shared assets

Put common brand/static assets in `packages/assets`, not in an app and not directly in `packages/ui`.

```text
packages/assets/
  src/
    fonts/
      GeistVF.woff
      GeistMonoVF.woff
    images/
      logo.svg
      logo-mark.svg
  package.json
```

The package exports assets by path:

```json
{
  "name": "@repo/assets",
  "exports": {
    "./fonts/*": "./src/fonts/*",
    "./images/*": "./src/images/*"
  }
}
```

Add it to any app that imports shared assets:

```sh
pnpm add @repo/assets --workspace --filter dashboard
pnpm add @repo/assets --workspace --filter marketing
```

Use it from an app:

```tsx
import logo from "@repo/assets/images/logo.svg";

export function HeaderLogo() {
  return <img src={logo.src} alt="TACA logo" />;
}
```

Load shared local fonts from each app layout with `next/font/local`:

```tsx
import localFont from "next/font/local";

const geistSans = localFont({
  src: "../../../packages/assets/src/fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});

const geistMono = localFont({
  src: "../../../packages/assets/src/fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});
```

`next/font/local` expects a filesystem path relative to the layout file, so app layouts point directly at `packages/assets/src/fonts`. The `@repo/assets/fonts/*` export is still useful for non-`next/font` asset imports.

Rule of thumb:

| Asset type                                       | Where                                      |
| ------------------------------------------------ | ------------------------------------------ |
| Shared brand assets (`logo.svg`, default avatar) | `packages/assets/src/images`               |
| Shared font files (`.woff`, `.woff2`)            | `packages/assets/src/fonts`                |
| Components that render assets (`Logo`, header)   | `packages/ui` or the app using them        |
| Marketing-only hero images                       | `apps/marketing/public` or marketing files |
| Dashboard-only screenshots/icons                 | `apps/dashboard/public` or dashboard files |

## 9. shadcn/ui components

Install shadcn components **centrally in `packages/ui`**, and have both apps consume them. This is the officially supported shadcn monorepo pattern.

**Prerequisite:** Tailwind must already be set up (section 7). We use Tailwind v4, so every `components.json` leaves `tailwind.config` blank and points to the shared CSS file.

### 9.1 Workspace routing

Every workspace that uses the shadcn CLI has a `components.json`. `package.json` handles dependencies; `components.json` tells the CLI where generated files go and how imports are written.

`packages/ui/package.json` exposes shared install targets:

```json
{
  "imports": {
    "#components/*": "./src/components/*.tsx",
    "#hooks/*": "./src/hooks/*.ts",
    "#lib/*": "./src/lib/*.ts"
  },
  "exports": {
    "./globals.css": "./src/styles/globals.css",
    "./components/*": "./src/components/*.tsx",
    "./hooks/*": "./src/hooks/*.ts",
    "./lib/*": "./src/lib/*.ts"
  }
}
```

Each app uses package-local aliases for app-only files:

```json
{
  "imports": {
    "#components/*": "./components/*.tsx",
    "#hooks/*": "./hooks/*.ts",
    "#lib/*": "./lib/*.ts"
  }
}
```

### 9.2 Current shadcn settings

Use the same settings in `packages/ui/components.json`, `apps/dashboard/components.json`, and `apps/marketing/components.json`:

- `style`: `base-nova`
- `baseColor`: `neutral`
- `iconLibrary`: `lucide`
- `rsc`: `true`
- `tsx`: `true`
- `cssVariables`: `true`
- `tailwind.config`: empty string for Tailwind v4

App configs route shared primitives to `@repo/ui`:

```json
{
  "aliases": {
    "components": "#components",
    "hooks": "#hooks",
    "lib": "#lib",
    "utils": "@repo/ui/lib/utils",
    "ui": "@repo/ui/components"
  }
}
```

The shared UI package config routes files locally:

```json
{
  "aliases": {
    "components": "#components",
    "hooks": "#hooks",
    "lib": "#lib",
    "utils": "#lib/utils",
    "ui": "#components"
  }
}
```

### 9.3 Adding components

Run the CLI from the repo root and point `-c` at an app workspace:

```sh
pnpm dlx shadcn@latest add button -c apps/dashboard
```

The app config routes primitive UI files into `packages/ui/src/components`. Import from either app:

```ts
import { Button } from "@repo/ui/components/button";
```

Use the same pattern for other shared primitives:

```sh
# shared primitives, installed into packages/ui/src/components
pnpm dlx shadcn@latest add card -c apps/dashboard
pnpm dlx shadcn@latest add table -c apps/dashboard
pnpm dlx shadcn@latest add input -c apps/dashboard
pnpm dlx shadcn@latest add dialog -c apps/dashboard
```

You can use `apps/marketing` as the CLI entrypoint too:

```sh
pnpm dlx shadcn@latest add card -c apps/marketing
```

For shared primitives, both entrypoints should produce the same shared result because both app configs route `ui` to `@repo/ui/components`.

Dependencies required by shared primitives (`@base-ui/react`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, etc.) belong in `packages/ui`, not the apps.

### 9.4 App-local blocks

If you add a block that includes app-specific composition, forms, or routes, it can create app-local files under that app's `components`, `hooks`, or `lib` directories while still importing primitives from `@repo/ui`.

```sh
# dashboard-only block/composed component
pnpm dlx shadcn@latest add login-01 -c apps/dashboard

# marketing-only block/composed component
pnpm dlx shadcn@latest add login-01 -c apps/marketing
```

Default to central shared primitives. Only keep a component app-local when it is genuinely specific to one app.

Shared theme tokens, `globals.css`, and the `cn()` util live in `packages/ui`.

### 9.5 Import examples

```tsx
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
```

## 10. Common commands

```sh
# run everything
pnpm dev
pnpm build

# run a single app
pnpm exec turbo dev --filter=marketing
pnpm exec turbo dev --filter=dashboard

# build a single app
pnpm exec turbo build --filter=dashboard

# checks
pnpm lint
pnpm check-types (check typescript types)
pnpm format

# For one project only:
pnpm exec turbo check-types --filter=dashboard
pnpm exec turbo check-types --filter=marketing
pnpm exec turbo check-types --filter=@repo/ui

# Equivalent direct pnpm form:
pnpm --filter dashboard check-types
pnpm --filter marketing check-types
pnpm --filter @repo/ui check-types

# lint one workspace only
pnpm exec turbo lint --filter=dashboard
pnpm exec turbo lint --filter=marketing
pnpm exec turbo lint --filter=@repo/ui

# equivalent pnpm filter form
pnpm --filter dashboard lint
pnpm --filter marketing lint
pnpm --filter @repo/ui lint

# install global:
pnpm install

# install for a specific package:
pnpm install --filter dashboard
pnpm install --filter marketing
pnpm install --filter @repo/ui
```
