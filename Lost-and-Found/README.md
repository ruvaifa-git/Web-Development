# Lost & Found+ — local frontend demo

Create two local sample accounts to demonstrate: lost report → found report → identifying claim with a linked report → owner review → confirmed return → recovered pair. Sign out and back in to switch personas in the same browser. No information is delivered to other devices.

All report pages require local sign-in. Browse offers text/type/category/status/location/date filters and sorting; opening a report and returning retains filters. Reset returns to open reports. Reports include image previews and a larger-photo dialog; photos are optional. Text drafts are saved per account/report; photos must be selected again after reopening.

Owners review Pending/Reviewed claims, then confirm a physical return. Confirmation recovers the related pair when the linked report is valid, or only the owner's report otherwise. Every affected claim is resolved in the same saved snapshot. Manually marking a report recovered follows the same coordinated save path. Sending a claim alone does not recover anything.

Migration reads `lf_items` and `lf_claims`, retains the raw legacy arrays, and writes the first successful update to `lf_records`. Malformed data blocks saving and offers a raw metadata backup. Failed new photos are rolled back; original attachments are removed only after metadata commits. Stale edits or changed sign-in during upload retain entered fields and refuse publication.

Run the sites and checks from the parent folder as described in [the main README](../readme.md) and [TESTING.md](../TESTING.md). The 16 October release passed 51 native checks, 46 Chromium scenarios and 20 real Orca speech-output checks. Browser accounts, reports and claims remain local demo data; there is no server authentication or email delivery.
