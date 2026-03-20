# Publishing to npm

## Setup (one-time)

1. Create an npm account at https://npmjs.com if you haven't already
2. Generate an **Automation** token at https://www.npmjs.com/settings/~/tokens
3. Add the token to GitHub repo secrets:
   - Go to **Settings → Secrets and variables → Actions**
   - Add a new secret named `NPM_TOKEN`

## Release Methods

### Method 1: Version bump on `main` (automatic)

The `npm-publish.yml` workflow watches for `package.json` changes on `main`.
When the `version` field changes, it automatically runs lint → test → build → publish.

```bash
# Bump version and push to main
npm version patch   # or minor / major
git push origin main
```

### Method 2: Git tag (automatic)

The `publish.yml` workflow triggers on any `v*` tag pushed to the repo.

```bash
npm version patch
git push origin main --follow-tags
```

### Method 3: Manual trigger

Go to **Actions → "Publish to npm (on version bump)" → Run workflow**.
Optionally enable **dry run** to preview what would be published without actually publishing.

## What gets published

The `files` field in `package.json` controls what's included:
- `dist/` — compiled JS output
- `README.md`
- `LICENSE`

## Install (after publish)

```bash
npm install -g ezeo
npx ezeo            # or try without installing
```
