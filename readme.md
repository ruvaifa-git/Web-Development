# Campus demos — round six with dedicated event pages

Two static sites: **Lost & Found+** and **VOSC Event Hub**. They use HTML, CSS and vanilla JavaScript. Backend work remains on hold; no API, remote database, server authentication or email delivery has been introduced.

## Run locally

From this folder:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open `http://127.0.0.1:8000/Lost-and-Found/index.html` or `http://127.0.0.1:8000/VOC%20Event%20Hub/index.html`. The server only serves static development files. Keep the same origin/port to reuse browser data.

## Event Hub pages — 17 October 2026

The navigation now opens dedicated **Registration**, **My Registration** and **Contact Us** pages. Registration saves participant details and opens the dashboard, which can show existing registrations and download demo tickets. The bottom Contact us button opens a validated enquiry form with local draft saving and text download. All pages work on narrow layouts and retain clear local-only notices.

Shared dates, venue and the optional Google Form responder URL live in `VOC Event Hub/js/event-config.js`. No Google Form has been created or connected; the contact page works locally without one. See [the Event Hub README](VOC%20Event%20Hub/README.md).

## Six fixes

1. Matching requires identity evidence, rejects contradictory colours and impossible chronology, ignores contact boilerplate, and labels scores as similarity out of 100.
2. Failed photo replacement/removal/deletion retains the old attachment and metadata. Unreadable saved records are preserved with a downloadable metadata backup; drafts and entered details stay available after failures.
3. Reports and claims use one authoritative localStorage snapshot so return confirmation saves report recovery and all affected claim statuses together.
4. Registration and downloadable tickets explicitly describe a local demo. Event dates remain unconfirmed until configured; calendar links/ICS are disabled for missing, invalid or reversed dates.
5. Skip links, associated field/category errors, focused success feedback, screen-reader live announcements, text drafts, campus/date filters and remembered Browse state are restored. The photo dialog and agenda remain keyboard accessible.
6. Reproducible native, browser and optional Orca checks and current documentation are included.

Round-six claims, owner review, linked recovery, recovered-pair statistics, photo viewing, My Ticket and My Agenda are retained. All report pages still require a local demo account, as in round six. Decline/withdraw claims, full backup/import and guided sample-data mode were not added in this fix release.

## Verification

On 17 October 2026: **52 Node checks, 55 Chromium browser scenarios and 22 Orca announcement scenarios passed**. No uncaught browser errors were recorded. See [TESTING.md](TESTING.md) for commands, coverage and limits, and [CHANGELOG.md](CHANGELOG.md) for the changes.

## Browser data and limits

Reports, claims, accounts and registrations stay in this browser. Another device does not receive them. Demo account passwords remain in localStorage, so this is not secure authentication. Registration is not sent to organisers; tickets do not reserve a seat or grant admission.

Existing report/claim arrays (`lf_items`, `lf_claims`) are validated and read without changing them. The first successful save writes `{version:1, items, claims}` to **`lf_records`**. Subsequent reads use that snapshot; the legacy arrays remain intact as migration backups. IndexedDB photo IDs and existing recovery links are retained. Do not run an older project version against the same origin alongside this version: it uses the obsolete arrays and cannot see new writes.

One snapshot write prevents partially saved recovery/claim statuses. localStorage still has no transaction or lock across simultaneous tabs; photo uploads reread current state and reject stale edits/session changes, but this is not a general concurrent database. Metadata backups contain raw report/claim records, not photos or account passwords. Photos remain in IndexedDB.

Matching is a heuristic, not AI or proof of ownership. Check identifying details and physically confirm the return before marking an item recovered.
