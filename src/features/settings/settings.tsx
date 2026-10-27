"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  ArrowRight,
  Check,
  Database,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Globe2,
  LockKeyhole,
  LogOut,
  Moon,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Sun,
  Wifi,
} from "lucide-react";
import { request, SNAPSHOT_KEY, useTraining } from "@/components/providers";
import { SheetsImport } from "@/components/sheets-import";
import { Button } from "@/components/ui/button";
import { ThemeToggle, useTheme } from "@/components/theme-toggle";
type Inventory = {
  title: string;
  tabs: { title: string; header: unknown[] }[];
};
type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
export function Settings() {
  const { data, refresh, notify, offline, sync, syncing } = useTraining();
  const [inventory, setInventory] = useState<Inventory>();
  const [inspecting, setInspecting] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [error, setError] = useState("");
  const light = useTheme() === "light";
  const [cache, setCache] = useState(
    () =>
      typeof localStorage === "undefined" ||
      localStorage.getItem("pe.offline.enabled") !== "false",
  );
  const [prompt, setPrompt] = useState<InstallPrompt>();
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);
  if (!data) return null;
  async function inspect() {
    setInspecting(true);
    setError("");
    try {
      setInventory(await request<Inventory>("/api/sheets"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setInspecting(false);
    }
  }
  async function initialize() {
    setInitializing(true);
    setError("");
    try {
      await request("/api/sheets", {});
      await refresh();
      notify(
        "Dedicated PE worksheets are ready. Existing tracker tabs were preserved.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setInitializing(false);
    }
  }
  async function connectPlan() {
    setInitializing(true);
    setError("");
    try {
      await request("/api/sheets/training-plan", {});
      await refresh();
      notify(
        "Training Plan is live. Weekly sheet updates will appear automatically.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setInitializing(false);
    }
  }
  function cacheToggle() {
    const next = !cache;
    setCache(next);
    localStorage.setItem("pe.offline.enabled", String(next));
    if (!next) localStorage.removeItem(SNAPSHOT_KEY);
    else
      localStorage.setItem(
        SNAPSHOT_KEY,
        JSON.stringify({ savedAt: new Date().toISOString(), data }),
      );
  }
  async function logout() {
    try {
      await request("/api/auth", {}, "DELETE");
      localStorage.removeItem(SNAPSHOT_KEY);
      sessionStorage.clear();
      location.assign(new URL("/login", location.origin).href);
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR SPACE, YOUR WAY</div>
          <h1>
            A little fine-tuning<span className="accent">.</span>
          </h1>
          <p>Connect your training, make yourself at home.</p>
        </div>
        <span className="count-pill">
          <ShieldCheck size={14} />
          Single-user workspace
        </span>
      </div>
      {!data.configured.sheets ? (
        <div className="panel info-note">
          <ShieldCheck size={18} />
          <p>
            <strong>Your Google Sheet isn’t connected yet.</strong> Start with
            Connect Google below to use your own training. You’re currently
            viewing sample data.
          </p>
        </div>
      ) : null}
      <div className="settings-grid">
        <section
          className="panel padded sheets-connection"
          aria-label="Google Sheets connection"
        >
          <span className="eyebrow">YOUR TRAINING SOURCE OF TRUTH</span>
          <div className="connection-head">
            <span className="connection-icon sheets-icon">
              <FileSpreadsheet size={24} />
            </span>
            <div>
              <h2>Google Sheets</h2>
              <p>Plans, feedback, goals & activity links</p>
            </div>
            <span
              className={`connection-status ${data.configured.sheets ? "ready" : ""}`}
            >
              <i />
              {data.configured.sheets
                ? data.configured.initialized
                  ? "Connected"
                  : "Finish setup"
                : "Not connected"}
            </span>
          </div>
          {!data.configured.sheets ? (
            <div className="google-connect-prompt">
              <h3>Start with your Google account</h3>
              <p>
                Connect the account that can edit your training sheet. We’ll
                guide you through approving access and finishing the private
                setup.
              </p>
              <Button asChild className="google-connect-button">
                <Link href="/settings/google">
                  Connect Google <ArrowRight size={18} />
                </Link>
              </Button>
              <span className="google-connect-caption">
                <ShieldCheck size={14} /> Your existing spreadsheet stays
                intact.
              </span>
            </div>
          ) : (
            <>
              <p className="helper">
                {data.configured.planSource === "training-plan"
                  ? "Your calendar reads the Training Plan tab directly. Weekly additions and sheet edits appear automatically; web edits save back to the same rows."
                  : "Review your spreadsheet and connect the Training Plan tab so weekly updates appear automatically."}
              </p>
              <div className="settings-detail">
                <span>Calendar source</span>
                <strong>
                  {data.configured.planSource === "training-plan"
                    ? "Training Plan · live"
                    : "PE worksheets"}
                </strong>
              </div>
              <div className="settings-detail">
                <span>Refresh interval</span>
                <strong>45 seconds while active</strong>
              </div>
              <div className="settings-detail">
                <span>External changes</span>
                <strong>Refresh on focus & reconnect</strong>
              </div>
              <div className="connection-actions">
                {data.configured.initialized &&
                data.configured.planSource !== "training-plan" ? (
                  <Button
                    onClick={() => void connectPlan()}
                    disabled={offline || initializing || data.mode === "demo"}
                  >
                    {initializing
                      ? "Connecting…"
                      : "Connect live Training Plan"}
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  onClick={() => void inspect()}
                  disabled={offline || inspecting || data.mode === "demo"}
                >
                  {inspecting ? "Inspecting…" : "Inspect spreadsheet"}
                </Button>
                {inventory && !data.configured.initialized ? (
                  <Button
                    onClick={() => void initialize()}
                    disabled={initializing || offline}
                  >
                    {initializing ? "Creating…" : "Create PE worksheets"}
                  </Button>
                ) : null}
                <Button asChild variant="outline">
                  <Link href="/settings/google">
                    Google connection settings <ArrowRight size={15} />
                  </Link>
                </Button>
              </div>
            </>
          )}
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          {inventory ? (
            <div className="sheet-inventory">
              <strong>{inventory.title}</strong>
              {inventory.tabs.map((t) => (
                <div key={t.title}>
                  <FileSpreadsheet size={14} />
                  <span>
                    {t.title}
                    <small>
                      {t.header.length
                        ? t.header.map(String).join(" · ")
                        : "Empty worksheet"}
                    </small>
                  </span>
                  <Check size={13} />
                </div>
              ))}
              <p className="helper">
                {data.configured.planSource === "training-plan"
                  ? "Training Plan is connected. Keep PE_ID and PE_Metadata columns when your weekly schedule updates the sheet."
                  : "Connect Training Plan for weekly updates, or import another tracker once using the mapping below."}
              </p>
              {data.configured.initialized &&
              data.configured.planSource !== "training-plan" ? (
                <SheetsImport tabs={inventory.tabs} />
              ) : null}
            </div>
          ) : null}
        </section>
        <section className="panel padded">
          <span className="eyebrow">CONNECTED TRAINING</span>
          <div className="connection-head">
            <span className="connection-icon">
              <Globe2 size={24} />
            </span>
            <div>
              <h2>Garmin Connect</h2>
              <p>Official Personal API</p>
            </div>
            <span
              className={`connection-status ${data.configured.garmin ? "ready" : ""}`}
            >
              <i />
              {data.mode === "demo"
                ? "Demo mode"
                : data.configured.garmin
                  ? "Key configured"
                  : "Not configured"}
            </span>
          </div>
          <p className="helper">
            Your activities come directly from Garmin Connect. Recorded metrics
            stay read-only; your API key stays on the server.
          </p>
          <div className="settings-detail">
            <span>Last successful sync</span>
            <strong>
              {data.sync.lastSuccess
                ? new Intl.DateTimeFormat("en-GB", {
                    timeZone: "Asia/Jakarta",
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(data.sync.lastSuccess))
                : "Not synced yet"}
            </strong>
          </div>
          <div className="settings-detail">
            <span>Automatic checks</span>
            <strong>Every 10 minutes while active</strong>
          </div>
          {data.sync.error ? (
            <p className="form-error" role="alert">
              {data.sync.error}
            </p>
          ) : null}
          <div className="connection-actions">
            <Button
              variant="outline"
              disabled={offline || syncing}
              onClick={() => void sync()}
            >
              <RefreshCw size={15} className={syncing ? "spin" : ""} />
              Sync now
            </Button>
            <a
              href="https://developer.garmin.com/gc-developer-program/personal/personal-faq/"
              target="_blank"
              rel="noreferrer"
            >
              API guide <ExternalLink size={13} />
            </a>
          </div>
        </section>
        <section className="panel padded">
          <span className="eyebrow">MAKE IT FEEL LIKE YOU</span>
          <h2>App preferences</h2>
          <div className="preference-row">
            <span className="preference-icon">
              {light ? <Sun size={18} /> : <Moon size={18} />}
            </span>
            <div>
              <strong>Appearance</strong>
              <p>{light ? "Light" : "Dark"} mode</p>
            </div>
            <ThemeToggle />
          </div>
          <div className="preference-row">
            <span className="preference-icon">
              <Globe2 size={18} />
            </span>
            <div>
              <strong>Timezone & units</strong>
              <p>Asia/Jakarta (WIB) · kilometres · min/km</p>
            </div>
            <span className="muted">Metric</span>
          </div>
          <div className="preference-row">
            <span className="preference-icon">
              <Wifi size={18} />
            </span>
            <div>
              <strong>Offline reading</strong>
              <p>
                Keep a training snapshot in this browser. Use a trusted device.
              </p>
            </div>
            <button
              className={`toggle ${cache ? "on" : ""}`}
              role="switch"
              aria-checked={cache}
              aria-label="Offline reading"
              onClick={cacheToggle}
            >
              <span />
            </button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              localStorage.removeItem(SNAPSHOT_KEY);
              notify("Saved browser snapshot cleared");
            }}
          >
            Clear saved browser data
          </Button>
        </section>
        <section className="panel padded install-panel">
          <span className="eyebrow">TAKE YOUR TRAINING WITH YOU</span>
          <div className="install-art">
            <Smartphone size={46} strokeWidth={1} />
            <span className="brand-icon">
              <FootprintLogo />
            </span>
          </div>
          <h2>A home on your home screen</h2>
          <p className="helper">
            Install Personal Endurance for quick access, a focused standalone
            view, and previously viewed training when offline.
          </p>
          {prompt ? (
            <Button
              onClick={async () => {
                await prompt.prompt();
                await prompt.userChoice;
                setPrompt(undefined);
              }}
            >
              <Download size={16} />
              Install app
            </Button>
          ) : (
            <div className="install-instructions">
              <p>
                <strong>iPhone / iPad</strong> Safari → Share → Add to Home
                Screen.
              </p>
              <p>
                <strong>Android / desktop</strong> Browser menu → Install app or
                Add to Home Screen.
              </p>
              <p>
                Installation needs HTTPS (or localhost) and a supported browser.
              </p>
            </div>
          )}
        </section>
        <section className="panel padded config-panel">
          <span className="eyebrow">
            <LockKeyhole size={14} /> SERVER CONFIGURATION
          </span>
          <h2>
            {data.mode === "demo"
              ? "From sample miles to your miles"
              : "A private place for your progress"}
          </h2>
          <p className="helper">
            Set these values in Vercel for Production, then redeploy. For local
            development, use <code>.env.local</code> and restart the server.
            Keep credentials out of chat, browser storage and Git.
          </p>
          <div className="config-list">
            {[
              "GOOGLE_AUTH_MODE=oauth",
              "GARMIN_PERSONAL_API_KEY",
              "GOOGLE_SHEETS_SPREADSHEET_ID",
              "GOOGLE_CLIENT_ID",
              "GOOGLE_CLIENT_SECRET",
              "GOOGLE_REFRESH_TOKEN",
              "GOOGLE_SHEETS_WRITES_ENABLED=true",
              "APP_PASSWORD",
              "SESSION_SECRET",
              "APP_ORIGIN",
            ].map((s) => (
              <code key={s}>{s}</code>
            ))}
          </div>
          <p className="helper">
            Connect the Google account that can edit your spreadsheet. A
            password of at least 16 characters and a session secret of at least
            32 are required in live mode and production. See README.md for
            setup, column mapping, tests and deployment.
          </p>
          <div className="security-note">
            <Database size={17} />
            <span>
              Google Sheets stores live training. Local demo changes use an
              isolated file. No AI API or paid AI service is used.
            </span>
          </div>
          <Button variant="outline" onClick={() => void logout()}>
            <LogOut size={15} />
            Sign out & clear browser snapshot
          </Button>
        </section>
      </div>
      <div className="info-note">
        <ShieldCheck size={18} />
        <p>
          Sync runs while the app is active. Closed-app background execution is
          browser-dependent. For unattended Garmin sync, configure an
          authenticated backend scheduler.
        </p>
        <ArrowUpRight size={16} />
      </div>
    </>
  );
}
function FootprintLogo() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 18 9 7l4 7 3-5 5 9H3Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
