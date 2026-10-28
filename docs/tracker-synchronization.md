# Tracker synchronization

Google Sheets owns planned workouts, manually entered results, journals and race goals. Garmin owns recorded device measurements. Source-only results appear as **Google Sheets · manual result**, with no invented start time or Garmin download.

## Native tabs

- **Training Plan** remains the calendar source. Original A:N values and formatting are retained. PE_ID and PE_Metadata preserve identity/history. PE_Sport, PE_Optional and PE_Status are calculated columns used by native Dashboard formulas. Weekly writers must preserve every PE column and its formulas and append/update only intended source cells.
- **Workout Log** mirrors synchronized activities by PE_Activity_ID, not by date alone. Existing rows are matched only by unique date, sport, distance and duration. PE_Source_Metadata retains the original row values when a legacy row is reconciled; an elevation correction also leaves a cell note explaining both values. Existing notes, HR drift, formulas, formats and validation are retained. PE_Active and PE_Sport support weekly Dashboard totals. A superseded manual result remains in history and is excluded from active totals.

  Journal RPE, scope, recovery fields and journal notes are mirrored into separate labeled columns; the original Notes column is retained. Edit these ratings through the app Journal or the Training Plan RPE cell, so distinct activity ratings retain their scope and revision history.

- **HM Roadmap 2027** supplies race goals with known months. PE_Goal_ID and PE_Goal_Metadata preserve stable identities, exact dates when known, target time and priority. January's conditional goal and the March backup remain distinct. Unknown race dates/months are not invented. Changes from either the web or the native race row are reflected on the next refresh.
- **Dashboard** uses the current Monday–Sunday in Asia/Jakarta. Its formulas use the same normalized status/optional/sport definitions as the web, and recorded running results from Workout Log. The week bounds can be inspected in B10:B11. Consistency is completed required sessions divided by all required scheduled sessions; rest and rescheduled history are excluded.

## Journals and effort

The Journal selector supports a whole training session and each linked activity. An activity journal takes precedence over the shared session journal, including an explicitly unrecorded activity rating. A shared RPE is multiplied by each linked activity's recorded duration once. Mixed-sport ratings imported for a specific run are attached to that run; they are not assumed to apply to a family ride.

An externally entered Training Plan RPE is exposed even if no PE_Feedback row exists yet. Its first web save starts a valid journal revision chain. Session journal RPE edits mirror the native RPE cell; individual activity ratings stay in PE_Feedback so two different ratings cannot overwrite one source cell.

## Save guarantees

All tracker updates join the existing atomic save and exact PE_Write_Lock worksheet fence. The source grids and PE revisions are checked under the shared lock, then checked again immediately before submission. Stale edits fail without overwriting newer data. There is no automatic retry of uncertain writes and no age-based lock stealing. Goal sidecar revision chains keep their real stored parent even though the visible source revision comes from the roadmap row.

External writers must also honor PE_Write_Lock to eliminate their race with app saves; Sheets provides no atomic compare-and-swap for arbitrary uncoordinated edits. The app still checks for external changes before submitting. Closed-app/background synchronization is not implied by polling while the app is active.

The authenticated **Reconcile tracker tabs** action initializes the adapters once, fills missing log rows, and restores only unambiguous historical links supported by actual results. Normal app saves and Garmin synchronization maintain the connected tabs. Initialization is not replayed over later user changes.

## Verification

Regression coverage includes return-ride filtering, linked labels, activity-level journal overrides, both rides in training load, manual-result labeling/deduplication, optional skips, historical-link ambiguity, source-only RPE first saves, roadmap goal editing/revisions, stale external changes and idempotent log updates. Native calculated-column formulas are additionally checked in a disposable Google worksheet before the production repair.
