import {
    useEffect,
    useRef,
    useState,
    type PointerEvent as ReactPointerEvent,
} from "react";
import { VideoCameraIcon } from "@phosphor-icons/react";
import { useTranslate } from "@tolgee/react";
import clsx from "clsx";
import { useShallow } from "zustand/react/shallow";
import {
    pixelsToWorld,
    worldToPixels,
    type FieldProperties,
} from "@openmarch/core";
import {
    VIEW3D_CAMERA_MOVE_CHANNEL,
    type View3dCameraMove,
    type View3dCameraPose,
} from "@/view3d/sync/protocol";
import { CHIP_CLASS, CHIP_PX } from "../HeldRolesChip";
import {
    elementToField,
    fieldToElement,
    useFieldViewStore,
} from "../fieldView";
import {
    cameraAim,
    cameraAimedAt,
    cameraMovedTo,
    poseLooking,
} from "./cameraWedge";
import { useFieldCameraStore } from "./fieldCameraStore";

/** The camera chip's radius, and the gap before the line of sight starts, in CSS pixels. */
const CHIP_RADIUS = 14;
const LINE_GAP = 4;

type Drag = "move" | "aim";

/** Sends the newest move once a frame: a drag reports more often than the window draws. */
function moveSender() {
    let frame = 0;
    let next: View3dCameraMove | null = null;
    const flush = () => {
        frame = 0;
        if (next)
            window.electron?.publishToView3d?.(
                VIEW3D_CAMERA_MOVE_CHANNEL,
                next,
            );
        next = null;
    };
    return {
        send: (move: View3dCameraMove) => {
            next = move;
            if (!frame) frame = window.requestAnimationFrame(flush);
        },
        flush: () => {
            window.cancelAnimationFrame(frame);
            flush();
        },
    };
}

/** Ends a drag: the window's own reports wait a moment for the last move to reach it. */
const settle = () =>
    useFieldCameraStore.setState({
        dragging: false,
        settledAt: performance.now(),
    });

/**
 * The 3D View's camera on the 2D field (#1207), over the canvas: a camera chip
 * where it stands, pointing where it looks, and a ring on the ground it looks
 * at, joined by a dashed line. Dragging the chip carries the camera across the
 * field, still looking the same way; dragging the ring turns it to look
 * there. The 3D View follows as a free view. The wedge under them is
 * `CameraMarkerLayer`.
 */
export default function CameraHandle({
    fieldProperties,
}: {
    fieldProperties: FieldProperties;
}) {
    const pose = useFieldCameraStore((s) => s.pose);
    // Nothing to draw, nor a view to follow, without a camera
    return pose ? (
        <ShownCamera pose={pose} fieldProperties={fieldProperties} />
    ) : null;
}

function ShownCamera({
    pose,
    fieldProperties,
}: {
    pose: View3dCameraPose;
    fieldProperties: FieldProperties;
}) {
    const { t } = useTranslate();
    const view = useFieldViewStore(
        useShallow((s) => ({
            panX: s.panX,
            panY: s.panY,
            zoom: s.zoom,
            width: s.width,
            height: s.height,
        })),
    );
    const dragging = useFieldCameraStore((s) => s.dragging);
    const [hover, setHover] = useState(false);
    const root = useRef<HTMLDivElement>(null);
    // A drag cut short by the camera going away (the window closed) ends with it
    useEffect(
        () => () => {
            if (useFieldCameraStore.getState().dragging) settle();
        },
        [],
    );

    const startDrag =
        (kind: Drag) => (event: ReactPointerEvent<HTMLElement>) => {
            const start = useFieldCameraStore.getState().pose;
            const box = root.current?.getBoundingClientRect();
            if (event.button !== 0 || !start || !box) return;
            // Also keeps the focus where it was (the field's keys), as the handles are only dragged
            event.preventDefault();
            event.stopPropagation();
            const element = event.currentTarget;
            element.setPointerCapture(event.pointerId);
            const fieldAt = (e: PointerEvent | ReactPointerEvent) =>
                elementToField(
                    useFieldViewStore.getState(),
                    e.clientX - box.left,
                    e.clientY - box.top,
                );
            const grabbed = fieldAt(event);
            const standing = worldToPixels(fieldProperties, {
                x: start.position[0],
                z: start.position[2],
            });
            const sender = moveSender();
            const move = (e: PointerEvent) => {
                const at = fieldAt(e);
                const ground = pixelsToWorld(
                    fieldProperties,
                    kind === "move"
                        ? {
                              x: standing.x + at.x - grabbed.x,
                              y: standing.y + at.y - grabbed.y,
                          }
                        : at,
                );
                const next =
                    kind === "move"
                        ? cameraMovedTo(start, ground.x, ground.z)
                        : cameraAimedAt(start, ground.x, ground.z);
                useFieldCameraStore.setState({
                    pose: poseLooking(start, next.position, next.target),
                    dragging: true,
                });
                sender.send(next);
            };
            const end = () => {
                element.removeEventListener("pointermove", move);
                element.removeEventListener("pointerup", end);
                element.removeEventListener("pointercancel", end);
                element.removeEventListener("lostpointercapture", end);
                sender.flush();
                settle();
            };
            element.addEventListener("pointermove", move);
            element.addEventListener("pointerup", end);
            element.addEventListener("pointercancel", end);
            element.addEventListener("lostpointercapture", end);
        };

    const standing = worldToPixels(fieldProperties, {
        x: pose.position[0],
        z: pose.position[2],
    });
    const aimWorld = cameraAim(pose);
    const aimField = worldToPixels(fieldProperties, {
        x: aimWorld[0],
        z: aimWorld[2],
    });
    const at = fieldToElement(view, standing.x, standing.y);
    const aim = fieldToElement(view, aimField.x, aimField.y);
    // Straight down, the ring is under the chip: no line, and the chip takes the drag
    const apart = Math.hypot(aim.x - at.x, aim.y - at.y) > CHIP_RADIUS * 2;
    const angle = Math.atan2(aim.y - at.y, aim.x - at.x);
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const tip = CHIP_RADIUS + 7;
    return (
        <div
            ref={root}
            className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
            data-testid="fieldView3dCamera"
        >
            {apart && (
                <svg className="absolute inset-0 h-full w-full">
                    <line
                        x1={at.x + ux * (tip + LINE_GAP)}
                        y1={at.y + uy * (tip + LINE_GAP)}
                        x2={aim.x - ux * 10}
                        y2={aim.y - uy * 10}
                        className="stroke-accent"
                        strokeWidth={1.5}
                        strokeDasharray="4 4"
                        strokeLinecap="round"
                    />
                    {/* The chip's nose, pointing where the camera looks */}
                    <polygon
                        points={[
                            [at.x + ux * tip, at.y + uy * tip],
                            [
                                at.x + ux * (CHIP_RADIUS - 2) - uy * 6,
                                at.y + uy * (CHIP_RADIUS - 2) + ux * 6,
                            ],
                            [
                                at.x + ux * (CHIP_RADIUS - 2) + uy * 6,
                                at.y + uy * (CHIP_RADIUS - 2) - ux * 6,
                            ],
                        ]
                            .map((p) => p.join(","))
                            .join(" ")}
                        className="fill-accent stroke-bg-1"
                        strokeWidth={1.5}
                        strokeLinejoin="round"
                    />
                </svg>
            )}
            {apart && (
                <button
                    type="button"
                    // Drag handles: the 3D View has the keyboard's camera controls
                    tabIndex={-1}
                    aria-label={t("field.view3dCamera.aim")}
                    data-testid="fieldView3dCameraAim"
                    onPointerDown={startDrag("aim")}
                    className="pointer-events-auto absolute flex size-32 -translate-x-1/2 -translate-y-1/2 cursor-crosshair touch-none items-center justify-center"
                    style={{ left: aim.x, top: aim.y }}
                >
                    <span className="border-accent bg-bg-1/70 size-16 rounded-full border-2" />
                </button>
            )}
            <button
                type="button"
                tabIndex={-1}
                aria-label={t("field.view3dCamera.move")}
                data-testid="fieldView3dCameraMove"
                onPointerDown={startDrag("move")}
                onPointerEnter={() => setHover(true)}
                onPointerLeave={() => setHover(false)}
                className={clsx(
                    "bg-accent text-text-invert border-bg-1 shadow-modal pointer-events-auto absolute flex size-28 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center rounded-full border-2",
                    dragging ? "cursor-grabbing" : "cursor-grab",
                )}
                style={{ left: at.x, top: at.y }}
            >
                <VideoCameraIcon size={16} weight="fill" />
            </button>
            {(hover || dragging) && (
                <div
                    className={`${CHIP_CLASS} absolute -translate-x-1/2`}
                    style={{
                        left: at.x,
                        top: at.y + CHIP_RADIUS + 6,
                        fontSize: CHIP_PX,
                    }}
                >
                    {t("field.view3dCamera.name")}
                </div>
            )}
        </div>
    );
}
