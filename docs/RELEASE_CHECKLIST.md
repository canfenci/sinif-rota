# Sınıf Rota — v1.0 Release & Deployment Checklist

This document defines the authoritative, deterministic release contract for **Sınıf Rota v1.0**.

---

## 1. Authoritative Hosting Target

- **Target Platform**: ChatGPT Sites / root-hosted Cloudflare Worker application (configured via `@openai/sites-vite-plugin` and `vinext`).
- **Existing Project ID**: `appgprj_6a86ff5180b8819184a4b8e7ad8833b4`
- **Canonical Public HTTPS URL**: `https://okul-takip.cnmrt84.chatgpt.site/`
- **Important**: **GitHub Pages is NOT the v1 production target.** The application relies on root-domain routing (`/`), Cloudflare Worker SSR, and root-scoped PWA lifecycle.

---

## 2. Pre-Release Local Quality Gates

Before any push or release, verify that the local repository is clean and all quality gates pass:

```bash
# 1. Inspect git state
git status
git rev-parse --short HEAD
git rev-parse --short origin/main

# 2. Execute automated quality gates
npm test
npm run build
npm run lint
npm run typecheck
git diff --check
```

**Required Gate Conditions:**
- All 368/368 automated tests PASS.
- Production build succeeds (`vinext build` + Service Worker finalization).
- ESLint: 0 errors, 0 warnings.
- TypeScript (`tsc --noEmit`): 0 errors.
- `git diff --check` is clean.
- Working tree is clean (no uncommitted modifications).

---

## 3. Build Traceability Contract

The exact release commit hash (e.g. `f360198`) must match across all runtime layers:

1. **Local Git HEAD**: `git rev-parse --short HEAD`
2. **Application UI Footer**: `Sınıf Rota · Build <hash>` (rendered on the homepage and logged to console on boot)
3. **Production Service Worker (`dist/client/sw.js`)**:
   ```javascript
   const BUILD_ID = "<hash>";
   const CACHE_NAME = "sinif-rota-<hash>";
   ```

> **Hard Gate**: Never begin formal QA when any of these identifiers differ.

---

## 4. Push Contract

Once local quality gates pass:

```bash
# Push release commit to upstream
git push origin main

# Confirm upstream synchronization
git fetch origin
git rev-parse --short HEAD
git rev-parse --short origin/main
```

**Required Gate Conditions:**
- `HEAD` equals `origin/main`.
- **No force push (`--force`) allowed.**

---

## 5. Platform Deployment / Publish

Publish or update the **EXISTING** Sınıf Rota ChatGPT Sites project:
- **Project ID**: `appgprj_6a86ff5180b8819184a4b8e7ad8833b4`
- The platform publish mechanism must be performed/confirmed before starting remote verification or Device QA.

---

## 6. Remote Smoke Verification Contract

Run the following checks against `https://okul-takip.cnmrt84.chatgpt.site/`:

```bash
# 1. Verify root application response and UI Build ID
curl -s -L https://okul-takip.cnmrt84.chatgpt.site/ | grep -o 'Sınıf Rota · Build [a-f0-9]*'

# 2. Verify Service Worker BUILD_ID and CACHE_NAME
curl -s -L https://okul-takip.cnmrt84.chatgpt.site/sw.js | grep -E 'const (BUILD_ID|CACHE_NAME) ='

# 3. Verify Web App Manifest
curl -s -L https://okul-takip.cnmrt84.chatgpt.site/manifest.webmanifest | grep '"name": "Sınıf Rota"'

# 4. Verify core icon assets (HTTP 200)
curl -s -o /dev/null -w "%{http_code}\n" https://okul-takip.cnmrt84.chatgpt.site/icon-192.png
```

**Required Smoke Conditions:**
- `/` returns HTTP 200 and HTML containing `Sınıf Rota · Build <HEAD>`.
- `/sw.js` returns HTTP 200 and contains `const BUILD_ID = "<HEAD>";`.
- `/manifest.webmanifest` returns HTTP 200 with valid JSON.
- `/icon-192.png` and `/favicon.ico` return HTTP 200.

---

## 7. Device QA Hard Gate

Formal Device QA (iOS Safari, Android Chrome, Desktop PWA) may start **ONLY** when:

$$\text{Local HEAD} == \text{origin/main HEAD} == \text{Remote UI Build ID} == \text{Remote SW BUILD\_ID}$$

---

## 8. Service Worker Update & Caching Note

- A newly deployed Service Worker installs in the background and activates once older controlled tabs are closed.
- **For clean release verification**: Close all open Sınıf Rota browser tabs and installed PWA standalone instances, then reopen `https://okul-takip.cnmrt84.chatgpt.site/`.
- **DO NOT clear `localStorage`**: Testers must never delete user data; testing must evaluate backward compatibility and data preservation across updates.

---

## 9. Failure Detection & Resolution Matrix

| Failure Mode | Detection | Root Cause | Resolution |
|---|---|---|---|
| **Remote UI shows old build** | Footer displays previous commit hash | Platform publish not triggered or CDN cache propagating | Confirm platform publish completed; hard-refresh without service worker bypass. |
| **`sw.js` shows old build** | `curl /sw.js` has previous `BUILD_ID` | Edge cache or deployment pending | Re-trigger platform publish; check platform deployment logs. |
| **`origin/main` differs from local** | `git rev-parse HEAD != origin/main` | Local commit not pushed | Run `git push origin main`. |
| **Manifest 404** | `curl /manifest.webmanifest` returns 404 | Asset missing from client bundle | Run `npm run build` to verify `dist/client/manifest.webmanifest` exists. |
| **Site 5xx Error** | HTTP status 500 / 502 / 503 on navigation | Edge Worker runtime exception | Check Cloudflare / ChatGPT Sites runtime logs. |
| **Old SW controls session** | Console shows old build version log | Existing tab holding previous worker | Close all tabs/PWA windows for `okul-takip.cnmrt84.chatgpt.site` and reopen. |
