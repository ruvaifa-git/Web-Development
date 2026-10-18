# Event Hub pages — 17 October 2026

- Replaced the homepage's embedded demo form with clear links to dedicated Registration, My Registration and Contact Us pages.
- Registration retains existing validation, duplicate detection and local saved records, and opens the dashboard after a successful save. The dashboard shows and switches between participants and retains demo ticket/calendar exports.
- Added a bottom Contact us button, an accessible enquiry form, local draft saving/restoration and unsent text export. Optional published Google Form responder links can be configured; no Google Form was created or connected.
- Moved date/venue/contact-link settings into shared `VOC Event Hub/js/event-config.js`, preserving invalid-date guards across all pages. No backend, organiser delivery or admission guarantee was added.
- Verified **52 native checks, 55 Chromium scenarios and 22 Orca speech-output checks**. Updated reproduction commands and coverage in TESTING.md.

# Round six fixes — 16 October 2026

Implemented the six review fixes while retaining the round-six claims, owner review, paired recovery, photo viewer, My Ticket and My Agenda features. Backend work remains on hold.

- Restored identity-based matching, boilerplate/colour/chronology guards and similarity scores out of 100.
- Restored safe photo replacement/removal/deletion, stale-upload guards, strict storage reads, retained input and raw metadata backups.
- Reports and claims now migrate to one `lf_records` snapshot on the first successful write; recovery and every affected claim commit together. Legacy arrays remain intact as migration backups.
- Removed official-registration/seat promises, left event dates unconfirmed, guarded calendar generation, and labelled HTML/PNG tickets as local demo records.
- Restored skip links, field/radio error associations, text drafts, campus/date filters, remembered Browse state, accessible success/agenda announcements and keyboard focus. Responsive controls also wrap under CSS zoom.
- Added reproducible testing and current README/contribution notes. **51 native checks, 46 Chromium scenarios and 20 Orca announcement checks passed.** See TESTING.md for the method and limits.

The following supplied changelog is historical. Its old line numbers, placeholder date, outstanding-issue list and one-off test counts do not certify this fixed release.

---

# Changelog: audit fixes

These fixes come from a code audit of the two static sites in this repository, **Lost-and-Found** and **VOC Event Hub**. Both are plain HTML, CSS and vanilla JavaScript. Neither has a build step, package manager, backend or test suite.

Line numbers refer to the **fixed** files unless they are marked *(orig)*. Severity uses this scale: **High** means a core feature is broken, **Medium** means a visible bug or a real security or privacy weakness, **Low** means hardening, accessibility or polish.

> Note: the Lost-and-Found README lists "example issues" for contributors, so some of these bugs were probably planted on purpose as exercises. They are fixed here because the goal was a working project. Revert any change you want to keep as a contributor exercise.

## Lost-and-Found

| # | File : line | Problem | Fix | Severity |
|---|---|---|---|---|
| 1 | `Lost-and-Found/dashboard.html:6` | The dashboard loaded only `script.js` and never loaded `auth.js` or `items.js`. As a result, logged-out users could open it, the greeting stayed "there", every stat showed 0, "Recent reports" was empty and **Log out did nothing**. | Load `auth.js` and `items.js` before `script.js`. All three were already written to be loaded together, and their globals don't clash. | High |
| 2 | `Lost-and-Found/items.js:112-113` | `initReport()` runs on every page that loads `items.js`, and it called `requireUser()` *before* checking whether the report form exists. Logged-out visitors to the public pages (`items.html`, `item-details.html`) were redirected to the login page, even though the landing page links to "Browse". | Check for `#reportForm` first and require login only on the report page. | High |
| 3 | `Lost-and-Found/items.js:184` | When a logged-out visitor clicked "Claim this item", the handler called `user().email` on `null` and threw a `TypeError`. Nothing happened on screen. | If no user is logged in, send them to `login.html`. | Medium |
| 4 | `Lost-and-Found/auth.js:5, 12, 14` | Login and registration copied the whole user record, **including the plaintext password**, into the `lf_currentUser` session key. | Store only `{id, name, email}` in the session through a new `sessionUser()` helper. Nothing read the password from the session. | Medium |
| 5 | `Lost-and-Found/items.js:194` | The Edit/Delete/Mark-recovered handler on My Reports acted on any item id, without checking who owns the item (related to README issue #122). | Ignore the action unless `reportedBy` matches the logged-in user. | Low |
| 6 | `Lost-and-Found/items.js:76-82, 87, 120, 181, 182` | Stored values (`type`, `status`, `id`, the legacy `image` URL) were inserted into `innerHTML` without escaping. User text fields were already escaped. | Wrap these values in the existing `esc()` helper. Defence in depth only, because all data comes from this browser's own storage. | Low |

## VOC Event Hub

| # | File : line | Problem | Fix | Severity |
|---|---|---|---|---|
| 7 | `VOC Event Hub/index.html:21-23, 40` | Nav links pointed to misspelled anchors (`#schedul`, `#spekrs`, `#abut`), and so did the hero "Learn More" button. None of them scrolled anywhere. | Corrected them to `#schedule`, `#speakers` and `#about`. | High |
| 8 | `VOC Event Hub/js/script.js` *(orig 60-63)* | Code at the end of the script overwrote the first FAQ answer ("Who should attend?") with the unrelated text "Seats are filling quickly…". | Removed that block. | Medium |
| 9 | `VOC Event Hub/js/script.js:27-57` | The form has `novalidate`, and the script only checked for empty fields, so invalid emails were accepted. It then called `form.submit()` on a form with no `action`. That did a GET to the same page, which **put the user's name and email in the URL and browser history** and reloaded the page with no feedback. | Check the email with `validity.valid`. Submit only if an `action` is configured. Otherwise show a confirmation and reset the form. *Ambiguity:* the project has no registration backend, so nothing is stored. Add an `action` (and `method="post"`) when one exists. | Medium |
| 10 | `VOC Event Hub/css/style.css:295-310` (also `:72-81`) | On mobile, the "Menu" button stayed hidden (`display:none` was never overridden), and the links were always expanded with a 2.5rem gap. The JS toggles `.is-open`, but no CSS existed for it. | Show the toggle at ≤720px, collapse the links by default, open them with `.nav-links.is-open`, and give the button a basic style. | Medium |
| 11 | `VOC Event Hub/index.html:108-117` | All three FAQ answers started expanded, so the accordion looked broken until someone clicked it. | Added `hidden` to the answers that are not active, so only the first one starts open. | Low |
| 12 | `VOC Event Hub/index.html:108,112,116`, `css/style.css:227-239`, `js/script.js:15,22` | FAQ questions were `<div>`s, which a keyboard can't reach or activate. | Changed them to `<button type="button">` with `aria-expanded` kept in sync, and added a CSS reset so they look the same as before. | Low |
| 13 | `VOC Event Hub/css/style.css:141-147` | `outline: none` on button focus removed every keyboard focus indicator. | Replaced it with a `:focus-visible` outline. | Low |
| 14 | `VOC Event Hub/css/style.css:137` | Buttons and links used `cursor: default`. | Changed it to `cursor: pointer`. | Low |
| 15 | `VOC Event Hub/css/style.css:177` | The sticky header covered section headings after an anchor jump. | Added `scroll-margin-top` to `.content-section`. | Low |
| 16 | `VOC Event Hub/index.html:123` | "Reserve your seat" was an `<h4>`. It skipped heading levels and didn't pick up the section heading style. | Changed it to `<h2>`, matching the other sections. | Low |

## Repository

| # | File | Change |
|---|---|---|
| 17 | `.gitignore` (new) | Ignores `node_modules`, `.env*`, OS and editor files, and logs. |
| 18 | `CHANGELOG.md` (new) | This file. |

## Round 2: frontend-only rectification

This round changes only HTML, CSS and client-side JavaScript. It adds no backend, database or server-side authentication, and the overall design is unchanged. Issue numbers match the task list.

### Lost-and-Found

| Task # | Files | Problem | Fix |
|---|---|---|---|
| 1 | `index.html`, `script.js`, `style.css` | The home page's "Recent activity · LIVE" card showed three hard-coded fake items. | The card now lists the 3 most recent reports saved in this browser, escaped as text and linked to their detail pages. With no reports it says "No reports yet." The **LIVE** label and its unused `.live` CSS are removed. |
| 2 | `index.html`, `script.js` | The home header always showed Log in and Get started. | Logged-in users now see **Dashboard** and **Log out** instead. |
| 3 | `style.css` | At ≤600px, a rule hid every header link except "Log in", including Browse and Get started. | Removed the hiding rules. The header now wraps onto a second row, so every link stays visible. |
| 4 | all app pages, `script.js`, `items.js` | Log out existed only on the dashboard. | Added a **Log out** button to the header of every app page for logged-in users. Logout handling moved from `items.js` into the shared `script.js`. |
| 5 | app pages, `script.js`, `auth.js`, `items.js`, `login.html` | Logged-out users saw My reports and Dashboard links (and the logo pointed to the dashboard), and these bounced them to the login page with no explanation. | Guests now see **Log in** and **Get started** instead, and the logo goes to the home page. Protected actions (opening a protected page, reporting an item, claiming) go to the login page with a clear notice such as "Please log in to report an item." After login or sign-up, the user returns to where they were heading. `?next=` accepts only this app's own page names, so it can't be abused for redirects to other sites. |
| 6 | `items.html`, `my-reports.html`, `style.css` | The only report button on these pages opened a *lost* report. | Added **+ Report found item** next to it, which is relabelled **+ Report lost item**. |
| 7 | `items.js`, `style.css` | Success messages used the red error style. | Added `success` (green, ✓), `info` (blue) and error (red, !) styles. Each has its own text colour, background and icon, so the states differ beyond colour alone. |
| 8 | `items.js`, `report.html`, `auth.js` | The report form showed one generic message: "Please complete all required fields." | Each field now has its own message, checked in order: "Please enter the item name.", "Please choose the date.", "The date can't be in the future.", "Please enter the place.", "Please enter a description.", "Please enter a contact email." and "Please enter a valid contact email…". The failing field is focused and marked `aria-invalid`. The form uses `novalidate` so these messages appear instead of the browser's popups. Fields have `maxlength` limits. Sign-up now rejects names made only of spaces, which used to crash the dashboard greeting. |
| 9 | `report.html` | The upload box said "Choose an image", but the input accepts any file, and the code deliberately supports non-image attachments. | The wording now reads "Choose a file", and the panel title is now "Photo or file". The input is still unrestricted, because restricting it would remove existing functionality. |
| 10 | `items.js`, `style.css` | The Mark recovered button stayed clickable after use. | Once a report is recovered, the button reads **✓ Recovered**, is disabled and styled green. The click handler also ignores items that are already recovered. |
| 11 | `items.html`, `my-reports.html`, `dashboard.html`, `item-details.html`, `style.css` | Report areas sat empty while reports and images loaded. | Added a "Loading reports…" placeholder with a small spinner. It stays still for users who prefer reduced motion and is replaced as soon as cards render. |
| 12 | `style.css` | Much of the text was 9–11px light grey, below WCAG contrast guidelines. | Small text is now 11–13px and uses the muted colour, which is slightly darkened to `#5f6b76`. Long unbroken text now wraps in cards, details and previews instead of overflowing. |
| 13 | `items.html`, `style.css` | The search box and type filter had no labels. | Added visible **Search reports** and **Report type** labels linked to their controls. |
| 14 | `style.css` | The CSS asked for `Inter`, but the font was never loaded. | Removed `Inter` from the font stack. The existing system font stack is what was already showing. |
| 15 | all pages, `style.css` | The site needed a check at phone sizes. | Tested every page at 320, 375 and 768px with no horizontal overflow. Also gave the logo the same markup as the home page on the other pages, which removes a stray gap before the "+". |

### VOSC Event Hub

| Task # | Files | Problem | Fix |
|---|---|---|---|
| 1 | `js/script.js` | The mobile menu stayed open after a link was tapped. | Choosing a link now closes the menu and resets `aria-expanded`. |
| 2 | `index.html`, `js/script.js`, `css/style.css` | Registration feedback used `alert()` popups. | Messages now appear on the page in a `role="status"` box, with separate messages for name, email and invalid email. Success shows "Registration Successful! Your registration has been submitted successfully." in green with ✓, and errors show in red with !. Invalid fields are marked. Name and email have `maxlength` limits. |
| 3 | — | The site mixed VOC and VOSC. | All visible text (title, brand, headings, footer, meta description) already says **VOSC**. Only the folder name `VOC Event Hub` differs. It was **not renamed**, because that would change the repo's structure and paths. Rename it if you want them to match. |
| 4–5 | — | Hero image stored locally, with descriptive alt text. | **Not changed, at the owner's request.** The hero image, its URL and its attributes are kept exactly as they were. |
| 6 | `index.html` | The footer was a plain `<div class="site-footer">`. | Changed it to `<footer class="site-footer">`. It looks the same, because the styles target the class. |

## Round 3: frontend contest improvements

This round uses only HTML, CSS and client-side JavaScript. There is no backend, server, database, API, server-side validation or change to authentication or password handling. Data stays in the browser storage the project already uses: `localStorage`, plus IndexedDB for photos. The only addition is VOSC registrations, now saved in `localStorage` so duplicate emails can be detected.

### Lost & Found

| Task # | Feature | Files |
|---|---|---|
| 1 | The home card is now titled **Recent Reports** and lists the 3 newest reports by creation time, with each one's category icon. It stays visible to logged-out visitors and doesn't claim to be live. | `index.html`, `script.js` |
| 2 | **Lost and found forms ask different questions.** Lost asks "What did you lose? / When did you lose it? / Where did you last have it? / Description". Found asks "What did you find? / When did you find it? / Where did you find it? / Additional details", with a tip to hold back one identifying detail. A switch at the top changes type without losing what's typed, and is hidden when editing. | `report.html`, `items.js` |
| 3 | **9 categories with icons** (📱 🔑 💳 🎒 👛 📚 👕 🧴 📦). They're defined once in `script.js` and used by the form, the Browse filter, cards, home, details and matching. Older reports with no category count as "Other". | `script.js`, `items.js`, `report.html`, `items.html` |
| 4 | **The photo is optional**, labelled "Add a photo (optional)", with accepted types listed: JPG, PNG, WebP and GIF, up to 10 MB. After choosing one you get a preview plus **Change photo** and **Remove photo**. Removing it while editing deletes the stored photo when you save. Uploads are now limited to images. Old reports with non-image attachments still display and download. | `report.html`, `items.js`, `style.css` |
| 5 | **Future dates are blocked.** The date picker's `max` is today in the user's local time zone. Submitting checks again, so manually typed or tampered values are caught, as is a page left open past midnight. Today and earlier are allowed, tomorrow or later gets "The date cannot be in the future.", and dates before 2000 or invalid dates are rejected too. | `items.js`, `report.html` |
| 6 | **Messages under each field**, such as "Item name is required.", "Please choose a category.", "Location is required." and "Please enter a valid email address…". Whitespace-only input, minimum and maximum lengths (checked even if `maxlength` is bypassed), invalid dates and wrong file types are all caught. A summary line counts the fields to fix, the first bad field gets focus, and each message clears as you correct it. Login and sign-up use the same style. A live character count shows for the description. | `script.js`, `items.js`, `auth.js`, `login.html`, `register.html`, `style.css` |
| 7 | Feedback states: green ✓ for success, red ! for errors, blue for info. New success messages appear after publishing, updating, deleting and marking an item recovered. | `items.js`, `style.css`, `my-reports.html` |
| 8 | **Clearer cards.** Each shows a Lost/Found badge, a category chip, the name, 📅 date, 📍 location, a status badge ("Still missing", "Awaiting owner" or "✓ Recovered") and View details. Reports without a photo show their category icon, and cards lift slightly on hover. | `items.js`, `style.css` |
| 9 | **Better Browse.** Search covers name, description, location and category. Every word must match, and matches are highlighted with `<mark>` (text is escaped first). There are filters for lost/found and category, newest/oldest sorting, a "N of M" count, and **Reset filters**. With no results it shows "No reports found / Try changing your search or filters." and a reset button. Links like `items.html?category=keys` also work. | `items.html`, `items.js`, `style.css` |
| 10 | **Possible Matches** on the details page. A lost report is compared with found reports (and the reverse) using category, keywords in the name and description, location, and how many days apart the dates are. Each match shows a score, a strength label, a meter and its reasons, with a note that this is simple matching in the browser, not AI. With no matches it says "No possible matches yet." After publishing, users land on their report so they see matches straight away. My reports cards link to their matches. | `items.js`, `style.css` |
| 11 | **Recovered state.** A disabled "✓ Recovered" button, a green ribbon on the card, a dimmed image, a banner on the details page, no claim button, and no further match suggestions. Clicking again does nothing. | `items.js`, `style.css` |
| 12 | **Skeleton loading cards** with a shimmer (still for users who prefer reduced motion) on Browse, My reports and the dashboard, plus a hidden "Loading…" message for screen readers. | `items.html`, `my-reports.html`, `dashboard.html`, `style.css` |
| 13 | **Mobile.** Every page was checked at 320, 375, 768 and 1280px in both themes. The header keeps the logo and theme button on one row with links wrapping below. Categories go to 2 columns, action buttons stretch full width, controls are at least 34px tall, and long text wraps. | `style.css` |
| 14 | **Accessibility.** All form controls have labels and the category picker is a `fieldset` with a `legend`. Field errors are linked with `aria-describedby`. Links, buttons and the upload area show a visible focus outline. The file input is reachable by keyboard (it was `display:none`). Photos get descriptive alt text, decorative icons are `aria-hidden`, and screen-reader-only text labels the 📅 and 📍 icons. | all pages, `style.css` |
| 15 | **Dark mode.** A ☾/☀ button in every page header switches theme. It starts from the system setting and remembers your choice in `localStorage`, and it applies before the page draws, so there's no flash of the wrong theme. A full dark palette covers cards, forms, alerts, badges and navigation, with a smooth transition when switching. Measured contrast: body text 15.8:1, muted text on cards 7.8:1. | `script.js`, `style.css`, all pages |
| 16 | **Fonts.** The system font stack is used throughout and no external fonts are loaded. | `style.css` |

**Restructured files:** `items.js` was rebuilt around the new features (cards, Browse, report form, details and matching, My reports). The storage format, IndexedDB photo storage, ownership checks and login redirects are unchanged. `script.js` now loads in `<head>` on every page, so the theme applies before paint and its shared helpers are ready for `auth.js` and `items.js`.

### VOSC Event Hub

| Task # | Feature | Files |
|---|---|---|
| 1 | **Event countdown** under the hero, showing days, hours, minutes and seconds and updating every second. When it reaches zero it shows "VOSC is happening now!", and after the end time "VOSC has ended". Screen readers get an update once a minute. ⚠️ The project gives no event date, so a **placeholder** is used: 14 Nov 2026, 09:00–17:00 IST, venue "to be announced". Change it in the `data-event-*` attributes on `#countdown` in `index.html`. | `index.html`, `js/script.js`, `css/style.css` |
| 2 | **Registration confirmation panel** replacing the form: 🎉 Registration Confirmed!, your name and email, ✓ Registration complete, a "keep this for your records" note, and **Back to Event Hub**. | `index.html`, `js/script.js`, `css/style.css` |
| 3 | **Digital ticket** showing name, role, 📅 date, 📍 venue, "Registration Confirmed ✓" and a reference code. **Download Ticket** draws it on a canvas and saves a PNG, all in the browser. It's labelled as not a secure or official credential. | `index.html`, `js/script.js`, `css/style.css` |
| 4 | **Duplicate-registration check, in this browser only.** Registrations are saved in `localStorage` (`vosc_registrations`) and compared without regard to letter case. A repeat shows "⚠️ Already Registered — This email is already registered for VOSC Event Hub. You don't need to register again.", an error under the email field, and a **Show my ticket** link. | `js/script.js`, `css/style.css` |
| 5 | **Errors under each field**: "Please enter your full name." / at least 2 characters / up to 80 / letters, spaces, dots, apostrophes and hyphens only; "Please enter your email address." / "Please enter a valid email address."; already-registered. Whitespace-only input counts as empty. Filled fields are checked when you leave them, and errors clear as you type. There are no `alert()` calls. | `index.html`, `js/script.js`, `css/style.css` |
| 6 | All visible text says **VOSC**. The `VOC Event Hub` folder is unchanged, as requested. | — |
| 7 | **Responsive.** Checked at 320, 375, 768, 1024 and 1280px. The countdown stacks, the ticket stub moves underneath, and buttons go full width on phones. | `css/style.css` |
| 8 | **Navigation** highlights the section you're viewing (`aria-current="location"`). Mobile menu links are at least 44px tall, desktop links have hover and focus states, and the mobile menu still closes after a tap. | `js/script.js`, `css/style.css` |
| 9 | **Hero image left as it was:** same URL, and its empty `alt` correctly marks it as decorative. | — |
| 10 | **Polish:** gentle section fade-ins (off for users who prefer reduced motion), hover lift on schedule and speaker cards, and initials avatars for speakers. | `index.html`, `js/script.js`, `css/style.css` |

## Round 4: matching lost and found reports, recovered list, review fixes

Frontend only, like every earlier round: HTML, CSS and client-side JavaScript. Data stays in the browser storage the project already uses. Nothing new is stored except two fields on each report (`matchedWith`, `recoveredAt`) and a one-time message in `sessionStorage`.

### Lost & Found

| # | Change | Files |
|---|---|---|
| 1 | **"✓ This is mine"** on each Possible Match, shown to the owner of the lost report. The finder sees **"✓ I returned it to this person"** instead. After a confirm, the lost report **and** the found report are both marked recovered and linked to each other (`matchedWith`, `recoveredAt`). | `items.js`, `style.css` |
| 2 | **Claim picker.** "This is mine — claim it" on a found item now asks *"Which of your lost reports is this?"*, with the best match preselected. "I think I found this" on a lost item asks the same about your found reports. People with no reports of the other type still send a plain response, as before. | `items.js`, `style.css` |
| 3 | **Matched reports leave the open lists**: Browse, homepage Recent Reports and the dashboard. Browse has a new **Status** filter (Still open / Recovered / All). The count shows how many recovered reports are hidden. My reports still shows everything. | `items.js`, `script.js`, `items.html`, `style.css` |
| 4 | **Recovered page** (`recovered.html`, linked in every menu). It shows each lost report next to the found report it was matched with: who lost it, who found it, where, the match date and the days it took. Totals at the top, and items marked recovered by hand get their own section. | `recovered.html`, `items.js`, `style.css` |
| 5 | The recovered banner names the matched report and the person to contact for the handover. Recovered cards show "🔗 Matched with …". | `items.js`, `style.css` |
| 6 | **Dashboard:** a **Matches for you** list (your open reports that have possible matches, with the best score), clickable tiles (Still missing, Awaiting owner, Recovered, My reports), and "Recent open reports". | `dashboard.html`, `items.js`, `style.css` |
| 7 | **Session check:** a saved sign-in whose account no longer exists in this browser is logged out, and any password left in an old saved sign-in is removed. | `script.js` |
| 8 | **Homepage:** logged-in users see "My reports" in the menu, and "Report a found item" instead of "Create an account". The Recent Reports card shows open reports only. | `index.html`, `script.js` |
| 9 | **Polish:** a bordered search box that lines up with the filters; shorter no-photo cards tinted red (lost) or green (found); larger My reports buttons with a red Delete; the phone footer on two lines. | `style.css`, `items.js` |
| 10 | **Accessibility:** darker red/green text on tinted backgrounds, white "READY?" text on the blue band, and hidden section headings so heading levels don't skip. The axe scan now reports no violations on any page, in light or dark mode. | `style.css`, `items.html`, `my-reports.html` |

### VOSC Event Hub

| # | Change | Files |
|---|---|---|
| 1 | **Stronger duplicate check.** Gmail addresses are compared the way Gmail delivers them, ignoring dots and `+tags` (`priya.sharma+vosc@gmail.com` = `priyasharma@gmail.com`). A returning visitor sees **"✓ You're already registered"** with **View my ticket** and **Register someone else** before the form. Double clicks are ignored while a registration is being saved. | `index.html`, `js/script.js`, `css/style.css` |
| 2 | **Add to Google Calendar** link and a **.ics download** (Outlook / Apple Calendar) on the confirmation. Both are built in the browser from the event details. | `index.html`, `js/script.js` |
| 3 | **Event at a glance** card next to the sign-up form (date, time, venue, entry, what to bring), filled from the same `data-event-*` attributes as the countdown. | `index.html`, `js/script.js`, `css/style.css` |
| 4 | "Reserve your spot" is now the main hero button, and the wording is the same everywhere. **Register** stands out in the menu. | `index.html`, `css/style.css` |
| 5 | **Fixes:** "Register now" uses the same font size as the other buttons, the Role dropdown matches the text fields, the About text has a comfortable reading width, and the footer lines up with the page content. | `index.html`, `css/style.css` |
| 6 | The fade-in now always reveals content after 2.5 seconds or before printing, so sections can't stay invisible. The unused "register button" handler was removed. | `js/script.js` |

**Verification (Round 4):** a 69-check headless Chromium test passed in full. It covered the session check, guest and member homepage, Matches for you, "This is mine", both reports leaving every open list, the Status filter and deep links, the claim picker, the finder's action, plain responses, the Recovered page (pairs and manual recoveries), publishing and future-date regressions, phone overflow on 6 pages; and for VOSC button wording, the summary card, font sizes, footer alignment, the double-click guard, the Gmail duplicate check, the returning banner, Register someone else, the Google Calendar link, the .ics file and phone overflow. The axe accessibility scan found no violations on 8 Lost & Found pages, in light and dark mode, or on VOSC. No JavaScript errors.

## Round 5: login required to see reports

At the owner's request, **every page that shows reports now requires login**: Browse (`items.html`), item details, Recovered, Dashboard, My reports and Report. A logged-out visitor who opens any of these, by menu link or by typing the address, goes to the login page with a short notice (for example "Please log in to browse lost and found reports.") and comes back to the same page after logging in. The check runs in `<head>` before the page draws, so report data never flashes on screen. The homepage "Recent Reports" card no longer lists items for guests. It asks them to log in or create a free account instead. A saved sign-in for an account that no longer exists counts as logged out. Files: `script.js`, `auth.js`, `style.css`.

> This replaces the earlier brief's "reports are browsable by logged-out visitors". As before, it is a frontend check only, not real access control.

## Round 6: claims workflow, Claims & Responses page, My Agenda

Frontend only: HTML, CSS and vanilla JavaScript. No backend, database, server, API or framework. The existing storage keys are reused (`lf_items`, `lf_claims`, `lf_users`, `vosc_registrations`), plus one new key, `vosc_agenda`.

### Lost & Found

| Change | Files |
|---|---|
| **Claim and response form** on item details. Found reports say **"I Think This Is Mine"** and ask for identifying details. Lost reports say **"I Found This Item"** and ask for a short message. The user can link one of their own reports of the other type, with the best estimated match preselected. The message is checked (10–500 characters, shown under the field). A confirmation appears only after the browser has actually stored the claim. A second claim on the same report is blocked, and the existing claim's status is shown instead. | `items.js`, `style.css` |
| **"Email Reporter"** is now a separate action, with a note that it opens the user's own email app and sends nothing automatically. | `items.js` |
| **Claims & Responses page** (`claims.html`, menu link with a pending-count badge). Owners see only claims on their own reports: item and type, claimant name and email, message, sent date, linked report, and status (⏳ Pending / 👁 Reviewed / ✓ Resolved, never colour alone). Actions: Mark reviewed, Confirm return (marks recovered), and Mark resolved. A Show filter and an "item" deep link are included. "Sent by you" lists the user's own claims and their statuses. | `claims.html`, `items.js`, `script.js`, `style.css`, `auth.js` |
| **Consistent resolution.** A claim never marks anything recovered by itself. Only the report owner's **Confirm return** does, after a confirmation dialog. If the claim links the claimant's own matching report, both reports are marked recovered and linked, reusing `resolveMatch`, so they appear on the Recovered page. Otherwise only the owner's report changes. Other claims on an already-recovered report can only be closed. Dashboard counts, Browse, Recovered and My reports stay in sync. | `items.js` |
| **Possible Matches:** strongest first, scores labelled as estimates, a "View report" link, and the right action ("I Think This Is Mine" / "I Found This Item") opening a pre-linked claim. Direct recovery from a match card was removed in favour of the claim → owner-confirmation flow. The note says matching is local, not AI, and not proof of ownership. | `items.js`, `style.css` |
| **Details and My reports:** photos open in a keyboard-accessible viewer (native `<dialog>`, Esc closes). Owners see a claims summary instead of a claim button, and edit stays owner-only. My reports cards show "📨 N claims & responses · N pending". The dashboard shows a pending-claims alert. Manually marking a report recovered now asks for confirmation and closes its open claims. | `items.js`, `dashboard.html`, `style.css` |
| **Reliability:** reports, users and claims are read defensively. Non-list or broken JSON, `null` entries and invalid dates no longer crash pages (invalid dates show "—"). Older `lf_claims` records (`{itemId, userEmail, date}`) are shown as Pending with a fallback message, and are upgraded with an id and status the next time they are saved. Storage failures show an error instead of a success message. | `items.js`, `script.js`, `auth.js` |

### VOSC Event Hub

| Change | Files |
|---|---|
| **My Agenda.** Each of the 3 existing schedule sessions has an **Add to My Agenda** toggle with stable ids (`kickoff`, `domain-mapping`, `prototyping`), a visible selected state and `aria-pressed`. A new **My Agenda** section lists the chosen sessions in time order, each with Remove, plus a Clear agenda button (with confirmation), an empty state and screen-reader announcements. Choices are saved in `vosc_agenda`, de-duplicated, and unknown or corrupt values are ignored. Two open tabs stay in sync. No registration is needed. | `index.html`, `js/script.js`, `css/style.css` |
| **"Happening now" / "Up next"** on schedule cards. They are calculated from the configured event date, time and time zone, are shown only while the event is running, and are hidden before and after it or if the configured date is invalid. | `js/script.js`, `css/style.css` |
| **My Ticket** menu link. It reopens the registration saved in this browser, with the same reference, Download Ticket and calendar actions. If none exists, it says plainly that registrations are stored only on the device and browser where they were made, and shows the form. | `index.html`, `js/script.js`, `css/style.css` |

### Not added, and why

- **Speaker details dialog:** the project only has each speaker's name and role. A dialog would add nothing without inventing biographies, so it was not built.
- **Session type filters and expandable session details:** the schedule has only 3 sessions, each with a title, a time and one description line. Filters or "more details" would need invented content.
- **VOSC dark mode:** not part of VOSC before, and not requested.

**Verification (Round 6):** an 88-check headless Chromium test passed in full. It covered claim and response submission (with and without a linked report), validation, duplicate claims, owner-only visibility, reviewed, resolved and closed, confirm-return pair and single cases, legacy claim migration, match links, search, filter, sort, the future-date check, publishing with and without a photo, the photo viewer (Esc), dark mode, guest redirects, corrupted `lf_users`, `lf_items`, `lf_claims`, `vosc_agenda` and `vosc_registrations`, invalid dates, agenda add, remove and clear, persistence and de-duplication, keyboard toggling, now/next flags (during, before and after the event), an invalid configured event date, My Ticket with and without a registration, ticket, .ics and Google Calendar actions, duplicate registration, the mobile menu, and phone overflow. The earlier 68-check regression suite also passed after being updated for the new claim → confirm flow. axe found no accessibility violations on the Claims page (light and dark), details with the claim form, My reports, or VOSC. There were no JavaScript errors.

## Known issues not changed

- **Passwords are stored in plaintext in `localStorage` (`lf_users`).** The README documents this as a demo limitation. Hashing on the client would still not make this real authentication, and it would break existing accounts, so it was left alone. Any real deployment needs a backend.
- **Reports, users and claims live in only one browser.** This is by design, per the README.
- The VOSC hero image is still loaded from Unsplash, so it needs network access, and its `alt` is still empty. Both were kept as they are at the owner's request.
- VOSC registrations and the duplicate-email check exist only in the visitor's own browser (`localStorage`). Nothing is sent to an organiser. A real event would need a backend.
- The VOSC countdown and ticket use a **placeholder event date and venue** (14 Nov 2026, 09:00 IST, "Venue to be announced"). Update the `data-event-*` attributes in `VOC Event Hub/index.html`.
- Lost & Found matching compares only reports saved in the same browser, using simple keyword and date scoring.
- Frontend validation helps users fill in forms correctly, but it is not a security control. Any real deployment needs server-side validation and authentication.
- **No LICENSE file** was in the upload, so none was added. Check the upstream repository's license before you publish.

## Verification

- `node --check` passes on every JS file.
- A headless Chromium smoke test (Playwright, served over HTTP) ran 21 checks covering register, login session, the dashboard, publishing a report with an image, browsing while logged out, escaping, mark recovered, edit, log out, claiming while logged out, VOC anchors, FAQ, form validation and the mobile menu. **Original code: 14 failed. Fixed code: 21 of 21 passed, with no uncaught page errors.**
- Lost-and-Found also registered and loaded the dashboard correctly when opened straight from disk (`file://`), as its README describes.
- **Round 2:** an 89-check headless Chromium test passed in full. It covered logged-in and logged-out headers on every page, guest redirects with notices, rejection of unsafe `?next=` values, and the report, sign-up and VOSC forms with empty, whitespace-only, invalid, over-long and valid input. It also covered HTML injection in item names, mark recovered, claim success and info styles, a check that success and error messages look different, the mobile menu closing after a link is tapped, the absence of `alert()` calls, and horizontal overflow on every page at 320, 375 and 768px. No uncaught JavaScript errors and no broken local file references were found.
- **Round 3:** a 171-check headless Chromium test passed in full. For Lost & Found it covered register and login validation; lost and found wording; all 9 categories; empty, whitespace, invalid and over-long input (including bypassed `maxlength`); dates (today and the past accepted; tomorrow, far-future, typed-in future and pre-2000 rejected); photos (wrong type, choose, change, remove, publish without a photo, remove on edit); search, highlighting, filters, sorting, the empty state and reset; Possible Matches, including no false match; the recovered state; dark mode (persistence, every page, contrast); logged-out access; and overflow on 9 pages × 4 widths × 2 themes. For VOSC it covered the countdown ticking and both zero states, every validation case, confirmation, ticket content, the PNG download, the case-insensitive duplicate check, Show my ticket, Back to Event Hub, no `alert()`, active nav, 44px mobile tap targets, the menu closing, and overflow at 5 widths. No JavaScript errors were found. The only failed network requests were the browser's automatic `favicon.ico` request and the Unsplash hero image, which my test environment blocks.
- There is no automated test suite in the repository. The smoke test was a one-off and is not included.
