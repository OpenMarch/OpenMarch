import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import TimelineControls from "./TimelineControls";
import { useFullscreenStore } from "@/stores/FullscreenStore";
import PerspectiveSlider from "./PerspectiveSlider";
import clsx from "clsx";

export default function FooterContainer({
    children,
}: {
    children: React.ReactNode;
}) {
    const { uiSettings } = useUiSettingsStore();
    const { isFullscreen } = useFullscreenStore();

    return (
        <div className={clsx("flex gap-8")}>
            {uiSettings.focussedComponent !== "timeline" && (
                <TimelineControls />
            )}
            {isFullscreen && <PerspectiveSlider />}
            {children}
        </div>
    );
}
