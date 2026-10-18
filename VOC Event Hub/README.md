# VOSC Event Hub

The event homepage links to three dedicated pages:

- **Registration** (`registration.html`) validates participant details and saves a local registration before opening the dashboard.
- **My Registration** (`dashboard.html`) shows saved participants, supports switching between them, and offers the existing demo PNG ticket and valid-date calendar exports. Existing `vosc_registrations` records still work.
- **Contact Us** (`contact.html`) validates questions, saves/restores a local enquiry draft and downloads its text. The homepage and footer have working Contact us links.

These are frontend prototype pages. Registrations and enquiries are not sent to organisers; no seat is reserved. The pages explain this before saving and in confirmations. The Contact Us form does not pretend to deliver a message. No backend was added.

My Agenda still works without registration, persists locally and synchronizes other tabs of the same origin. Corrupt saved records are retained and surfaced as errors rather than silently replaced.

## Shared event settings

Edit **`js/event-config.js`**, which is loaded by all four pages. Dates are intentionally blank. When confirmed, set `start` and `end` to full ISO timestamps with timezone offsets, with end after start; set a valid `timeZone` and confirmed `venue`. Countdown, schedule flags and calendar exports activate only with valid dates. Blank/impossible/reversed dates or an invalid timezone keep registration usable and calendar exports hidden. Existing schedule times remain illustrative while the date is unconfirmed.

To make the bottom/footer Contact us buttons open a published Google Form, set `contactFormUrl` to its HTTPS responder link (`https://forms.gle/...` or `https://docs.google.com/forms/d/e/.../viewform`). A Google Form has not been created or connected in this release. Blank, invalid, non-Google or edit links preserve the working local contact page. The navigation always keeps a route to that page. External form links open in a new tab with `noopener noreferrer`; the website does not prefill or send local draft data to Google.

Saved records use `vosc_registrations`; agenda choices use `vosc_agenda`; enquiry drafts use `vosc_contact_draft`. Demo duplicate checks include Gmail aliases. The ticket remains labelled as a demo and invalid for admission. Changing devices, browsers, localhost ports or temporary tunnel URLs uses a separate browser-storage origin.

See [TESTING.md](../TESTING.md) for reproduction commands and coverage.
