# Contributing

Follow the college club/upstream repository's contribution rules. Use focused issues/PRs so maintainers can review and credit each change clearly.

Include the student's concrete problem, reproduction steps, expected/actual behavior, resulting behavior and relevant compatibility decisions. Preserve older reports and user input on failure. Keep the HTML/CSS/vanilla-JavaScript stack; backend work is on hold.

Run `node tests/frontend.test.cjs`, then the relevant browser/manual checks in `TESTING.md`. Include before/after screenshots or a short recording when useful. Report only checks that actually ran, and update documentation when controls, data or demo behavior changes.

## Matching examples to retain

| Example | Expected |
|---|---|
| Same distinctive phone name/details and nearby dates | Useful suggestion |
| iPhone vs ThinkPad at the same place/date | No suggestion |
| Shared category/place/date with unrelated names/details | No suggestion |
| Found months before lost | No suggestion |
| Generic “black phone” without distinctive details | Tentative score below 50 |
| Umbrella vs calculator, both described as “Please contact me” | No suggestion |
| Black watch vs white watch | No suggestion |
| Grey/gray aliases or overlapping multicolour titles with distinctive details | Useful suggestion |
| Recovered report | No suggestion |

Use sample data in tests. Do not commit student credentials, registrations or saved browser data. Do not present local demo accounts/tickets as secure or official registrations. The upstream license and contribution rules govern publication.
