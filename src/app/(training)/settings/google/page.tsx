import { authRequired, signedIn } from "@/lib/server/auth";
import { redirect } from "next/navigation";
import {
  appOrigin,
  googleCallbackUrl,
  oauthConfigured,
  oauthReady,
} from "@/lib/google-sheets/oauth";
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
  const ready = oauthReady();
  const canConnect =
    process.env.GOOGLE_AUTH_MODE === "oauth" && oauthConfigured() && !!origin;
  return (
    <div className="panel padded google-setup-page">
      <span className="eyebrow">GOOGLE SHEETS CONNECTION</span>
      <h1>
        {ready ? "Your Google connection" : "Let’s connect your training"}
      </h1>
      <p className="helper">
        {ready
          ? "Your Google credentials are configured. Verify access to your sheet to finish setup."
          : "Choose the Google account that can edit your training sheet. We’ll take you to Google to approve access."}
      </p>
      {!ready ? (
        <>
          <ol className="google-setup-steps" aria-label="Connection steps">
            <li>Choose your account</li>
            <li>Approve access</li>
            <li>Finish private setup</li>
          </ol>
          <form action="/api/google" method="post">
            <button
              className="btn btn-primary google-connect-button"
              disabled={!canConnect}
              type="submit"
            >
              Connect Google <ArrowRight size={18} />
            </button>
          </form>
          {canConnect ? (
            <p className="helper">
              After approval, you’ll get a private copy button for the refresh
              token. Paste it directly into Vercel to complete the connection.
            </p>
          ) : (
            <p className="form-error" role="status">
              Your Google client needs configuration before you can connect.
              Follow the setup details below, then redeploy.
            </p>
          )}
          <span className="google-connect-caption">
            <ShieldCheck size={14} /> Your existing tabs, formulas and
            formatting stay intact.
          </span>
        </>
      ) : (
        <GoogleVerification />
      )}
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
            Connect Google below. Copy the refresh token from the private masked
            completion page directly into GOOGLE_REFRESH_TOKEN in Vercel, then
            redeploy again.
          </li>
        </ol>
        <div className="settings-detail">
          <span>OAuth client</span>
          <strong>
            {canConnect ? "Configured" : "Needs configuration and redeploy"}
          </strong>
        </div>
        <div className="settings-detail">
          <span>Refresh token</span>
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
      {ready ? (
        <form action="/api/google" method="post" style={{ marginTop: 24 }}>
          <button
            className="btn btn-outline"
            disabled={!canConnect}
            type="submit"
          >
            Reconnect Google
          </button>
        </form>
      ) : null}
      <p>
        <Link href="/settings">Return to Settings</Link>
      </p>
    </div>
  );
}
