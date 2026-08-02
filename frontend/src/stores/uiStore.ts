import { create } from "zustand";
import { persist } from "zustand/middleware";
import { applyTheme, resolveInitialTheme, setThemePreference } from "../utils/theme";

export type ThemeMode = "light" | "dark";

export interface UIState {
  sidebarOpen: boolean;
  theme: ThemeMode;
  toggleSidebar: () => void;
  setTheme: (theme: ThemeMode) => void;
}

const initialTheme = resolveInitialTheme();

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      theme: initialTheme,
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setTheme: (theme) => {
        applyTheme(theme);
        setThemePreference(theme);
        set({ theme });
      },
    }),
    {
      name: "ui-storage",
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<UIState>;
        const theme = p.theme ?? current.theme;
        applyTheme(theme);
        return {
          ...current,
          sidebarOpen: p.sidebarOpen ?? current.sidebarOpen,
          theme,
        };
      },
    },
  ),
);
