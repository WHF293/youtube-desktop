import { create } from "zustand";
import { ytApi } from "../lib/youtube";
import { errorMessage, type Status } from "./videos";
import type { SubscriptionItem } from "../types/youtube";

interface SubsState {
  items: SubscriptionItem[];
  status: Status;
  error: string;
  load: () => Promise<void>;
}

export const useSubs = create<SubsState>()((set) => ({
  items: [],
  status: "idle",
  error: "",
  load: async () => {
    set({ status: "loading", error: "" });
    try {
      const items = await ytApi.mySubscriptions(50);
      set({ items, status: "ready" });
    } catch (e) {
      set({ status: "error", error: errorMessage(e) });
    }
  },
}));
