"use client";
import { useEffect, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "./ui/button";

function subscribe(listener: () => void) {
  const storedThemeChanged = (event: StorageEvent) => {
    if (event.key === "pe.theme" || event.key === null) {
      document.documentElement.dataset.theme =
        event.newValue === "dark" ? "dark" : "light";
      listener();
    }
  };
  window.addEventListener("pe:theme", listener);
  window.addEventListener("storage", storedThemeChanged);
  return () => {
    window.removeEventListener("pe:theme", listener);
    window.removeEventListener("storage", storedThemeChanged);
  };
}
function currentTheme(): "light" | "dark" {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}
export function useTheme() {
  return useSyncExternalStore(subscribe, currentTheme, () => "light" as const);
}
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const theme = useTheme();
  useEffect(() => {
    document
      .querySelectorAll('meta[name="theme-color"]')
      .forEach((meta) =>
        meta.setAttribute("content", theme === "dark" ? "#171d25" : "#f3f6f8"),
      );
  }, [theme]);
  const next = theme === "light" ? "dark" : "light";
  function toggle() {
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("pe.theme", next);
    } catch {
      /* Optional storage. */
    }
    window.dispatchEvent(new Event("pe:theme"));
  }
  return (
    <Button
      variant="outline"
      size="sm"
      className={compact ? "theme-toggle" : undefined}
      aria-label={compact ? `Use ${next} theme` : `Switch to ${next}`}
      onClick={toggle}
    >
      {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
      <span>
        {compact
          ? `${next === "dark" ? "Dark" : "Light"} mode`
          : `Switch to ${next}`}
      </span>
    </Button>
  );
}
