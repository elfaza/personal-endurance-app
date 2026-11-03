import "server-only";
import { randomBytes } from "node:crypto";

// No token, authorization code or provider error is rendered to the browser.
export function connectionPage() {
  const nonce = randomBytes(24).toString("base64");
  return {
    nonce,
    html: `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Google connected · Personal Endurance</title></head><body><main><p class="eyebrow">PERSONAL ENDURANCE</p><h1>Google is connected.</h1><p>Your connection was saved securely on the server. You can continue training now. No copying tokens or redeploying.</p><a class="button" href="/">Continue to training</a><p><a href="/settings/google">Connection settings</a></p><p class="note">While your Google app is in Testing, Google access expires after seven days. Just reconnect here when needed.</p></main><style nonce="${nonce}">body{margin:0;background:#f3f6fa;color:#182838;font:16px/1.7 system-ui}main{max-width:560px;margin:10vh auto;padding:28px}h1{font-size:32px;line-height:1.2}.eyebrow{font-size:12px;letter-spacing:2px;color:#38638a}a{color:#245e98}.button{display:inline-block;padding:12px 20px;background:#245e98;color:#fff;border-radius:10px;text-decoration:none;margin:16px 0}.note{font-size:14px;color:#536579}</style><script nonce="${nonce}">history.replaceState(null,'','/api/google/callback');</script></body></html>`,
  };
}
