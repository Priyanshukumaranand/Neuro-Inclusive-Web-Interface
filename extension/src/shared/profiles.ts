import type { PageSettings } from "./messages.js";

export type ProfileId = "none" | "adhd" | "dyslexia" | "autism";

export type ProfileMeta = {
  id: ProfileId;
  label: string;
  description: string;
};

export const PROFILE_LIST: ProfileMeta[] = [
  { id: "none", label: "Default", description: "No preset" },
  {
    id: "adhd",
    label: "ADHD",
    description: "Minimal UI cues, focus highlights, distraction reduction on",
  },
  {
    id: "dyslexia",
    label: "Dyslexia",
    description: "Dyslexia-friendly font, spacing, sepia tint",
  },
  {
    id: "autism",
    label: "Autism",
    description: "Low sensory: muted palette, reduced motion emphasis",
  },
];

/** Maps profile → partial page settings merged into store defaults */
export function profileToSettings(id: ProfileId): Partial<PageSettings> {
  switch (id) {
    case "adhd":
      return {
        theme: "dark",
        distractionReduction: true,
        focusMode: true,
        readabilityMode: true,
        fontSizePx: 18,
        lineHeight: 1.65,
        letterSpacingEm: 0.02,
        bionicReading: true,
        readingRuler: false,
      };
    case "dyslexia":
      return {
        theme: "dyslexia",
        distractionReduction: true,
        readabilityMode: true,
        fontSizePx: 20,
        lineHeight: 1.75,
        letterSpacingEm: 0.06,
        bionicReading: false,
        readingRuler: true,
      };
    case "autism":
      return {
        theme: "autism",
        distractionReduction: true,
        focusMode: false,
        readabilityMode: true,
        fontSizePx: 17,
        lineHeight: 1.55,
        letterSpacingEm: 0.03,
        bionicReading: false,
        readingRuler: false,
      };
    default:
      return {};
  }
}
