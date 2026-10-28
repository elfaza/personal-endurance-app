"use client";
import useSWR from "swr";
import { useEffect } from "react";
import { request, useTraining } from "../providers";
import type { WellnessData } from "@/lib/wellness";

export function useWellness() {
  const { data: training, offline } = useTraining();
  const swr = useSWR<WellnessData, Error>(
    "/api/wellness",
    (url: string) => request<WellnessData>(url),
    { errorRetryCount: 0, revalidateOnFocus: true, refreshInterval: 0 },
  );
  const trainingVersion = JSON.stringify([
    training?.sync.lastSuccess,
    training?.workouts.map((w) => w.revision),
    training?.feedback.map((f) => f.revision),
    training?.goals.map((g) => g.revision),
  ]);
  const mutate = swr.mutate;
  useEffect(() => {
    if (trainingVersion && !offline) void mutate();
  }, [trainingVersion, offline, mutate]);
  return {
    ...swr,
    offline,
    disabled:
      offline ||
      !!training?.configured.readOnly ||
      !training?.configured.initialized,
  };
}
