"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import useSWR from "swr";
import { Check, CircleAlert, X } from "lucide-react";
import type { AppData } from "@/lib/domain";

export const SNAPSHOT_KEY = "pe.offline.v1";
let cooldownUntil = 0;
export class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function request<T>(
  url: string,
  body?: unknown,
  method = "POST",
  operationId?: string,
): Promise<T> {
  if (url !== "/api/auth" && Date.now() < cooldownUntil)
    throw new RequestError(
      `Please wait ${Math.ceil((cooldownUntil - Date.now()) / 1000)} seconds before continuing. No save was sent.`,
      429,
    );
  const res = await fetch(url, {
    method: body === undefined && method === "POST" ? "GET" : method,
    cache: "no-store",
    headers:
      body === undefined
        ? {}
        : {
            "Content-Type": "application/json",
            "Idempotency-Key": operationId ?? crypto.randomUUID(),
          },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) {
    if (res.status === 401 && url !== "/api/auth") {
      localStorage.removeItem(SNAPSHOT_KEY);
      location.assign(new URL("/login", location.origin).href);
    }
    if (res.status === 429 && url !== "/api/auth") {
      const seconds = Number(res.headers.get("Retry-After"));
      cooldownUntil =
        Date.now() +
        (Number.isFinite(seconds) && seconds > 0
          ? Math.min(seconds, 300)
          : 60) *
          1000;
    }
    throw new RequestError(json.error ?? "Request failed.", res.status);
  }
  return json;
}
type Context = {
  data: AppData | undefined;
  error: Error | undefined;
  loading: boolean;
  offline: boolean;
  syncing: boolean;
  editingPaused: boolean;
  refreshRequired: boolean;
  refresh: () => Promise<unknown>;
  sync: () => Promise<void>;
  save: (
    body: unknown,
    optimistic?: (data: AppData) => AppData,
  ) => Promise<void>;
  notify: (message: string, error?: boolean) => void;
};
const DataContext = createContext<Context | null>(null);
export function Providers({ children }: { children: ReactNode }) {
  const [offline, setOffline] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const savingRef = useRef(false);
  const loadData = useCallback(async (url: string) => {
    const result = await request<AppData>(url);
    setNeedsRefresh(false);
    return result;
  }, []);
  const [toast, setToast] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  const notify = useCallback(
    (message: string, error = false) => setToast({ message, error }),
    [],
  );
  const { data, error, isLoading, mutate } = useSWR<AppData, Error>(
    "/api/data",
    loadData,
    {
      refreshInterval: saving ? 0 : 45000,
      refreshWhenHidden: false,
      refreshWhenOffline: false,
      revalidateOnFocus: !saving,
      revalidateOnReconnect: !saving,
      shouldRetryOnError: (error) =>
        !(error instanceof RequestError && error.status === 429),
      errorRetryCount: 2,
    },
  );
  const sync = useCallback(async () => {
    if (savingRef.current) return;
    if (!navigator.onLine) {
      notify("You’re offline. Reconnect before syncing.", true);
      return;
    }
    setSyncing(true);
    try {
      const result = await request<{
        demo?: boolean;
        count?: number;
        message?: string;
      }>("/api/sync", {});
      await mutate();
      notify(
        result.message ??
          `Garmin sync complete · ${result.count ?? 0} activities checked`,
      );
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setSyncing(false);
    }
  }, [mutate, notify]);
  const autoAttempt = useRef(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    try {
      if (data && localStorage.getItem("pe.offline.enabled") !== "false")
        localStorage.setItem(
          SNAPSHOT_KEY,
          JSON.stringify({ savedAt: new Date().toISOString(), data }),
        );
    } catch {
      /* Keep live training usable when browser storage is full or blocked. */
    }
  }, [data]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6500);
    return () => clearTimeout(t);
  }, [toast]);
  const autoSyncEnabled =
    data?.mode === "live" &&
    data.configured.garmin &&
    data.configured.initialized &&
    !data.configured.readOnly;
  const lastSuccess = data?.sync.lastSuccess;
  useEffect(() => {
    if (!autoSyncEnabled || offline) return;
    const initial = setTimeout(() => {
      if (!autoAttempt.current) {
        autoAttempt.current = true;
        if (!lastSuccess || Date.now() - Date.parse(lastSuccess) > 600000)
          void sync();
      }
    }, 0);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine)
        void sync();
    }, 600000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [autoSyncEnabled, lastSuccess, sync, offline]);
  const save = useCallback(
    async (body: unknown, optimistic?: (data: AppData) => AppData) => {
      if (savingRef.current)
        throw new Error("A save is still running. Wait for it to finish.");
      if (needsRefresh)
        throw new Error(
          "Your last save succeeded, but the summary needs refreshing before another edit.",
        );
      if (data?.configured.readOnly)
        throw new Error(
          "Editing is disabled. Complete Google Sheets setup and enable writes in the server configuration.",
        );
      if (!navigator.onLine)
        throw new Error(
          "Offline reading is available. Reconnect before editing.",
        );
      const operationId = crypto.randomUUID();
      savingRef.current = true;
      setSaving(true);
      try {
        await mutate(
          async () => {
            await request("/api/training", body, "POST", operationId);
            try {
              return await loadData("/api/data");
            } catch {
              // The write is confirmed. A failed summary read must not invite a duplicate save.
              setNeedsRefresh(true);
              notify(
                "Saved successfully, but the summary could not refresh. Refresh before editing again.",
                true,
              );
              return optimistic && data ? optimistic(data) : data;
            }
          },
          {
            optimisticData: optimistic && data ? optimistic(data) : undefined,
            rollbackOnError: true,
            // The mutation already fetched the authoritative summary once.
            revalidate: false,
            populateCache: true,
          },
        );
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [mutate, data, needsRefresh, notify, loadData],
  );
  return (
    <DataContext.Provider
      value={{
        data,
        error,
        loading: isLoading,
        offline,
        syncing,
        editingPaused: saving || needsRefresh,
        refreshRequired: needsRefresh,
        sync,
        save,
        refresh: () => mutate(),
        notify,
      }}
    >
      {children}
      {toast ? (
        <div
          className={`toast ${toast.error ? "toast-error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? <CircleAlert size={18} /> : <Check size={18} />}
          <span>{toast.message}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <X size={16} />
          </button>
        </div>
      ) : null}
    </DataContext.Provider>
  );
}
export function useTraining() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("Missing training provider");
  return ctx;
}
export function useEditingDisabled() {
  const { data, offline, editingPaused } = useTraining();
  return offline || editingPaused || !!data?.configured.readOnly;
}
