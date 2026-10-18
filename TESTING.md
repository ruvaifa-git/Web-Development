# Testing the round-six fixes

## Recorded results — 17 October 2026

- **52 dependency-free Node checks passed.** Matching, storage shape/preservation, migration, combined recovery/claim writes, rollback behavior, drafts, stale-edit/session checks, dates, escaping, markup references and syntax.
- **55 browser scenarios passed in Chromium 153.0.8010.12 on Linux**, with no uncaught page errors. These exercise real IndexedDB photos, metadata quotas/corruption/backups, claim → owner review → coordinated recovery and retry, retained identifying messages, drafts, filter navigation, calendar exports/invalid dates, agenda persistence/cross-tab sync, dialogs, keyboard focus and narrow layouts.
- **22 real Orca 50.2 announcement checks passed** with Chromium and AT-SPI2 2.60.6 in a disposable virtual desktop. Assertions use Orca's generated speech-output log, plus separate accessibility-tree checks. This does not claim human listening, braille coverage or full accessibility certification.

## Native checks

With Node 20 or newer, from the project root:

```sh
npm test
```

No installed packages are needed for this command. The native suite also checks that optional Google Form links accept only HTTPS responder URLs and reject edit links, credential-bearing URLs and lookalike hosts. The native suite uses Node's test/assert/VM modules and lightweight form/storage doubles. Browser checks independently exercise real forms, IndexedDB and focus rather than assuming the doubles establish browser behavior.

## Browser checks

```sh
npm install
npx playwright install chromium
npm run test:browser
```

Playwright is a development dependency only; neither site loads it. `tests/browser.cjs` starts/stops a temporary localhost static server and calls `tests/round6-cases.cjs` and `tests/event-pages.cjs` for lifecycle/failure cases. It uses disposable profiles, sample accounts and generated sample photos. Results and screenshots go to `tests/artifacts/`.

The recorded run used the installed Playwright/browser via the exported runner's `playwright`, `executablePath` and `artifacts` options. It did not access an existing browser profile. The external decorative hero image is not a functional pass criterion.

Coverage includes ten Lost & Found pages at 320/375/768 px in both themes, Event Hub at the same widths and desktop flows at 1280×900. The suite checks reduced motion and 200% CSS zoom; CSS zoom is not native browser zoom. Mobile Browse/Event Hub, the new registration/dashboard/contact pages and the generated demo PNG were visually inspected. Dedicated pages are additionally checked at 960/1280 px, with keyboard skip links and mobile menus. Contact tests cover validation, local draft restoration, text export, quota failures and corrupt storage; dashboard tests cover empty/corrupt data, multiple saved participants and persistence.

## Optional Orca integration

Requires an existing Linux graphical session, Orca, Python GI/AT-SPI, KWin with virtual output/Xwayland, Speech Dispatcher, eSpeak NG and Playwright. The `/usr/libexec/` AT-SPI paths were verified on this Fedora/KDE host and may differ on other distributions. Orca must not already be running; the runner refuses to replace another instance.

```sh
CONTEST_PRIVATE_DBUS=1 dbus-run-session -- npm run test:screen-reader
```

The runner creates a private virtual desktop, DBus/AT-SPI services, temporary preferences and a new browser, then stops only those processes. It does not modify the user's normal screen-reader settings or browser data. Default verbose speech is retained; automatic full-page reading on load is disabled in that temporary profile so it does not move the caret during focus checks. Heading navigation invokes Orca's own command; page controls use Playwright.

`tests/artifacts/screen-reader/` receives `results.json`, accessibility-tree snapshots and `speech-transcript.txt`. `PLAYWRIGHT_MODULE_PATH`, `CHROMIUM_PATH`, and `SCREEN_READER_ARTIFACTS` can select existing local runtimes and an output folder.

The 22 checks cover skip/main navigation, heading navigation, search/result counts, named item links, claim confirmation, account/report/category/date errors, location/photo guidance, draft restoration, publication focus, photo-dialog name/Escape, event form/confirmation, FAQ states, agenda add/remove announcements, mobile menu/Escape, Contact Us validation/local-only save announcements and save-failure alerts. Event confirmation uses a persistent live announcement because replacing the focused form can otherwise suppress Orca's focus announcement.

## Regressions that must stay fixed

- Umbrella/calculator with “Please contact me”, black/white watches, unrelated iPhone/ThinkPad and a phone found months before its lost date must not be suggested. Distinctive true pairs and grey/gray aliases should still match.
- Fail `lf_records` writes during photo removal/replacement/deletion. Metadata and the original IndexedDB photo must remain; only a new uncommitted photo may be cleaned up.
- Fail return confirmation. Both report states and affected claims must remain in the preceding snapshot. A successful retry resolves all of them together.
- Put invalid JSON/wrong shapes in legacy or authoritative storage. Saving must preserve the raw data and show a recoverable error. The downloadable metadata backup must retain the raw strings and omit account passwords.
- Publish in a second tab while a real photo save is paused in the first. Both reports must survive and the photo must decode. Native cases also change/delete the edited report or switch accounts during upload; stale edits must be refused and input retained.
- Configure shared dates in `VOC Event Hub/js/event-config.js` as blank, impossible, reversed or invalid-timezone event dates. Registration must work, calendar actions must stay hidden and no page error should occur. Valid dates must export correct UTC start/end values.

## Limits and remaining checks

Selected Chromium/Orca coverage does not establish Firefox/Safari, NVDA/VoiceOver, braille, native 200% browser zoom, comprehensive colour contrast, every content length or complete WCAG conformance. Repeat relevant manual checks on those platforms when available. localStorage still lacks cross-tab transactions; the single-record update prevents partial recovery/claim persistence, not every possible concurrent read-modify-write conflict. No application backend was added.

## Dedicated-page checks

Home → Registration → My Registration must work as real page navigation. Existing `vosc_registrations` records must remain readable. The dashboard must select the newly saved participant and keep a chosen participant after reload. A new browser must show an empty state; corrupted data must show an error instead.

Contact Us must retain entered questions after a failed save, preserve unreadable prior data, and label both the save confirmation and exported text as unsent. With no Google Form configured, Contact us must open the actual local contact page. With a valid responder URL configured, bottom/footer buttons must open that URL separately without transmitting local draft data. Tests mock configuration and inspect link behavior without submitting a real form.
