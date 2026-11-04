// The What's new slides' clips are recorded from the app by
// scripts/whats-new-media/record.mjs; re-record them when the UI they show changes.
import timelineVideo from "@/assets/welcome/whats-new/timeline.mp4";
import timelinePoster from "@/assets/welcome/whats-new/timeline.webp";
import shapesVideo from "@/assets/welcome/whats-new/shapes.mp4";
import shapesPoster from "@/assets/welcome/whats-new/shapes.webp";
import propsVideo from "@/assets/welcome/whats-new/props.mp4";
import propsPoster from "@/assets/welcome/whats-new/props.webp";
import view3dVideo from "@/assets/welcome/whats-new/view3d.mp4";
import view3dPoster from "@/assets/welcome/whats-new/view3d.webp";

/** One feature: a short muted loop (and its first frame), a title and one sentence. */
export type WhatsNewSlide = {
    id: string;
    video: string;
    poster: string;
    titleKey: string;
    textKey: string;
    /** What the clip shows, for screen readers and when it can't play. */
    mediaKey: string;
};

const slide = (id: string, video: string, poster: string): WhatsNewSlide => ({
    id,
    video,
    poster,
    titleKey: `welcomeFlow.whatsNew.slides.${id}.title`,
    textKey: `welcomeFlow.whatsNew.slides.${id}.text`,
    mediaKey: `welcomeFlow.whatsNew.slides.${id}.media`,
});

/** In the order a returning director meets them. */
export const WHATS_NEW_SLIDES: readonly WhatsNewSlide[] = [
    slide("timeline", timelineVideo, timelinePoster),
    slide("shapes", shapesVideo, shapesPoster),
    slide("props", propsVideo, propsPoster),
    slide("view3d", view3dVideo, view3dPoster),
];

/** The docs site, as Help › Docs/Guides opens it. */
export const GUIDES_URL = "https://openmarch.com/guides";

/** What a key press does in the walkthrough, or null for keys it leaves alone. */
export function whatsNewKeyAction(
    key: string,
): "next" | "back" | "skip" | null {
    if (key === "ArrowRight") return "next";
    if (key === "ArrowLeft") return "back";
    if (key === "Escape") return "skip";
    return null;
}
