import { useTranslate } from "@tolgee/react";
import { isMacPlatform } from "@/shortcuts/platform";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useGestureChipStore } from "@/input/gestureChipStore";
import { gestureChipSegments } from "./heldRoleChipText";

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
 * renders it again as the pointer moves.
 */
export default function HeldRolesChip({
    belowTip = false,
}: {
    /** A drag readout (the tip) is showing; the chip sits under it there instead */
    belowTip?: boolean;
}) {
    const text = useHeldRolesChipText();
    if (belowTip || text === null) return null;
    return <ChipAtPointer text={text} />;
}

/** The chip's text for the running drag, or null when there's nothing to show */
export function useHeldRolesChipText(): string | null {
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
    return segments.length === 0 ? null : segments.join(" · ");
}

/** The chip under a drag readout, so the two stack instead of overlapping */
export function HeldRolesChipBelowTip() {
    const text = useHeldRolesChipText();
    if (text === null) return null;
    return (
        <div
            className={CHIP_CLASS}
            style={{ fontSize: CHIP_PX }}
            data-testid="heldRolesChip"
        >
            {text}
        </div>
    );
}

/** The chip itself, the only part that follows the pointer */
function ChipAtPointer({ text }: { text: string }) {
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
            {text}
        </div>
    );
}
