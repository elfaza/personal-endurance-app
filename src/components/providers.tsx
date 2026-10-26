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
export async function request<T>(
  url: string,
  body?: unknown,
  method = "POST",
  operationId?: string,
): Promise<T> {
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
    throw new Error(json.error ?? "Request failed.");
  }
  return json;
}
type Context = {
  data: AppData | undefined;
  error: Error | undefined;
  loading: boolean;
  offline: boolean;
  syncing: boolean;
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
    (url) => request<AppData>(url),
    {
      refreshInterval: 45000,
      refreshWhenHidden: false,
      refreshWhenOffline: false,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      errorRetryCount: 2,
    },
  );
  const sync = useCallback(async () => {
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
    try {
      const theme = localStorage.getItem("pe.theme");
      if (theme === "light") document.documentElement.dataset.theme = "light";
    } catch {
      /* Private browser storage can be unavailable. */
    }
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
      if (data?.configured.readOnly)
        throw new Error(
          "Editing is disabled. Complete Google Sheets setup and enable writes in the server configuration.",
        );
      if (!navigator.onLine)
        throw new Error(
          "Offline reading is available. Reconnect before editing.",
        );
      const operationId = crypto.randomUUID();
      await mutate(
        async () => {
          await request("/api/training", body, "POST", operationId);
          return await request<AppData>("/api/data");
        },
        {
          optimisticData: optimistic && data ? optimistic(data) : undefined,
          rollbackOnError: true,
          revalidate: true,
          populateCache: true,
        },
      );
    },
    [mutate, data],
  );
  return (
    <DataContext.Provider
      value={{
        data,
        error,
        loading: isLoading,
        offline,
        syncing,
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
  const { data, offline } = useTraining();
  return offline || !!data?.configured.readOnly;
}
