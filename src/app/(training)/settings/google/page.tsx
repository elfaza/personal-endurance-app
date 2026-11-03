import { authRequired, signedIn } from "@/lib/server/auth";
import { redirect } from "next/navigation";
import {
  appOrigin,
  googleCallbackUrl,
  oauthConfigured,
} from "@/lib/google-sheets/oauth";
import {
  readRefreshToken,
  tokenStoreConfigured,
} from "@/lib/google-sheets/token-store";
import { GoogleVerification } from "@/components/google-verification";
import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
export const dynamic = "force-dynamic";
export default async function GoogleSetup() {
  if (!authRequired() || !(await signedIn())) redirect("/login");
  let callback = "Set APP_ORIGIN in Vercel first.";
  let origin = "";
  try {
    callback = googleCallbackUrl();
    origin = appOrigin();
  } catch {
    /* Show configuration instructions without credential values. */
  }
  let ready = false;
  let storageError = "";
  try {
    ready = !!(await readRefreshToken());
  } catch {
    storageError =
      "Connection storage is temporarily unavailable. Try again later.";
  }
  const canConnect =
    process.env.GOOGLE_AUTH_MODE === "oauth" &&
    oauthConfigured() &&
    !!origin &&
    tokenStoreConfigured() &&
    process.env.VERCEL_BLOB_RETRIES === "0";
  return (
    <div className="panel padded google-setup-page">
      <span className="eyebrow">GOOGLE SHEETS CONNECTION</span>
      <h1>
        {ready ? "Your Google connection" : "Let’s connect your training"}
      </h1>
      <p className="helper">
        {ready
          ? "A Google connection is saved on the server. If access has expired, reconnect below."
          : "Choose the Google account that can edit your training sheet. We’ll take you to Google to approve access."}
      </p>
      {storageError ? (
        <p className="form-error" role="alert">
          {storageError}
        </p>
      ) : null}
      {
        <>
          <ol className="google-setup-steps" aria-label="Connection steps">
            <li>Choose your account</li>
            <li>Approve access</li>
            <li>Continue training</li>
          </ol>
          <form action="/api/google" method="post">
            <button
              className="btn btn-primary google-connect-button"
              disabled={!canConnect}
              type="submit"
            >
              {ready ? "Reconnect Google" : "Connect Google"}{" "}
              <ArrowRight size={18} />
            </button>
          </form>
          {canConnect ? (
            <p className="helper">
              Your connection is saved automatically and encrypted on the
              server. No token copying or redeployment is needed.
            </p>
          ) : (
            <p className="form-error" role="status">
              Your Google client and private storage need configuration before
              you can connect. Follow the setup details below, then redeploy.
            </p>
          )}
          <span className="google-connect-caption">
            <ShieldCheck size={14} /> Your existing tabs, formulas and
            formatting stay intact.
          </span>
        </>
      }
      {ready ? <GoogleVerification /> : null}
      <p className="helper">
        Google apps in Testing expire access after seven days. When that
        happens, use Reconnect Google here.
      </p>
      <details open={!canConnect}>
        <summary>Google Cloud & Vercel setup details</summary>
        <p>
          <strong>Exact OAuth redirect URI</strong>
          <br />
          <code>{callback}</code>
        </p>
        <ol>
          <li>In Google Cloud, enable Google Sheets API for your project.</li>
          <li>
            Configure Google Auth Platform branding and audience. If the app is
            External and Testing, add your Google email under Audience → Test
            users.
          </li>
          <li>
            Create an OAuth client of type Web application. Register the
            redirect URI above exactly.
          </li>
          <li>
            In{" "}
            <a
              href="https://vercel.com/elfazas-projects/personal-endurance-app/settings/environment-variables"
              target="_blank"
              rel="noreferrer"
            >
              Vercel environment variables
            </a>
            , save GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET for Production,
            then redeploy. Store the secret as Secret / Sensitive. Keep all
            values out of chat.
          </li>
          <li>
            Connect a private Vercel Blob store to this project. Its server-only
            storage credentials are configured once. Connect Google above;
            subsequent connections are saved automatically without redeployment.
          </li>
        </ol>
        <div className="settings-detail">
          <span>OAuth client</span>
          <strong>
            {canConnect ? "Configured" : "Needs configuration and redeploy"}
          </strong>
        </div>
        <div className="settings-detail">
          <span>Saved Google connection</span>
          <strong>{ready ? "Configured on server" : "Not configured"}</strong>
        </div>
        <p className="helper">
          Google apps in Testing issue Sheets refresh tokens that expire after
          seven days. For ongoing personal use, switch the consent app to In
          production when appropriate, then reconnect. Google may show an
          unverified-app notice for your own app.
        </p>
        <p className="helper">
          Verification writes a marker only to a new disposable hidden
          worksheet, reads it back, then deletes that worksheet. Existing tabs,
          cells, formulas and formatting are never targeted.
        </p>
      </details>
      <p>
        <Link href="/settings">Return to Settings</Link>
      </p>
    </div>
  );
}
