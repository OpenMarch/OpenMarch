// The What's new slides' clips are recorded from the app by
// scripts/whats-new-media/record.mjs; re-record them when the UI they show changes.
import timelineVideo from "@/assets/welcome/whats-new/timeline.mp4";
import timelinePoster from "@/assets/welcome/whats-new/timeline.webp";
import shapesVideo from "@/assets/welcome/whats-new/shapes.mp4";
import shapesPoster from "@/assets/welcome/whats-new/shapes.webp";
import view3dVideo from "@/assets/welcome/whats-new/view3d.mp4";
import view3dPoster from "@/assets/welcome/whats-new/view3d.webp";
import propsVideo from "@/assets/welcome/whats-new/props.mp4";
import propsPoster from "@/assets/welcome/whats-new/props.webp";
import tempoVideo from "@/assets/welcome/whats-new/tempo.mp4";
import tempoPoster from "@/assets/welcome/whats-new/tempo.webp";
import pathwaysPoster from "@/assets/welcome/whats-new/pathways.webp";
import { siteUrl } from "@/global/siteUrl";

/** Features with a slide written before they reached main. */
export type UpcomingFeature = "tempoMode" | "pathways";

/**
 * Which upcoming features are on main. A slide that `requires` one stays hidden until its
 * switch here is true. When turning one on, record its clip
 * (`node scripts/whats-new-media/record.mjs <clip>`) and add the video to its slide below.
 */
export const SHIPPED_FEATURES: Record<UpcomingFeature, boolean> = {
    tempoMode: true,
    // Turn on when fork PR #674 (pathways: the Path pen) merges.
    pathways: false,
};

/**
 * Shows the hidden slides too, for reviewing them before their feature lands: build or run
 * with VITE_PUBLIC_WHATS_NEW_PREVIEW=true. Never set in a release build.
 */
export const PREVIEW_UPCOMING_SLIDES =
    import.meta.env.VITE_PUBLIC_WHATS_NEW_PREVIEW === "true";

/** One feature: a short muted loop (and its first frame), a title and one sentence. */
export type WhatsNewSlide = {
    id: string;
    /** The clip; a slide without one shows its poster (a placeholder until it's recorded). */
    video?: string;
    poster: string;
    /** Short name in the row of steps above the clip. */
    labelKey: string;
    titleKey: string;
    textKey: string;
    /** What the clip shows, for screen readers and when it can't play. */
    mediaKey: string;
    /** Hidden until this feature is on main (`SHIPPED_FEATURES`). */
    requires?: UpcomingFeature;
};

const slide = (
    id: string,
    media: { video?: string; poster: string },
    requires?: UpcomingFeature,
): WhatsNewSlide => ({
    id,
    ...media,
    labelKey: `welcomeFlow.whatsNew.slides.${id}.label`,
    titleKey: `welcomeFlow.whatsNew.slides.${id}.title`,
    textKey: `welcomeFlow.whatsNew.slides.${id}.text`,
    mediaKey: `welcomeFlow.whatsNew.slides.${id}.media`,
    requires,
});

/** Every slide, in order, hidden ones included. */
export const ALL_WHATS_NEW_SLIDES: readonly WhatsNewSlide[] = [
    slide("timeline", { video: timelineVideo, poster: timelinePoster }),
    slide("shapes", { video: shapesVideo, poster: shapesPoster }),
    slide("view3d", { video: view3dVideo, poster: view3dPoster }),
    slide("props", { video: propsVideo, poster: propsPoster }),
    slide("tempo", { video: tempoVideo, poster: tempoPoster }, "tempoMode"),
    // Placeholder poster; record pathways.mp4 when #674 lands.
    slide("pathways", { poster: pathwaysPoster }, "pathways"),
];

/** The slides to show: those whose feature is on main, or all of them when previewing. */
export function visibleWhatsNewSlides(
    slides: readonly WhatsNewSlide[],
    {
        shipped,
        preview,
    }: { shipped: Record<UpcomingFeature, boolean>; preview: boolean },
): readonly WhatsNewSlide[] {
    return slides.filter((s) => preview || !s.requires || shipped[s.requires]);
}

/** The slides people see. */
export const WHATS_NEW_SLIDES = visibleWhatsNewSlides(ALL_WHATS_NEW_SLIDES, {
    shipped: SHIPPED_FEATURES,
    preview: PREVIEW_UPCOMING_SLIDES,
});

/** The docs site, as Help › Docs/Guides opens it. */
export const GUIDES_URL = siteUrl("/guides");

/** What a key press does in the walkthrough, or null for keys it leaves alone. */
export function whatsNewKeyAction(
    key: string,
): "next" | "back" | "skip" | null {
    if (key === "ArrowRight") return "next";
    if (key === "ArrowLeft") return "back";
    if (key === "Escape") return "skip";
    return null;
}
