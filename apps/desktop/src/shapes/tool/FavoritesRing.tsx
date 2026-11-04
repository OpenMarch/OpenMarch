import tolgee from "@/global/singletons/Tolgee";
import clsx from "clsx";
import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { create } from "zustand";
import { performersOnly } from "@/global/classes/Marcher";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useActionHandler } from "@/shortcuts/useActionHandler";
import { useEditorReadiness } from "@/shortcuts/handlers/useEditorReadiness";
import ShapePreviewIcon from "../preview/ShapePreviewIcon";
import {
    clickRing,
    latchRing,
    openRing,
    pointRing,
    releaseRingKey,
    RING_RADIUS,
    ringSlots,
    slotAngle,
    type RingShape,
    type RingState,
} from "./ringMachine";
import { kindPickGate, pickShapeKind } from "./pickKind";
import { SHAPE_TOOLS } from "./shapeTools";
import { useShapeShown } from "./shapeToolStore";
import { Tip } from "@/components/ui/Tip";

/** The ring's slots, the same every time */
const SLOTS = ringSlots(SHAPE_TOOLS);

/** The open ring, if any */
const useRingStore = create<{ ring: RingState | null }>(() => ({
    ring: null,
}));
const setRing = (ring: RingState | null) => useRingStore.setState({ ring });

/** How far the ring keeps from the window's edges, so every slot stays on screen */
const EDGE = RING_RADIUS + 64;

/**
 * The ring's buttons cast a heavier shadow than a menu's, so they stand off the field (#379): a
 * tight contact shadow under a wide soft one, which the dark theme darkens.
 */
const BUTTON_SHADOW =
    "shadow-[0_2px_4px_rgba(0,0,0,0.3),0_6px_16px_var(--color-modal-shadow),0_12px_36px_var(--color-modal-shadow)]";

/** Where the pointer last was, in the window; the ring opens around it */
let pointer: { x: number; y: number } | null = null;

function ringCenter(): { x: number; y: number } {
    const { innerWidth: w, innerHeight: h } = window;
    const at = pointer ?? { x: w / 2, y: h / 2 };
    const clamp = (v: number, size: number) =>
        size < 2 * EDGE ? size / 2 : Math.min(size - EDGE, Math.max(EDGE, v));
    return { x: clamp(at.x, w), y: clamp(at.y, h) };
}

/**
 * The favorites ring (#351, spec #344): hold R to open a ring of shapes around the cursor, slide
 * toward one and let go to arm it; tap R to keep it open until a click. It holds the kinds in
 * the Shapes tab's order, at most 8. Picking goes through the
 * host's `pickShapeKind`, so with a shape open it turns into the picked kind, and with nobody
 * selected the shapes are greyed out and say why. Escape closes it before anything else. The key
 * is the `openShapeRing` action, so it can be rebound.
 */
export default function FavoritesRing() {
    const { ready } = useEditorReadiness();
    const selected = useSelectedMarchers()?.selectedMarchers;
    const performers = useMemo(
        () => performersOnly(selected ?? []),
        [selected],
    );
    const slots = SLOTS;
    const gate = kindPickGate(useShapeShown(), performers);
    const ring = useRingStore((s) => s.ring);

    // The key's handlers read these when they run, not when they were registered
    const live = useRef({ slots, performers, gate });
    live.current = { slots, performers, gate };

    const pick = (index: number | null) => {
        setRing(null);
        const { slots, performers, gate } = live.current;
        const slot = index === null ? undefined : slots[index];
        if (slot && gate.ok) pickShapeKind(slot.kind, performers);
    };

    useActionHandler(
        "openShapeRing",
        (args) => {
            // R again closes a latched ring
            if (useRingStore.getState().ring) {
                setRing(null);
                return;
            }
            const opened = openRing(
                ringCenter(),
                performance.now(),
                pointer ?? undefined,
            );
            // From the command palette: latched, as a tap leaves it (#411)
            setRing(args?.latched === true ? latchRing(opened) : opened);
        },
        {
            enabled: ready,
            onRelease: () => {
                const open = useRingStore.getState().ring;
                if (!open) return;
                const released = releaseRingKey(open, performance.now());
                if (released.pick !== null) pick(released.pick);
                else setRing(released.ring);
            },
        },
    );

    useEffect(() => {
        const onMove = (event: PointerEvent) => {
            pointer = { x: event.clientX, y: event.clientY };
            const open = useRingStore.getState().ring;
            if (open)
                setRing(pointRing(open, pointer, live.current.slots.length));
        };
        window.addEventListener("pointermove", onMove);
        return () => window.removeEventListener("pointermove", onMove);
    }, []);

    if (!ring) return null;
    return createPortal(
        <>
            <RingKeys />
            {/* Takes the clicks while the ring is open, so none reaches the field */}
            <div
                className="fixed inset-0 z-50"
                data-shape-ui
                onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const at = { x: event.clientX, y: event.clientY };
                    pick(
                        event.button === 0
                            ? clickRing(ring, at, slots.length)
                            : null,
                    );
                }}
                onContextMenu={(event) => event.preventDefault()}
            />
            {/* The aim line, from the ring's center to the pointer, under the buttons (#379) */}
            <svg
                className="pointer-events-none fixed inset-0 z-50 size-full overflow-visible"
                data-shape-ui
            >
                <line
                    x1={ring.center.x}
                    y1={ring.center.y}
                    x2={ring.aim.x}
                    y2={ring.aim.y}
                    className="stroke-accent drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]"
                    strokeWidth={2}
                    strokeLinecap="round"
                    data-testid="shape-ring-aim"
                />
            </svg>
            {/* The ring's whole area, its slots placed from its middle */}
            <div
                className="pointer-events-none fixed z-50"
                style={{
                    left: ring.center.x - EDGE,
                    top: ring.center.y - EDGE,
                    width: 2 * EDGE,
                    height: 2 * EDGE,
                }}
                data-testid="shape-ring"
                data-latched={ring.latched}
                data-shape-ui
            >
                <div className="absolute top-1/2 left-1/2">
                    {/*
                     * A faint track, so a ring of one or two shapes still reads as a ring. Dark in
                     * both themes: the field it sits on stays light in the dark theme too (#379).
                     */}
                    <div
                        className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/20"
                        style={{
                            width: 2 * RING_RADIUS,
                            height: 2 * RING_RADIUS,
                        }}
                    />
                    <div
                        className={clsx(
                            "border-stroke bg-modal absolute size-24 -translate-x-1/2 -translate-y-1/2 rounded-full border",
                            BUTTON_SHADOW,
                        )}
                        data-testid="shape-ring-center"
                    />
                    {slots.map((slot, i) => (
                        <RingSlot
                            key={slot.id}
                            slot={slot}
                            angle={slotAngle(i, slots.length)}
                            hot={ring.hot === i}
                            disabled={!gate.ok}
                            title={gate.ok ? undefined : gate.reason}
                            onPick={() => pick(i)}
                        />
                    ))}
                    {!gate.ok && (
                        <span
                            className="rounded-6 bg-modal text-body text-text shadow-modal absolute -translate-x-1/2 px-8 py-2 whitespace-nowrap"
                            style={{ top: 20 }}
                            data-testid="shape-ring-reason"
                        >
                            {gate.reason}
                        </span>
                    )}
                    {gate.ok && ring.latched && (
                        <span
                            className="rounded-6 bg-modal text-sub text-text-subtitle shadow-modal absolute -translate-x-1/2 px-8 py-2 whitespace-nowrap"
                            style={{ top: 20 }}
                            data-testid="shape-ring-hint"
                        >
                            {tolgee.t(
                                "shapes.tool.ring.hint",
                                "Click a shape, or anywhere else to close",
                            )}
                        </span>
                    )}
                </div>
            </div>
        </>,
        document.body,
    );
}

function RingSlot({
    slot,
    angle,
    hot,
    disabled,
    title,
    onPick,
}: {
    slot: RingShape;
    angle: number;
    hot: boolean;
    disabled: boolean;
    title: string | undefined;
    onPick: () => void;
}) {
    return (
        // aria-disabled, not disabled, so a click on a greyed-out shape still dismisses the ring
        <Tip label={title}>
            <button
                type="button"
                tabIndex={-1}
                aria-disabled={disabled}
                data-testid={`shape-ring-slot-${slot.id}`}
                data-hot={hot}
                className={clsx(
                    "border-stroke text-body pointer-events-auto absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-6 rounded-full border px-12 py-6 whitespace-nowrap",
                    hot && !disabled
                        ? "bg-accent text-text-invert"
                        : "bg-modal text-text",
                    BUTTON_SHADOW,
                    disabled && "opacity-50",
                )}
                style={{
                    left: Math.cos(angle) * RING_RADIUS,
                    top: Math.sin(angle) * RING_RADIUS,
                }}
                onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onPick();
                }}
            >
                <ShapePreviewIcon kind={slot.kind} size={20} picked={hot} />
                {slot.label}
            </button>
        </Tip>
    );
}

/**
 * Mounted while the ring is open, after the shape tool's own keys, so Escape closes the ring
 * before the shape (spec #344).
 */
function RingKeys(): null {
    useActionHandler("cancelAlignmentUpdates", () => setRing(null));
    return null;
}
