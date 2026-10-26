"use client";
import { useState } from "react";
import { request } from "./providers";
import { Button } from "./ui/button";
export function GoogleVerification() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <div>
      <Button
        variant="outline"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMessage("");
          try {
            await request("/api/sheets/verify", {});
            setMessage(
              "Verified reading and writing. The disposable test worksheet was removed; existing tabs were retained.",
            );
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Verifying…" : "Verify reading & writing"}
      </Button>
      <p role="status" className="helper">
        {message}
      </p>
    </div>
  );
}
