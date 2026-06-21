import { useState, useEffect, useRef } from "react";

export type Theme = "dark" | "light";

function getSystemTheme(): Theme {
  return window.matchMedia?.("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getSystemTheme);
  const manualRef = useRef(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: light)");
    if (!mq) return;
    const handler = () => {
      if (!manualRef.current) setTheme(getSystemTheme());
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const toggle = () => {
    manualRef.current = true;
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  };

  return { theme, toggle };
}
