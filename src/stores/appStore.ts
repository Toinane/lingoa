import { create } from "zustand";
import type { AppView } from "../types";

interface AppState {
  view: AppView;
  setView: (view: AppView) => void;
}

export const useAppStore = create<AppState>((set) => ({
  view: "loading",
  setView: (view) => set({ view }),
}));
