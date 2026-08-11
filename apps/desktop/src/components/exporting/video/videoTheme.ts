/**
 * Video export theme colors derived from packages/ui/src/tailwind.css.
 * Keep these in sync when design tokens change.
 */
export type VideoTheme = "light" | "dark";

export interface VideoThemeColors {
    // cspell:disable-next-line
    /** Letterbox / pillarbox background (bg-1) */
    bg1: string;
    overlayBg: string;
    overlayText: string;
    overlayTextMuted: string;
    brandingBg: string;
    brandingText: string;
    brandingLogoHex: string;
}

const VIDEO_THEME_COLORS: Record<VideoTheme, VideoThemeColors> = {
    light: {
        bg1: "rgb(236, 235, 240)",
        overlayBg: "rgba(236, 235, 240, 0.85)",
        overlayText: "rgba(32, 32, 32, 0.95)",
        overlayTextMuted: "rgba(32, 32, 32, 0.45)",
        brandingBg: "rgba(236, 235, 240, 0.75)",
        brandingText: "rgba(32, 32, 32, 0.92)",
        brandingLogoHex: "#202020",
    },
    dark: {
        bg1: "rgb(15, 14, 19)",
        overlayBg: "rgba(15, 14, 19, 0.7)",
        overlayText: "rgba(255, 255, 255, 0.95)",
        overlayTextMuted: "rgba(255, 255, 255, 0.45)",
        brandingBg: "rgba(15, 14, 19, 0.55)",
        brandingText: "rgba(255, 255, 255, 0.92)",
        brandingLogoHex: "#ffffff",
    },
};

export function getVideoThemeColors(theme: VideoTheme): VideoThemeColors {
    return VIDEO_THEME_COLORS[theme];
}
