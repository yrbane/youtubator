# Changelog

[SemVer](https://semver.org/) versioning: the version lives in `apps/web/package.json`,
is injected at build time (`__APP_VERSION__`) and shown in the app's topbar.

## 0.20.13 — 2026-08-26 · "A precision on rule 13"

- `docs/GUIDELINES.md` §13 clarified: the targeted `tsc --noEmit` exclusion
  isn't just for `.svelte` files, but also for the rune-based `*.svelte.ts`
  stores from rule 2 (`deck.svelte.ts`, `mixer.svelte.ts`…) — checked
  tonight: `tsc` alone fails on them with `Cannot find name '$state'`,
  missing the Svelte preprocessor. The rule now also references tonight's
  two fixes (v0.20.12) as concrete proof this isn't a theoretical risk.
- No code change, `pnpm test` 296/296 green before and after.

## 0.20.12 — 2026-08-26 · "What rule 13 just found"

- **Two type fixes pushed to `lutin/ameliorations` (PR #2)**, found by
  running the targeted `tsc --noEmit` command from rule 13 (v0.20.11 below)
  on `apps/web/src`: without it, neither `pnpm typecheck` (limited to
  `packages/audio-engine`) nor `pnpm build` (esbuild, no type-checking) would
  have caught them.
  - `library.ts`: `WaveformRecord#gridV` (`number`, without `| null` unlike
    its neighbors `bpm`/`anchorS`/`loopInS`/`loopOutS`) was explicitly
    assigned `undefined` in `saveWaveform` — rejected by
    `exactOptionalPropertyTypes`. Aligned with the neighboring fields'
    convention (`| null`, `?? null` default), no behavior change.
  - `track-meta.ts`: `nextColor` indexed `TRACK_COLORS` with a modulo that
    `noUncheckedIndexedAccess` couldn't prove stays in bounds (it always
    does at runtime) — explicit `TRACK_COLORS[0]` fallback, unchanged
    behavior (299 tests still green on the branch, including `nextColor`'s).
- No change on `main` (rule 6): `pnpm test` 296/296 green before and after
  this commit.

## 0.20.11 — 2026-08-26 · "An any that shouldn't travel"

- **`docs/GUIDELINES.md`**: new §12 and §13 rules. §12 extends rule 8 to
  external HTTP API JSON responses (`fetch(...).json()`): unlike an untyped
  browser API, nothing prevents typing an HTTP response — yet
  `apps/web/src/lib/youtube-account.ts` propagated `any` all the way into the
  public signature of `fetchAccountIdentity()`, even though `accounts.ts`
  already defined `RawChannels`/`RawUserinfo` for the same use, just not
  exported. §13 documents that `pnpm typecheck` only covers
  `packages/audio-engine` (neither `apps/web` nor `extension` has a
  `tsconfig.json`) and that `pnpm build` doesn't fill that gap (esbuild
  transpiles without type-checking) — with the `tsc --noEmit` command to run
  by hand on those two packages until issue #3 is settled.
- **Typing fix pushed to the `lutin/ameliorations` branch (PR #2)**, not to
  `main` (rule 6): `apiGet` becomes generic, `fetchAccountIdentity`/
  `fetchMyPlaylists`/`fetchPlaylistPage`/`fetchLikedPlaylistId` no longer use
  `any` — verified with a targeted `tsc --noEmit` (the root typecheck script
  doesn't cover this file, see §13) and the full test suite (299/299 green
  on the branch, build with no new warning). The branch was also resynced
  with `main` (2 doc commits absorbed); CI green after both pushes.
- README § 16: pointer to `docs/GUIDELINES.md` updated with the two new
  topics.
- §1 and §5 re-checked: unchanged on `main` (`pnpm audit` still at 19
  dev-only alerts, fixes ready on PR #2 — CI green, still not merged after
  12 nights; arbitration requested in issues #10 and #13, no answer to date;
  `pnpm test` 296/296 green before and after this commit, no code change on
  `main`); `gitleaks detect --log-opts="--all"` scan clean (93 commits,
  full history of both branches).

## 0.20.10 — 2026-08-25 · "Where session secrets live"

- **`docs/GUIDELINES.md`**: new §10 and §11 rules. §10 documents the split
  already in place in `youtube-auth.ts` between non-sensitive identifiers
  persisted in `localStorage` (Client ID, active account) and the OAuth
  access token itself, confined to `sessionStorage` (cleared when the tab
  closes) — a future OAuth backend (SoundCloud, issue #1) follows the same
  split. §11 documents the `e.source` filtering (never `e.origin` alone, and
  never implicit trust) used by the repo's two cross-frame `postMessage`
  channels (`deck-channel.ts` app↔YouTube iframe,
  `extension/src/main.ts` content-script↔parent page), verified: these are
  the only two `message` listeners in the repo and both already filter
  correctly.
- README § 16: pointer to `docs/GUIDELINES.md` updated with the two new
  topics.
- §1 and §5 re-checked: unchanged on `main` (`pnpm audit` still at 19
  dev-only alerts, fixes ready on PR #2 — CI green, still not merged after
  11 nights; arbitration requested in issues #10 and #13, no answer to date;
  `pnpm test` 296/296 green before and after this commit, no code change);
  `gitleaks detect --log-opts="--all"` scan clean (91 commits).
- Recurrence of the production symptom that opened issue #8 (`GET /` → 500 +
  `AH00124`, same client/timestamp across both lines, `python-requests`
  user-agent): re-checked, same diagnosis as the four previous passes — out
  of scope for this repo (GUIDELINES §3). Details in the comment added to
  issue #8.

## 0.20.9 — 2026-08-24 · "Two rules that are true today"

- **`docs/GUIDELINES.md`**: new §8 and §9 rules. §8 documents that `any` (about twenty occurrences, `apps/web/src`, `extension/src`) stays confined to boundaries with browser APIs the project has no official typings for (`chrome.*`, the `YT` global, `google` from Sign-In, Web MIDI, File System Access) — `packages/audio-engine/src` and the `*-core.ts` modules (rule 6) sit at zero `any`, verified by grep. §9 documents the criterion that separates a capability shared across backends (joins `DeckAudioBackend`/`DeckCapabilities`) from one specific to a single backend (`instanceof` narrowing from `Deck`, like `LocalFileBackend#decodeForAnalysis`/`setFilter`/`engageLoop`) — relevant for the future SoundCloud backend (issue #1).
- README § 16: pointer to `docs/GUIDELINES.md` updated with the two new topics.
- §1 re-checked: unchanged on `main` (`pnpm audit` still at 19 dev-only alerts, fixes ready on PR #2 — CI green, `MERGEABLE`, still not merged after 10 nights; arbitration requested in issues #10 and #13, no answer to date). No fix replayed by hand on `main` in the meantime.
- Investigated tonight's newly "observed" production alerts (`/.git/HEAD` and `/.git/config` scans blocked by ModSecurity, rule 930130): the targeted hostname is `git.nethttp.net`, not `youtubator.nethttp.net` — confirmed out of scope for this repo (§3 of the guidelines), same diagnosis as issue #8 (scan noise on the shared hosting, already blocked upstream). Detail added as a comment on issue #8.

## 0.20.8 — 2026-08-23 · "The test report has no business in the history"

- **`.gitignore`**: `test-results/` and `playwright-report/` (Playwright outputs — last-run state, HTML report) were missing since the e2e tests were introduced (`88fcc02`). `test-results/.last-run.json` slipped into git tracking right from that commit and was never removed — `git rm --cached`, won't be regenerated by the next `pnpm test`/`playwright test`.
- **`docs/GUIDELINES.md`**: new §7 rule — any dev tool that writes an output directory must get `.gitignore` updated in the same commit that introduces it, not after the fact (this is the second time this kind of oversight has happened, after `node-compile-cache/`/`playwright-transform-cache-*/` in v0.20.2). §1 and §5 re-checked on 2026-08-23: audit unchanged (still 19 dev-only alerts on `main`, fixes pending on PR #2 — now open for 9 nights, arbitration requested in issue #10), full `gitleaks` scan with no secrets (89 commits).
- README § 16: pointer to `docs/GUIDELINES.md` updated with the new topic.

## 0.20.7 — 2026-08-18 · "What main actually knows"

- **`docs/GUIDELINES.md` corrected**: rules §1, §2 and §5 described a state already achieved on `main` (dependency audit down to 2 alerts, Svelte plugin loaded for `*.svelte.ts` stores, active `gitleaks` hook) — in reality, all three fixes live only on the `lutin/ameliorations` branch (PR #2, opened 2026-08-14, **still not merged** as of 2026-08-18): on `main`, `pnpm audit` still reports its original 19 alerts, `apps/web/vitest.config.ts` doesn't exist, neither does `.githooks/`. The three rules now spell out this gap explicitly instead of glossing over it — a contributor following them to the letter on `main` shouldn't be caught off guard.
- §1: audit re-checked on 2026-08-18 — unchanged (19 dev-only alerts on `main`, 2 of which — *high*, on `image-size` — will stay unpatched upstream even after the PR merges; `web-ext` is already on its latest published version, nothing more to bump tooling-side).
- §5: full history scan re-run (`gitleaks detect --log-opts="--all"`, 87 commits) — no secrets found.
- **New §6 rule**: logic with its own lifecycle (timers, sequencing) gets extracted into a DOM-free `*-core.ts` module, testable via direct `import` — like `deck-core.ts`, `automix-core.ts` and `midi-core.ts`, already on `main`.
- README § 16: pointer to `docs/GUIDELINES.md` updated with the new topic.

## 0.20.6 — 2026-08-17 · "Secret scanning"

- **`docs/GUIDELINES.md`**: new §5 rule — `gitleaks` now runs as a versioned pre-commit hook (`.githooks/pre-commit`, enabled via `scripts/install-hooks.sh`), refuses the commit if a secret shows up in the staged diff, degrades gracefully (a warning) if `gitleaks` isn't installed on the machine. §1 updated: dependency audit re-checked on 2026-08-17, still 2 *high* alerts with no upstream fix on `image-size` (unchanged).
- README § 16: pointer to `docs/GUIDELINES.md` updated with the new topic.
- Investigated the production alerts "observed" for `gravitysmtp`, `/.git` and `.aws/` scans, and the `AH00124` redirect loop: confirmed out of scope for this repo (§3 of the guidelines, already in place) — no trace of a WordPress plugin, server route, or `RewriteRule` in the code; these are bot probes hitting the shared hosting. Full git-history scan (`gitleaks detect`, 85 commits): no secrets found.
- The `.githooks/pre-commit` hook and the dev-dependency fixes are under review on the `lutin/ameliorations` branch (PR #2), not yet merged — see that PR for the code-side details.

## 0.20.5 — 2026-08-16 · "Repo/server boundary"

- **`docs/GUIDELINES.md`**: two new rules. §3 — the Apache vhost configuration (nethttp.net) lives outside this repo (only `.htaccess` and the deploy scripts are versioned): a server-side HTTP anomaly (internal-redirect loop, 500) on a 100% static app with no `RewriteRule` and no service worker is the vhost operator's problem, not a code fix here — investigated after production logs turned up no cause inside this repo. §4 — architecture decisions that get acted on go into `docs/adr/`, numbered, with Status/Date/Context/Decision/Consequences (already the practice for ADR 0001 and 0002, now made explicit). Added an operational note under §1: after editing `pnpm-workspace.yaml`, if `pnpm install` reports "Already up to date" without changing anything, `rm -rf node_modules` before reinstalling.
- README § 16: pointer to `docs/GUIDELINES.md` updated with the two new topics.

## 0.20.4 — 2026-08-14 · "Guidelines"

- **`docs/GUIDELINES.md`**: first contribution rules — dependency security audit (`pnpm audit`) before every release with justified, dated overrides in `pnpm-workspace.yaml`, and mandatory testability of `*.svelte.ts` (rune) stores via direct import, without mounting a component. Linked from README § 16.
- README § 14: file tree corrected to match the real structure (`apps/web/src/lib/`, flat files in `packages/audio-engine/src/`, extension already shipped rather than "M2").

## 0.20.3 — 2026-08-14 · "Bilingual changelog"

- **`CHANGELOG.en.md`**: full history caught up in English, entry by entry, mirroring `CHANGELOG.md`. Both now evolve together with every version.

## 0.20.2 — 2026-07-15 · "Repo hygiene"

- `.gitignore`: Playwright caches (`playwright-transform-cache-*/`) can no longer sneak into a commit, just like `node-compile-cache/` before them.

## 0.20.1 — 2026-07-15 · "Automix panel unclipped"

- **Display fix**: the automix ⚙ panel was being clipped by the narrow mixer column (labels cut off on both sides). It now floats centered on screen (`position: fixed`, immune to ancestor `overflow`) and widens to 300 px. Verified with a before/after capture.

## 0.20.0 — 2026-07-15 · "Automix, tailored"

Automix moves from "it mixes on its own" to "it mixes **like you**": every choice it makes is now adjustable (⚙ next to AUTOMIX, persisted, bounded, one-click factory reset ↺).

- **Choice of sources**: 💾 local files · ♥ favorites · 🕘 history — toggleable independently.
- **Tempo**: adjustable tolerance from ±1 to ±25% (octaves included).
- **Key, three personalities**: *Ignored* (tempo only), *Preferred* (Camelot-compatible tracks come first, never blocking), *Strict* (compatible only — otherwise automix waits, no risky fallback).
- **Adjustable randomness** (picks among the top 1 to 10 candidates), **anti-repeat 0–50**, **min/max duration** bounds (anti-jingle, anti hour-long DJ set).
- **Shapeable transition**: prep at −15…−180 s, fade 2–60 s, **curves** Smooth/Linear/Cut, **bass swap** (the incoming deck's low stays killed until mid-fade, then the bass switches over — EQ extension or local deck), start on **first cue or beginning**.
- **⏭ Mix now**: forces an immediate transition without waiting for the track to end.
- Under the hood: `pickNextTrack` and the fade curves stay pure and tested (14 + 3 cases), serialized/bounded settings tested separately — 296 unit tests, 7 E2E.

## 0.19.1 — 2026-07-15 · "Documented release & local files fixed on the mirror"

- **`docs/RELEASE.md`**: the full publishing procedure (checks, docs, single version+changelog commit, green CI before tagging, release with zip, showcases) is recorded in the repo, usable without external tooling. Linked from README § 16.
- **CSP fix**: the policy served by youtubator.nethttp.net did not declare `media-src`, so `blob:` audio (local file decks and 🎧 preview) was blocked there — GitHub Pages doesn't enforce a CSP, only the mirror was affected. Added `media-src 'self' blob:` to `apps/web/public/.htaccess`.
- **`pnpm typecheck` fixed** (it pointed at no tsconfig): now covers the audio engine; two type errors fixed along the way (`ProtocolMessage` becomes a distributive union discriminated on `type`).

## 0.19.0 — 2026-07-09 · "Smart automix & drag-and-drop"

- **AUTOMIX** (button in the mixer): the app mixes on its own — the next track is chosen **matching tempo (±6%, octaves included) and compatible key** from the library (local files + favorites + history, anti-repeat over the last 12), loaded on the opposite deck with SYNC, started **on its first cue**, then a **smooth 12 s crossfader transition**, looping forever. A touch of randomness among the top 3 candidates avoids always-identical sequences. Status displayed ("Next: …", "Transition → …").
- **Drag-and-drop**: any browser row can be dragged straight onto a deck (target deck highlighted), equivalent to the →A/→B buttons.

## 0.18.0 — 2026-07-09 · "Local deck, full parity"

The local file deck's last five gaps closed — now level with (and sometimes ahead of) the YouTube+extension deck.

- **Sample-accurate local loops**: the IN→OUT region is replayed from the decoded AudioBuffer, through the EQ/filter/gain chain — zero seek, perfect loops, ÷2/×2 and beat loops included. The displayed time cycles within the region, output resumes in phase.
- **Embedded tags**: reads **ID3v2 (MP3) and Vorbis comments (FLAC)** on scan — artist, title, album, **genre** (numeric ID3v1 genres are translated). Tags take precedence over the filename, and **genre becomes the track's default style** (never overriding a manual choice).
- **Local key detection**: offline chromagram (36-semitone Goertzel) → Camelot key detection over the whole track, verified E2E (A 220 Hz → 8A exactly).
- **Bipolar filter and VU meter** active on local decks; **🎧 preview** of local files (direct audio, starts at the one-third mark).
- **⚡ local analysis queue**: BPM + key + waveform for the whole library in the background (direct decoding, no deck or extension needed), progress counter in the LOCAL tab — MATCH and BPM sort useful across the whole collection.

## 0.17.0 — 2026-07-09 · "Columns à la carte"

- Dedicated **Artist column** (YouTube channel or local file tag) and separate **BPM** / **Key** columns.
- **⚏ Columns**: choose which columns are shown in all lists — Thumbnail, Style, Artist, BPM, Key, Plays, Duration, Rating (title is always there). Choice persisted.
- **Clean default: style · title · artist** — the rest is opt-in.
- Sort: "Artist" (ex-Channel) and new **Key** sort key (Camelot, unknowns last).

## 0.16.0 — 2026-07-09 · "Local files"

The Traktor-style local library brick — your Bandcamp/Beatport purchases, your rips, your productions.

- **💾 LOCAL tab**: "+ Music folder" (File System Access, permission remembered, ↻ rescan, ✕ remove), recursive scan (MP3, FLAC, WAV, OGG, M4A, AAC, Opus, AIFF…), "Artist - Title" derived from the filename, cleaned-up track numbers. Firefox: one-off folder import (files stored in the browser).
- **Local deck without extension**: `LocalFileBackend` (audio + Web Audio graph in-page) — **native 3-band EQ, kills, Master Tempo/Vinyl and continuous rate**. The EXT badge now only concerns YouTube decks.
- **Instant analysis**: the file is fully decoded on load — immediate full waveform, **BPM/grid and key in a few seconds** (verified at exactly 140.0 on a test WAV), auto-gain. Everything is persisted just like for YouTube (cues, loops, notes, styles).
- Filter, sort, MATCH, multi-select, crates, favorites: local tracks flow through **all** of the browser's pipeline (stable `file:` ids). 💾 badge on rows, YouTube links removed. Dexie v9 (`localFolders`, `localTracks`).
- v1 limits: bipolar filter/delay inactive on the local deck, loops precise to the tick (~80 ms) — sample-accurate coming later.

## 0.15.0 — 2026-07-09 · "Full MIDI & S2 preset"

- **22 new mappable MIDI actions** per deck: **3-band EQ** (±12 dB knobs), **kills** (mute High/Mid/Low), **loops** (IN, OUT, reloop ∞, ÷2, ×2). Toggles now react only on press (a button mapped to a CC no longer toggles twice).
- **NI Traktor Kontrol S2 preset** (MIDI mode): full mixer (crossfader, volumes, EQ, tempo faders), transport, hot cues and loop section — the FX knobs act as filters. The **X1** preset gains its loop section.
- Settings: the MIDI grid scrolls within the dialog.

## 0.14.0 — 2026-07-09 · "Explicit extension & mobile"

- **Extension put front and center**: the EXT badge becomes a button that opens a **full guide** — detected/absent status, what it unlocks (real EQ, tempo modes, waveforms, exact loops, BPM/key, recording), what works without it, and step-by-step install for Chrome **and** Firefox with a direct download link. The home screen gains an explicit extension callout.
- **Mobile version**: the app stacks and scrolls on small screens (full-width decks, mixer below, scrollable top-bar controls, full-width filter, enlarged touch targets, keyboard shortcuts hidden) — tested with no horizontal overflow at 390×844 (dedicated e2e test).
- **Installable PWA**: manifest + SVG icon + theme-color — "Add to home screen" on Android/iOS opens Youtubator fullscreen.

## 0.13.1 — 2026-07-08 · "Home screen (CI fix)"

- E2E tests adapted to the home screen (new dedicated test + "without account" choice pre-remembered for the others).

## 0.13.0 — 2026-07-08 · "Home screen, logo & MIDI presets"

- **Home screen** on first launch: logo, three-point pitch and **Google sign-in ahead of the interface**; "Continue without account" remains possible (choice remembered, the screen never returns once an account is known).
- **Original SVG logo** — concentric hexagons Traktor-style + play triangle YouTube-style, gradient deck A → deck B. In the topbar, on the splash screen, and as favicon.
- **Per-controller MIDI presets** (one file per controller, `lib/midi-presets/`): selector in settings, first preset **NI Traktor Kontrol X1 (MIDI mode)** — factory template, every key still adjustable via Learn. Tests automatically validate any new preset (known actions, valid MIDI bindings, no duplicate key).
- **Streamlined settings**: the OAuth Client ID moves into a collapsed "Advanced" section (the instance ID is enough day to day).

## 0.12.2 — 2026-07-08 · "One-click sign-in"

- The instance's OAuth Client ID is now embedded: YouTube sign-in now works with **just a Google account**, on both domains — no more console onboarding for visitors (reminder: the `https://youtubator.nethttp.net` origin must be authorized on the Google project).

## 0.12.1 — 2026-07-07 · "Google sign-in without the console"

- **Instance OAuth Client ID**: the app can embed a default Client ID (`app-config.ts`, public by design, protected by the Google project's authorized origins). Visitors can then sign in "with just their Google account", with no credentials to create. The ID pasted into ⚙ Settings always takes precedence (instance ≠ obligation).
- Still to do: fill in `DEFAULT_CLIENT_ID` with the instance project's ID and authorize both origins (github.io + nethttp.net) in the Google console.

## 0.12.0 — 2026-07-07 · "Continuous mirror deployment"

- **`deploy-nethttp.yml` GitHub workflow**: every push to main builds (base `/`) and automatically deploys to https://youtubator.nethttp.net (dedicated SSH key as secret, rsync, www-data install, online verification). Also triggerable manually (workflow_dispatch).
- **Mirror fix**: the vhost's CSP (`default-src 'self'`) blocked the YouTube IFrame API, embeds, Google Sign-In and the Data API — `apps/web/public/.htaccess` replaces it with an adapted CSP (youtube.com, accounts.google.com, googleapis.com, thumbnails/avatars), inert on GitHub Pages.

## 0.11.2 — 2026-07-07 · "Self-hosted mirror"

- Deployment on **https://youtubator.nethttp.net** (Apache wildcard vhost, docroot `/var/www/nethttp.net/youtubator/public`) — reproducible script `scripts/deploy-nethttp.sh` (build base `/`, rsync, www-data install).
- README § 16: both deployment targets documented + reminder to add the new domain's origin to the Google OAuth Client ID.

## 0.11.1 — 2026-07-07 · "Spec up to date"

- README: the Sync spec (§ 6.3) documents the phase-lock PLL (F-SYNC-04) and the master clock (F-SYNC-05) shipped in 0.11.0.
- Publishing process hardened: green CI required before tagging, extension zip attached to every release.

## 0.11.0 — 2026-07-07 · "Master clock"

Sync fine-tuned Traktor-style.

- **Master clock (CLOCK)** in the mixer: once armed, it adopts the master deck's BPM then **becomes law** — every SYNCed deck follows it, master deck included (octave pairing). −/+ 0.5 BPM buttons; one-click AUTO return; effective BPM shown continuously.
- **Tightened PLL**: phase lock 3× faster (correction every 250 ms instead of 700, convergence ~1 s instead of ~3.5), with a **±2 ms dead zone** — no more micro-jitter once decks are locked, never a seek under 35% of the period.

## 0.10.1 — 2026-07-07 · "Full-height columns"

- Cue/loop blocks now occupy **the full height of the waveforms**: column A (and C) on the left, column B (and D) on the right, waveforms stacked in the center. Each block carries its deck's badge and color stripe.

## 0.10.0 — 2026-07-07 · "Mirrored top bar"

Waveform/sync/cues/loops revision, and mirrored top-bar layout.

- **Mirrored layout**: deck A (and C) controls (hot cues, TAP/octave, beat loops, IN/OUT/∞/ROLL) are grouped **to the left** of its waveform, deck B (and D)'s **to the right** — facing each other, like on a real table.
- **Waveform**: **scroll-wheel zoom** (10-120 px/s, shared across top bars), double-click to return to the default zoom.
- **Cues**: **right-click a pad** to delete the cue (no more hunting for its position on the waveform).
- **Loops**: **÷2 / ×2** — resizes the loop while keeping the IN point (sample-accurate re-extraction if engaged).
- **Sync**: **beat jump ◀/▶** (1 bar, Shift = 1 beat) and a **φ** button that instantly realigns phase onto the master deck (shortest-path jump).

## 0.9.0 — 2026-07-07 · "Pro browser"

The browser becomes a full Traktor-style mixing tool (README § 6.4 quater).

- **MATCH**: "mixable with the master deck" filter (BPM ±6% octaves included, Camelot).
- **Keyboard navigation**: ↑/↓ cursor, Enter → deck A, Shift+Enter → deck B, F favorite.
- **Multi-select** (click / Ctrl / Shift) + bulk actions: note, style, ➕ crate, ⚡ analysis.
- **Editable crates**: creation, renaming, ↑↓ reordering, removal, **publishing as a private YouTube playlist**.
- **Smart crates**: saved filter + sort (💾), reapplied in one click (✨).
- **🎧 Preview** without occupying a deck (starts at the one-third mark).
- **⚡ list**: pre-analysis of the whole displayed list (ghost analyzer).
- **Tracklist export**: ⤓ txt, publish-ready (relative timestamps), and ⤓ csv from history.
- **📊 Stats**: most played, breakdown by style, dormant tracks (30+ days).
- **Refined search**: duration (tracks / mixes, excludes Shorts) and sort by date.
- **Crate v2**: library export/import also carries notes, styles, colors, smart lists and history.
- **Light virtualization** of lists (`content-visibility: auto`).
- Version number shown in the topbar; Dexie database migrated to v8 (`smartlists`).

### Previously (summary, before versioning started)

- Traktor-style free-text filter (accents/case, multi-word, all fields). Colors by **style** + color picker (right-click).
- DJ metadata: 1-5 ★ rating, style, play counter, ↗ YouTube link, removals (history, "liked"). Column sorting.
- Scroll pagination + local cache: YouTube "liked"/playlists, search (1 h), history, favorites.
- Momentary fullscreen browser (⛶, `/`, Escape). Thumbnail scale A−/A+ limit.
- Beat-grid beatmatching, sample-accurate 1-32 beat loops, Camelot key, scrolling waveforms, multi-account YouTube, favorites ↔ "liked" mirroring, Chrome/Firefox extension (EQ, tempo, capture).
