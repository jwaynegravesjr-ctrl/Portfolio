# J Wayne Graves Jr — Portfolio

The [public portfolio](https://jwaynegravesjr-ctrl.github.io/Portfolio/) is built from the TypeScript and Vite project in `site/`. GitHub Pages serves the generated `index.html` and `assets/` from this repository's root. The previous version remains available in Git history.

## Contents

- [Site](#site)
- [Build and publish](#build-and-publish)
- [Checks](#checks)
- [Revision history](#revision-history)

## Site

The site contains the approved ink-on-paper banner with eight birds clearing sixteen pieces of debris from three utility lines. The birds emerge slowly from staggered ink pools before cleanup begins. Their movement runs at 85% of the approved rate, so the banner finishes in about 14.54 seconds; the name and larger professional title remain visible once formed. Its warm ivory background matches the website. The banner has no visible Pause or Replay buttons. The graph in the existing results section traces the five reported monthly observations 26.5% faster than the reference, in about 5.69 seconds. The original native table retains its rules-first ink formation and saves unfinished progress when it leaves view. The page also includes the Genetics Support Tool case story, a synthetic report gallery, contact information, and a viewable and downloadable résumé. Native HTML keeps the content readable and accessible; reduced-motion and rendering fallbacks show completed compositions.

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

For local review of the current source, run `npm run build` and `npm run preview -- --port 8905 --strictPort` in `site/`, then open `http://127.0.0.1:8905/`. This local build does not alter the Pages output at the repository root. To preview the deployed path after an authorized Pages build, run `npx vite preview --mode pages` and open `/Portfolio/`.

## Checks

From `site/`, run `npm run validate` for the retimed score, observations, and requested copy. With the local preview running on port 8905, run `npm run check:browser` for WebGL, desktop/mobile artwork, separate visible-time clocks, table interruption/resume, keyboard graph/table controls, reduced motion, and fallbacks. Before any authorized publication, run `npm run build:pages` and check the portrait, report gallery, résumé view/download, contact links, navigation, and mobile layout under `/Portfolio/`.

## Revision history

| Date | Change |
| --- | --- |
| 2026-09-25 | Integrated the approved utility-line banner, faster independent graph, persistent table playback, requested copy edits, permanent hero title, portrait-caption removal, and matching paper color into the GitHub Pages build. |
| 2026-09-24 | Matched the hero canvas, CSS background, and desktop/mobile fallback images to the website's `#efe7d7` paper; the separate graph treatment remains unchanged. Local checks pass; no deployment. |
| 2026-09-24 | Enlarged and retained the hero's professional title, lengthened the birds' staggered ink birth, removed the portrait caption, sped the graph by a further 10%, and refreshed static fallbacks. Local checks pass; no deployment. |
| 2026-09-24 | Birds retimed to 85% speed with a 12.94-second final hold; banner controls removed; graph trace sped up 15% to 6.26 seconds. Local preview and focused checks updated; no deployment. |
| 2026-09-24 | Local review candidate: approved 11-second utility-wire banner and 7.2-second graph, independent table playback, exact copy edits, and focused desktop/mobile checks. No push or deployment. |
| 2026-09-23 | Published the 24-second opening with ink-formed title, slower wingbeats, opposite-edge newcomers, and a seamless six-bird loop boundary. |
| 2026-09-23 | Replaced the former static portfolio with the Shared Perch website, embedded résumé, and reproducible GitHub Pages build. |
