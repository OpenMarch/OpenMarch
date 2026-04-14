import { useIsPlaying } from "@/context/IsPlayingContext";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useEffect, useRef } from "react";
import { useTimingObjects } from "@/hooks";
import clsx from "clsx";
import TimelineZoomControls from "./TimelineZoomControls";

export default function TimelineContainer({
    zoomControls = true,
    children,
}: {
    zoomControls?: boolean;
    children: React.ReactNode;
}) {
    const { isPlaying } = useIsPlaying()!;
    const { measures } = useTimingObjects()!;
    const { selectedPage } = useSelectedPage()!;
    const timelineRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!selectedPage) return;

        const container = timelineRef.current;
        const selectedPageElement = document.querySelector(
            `[timeline-page-id="${selectedPage.id}"]`,
        );

        if (!container || !selectedPageElement) return;

        if (isPlaying) {
            // During playback: Linear scroll animation
            container.style.scrollBehavior = "auto";
            const containerRect = container.getBoundingClientRect();
            const elementRect = selectedPageElement.getBoundingClientRect();

            const targetScroll =
                elementRect.left +
                container.scrollLeft -
                containerRect.left -
                (containerRect.width - elementRect.width) / 2;

            // Set the scroll directly without transition (animation handled by CSS)
            container.scrollLeft = targetScroll;
        } else {
            // Manual selection: Smooth scroll
            container.style.scrollBehavior = "smooth";
            selectedPageElement.scrollIntoView({
                block: "nearest",
                inline: "center",
            });
        }

        return () => {
            container.style.scrollBehavior = "smooth";
            container.style.transition = "";
        };
    }, [selectedPage, isPlaying]);

    // Rerender the timeline when the measures or pages change
    useEffect(() => {
        // do nothing, just re-render
    }, [measures]);

    return (
        <div
            ref={timelineRef}
            id="timeline"
            className={clsx(
                "rounded-6 border-stroke bg-fg-1 relative flex h-full w-full min-w-0 overflow-x-auto overflow-y-hidden border p-8 transition-all duration-200",
            )}
        >
            {children}
            {zoomControls && <TimelineZoomControls />}
        </div>
    );
}
