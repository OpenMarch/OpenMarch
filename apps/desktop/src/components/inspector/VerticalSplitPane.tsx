import { clsx } from "clsx";
import { useCallback, useRef, useState } from "react";

const DEFAULT_RATIO = 0.5;
const DEFAULT_MIN_RATIO = 0.2;

function clampRatio(ratio: number, minRatio: number): number {
    return Math.min(Math.max(ratio, minRatio), 1 - minRatio);
}

export type VerticalSplitPaneProps = {
    top: React.ReactNode;
    bottom: React.ReactNode;
    defaultRatio?: number;
    minRatio?: number;
    className?: string;
};

export default function VerticalSplitPane({
    top,
    bottom,
    defaultRatio = DEFAULT_RATIO,
    minRatio = DEFAULT_MIN_RATIO,
    className,
}: VerticalSplitPaneProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [topRatio, setTopRatio] = useState(() =>
        clampRatio(defaultRatio, minRatio),
    );
    const [isDragging, setIsDragging] = useState(false);

    const handlePointerDown = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            e.preventDefault();
            const container = containerRef.current;
            if (!container) return;

            const separator = e.currentTarget;
            const pointerId = e.pointerId;
            const rect = container.getBoundingClientRect();
            const startY = e.clientY;
            const startRatio = topRatio;

            setIsDragging(true);
            separator.setPointerCapture(pointerId);
            document.body.style.userSelect = "none";

            const endDrag = () => {
                setIsDragging(false);
                document.body.style.userSelect = "";
                separator.removeEventListener("pointermove", handlePointerMove);
                separator.removeEventListener("pointerup", handlePointerUp);
                separator.removeEventListener(
                    "lostpointercapture",
                    handleLostCapture,
                );
            };

            const handlePointerMove = (ev: PointerEvent) => {
                const height = rect.height;
                if (height <= 0) return;
                const delta = ev.clientY - startY;
                const nextRatio = clampRatio(
                    startRatio + delta / height,
                    minRatio,
                );
                setTopRatio(nextRatio);
            };

            const handlePointerUp = (ev: PointerEvent) => {
                if (ev.pointerId !== pointerId) return;
                separator.releasePointerCapture(pointerId);
                endDrag();
            };

            const handleLostCapture = () => {
                endDrag();
            };

            separator.addEventListener("pointermove", handlePointerMove);
            separator.addEventListener("pointerup", handlePointerUp);
            separator.addEventListener("lostpointercapture", handleLostCapture);
        },
        [minRatio, topRatio],
    );

    const ariaValueNow = Math.round(topRatio * 100);

    return (
        <div
            ref={containerRef}
            className={clsx("flex min-h-0 flex-1 flex-col", className)}
        >
            <div className="flex min-h-0 flex-col" style={{ flex: topRatio }}>
                {top}
            </div>
            <div
                role="separator"
                aria-orientation="horizontal"
                aria-valuemin={Math.round(minRatio * 100)}
                aria-valuemax={Math.round((1 - minRatio) * 100)}
                aria-valuenow={ariaValueNow}
                tabIndex={0}
                className={clsx(
                    "m-4 h-4 shrink-0 cursor-ns-resize touch-none rounded-full p-2 duration-150 ease-out",
                    isDragging ? "bg-accent/50" : "hover:bg-accent/30",
                )}
                onPointerDown={handlePointerDown}
            />
            <div
                className="flex min-h-0 flex-col"
                style={{ flex: 1 - topRatio }}
            >
                {bottom}
            </div>
        </div>
    );
}
