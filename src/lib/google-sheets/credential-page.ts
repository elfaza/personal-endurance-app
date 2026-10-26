import "server-only";
import { randomBytes } from "node:crypto";
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function credentialPage(token: string) {
  const nonce = randomBytes(24).toString("base64");
  return {
    nonce,
    html: `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Google connection · Personal Endurance</title></head><body><main><p class="eyebrow">PERSONAL ENDURANCE · PRIVATE SETUP</p><h1>Google approved access.</h1><p>Copy this credential directly into Vercel to keep your sheet connected across devices.</p><ol><li>Select <strong>Copy refresh token</strong>.</li><li>Open <a href="https://vercel.com/elfazas-projects/personal-endurance-app/settings/environment-variables" target="_blank" rel="noreferrer noopener">Vercel environment variables</a>.</li><li>Add <code>GOOGLE_REFRESH_TOKEN</code> for <strong>Production</strong> as a <strong>Secret / Sensitive</strong> value and paste it.</li><li>Save, then tell Codex it is saved so the app can be redeployed and verified.</li></ol><label>Private refresh token<input id="token" type="password" value="${escape(token)}" readonly autocomplete="off" spellcheck="false"></label><button id="copy">Copy refresh token</button><button id="clear">Clear this page</button><p id="status" role="status"></p><p class="note">Do not paste this token in chat or share its value. It exists only in this private page until you clear or leave it, or five minutes pass. This page does not write browser storage or your spreadsheet.</p><a href="/settings/google">Return to Google setup</a></main><style nonce="${nonce}">body{margin:0;background:#101713;color:#edf1e8;font:15px/1.7 system-ui}main{max-width:620px;margin:5vh auto;padding:24px}h1{line-height:1.2;font-size:32px;letter-spacing:-1px}p,li{color:#b5c1b7}.eyebrow{font-size:11px;letter-spacing:2px;color:#c9ed91}a{color:#c9ed91}li{margin:12px 0}label{display:block;margin-top:24px}input{box-sizing:border-box;width:100%;padding:14px;background:#1b261e;color:#fff;border:1px solid #425345;border-radius:8px;margin:8px 0}button{padding:12px 16px;margin:8px 8px 0 0;border:0;border-radius:8px;background:#c9ed91;color:#15200d;font:inherit;cursor:pointer}button:disabled{opacity:.4}.note{font-size:12px}code{overflow-wrap:anywhere}</style><script nonce="${nonce}">history.replaceState(null,'','/api/google/callback');const field=document.getElementById('token'),status=document.getElementById('status'),button=document.getElementById('copy');function clear(){field.value='';button.disabled=true;status.textContent='Credential cleared. Connect again if you still need it.';}document.getElementById('clear').onclick=clear;button.onclick=async()=>{try{await navigator.clipboard.writeText(field.value);status.textContent='Copied. Paste directly into Vercel.';}catch{field.focus();field.select();status.textContent='Copy unavailable. Copy the selected masked field manually.';}};addEventListener('pagehide',clear);setTimeout(clear,300000);</script></body></html>`,
  };
}
