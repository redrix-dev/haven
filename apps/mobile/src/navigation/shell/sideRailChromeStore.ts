import { create } from "zustand";

export type SideRailGlowSegment = "top" | "middle" | "bottom";
export type SideRailGlowPattern = "steady" | "pulse" | "breathe" | "scan";

type SideRailChromeState = {
  edgeGlowEnabled: boolean;
  edgeGlowColor: string;
  edgeGlowIntensity: number;
  edgeGlowPattern: SideRailGlowPattern;
  edgeGlowSegments: Record<SideRailGlowSegment, boolean>;
  setEdgeGlowEnabled: (enabled: boolean) => void;
  setEdgeGlowColor: (color: string) => void;
  setEdgeGlowIntensity: (intensity: number) => void;
  setEdgeGlowPattern: (pattern: SideRailGlowPattern) => void;
  toggleEdgeGlowSegment: (segment: SideRailGlowSegment) => void;
};

const clampIntensity = (value: number) => Math.max(0, Math.min(1, value));

export const useSideRailChromeStore = create<SideRailChromeState>((set) => ({
  edgeGlowEnabled: typeof __DEV__ !== "undefined" ? __DEV__ : false,
  edgeGlowColor: "#38bdf8",
  edgeGlowIntensity: 0.72,
  edgeGlowPattern: "breathe",
  edgeGlowSegments: {
    top: true,
    middle: true,
    bottom: true,
  },
  setEdgeGlowEnabled: (enabled) => set({ edgeGlowEnabled: enabled }),
  setEdgeGlowColor: (color) => set({ edgeGlowColor: color }),
  setEdgeGlowIntensity: (intensity) =>
    set({ edgeGlowIntensity: clampIntensity(intensity) }),
  setEdgeGlowPattern: (pattern) => set({ edgeGlowPattern: pattern }),
  toggleEdgeGlowSegment: (segment) =>
    set((state) => ({
      edgeGlowSegments: {
        ...state.edgeGlowSegments,
        [segment]: !state.edgeGlowSegments[segment],
      },
    })),
}));
