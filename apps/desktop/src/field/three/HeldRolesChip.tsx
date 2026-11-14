import { Fragment } from "react";
import { T, useTranslate } from "@tolgee/react";
import Shortcut from "@/components/ui/Shortcut";
import { isMacPlatform } from "@/shortcuts/platform";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useGestureChipStore } from "@/input/gestureChipStore";
import ClearOfFinger from "./ClearOfFinger";
import { useFieldViewStore } from "./fieldView";
import {
    gestureChipSegments,
    WITH_KEY_I18N,
    type ChipSegment,
} from "./heldRoleChipText";

const OFFSET_X = 16;
const OFFSET_Y = 18;
/**
 * Dimmer than the drag readout it sits under: a hint, not a measurement, so it never reads as a
 * second readout (owner). See-through, so it still reads over the field's lines.
 */
const CHIP_CLASS =
    "rounded-6 bg-bg-1/60 text-text-subtitle px-6 py-2 whitespace-nowrap";
const CHIP_PX = 11;

/**
 * A small readout near the cursor while a field drag runs: the held roles the drag reads, and Snap
 * off. It follows the drag's roles, not its pointer, so a drag it has nothing to say about never
 * renders it again as the pointer moves. A touch drag's chip sits above the finger, clear of it.
 */
export default function HeldRolesChip({
    belowTip = false,
    touch = false,
}: {
    /** A drag readout (the tip) is showing; the chip sits under it there instead */
    belowTip?: boolean;
    /** The drag is a finger's: the chip keeps clear of it */
    touch?: boolean;
}) {
    const segments = useHeldRolesChipSegments();
    if (belowTip || segments === null) return null;
    return touch ? (
        <ChipAboveFinger segments={segments} />
    ) : (
        <ChipAtPointer segments={segments} />
    );
}

/** The chip's segments for the running drag, or null when there's nothing to show */
export function useHeldRolesChipSegments(): ChipSegment[] | null {
    const { t } = useTranslate();
    const active = useGestureChipStore((state) => state.active);
    const honored = useGestureChipStore((state) => state.honored);
    const roles = useGestureChipStore((state) => state.roles);
    const isPlaying = useIsPlaying()?.isPlaying ?? false;
    const snapOn = useUiSettingsStore((state) => state.uiSettings.snap);
    if (!active || isPlaying) return null;
    const segments = gestureChipSegments(
        honored,
        roles,
        snapOn,
        isMacPlatform(),
        t,
    );
    return segments.length === 0 ? null : segments;
}

/** The segments in a row, each held key as a `Shortcut`, apart by dots */
function ChipText({ segments }: { segments: readonly ChipSegment[] }) {
    return (
        <>
            {segments.map((segment, i) => (
                <Fragment key={`${segment.key}-${segment.word}`}>
                    {i > 0 && <span aria-hidden="true"> · </span>}
                    {segment.key === null ? (
                        segment.word
                    ) : (
                        <T
                            keyName={WITH_KEY_I18N}
                            params={{
                                word: segment.word,
                                keys: () => <Shortcut keys={[segment.key!]} />,
                            }}
                        />
                    )}
                </Fragment>
            ))}
        </>
    );
}

/** The chip under a drag readout, so the two stack instead of overlapping */
export function HeldRolesChipBelowTip() {
    const segments = useHeldRolesChipSegments();
    if (segments === null) return null;
    return (
        <div
            className={CHIP_CLASS}
            style={{ fontSize: CHIP_PX }}
            data-testid="heldRolesChip"
        >
            <ChipText segments={segments} />
        </div>
    );
}

/** The chip itself, the only part that follows the pointer */
function ChipAtPointer({ segments }: { segments: readonly ChipSegment[] }) {
    const screen = useGestureChipStore((state) => state.screen);
    if (!screen) return null;
    return (
        <div
            className={`${CHIP_CLASS} pointer-events-none absolute z-20`}
            style={{
                left: screen.x + OFFSET_X,
                top: screen.y + OFFSET_Y,
                fontSize: CHIP_PX,
            }}
            data-testid="heldRolesChip"
        >
            <ChipText segments={segments} />
        </div>
    );
}

/** The chip of a touch drag, above the finger so the finger doesn't cover it */
function ChipAboveFinger({ segments }: { segments: readonly ChipSegment[] }) {
    const screen = useGestureChipStore((state) => state.screen);
    const width = useFieldViewStore((state) => state.width);
    const height = useFieldViewStore((state) => state.height);
    if (!screen) return null;
    return (
        <ClearOfFinger finger={screen} bounds={{ width, height }}>
            <div
                className={CHIP_CLASS}
                style={{ fontSize: CHIP_PX }}
                data-testid="heldRolesChip"
            >
                <ChipText segments={segments} />
            </div>
        </ClearOfFinger>
    );
}
