"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const saved = (localStorage.getItem("campusfleet_theme") || localStorage.getItem("campusride_theme") || localStorage.getItem("bussync_theme")) as Theme | null;
    if (saved && (saved === "light" || saved === "dark" || saved === "system")) {
      setThemeState(saved);
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const applyTheme = () => {
      let isDark = false;
      if (theme === "system") {
        isDark = mediaQuery.matches;
      } else {
        isDark = theme === "dark";
      }

      setResolvedTheme(isDark ? "dark" : "light");
      root.style.colorScheme = isDark ? "dark" : "light";
      if (isDark) {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }

      // Dynamically update mobile browser chrome bar (Android address bar & iOS status bar)
      try {
        const metaThemes = document.querySelectorAll('meta[name="theme-color"]');
        if (metaThemes.length > 0) {
          metaThemes.forEach((meta, idx) => {
            if (idx === 0) {
              meta.setAttribute("content", isDark ? "#000000" : "#ffffff");
              meta.removeAttribute("media");
            } else {
              meta.remove();
            }
          });
        } else {
          const metaTheme = document.createElement("meta");
          metaTheme.setAttribute("name", "theme-color");
          metaTheme.setAttribute("content", isDark ? "#000000" : "#ffffff");
          document.head.appendChild(metaTheme);
        }

        let appleMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
        if (!appleMeta) {
          appleMeta = document.createElement("meta");
          appleMeta.setAttribute("name", "apple-mobile-web-app-status-bar-style");
          document.head.appendChild(appleMeta);
        }
        appleMeta.setAttribute("content", isDark ? "black-translucent" : "default");
      } catch (e) {
        // Ignore in non-browser env
      }
    };

    applyTheme();

    const listener = () => {
      if (theme === "system") {
        applyTheme();
      }
    };

    mediaQuery.addEventListener("change", listener);
    return () => mediaQuery.removeEventListener("change", listener);
  }, [theme]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem("campusfleet_theme", newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
