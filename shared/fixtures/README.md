# Fixtures

`reports.json`: the parts of real analyzer reports that a summary is built from, one per clip.
Produced on 9 Nov 2026 by sport-coach-browser (CPU, 15 fps) from its e2e clips (`rg-*`, `boxing-chunk`,
`fitness-*`) and two boxing clips of the owner (`boxing-bag`, `boxing-sparring`).
Only numbers and finding codes: no file names, no frames, no landmarks.

Fields: `scalars` are `[id, value]` in the report's order (the priority order), `findings` keep `code`,
`kind`, `tone` and `focus`. Regenerate when the analyzer's scalars or finding codes change.
