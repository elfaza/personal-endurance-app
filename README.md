# Personal Endurance

A single-user, mobile-first training PWA for running and cycling. Built with Next.js App Router, strict TypeScript, Tailwind, shadcn-style Radix components, Lucide, Recharts, SWR, Zod and React Hook Form. No OpenAI API, paid AI service, database server, or Garmin login scraper.

## Start locally

Requires Node.js 22+ and npm. Dependencies are pinned in `package.json` and `package-lock.json`.

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Open [localhost:3107](http://localhost:3107). The default is **demo mode**, with conspicuously labeled sample data and isolated persistence in `.data/demo.json`. Demo mode never calls Garmin or Sheets. Changing a sample workout persists across server restarts. To reset it, stop the server and move `.data/demo.json` aside. No credentials are needed for demo mode or unit tests.

Development demo access without a password is restricted to localhost. Configure the password and session secret before network access. Live mode and production always require authentication, including API routes; incomplete security configuration fails closed.

## What is implemented

- Five sections: dashboard, weekly/monthly calendar, activities, analytics, settings; desktop sidebar and mobile bottom navigation.
- Metric summaries, date filters, running/cycling distance, planned versus actual distance, pace and HR trends, volume and consistency charts.
- Workout creation, edit, soft deletion of plans, duplication, skip, explicit manual completion, partial completion, rescheduling with retained original history, multiple sessions per day, optional sessions and configurable targets.
- Usual-week action: Monday easy run, Tuesday commute, Wednesday intervals, tentative Thursday commute, Friday long run and weekend rest. It leaves occupied days intact and adds no automatic training targets or progression.
- Official Garmin Personal API bearer exchange, in-memory token expiry/cache, one retry after unauthorized bearer, paginated activity sync with stable-ID deduplication, detail DTO normalization, available split summaries/HR-zone durations and original ZIP download.
- Direct Google OAuth with offline access, state validation, S256 PKCE, a private masked credential handoff, and Sheets read/write adapters, layout inspection, dedicated PE worksheets, explicit legacy-column import preview, append-only revision history, conflict detection, atomic multi-sheet writes and idempotency receipts.
- Conservative activity matching, timed one- or two-ride commute progress, intentional mixed-sport sessions, manual linking/unlinking and planned versus actual comparison. Original Garmin metrics are never manually overwritten.
- Editable feedback journal and multiple race goals; default demo goal is 21.1 km in January 2027 with no invented race day. Longest-run progress is a distance milestone, not a readiness score.
- Explainable session-RPE load where both recorded duration and a journal RPE exist, including cycling. Missing measurements remain missing.
- 45-second active Sheets refresh, focus/reconnect revalidation, 10-minute active Garmin checks, sync on opening a stale live workspace, manual sync and optional authenticated scheduler endpoint.
- Installable manifest, PNG icons, standalone mode, service worker, offline snapshot reader, light/dark appearance and disabled offline editing.

## Environment

Copy `.env.example` to `.env.local`. Never use `NEXT_PUBLIC_` for any credential.

| Variable                       | Purpose                                                                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PE_DATA_MODE`                 | Optional local override. Demo until OAuth has a refresh token; configured OAuth automatically selects live mode. Live errors never fall back to sample data. |
| `GARMIN_PERSONAL_API_KEY`      | Official Garmin Connect Personal API key. Required for Garmin sync, not for using the calendar.                                                              |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | ID from the spreadsheet URL, between `/d/` and `/edit`.                                                                                                      |
| `GOOGLE_AUTH_MODE`             | Set to `oauth`. No service-account private keys or Vercel Connect.                                                                                           |
| `GOOGLE_CLIENT_ID`             | Google Web application OAuth client ID, server-side only.                                                                                                    |
| `GOOGLE_CLIENT_SECRET`         | OAuth client secret. Save directly in Vercel as a Production Secret / Sensitive variable.                                                                    |
| `GOOGLE_REFRESH_TOKEN`         | Copy from the private masked callback page directly into Vercel as a Production Secret / Sensitive variable.                                                 |
| `GOOGLE_SHEETS_WRITES_ENABLED` | Must equal `true` for any Sheets mutation, including initialization and verification.                                                                        |
| `APP_PASSWORD`                 | Strong single-user password, minimum 16 characters. Required for live, production or network access.                                                         |
| `SESSION_SECRET`               | Cryptographically random signing secret, minimum 32 characters. Required with the password.                                                                  |
| `APP_ORIGIN`                   | Exact HTTPS app origin. Pins OAuth callback and mutation origins. APP_URL remains a legacy mutation-origin fallback only.                                    |
| `CRON_SECRET`                  | Optional independent random 32+ character bearer secret for unattended sync.                                                                                 |

Generate a session secret locally (do not paste it in chat or commit it):

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

After changing environment variables, redeploy (or restart locally). Secrets and upstream error objects are never logged or included in data endpoints. The only credential handoff is the private callback page for copying a new refresh token into Vercel; it is never saved to cookies, browser storage, or Sheets.

## Google Sheets setup

1. Create or select a Google Cloud project and enable **Google Sheets API**.
2. Configure Google Auth Platform branding and audience. For an External app in Testing, add the Google account that can edit the sheet under **Audience → Test users**.
3. Create a **Web application** OAuth client. Register this exact production redirect URI: `https://personal-endurance-app-elfazas-projects.vercel.app/api/google/callback`. For another deployment, use APP_ORIGIN followed by `/api/google/callback`.
4. Save GOOGLE_AUTH_MODE=oauth, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_SHEETS_SPREADSHEET_ID, GOOGLE_SHEETS_WRITES_ENABLED=true, APP_ORIGIN, APP_PASSWORD, and SESSION_SECRET in Vercel for Production. Keep secrets in Secret / Sensitive fields, out of chat. Redeploy.
5. Sign in and open `/settings/google`. Select **Connect Google**, approve editing access, then copy the refresh token from the private masked page directly into GOOGLE_REFRESH_TOKEN in Vercel. Redeploy again. Live mode activates automatically. The completion page uses no-store, no-referrer and a nonce CSP; it clears on exit or after five minutes.
6. Verify reading and writing from Google setup. This writes and reads a marker only in a new disposable hidden worksheet, then deletes only that exact worksheet. Existing content is never targeted. A failed verification may retain the test worksheet or lock for review; do not retry an uncertain write automatically.
7. In **Settings → Google Sheets → Inspect spreadsheet**, review the existing worksheet names and headers. Then select **Create PE worksheets**. Only missing PE datasets are added. An incompatible PE schema is rejected before mutation.
8. For this tracker, select **Connect live Training Plan**. The original `Training Plan` becomes the calendar source, and web edits save back to it. Other tracker layouts can still use the one-time import described below.

Google’s [Testing audience rules](https://support.google.com/cloud/answer/15549945) expire Sheets refresh tokens after seven days. For ongoing use, configure the OAuth app’s production publishing status as appropriate and reconnect; Google may require verification or show an unverified-app warning. The app requests only the Sheets scope, which allows access to spreadsheets the authorizing account can access; the server is pinned to its configured spreadsheet ID.

OAuth initiation is an authenticated same-origin POST. A ten-minute HttpOnly SameSite=Lax cookie contains only a signed state nonce and timestamp; the PKCE verifier is derived server-side. This proof authenticates the cross-site callback where the Strict app session is unavailable. Forged or expired state fails before token exchange. Password/session-secret rotation invalidates pending state. Do not capture callback pages in logs, screenshots, browser traces or error-reporting tools.

### Dedicated datasets and column mapping

| Worksheet          | Dataset                                                                            |
| ------------------ | ---------------------------------------------------------------------------------- |
| `PE_Workouts`      | Workout revision history; legacy calendar source before Training Plan is connected |
| `PE_Feedback`      | RPE, energy, fatigue, soreness, sleep quality, notes and skipped reason            |
| `PE_Goals`         | Multiple race/distance goals, optional exact dates and target time                 |
| `PE_ActivityLinks` | Unique workout-to-activity mappings, separate from recorded metrics                |
| `PE_Activities`    | Persistent normalized Garmin activity cache (Garmin remains authoritative)         |
| `PE_Meta`          | Last sync/error state and mutation operation receipts                              |

Each dataset uses the documented adapter in `src/lib/google-sheets/rows.ts` and these exact columns:

```text
id | revision | parent_revision | updated_at | deleted | payload_json | operation_id
```

The payload is JSON in one cell. This deliberately keeps a compact common persistence adapter while retaining old revisions, stable IDs, and separate logical datasets. The app uses **append-only rows**, rather than finding a row by an unstable row number and overwriting it. `deleted=true` hides a plan while retaining its history. Writes use `stringValue`, preventing note text from being interpreted as a spreadsheet formula.

### Live Training Plan and weekly generation

`Training Plan` is the canonical calendar when `PE_Meta` contains the enabled `training-plan-source` marker. Its existing columns are Date, Day, Session, Planned detail, Goal, Target km, Target min, Status, Actual km, Actual min, Avg HR, Max HR, RPE, and Notes. Setup adds `PE_ID` and `PE_Metadata` in unused columns and retains current web IDs, activity links, commute settings and completion updates. Existing PE revision history remains intact. The two extra columns contain app settings, never credentials.

Every authenticated data refresh reads the original tab (45 seconds while active, and on focus/reconnect). Weekly rows added to the original columns appear without re-importing, even with blank PE columns. An identity derived from sheet/date/session/time is used until the first web save assigns a stable PE_ID. Keep explicit IDs when sorting or changing existing sessions; indistinguishable duplicate rows require distinct IDs. Existing round-trip commute preferences supply defaults for new bike-to-work rows.

Web saves re-read under the shared lock, check the browser revision and full snapshot, then check the original grid again immediately before an atomic batch. Only changed `userEnteredValue` cells are updated; formulas, formatting, dropdown validation and unrelated columns are preserved. An attempted formula overwrite is rejected. Numeric targets and free-text duration ranges are kept separately. `Modified` maps to Partially Completed; Optional/Tentative remain optional plans. Deleted sessions stay in the sheet as Skipped with metadata marking deletion; rescheduled originals stay as Skipped with metadata recording Rescheduled and the replacement ID, preserving existing dropdown rules. Source status edits supersede a reschedule override.

Linked Garmin activities write actual distance, duration and heart rates to the corresponding plan row; mixed-sport sessions use only the primary sport for those metrics. Journal RPE writes to the plan's RPE cell; additional journal fields, race goals and activity links stay in PE datasets. This connection does not independently populate `Workout Log` or `HM Roadmap 2027`. Existing Dashboard formulas continue using their existing references.

The weekly generator should append new rows in A:N, preserve headers and PE columns, and avoid resetting historical statuses/actuals. To serialize concurrent generator edits with web saves, the generator must use the same `PE_Write_Lock` protocol: acquire the uniquely named hidden tab, reread after acquisition, submit its exact cell updates and deletion of its own lock ID in one atomic batch, and never automatically retry an uncertain write. Do not steal a lock based on age. A scheduler that bypasses this protocol can still race in the final gap between a read and write; Sheets does not provide a compare-and-swap cell API. The app's checks catch external edits visible before submission, but cannot guarantee serialization with an uncoordinated writer.

Workout payload fields:

```json
{
  "date": "2026-10-30",
  "time": "06:00",
  "type": "Long Run",
  "title": "Friday long run",
  "description": "Comfortable conversational effort",
  "distanceKm": 8,
  "durationMin": 60,
  "targetPace": "7:15–7:45",
  "hrZone": 2,
  "rpe": null,
  "status": "Planned",
  "optional": false,
  "notes": "",
  "createdAt": "2026-10-26T00:00:00.000Z"
}
```

Supported types: Easy Run, Recovery Run, Interval Run, Tempo Run, Long Run, Cycling, Bike-to-Work, Strength Training, Cross Training, Rest Day, Custom Workout. Statuses: Planned, Completed, Partially Completed, Skipped, Rescheduled. All dates are ISO `YYYY-MM-DD`; times are `HH:mm` in Asia/Jakarta. Distances are km; durations in workout targets are minutes. Target `rpe` is distinct from the journal's actual session RPE.

### Existing tracker import

After inspection and setup, **Bring in an existing plan** lets you select the original tab and explicitly map headers to app fields. A stable, unique source workout ID, ISO date, supported workout type and title are required. Optional mappings include time, distance, duration, status, notes and RPE. There is no schema guessing.

Preview validates every nonempty row before any import. Confirming imports new IDs into `PE_Workouts`, preserving the source tab. IDs derive from the spreadsheet, source tab and source ID, so re-importing skips existing records. A hash detects source edits between preview and confirmation. The import supports up to 1,999 workouts and 52 columns; split larger trackers into source tabs. Imported completion statuses are your explicit manual confirmations, not fabricated Garmin measurements.

This is a **one-time migration**. Subsequent two-way synchronization is with the PE datasets. The app does not continually mirror arbitrary original tracker layouts or rewrite their formulas. Original tracker views can reference the PE datasets, or the adapter can be extended for a specific verified schema.

### External edits and concurrent changes

External edits to the current `payload_json` are picked up on the next active refresh. Preserve valid JSON, headers, IDs and revision metadata. Using the app for edits is more convenient and retains complete history. For example, changing a current planned workout's `notes` inside its JSON cell will appear within 45 seconds.

Before saving, the app acquires a hidden `PE_Write_Lock` worksheet through an atomic addSheet request. Google’s unique title rule allows only one Vercel instance to acquire it. Under that lock, the app rereads records and checks browser revisions and the snapshot used for decisions such as link uniqueness. Stale edits return **409**. A single Sheets batch appends all related changes and deletes the exact lock ID atomically. Operation receipts make explicitly repeated operation IDs idempotent.

There are no automatic Sheets write retries, lock expiry, or lock stealing. On an uncertain acquisition or commit, refresh to determine whether it saved. A retained lock stops further app writes. Validation failures release their lock only if no content batch was submitted. An atomic commit’s exact lock deletion also fences delayed batches: if that ID has been recovered, an old batch fails in full instead of changing content.

Recovery is manual: stop further saves, inspect the lock and operation receipts, wait for in-flight functions to finish, reconcile the outcome, then delete the abandoned lock by its exact ID. Never replay a timed-out write or delete a lock based only on age. Reserved `PE_Write_Lock` and `PE_Verify_*` tabs contain no credentials. Verification deletes only exact IDs it created.

This serializes app saves across instances. Humans editing Sheets directly do not participate in the lock; Sheets has no compare-and-swap API for those edits. Fingerprints detect changes visible before commit, and append-only branch detection preserves conflicts. Avoid editing PE metadata/history or making direct PE edits while an app save is in progress. Original non-PE tracker tabs can be used normally.

## Garmin setup and verified contract

Put the Personal API key you already own into `GARMIN_PERSONAL_API_KEY`. No Garmin username/password or unofficial login library is used.

The contract was checked against the [official FAQ](https://developer.garmin.com/gc-developer-program/personal/personal-faq/), [official Swagger documentation](https://developer.garmin.com/gc-developer-program/personal/swagger-docs/) (including its embedded OpenAPI), and Garmin's [reference client](https://github.com/garmin/connect-personal-api-python).

- `POST https://personal.connectapi.garmin.com/personalapitoken-service/personal-api/personal-api-key/token` with `Authorization: ApiKey …`. The response body is a **raw JWT string**, not an OAuth JSON token object.
- Cache the bearer in server memory only, read the JWT expiry for cache timing, renew within an hour of expiry, and share an in-flight token request. No refresh-token flow. On a data 401, discard the cached token and retry once; never expose the token or key.
- `GET /activitylist-service/activities/search/activities` with `start`, `limit`, `startDate`, `endDate`, `excludeChildren`. Pagination continues to exhaustion, up to 10,000 rows per window.
- `GET /activity-service/activity/{activityId}` uses nested `summaryDTO` / `activityTypeDTO`, whereas list results have top-level measurements and `activityType`.
- `GET /download-service/files/activity/{activityId}` returns an original **ZIP archive**, potentially containing FIT files. The app downloads it without untrusted file extraction.
- Distance is metres upstream, durations are seconds, HR is bpm, elevation is metres, and GMT timestamps can omit `Z`. App dates are derived from GMT in Asia/Jakarta, rather than the server's timezone. HR zone durations are seconds. Missing fields remain null; invalid responses fail validation rather than creating plausible data.
- Split summaries are shown as supplied; they are not relabeled as kilometre laps. Zone durations are displayed only where supplied by the list endpoint.

Live credentials were **not provided or tested** during implementation. Mocked official response shapes exercise authentication, pagination, normalization, units and errors. Configure your key, initialize Sheets, then select **Sync now** to verify your own account.

## Synchronization and matching

SWR polls app data every 45 seconds while visible and online, revalidates on focus/reconnect, and rolls back optimistic changes if persistence fails. Safe workout updates revalidate the complete dataset so calendar and analytics stay consistent. Hidden/offline data polling is disabled.

Garmin checks on opening a stale live workspace and every 10 minutes while visible/online. Initial sync imports the last 90 days; subsequent checks overlap the last success by seven days to pick up new or edited activities. Existing cached activity IDs are retained. Manual checks are throttled to once a minute after a success. Data is not available until the activity has uploaded to Garmin Connect.

For an older backfill, authenticated clients can `POST /api/sync` with JSON `{ "start": "2026-01-01", "end": "2026-10-26" }` and the correct Origin header. Use smaller ranges for large accounts. The routine sync does not discover edits to very old activities outside its overlap window; run a backfill for those.

Ordinary auto-matching requires the same Jakarta date, the same running/cycling sport, a distance or duration within 25% of a measured target, and a start time within 90 minutes when a target time exists. Candidates must be unique, including across different planned sessions. Manually partial sessions retain their partial status when an activity is linked.

A Bike-to-Work plan can explicitly expect one ride or both the morning and return rides. A unique cycling activity within 90 minutes of a scheduled start can match an open-target commute. A two-ride plan needs a separate return start time for automatic return matching. One distinct ride produces Partially Completed; two produce Completed. Repeated syncs retain both links without counting a ride twice. Missing schedules or ambiguous evidence remain unlinked.

Other combined sessions may expect two activities. Different sports require explicit Allow different sports on the same date. Manual selectors only offer activities and plans compatible with the date and allowed sports. This supports an intentional replacement such as a run plus family cycling without claiming strength training was recorded. Multiple activities share one link record with an activityIds array; activityId remains its first entry for older records. Unlinking clears associations and restores the plan while preserving Garmin measurements. No workout intensity is automatically increased.

### Optional unattended scheduler

The PWA does not rely on closed-app background execution. Configure a trusted scheduler to call `GET /api/sync` every 10–15 minutes using `Authorization: Bearer <CRON_SECRET>`. It invokes the same idempotent sync service. Provision the secret in the scheduler's secret store. Browser session authentication does not grant scheduler access. No scheduler or cloud deployment was created automatically.

## Analytics definitions

- Recorded running/cycling distance: sum of synchronized activities of that sport within the selected Jakarta dates. Manual completion alone does not invent actual distance.
- Average running pace: sum of durations ÷ sum of distances for running activities having both values. Recorded timer duration is used consistently; moving time is shown separately.
- Average HR: duration-weighted mean across activities having both HR and positive duration. Maximum HR: max of supplied values.
- Completed sessions: plans marked Completed by an activity link or your explicit confirmation. Partial completion is displayed, but not counted as full completion.
- Consistency: completed required sessions ÷ required scheduled sessions × 100. Rest, optional sessions and retained Rescheduled entries are excluded; future required plans within the selected period remain in its denominator.
- Planned/actual distance: planned targets versus recorded distance. Cycling remains visible separately and contributes to total activity time and session-RPE load.
- Session load: actual journal RPE × recorded duration in minutes, summed where both exist. Missing RPE is excluded and coverage is shown. This is not Garmin's training-load formula.
- Goal progress: longest recorded run ÷ goal distance, capped at 100% for display. It is a milestone, not a health assessment or prediction of race readiness.

No unsupported health, recovery or readiness score is generated. Sleep/HRV/stress ingestion, adaptive suggestions, full FIT parsing, standalone activity journals, manually entered numeric actual results, exports and richer analysis remain later work. Basic feedback can be entered on a workout, including a linked activity.

## PWA and offline reading

Use HTTPS in production. On Android/desktop, choose **Install app** in the browser menu (or Settings when an install prompt is available). On iOS, use Safari → Share → Add to Home Screen. Actual installation depends on the browser/device and was not tested on a physical phone.

The service worker caches public static assets and a dedicated offline reader, **never authenticated HTML, API responses or credentials**. After opening the app online once, a full offline navigation shows the most recently saved training snapshot. The loaded app also remains readable offline and disables editing/sync. A snapshot is stored in localStorage on that browser; enable it only on trusted devices. Disable offline reading or clear its data in Settings. Sign-out clears the snapshot. Offline snapshots are not encrypted and can be read by someone with access to that browser profile; normal server authentication cannot protect data intentionally retained offline.

## Security and deployment

The private Vercel project is `elfazas-projects/personal-endurance-app`. Vercel sign-in protection and the app's own password both protect the hosted app. A read-only demo is safe to browse before integrations are configured: on Vercel (`VERCEL=1`) demo writes are explicitly rejected, rather than using an unreliable serverless file. Local development demo editing remains available.

From your Mac, follow the direct OAuth setup above in Google Cloud and Vercel. Keep APP_PASSWORD and SESSION_SECRET set, with APP_ORIGIN equal to the deployed HTTPS origin. Once the refresh token is saved and redeployed, live mode activates automatically. GARMIN_PERSONAL_API_KEY is optional for Sheets-only use. The app works across networks without the Windows machine staying online.

- Authentication uses an HttpOnly, SameSite=Strict signed cookie, Secure in production, expiring after seven days. Password rotation invalidates existing sessions. Login is throttled in process to ten failures per 15 minutes. Put additional rate limiting at your hosting proxy if publicly exposed.
- All data/mutation/download routes enforce access control. Same-origin checks apply to browser mutations; the scheduler uses its separate bearer secret. Input size, date, enum and target ranges are validated.
- Avoid serving the development server publicly. Use a production Next.js deployment with HTTPS and correct `APP_ORIGIN`. Set the server environment, run `npm run build`, then `npm start` or your host's Next.js runtime.
- Live persistence is in Sheets; bearer caches and locks are in memory. A restart obtains new tokens. Serverless live deployment does not depend on writable local disk, but use a single instance when possible for Sheets write serialization.
- Demo file persistence requires writable persistent local storage; it is intended for development, not an ephemeral hosted filesystem. Never deploy secrets or `.data` as public assets.
- `.env.local`, `.data`, `.local`, browser artifacts and logs are ignored by Git. Do not log the environment or raw token responses.
- Google Sheets is suitable for personal scale, not high-frequency telemetry. The append-only history grows over time; Sheets quotas, maximum size, and the 50,000-character cell limit apply (payloads are capped below it). A future database can implement the `Repository` interface without changing UI/business logic.

## Verification

```powershell
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

Unit tests require no real credentials and mock Garmin/Google responses. They cover token caching/renewal/rejection, pagination, normalization, missing data, Sheets headers/rows/import mapping, retained branches, external changes, workout CRUD, idempotency, rescheduling, manual confirmation, immutable activity linking, timezone boundaries, calculations and access control.

Playwright uses installed Microsoft Edge by default, one worker, and an isolated dev server at `127.0.0.1:3108`, with `.next-e2e` build output and `.data/e2e-demo.json` persistence. Your normal preview uses port 3107 and `.data/demo.json`. Change `channel` in `playwright.config.ts` for another browser, or install Chromium with Playwright. E2E tests cover responsive navigation, creation/edit/persistence, rescheduling/conflicts/completion, activities, preferences and offline reading. The suite creates uniquely named demo training records; it never calls live integrations.

Implementation validation: 38 unit tests and all 4 browser stories passed; ESLint, strict TypeScript and the production build passed. No physical phone install or live Garmin/Google account was verified.

## Structure

```text
src/app/                  routes, protected training layout, manifest, auth and API handlers
src/components/           accessible UI, shell, SWR state, forms, charts, goal/import controls
src/features/             dashboard, calendar, activity history/detail, analytics, settings
src/lib/domain.ts         domain models and Zod inputs
src/lib/garmin/            official HTTP client and separate upstream normalization
src/lib/google-sheets/     Google auth/HTTP, row mapping, explicit legacy import mapping
src/lib/server/           access control, repository adapters, mutation/sync services
src/lib/calculations.ts   deterministic analytics and conservative matching
src/lib/dates.ts          metric formatting and Jakarta calendar arithmetic
tests/                    credential-free unit tests and essential browser stories
public/                   install icons, service worker and offline reader
```
