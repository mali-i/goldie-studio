import type { Decoration, Theme } from "./manifest";

export const PROJECT_SCHEMA_VERSION = 1 as const;
export const WORKSPACE_FRAME_VARIANTS = [
  "17-pro-classic",
  "17-pro-silver",
  "17-pro-blue",
  "17-pro-orange",
] as const;
export type WorkspaceFrameVariant = (typeof WORKSPACE_FRAME_VARIANTS)[number];

export type ProjectSummary = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectScene = {
  id: string;
  /** Uploaded files, keyed by device and then locale. Paths are relative to the config. */
  sources: Record<string, Record<string, string>>;
  headline: Record<string, string>;
  subhead?: Record<string, string>;
  background?: string;
  layout?: string;
  secondScene?: string;
  decorations?: Decoration[];
};

export type ProjectStoreListing = {
  name: string;
  subtitle: Record<string, string>;
  developer: string;
  category: string;
  rating: number;
  ratingCount: string;
  ageRating: string;
  price: string;
  description: Record<string, string>;
};

/** Upload-only Goldie project config. This is the canonical project state. */
export type GoldieProjectConfig = {
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  store: ProjectStoreListing;
  devices: string[];
  locales: string[];
  frame: { variant: WorkspaceFrameVariant };
  theme: Theme & {
    template?: string | string[];
    layout?: string;
    screenOnly?: boolean;
    decorations?: Decoration[];
  };
  scenes: ProjectScene[];
};

export type ProjectDetail = {
  project: ProjectSummary;
  config: GoldieProjectConfig;
};

export type UploadScreenshotInput = {
  device: string;
  locale: string;
  sceneId: string;
  headline?: string;
  subhead?: string;
  mimeType: string;
  base64: string;
};

export function defaultProjectConfig(name: string): GoldieProjectConfig {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    store: {
      name,
      subtitle: { "en-US": "A better way to get things done" },
      developer: "Your Company",
      category: "Productivity",
      rating: 4.8,
      ratingCount: "1.2K Ratings",
      ageRating: "4+",
      price: "Free",
      description: { "en-US": "Show people what makes your app worth downloading." },
    },
    devices: ["iphone-6.9"],
    locales: ["en-US"],
    frame: { variant: "17-pro-blue" },
    theme: {
      background: "linear-gradient(160deg, #E8F1FF 0%, #F7FAFF 55%, #FFFFFF 100%)",
      headlineColor: "#0E1B2A",
      subheadColor: "#5A6A7D",
      fontFamily: '-apple-system, "SF Pro Display", system-ui, sans-serif',
      copyHeightRatio: 0.24,
      deviceWidthRatio: 0.84,
      template: "showcase",
      layout: "classic",
      screenOnly: false,
    },
    scenes: [],
  };
}
