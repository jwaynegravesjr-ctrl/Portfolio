# J Wayne Graves Jr — Portfolio

The [public portfolio](https://jwaynegravesjr-ctrl.github.io/Portfolio/) is built from the TypeScript and Vite project in `site/`. GitHub Pages serves the generated `index.html` and `assets/` from this repository's root. The previous version remains available in Git history.

## Contents

- [Site](#site)
- [Build and publish](#build-and-publish)
- [Checks](#checks)
- [Revision history](#revision-history)

## Site

The opening is a hand-drawn ink animation. The page includes the Genetics Support Tool case story, full-operation figures, a synthetic report gallery, contact information, and a viewable and downloadable résumé. Native HTML keeps the content readable and accessible while decorative WebGL ink forms it as visitors scroll. Reduced-motion and rendering fallbacks show the content directly.

## Build and publish

Install Node.js 24 or a compatible release, then run in PowerShell:

```powershell
cd site
npm ci
cd ..
./scripts/build-pages.ps1
git add -A
git commit -m "Update portfolio site"
git push origin main
```

The script runs the Pages build with the `/Portfolio/` base path and refreshes only the generated root `index.html` and `assets/`. The development study at `site/ink-study.html` stays in source and is excluded from the Pages output. Résumé PDF generation is in `site/scripts/build-resume.py`; its current output is committed under both `site/public/assets/documents/` and the generated root `assets/documents/`.

For local development, run `npm run dev` in `site/`. To preview the deployed path locally after building, run `npx vite preview --mode pages` and open `/Portfolio/`.

## Checks

From `site/`, run `npm run validate` for the timeline and `npm run build:pages` for type checking and output. Before publishing, check the portrait, report gallery, résumé view/download, contact links, navigation, and mobile layout under `/Portfolio/`. Verify the same on the [public site](https://jwaynegravesjr-ctrl.github.io/Portfolio/) after pushing.

## Revision history

| Date | Change |
| --- | --- |
| 2026-09-23 | Replaced the former static portfolio with the Shared Perch website, embedded résumé, and reproducible GitHub Pages build. |
