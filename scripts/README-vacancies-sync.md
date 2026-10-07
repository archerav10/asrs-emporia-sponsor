# Vacancies hub — how it stays up to date

The "Current Openings" page (`/openings/`) is a static HTML file, but it's
generated from data, not hand-edited.

**Source of truth:** the "Home Vacancies" database in Notion, under the
Longstreet Dashboard page.
Data source: `collection://618a4b72-ab89-4c12-856c-8d7c51b29984`

Columns: Home Name, City/State, Zip Code, Vacancy Status (Open / Filled /
Coming Soon), Opening Date, Short Description, Page Path, Hero Photo Path,
Home Type (Group Home / Sponsored Residential — shown as the badge on the
opposite side of the photo from "Open Now"; saved as `homeType` in the JSON).

**Pipeline:**
1. A scheduled Claude task queries that Notion database.
2. It writes the result to `data/vacancies.json` in this repo (matching the
   shape already in that file).
3. It runs `node scripts/generate-openings.js`, which regenerates
   `openings/index.html` — filtering to `Vacancy Status = Open`, sorted by
   `Opening Date` ascending (earliest opening listed first).
4. If anything changed, it commits and pushes. Netlify auto-deploys from
   GitHub, so the live page updates within a minute or two.

**To add a new home / change a vacancy status:** update the row in the
Notion "Home Vacancies" database (add a home, flip its status to Filled,
change its opening date, etc.) — no need to touch code. The next scheduled
sync run picks it up automatically. You can also ask Claude to run the sync
immediately after you make a change in Notion, instead of waiting.

**To add a new home's individual sponsor page:** that's still a page build
(like Emporia and Highland Springs), not something this sync creates by
itself — it only manages the hub listing once a page exists at the "Page
Path" you set in Notion.
