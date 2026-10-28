# Personal profile, training outlook and food journal

## Research and decisions

Research checked 28 October 2026. This is a heuristic review, not user testing.

- [Nielsen Norman Group: usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/): make status visible, retain user control, prevent errors. Show source measurements, report dates, limitations and budget beside AI actions. Never generate paid reports on navigation.
- [Material: errors](https://m1.material.io/patterns/errors.html): keep entered values when saving fails and explain how to recover. Photo analysis fills an editable draft; it never creates a meal automatically. Manual entry works without AI.
- [OpenAI vision](https://developers.openai.com/api/docs/guides/images-vision): image interpretation has limitations. Use calorie ranges and editable portions, explicitly account for hidden oils/sauces, allow an unidentifiable result.
- [OpenAI Luna](https://developers.openai.com/api/docs/models/gpt-6-luna): supports text and image input. Fixed model and conservative server-side reservations limit spend; no automatic model upgrades or retries.

## Navigation and flows

Keep Overview, Calendar, Activities, Analytics and Settings. Add Food journal to the sidebar; on phones keep five bottom destinations (Home, Calendar, Activities, Food, Settings), with Analytics reachable from Home and the desktop sidebar. Keep existing light/charcoal tokens, 16px inputs, 44px actions, written states and keyboard labels.

1. Settings → Personal profile → birth date, height, goal, experience → save. Weight has its own dated entry and editable history; replacing a measurement on the same date preserves repository revision history. Personal data is optional for training analysis. No readiness/BMI score or inferred calorie target.
2. Overview → Training outlook → recorded seven-day comparison and session-RPE coverage → per-sport month outlook and goal evidence → optional Generate AI review. Reports include date, model, measurement references and limitations. Changed inputs mark saved reports as outdated. No race-time prediction, diagnosis or automatic schedule edits.
3. Food journal → choose date → Add meal → manual entry or photo → explicitly allow photo processing → Analyze photo → review components, grams, nutrition range and uncertainty → edit/remove/add components → Save confirmed meal. Cancel discards the draft. Totals describe logged food, never daily adequacy or Garmin net calories. Edit/delete uses conflict detection.
4. Settings and AI actions → monthly budget → used/reserved, remaining, 80% notice, reset date in Asia/Jakarta. Hard app ceiling Rp20,000 at the configured conservative USD conversion plus margin; it does not control other apps, provider price changes, taxes or card FX. Request maximum is persisted before contacting OpenAI. Uncertain outcomes retain their reservation, including across restarts and month boundaries. No auto top-up or automatic retry.

## Data and privacy

Use namespaced PE_Meta records through the existing append-only repository and shared Sheets lock. Preserve existing worksheets/formulas and existing training data. No schema migration or production write during development. Local demo uses the isolated existing demo file. AI calls require live, writable persistence and a server-only key; demo does not spend money.

Confirmed meals retain a compressed photo, as requested, without adding a paid storage service. Re-encode at at most 640px, strip metadata, and cap JPEG at 48 KB. Persist encoded chunks below the Sheets cell limit as namespaced PE_Meta records in the same atomic transaction as the meal. These are journal previews, not original-resolution backups. Serve through an authenticated photo route; cancelling uploads nothing. Soft deletion immediately hides the image; append-only history retains its encoded data. At 90 photos per month the maximum encoded growth is about 6 MB per month plus revision overhead, so this is a personal-scale compromise. Use provider store:false for analysis; this is not a zero-retention guarantee. Profile, meals, photos, weights, reports and receipts stay out of the browser offline training snapshot. The repository currently reads complete datasets, so this storage choice increases read payloads over time; an archive/migration may eventually be needed.

## Acceptance checks

- Manual profile/weight/meal CRUD persists without an AI key, with stale revisions rejected.
- Photo → editable draft → explicit save, including a failure that retains the draft.
- Invalid input, offline, missing key, demo, read-only and exhausted budget have explicit states.
- Concurrent requests cannot overspend; duplicate operation IDs cannot incur a second call; ambiguous failures stay reserved; reset uses Jakarta month and old reservations settle against their original month.
- Workload requires recorded duration and journal RPE; missing data remains missing. Sports stay separate for distance forecasts; future sessions and duplicated links do not inflate actuals.
- Desktop/mobile, both themes, keyboard interaction, validation, overflow, and deterministic computation tests.

## Implementation verification

The automated suite uses isolated demo persistence and mocked provider responses, never live Garmin/Google accounts or a paid AI call. It checks profile/weight persistence, photo retrieval after reload, portion scaling (including a cleared input), meal removal and photo access, draft preservation on a failed save, AI consent, desktop/mobile navigation and both themes. Server tests cover authenticated route guards, demo/missing-key/read-only behavior, cached reviews, operation deduplication, concurrent budget reservations, malformed results, unknown billing outcomes, wrong-model/above-bound protection and Jakarta month rollover. Production Google writes and real model quality remain unverified until private credentials are configured and a live validation is explicitly run.
