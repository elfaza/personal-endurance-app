"use client";
import { useState } from "react";
import { request, useTraining } from "./providers";
import { Button } from "./ui/button";
type Preview = {
  sourceHash: string;
  total: number;
  existing: number;
  preview: { date: string; title: string; status: string; type: string }[];
};
export function SheetsImport({
  tabs,
}: {
  tabs: { title: string; header: unknown[] }[];
}) {
  const { refresh, notify, offline } = useTraining();
  const [tab, setTab] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<Preview>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const header = tabs.find((t) => t.title === tab)?.header.map(String) ?? [];
  async function run(commit = false) {
    setBusy(true);
    setError("");
    try {
      const body = {
        tab,
        mapping,
        preview: !commit,
        sourceHash: preview?.sourceHash,
      };
      if (commit) {
        const result = await request<{ count: number }>(
          "/api/sheets/import",
          body,
        );
        await refresh();
        notify(`${result.count} existing plans imported into PE worksheets`);
        setPreview(undefined);
      } else setPreview(await request<Preview>("/api/sheets/import", body));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="sheets-import">
      <h3>Bring in an existing plan</h3>
      <p className="helper">
        Map your existing columns, review the result, then import once. Source
        rows are retained. Future app and external edits use the PE worksheets.
        Re-importing skips existing IDs.
      </p>
      <label>
        Source worksheet
        <select
          value={tab}
          onChange={(e) => {
            setTab(e.target.value);
            setMapping({});
            setPreview(undefined);
          }}
        >
          <option value="">Choose a source tab</option>
          {tabs
            .filter((t) => !t.title.startsWith("PE_"))
            .map((t) => (
              <option key={t.title}>{t.title}</option>
            ))}
        </select>
      </label>
      {tab ? (
        <div className="form-grid">
          {[
            "id",
            "date",
            "type",
            "title",
            "time",
            "distanceKm",
            "durationMin",
            "status",
            "notes",
            "rpe",
          ].map((field) => (
            <label key={field}>
              {field}
              {["id", "date", "type", "title"].includes(field) ? " *" : ""}
              <select
                value={mapping[field] ?? ""}
                onChange={(e) => {
                  const next = { ...mapping };
                  if (e.target.value) next[field] = e.target.value;
                  else delete next[field];
                  setMapping(next);
                  setPreview(undefined);
                }}
              >
                <option value="">
                  {["id", "date", "type", "title"].includes(field)
                    ? "Select required column"
                    : "Not mapped"}
                </option>
                {header.map((h, i) => (
                  <option value={h} key={i}>
                    {h || "(empty header)"}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {tab ? (
        <Button
          variant="outline"
          disabled={busy || offline}
          onClick={() => void run()}
        >
          Preview import
        </Button>
      ) : null}
      {preview ? (
        <div className="import-preview">
          <p>
            {preview.preview.length} new plans · {preview.existing} existing IDs
            skipped
          </p>
          <ul>
            {preview.preview.slice(0, 10).map((w, i) => (
              <li key={i}>
                {w.date} · {w.title} · {w.type} · {w.status}
              </li>
            ))}
          </ul>
          {preview.preview.length > 10 ? (
            <p>…and {preview.preview.length - 10} more.</p>
          ) : null}
          <p className="helper">
            Importing confirms that source statuses reflect your own training
            records. Recorded Garmin activities are untouched.
          </p>
          <Button
            disabled={busy || offline || !preview.preview.length}
            onClick={() => void run(true)}
          >
            {busy ? "Importing…" : "Confirm & import plans"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
