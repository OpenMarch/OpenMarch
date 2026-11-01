import * as Popover from "@radix-ui/react-popover";
import { PathIcon } from "@phosphor-icons/react";
import { SegmentedTextSwitch } from "@openmarch/ui";
import { useTranslate } from "@tolgee/react";
import clsx from "clsx";
import type { ReactNode } from "react";
import { getActionShortcutKeys } from "@/shortcuts/labels";
import { useShortcutOverridesStore } from "@/stores/ShortcutOverridesStore";
import {
    isStartFlagHoldActive,
    startFlagLevelsInEffect,
    useStartFlagKeyStore,
} from "@/stores/StartFlagKeyStore";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import {
    setStartFlagDots,
    setStartFlagPaths,
    START_FLAG_LEVEL_ORDER,
    type StartFlagLevel,
    type StartFlagLevels,
    type StartFlagPositionsSettings,
} from "@/timeline/startFlagLevels";
import { Keycaps, ShortcutTooltip } from "./ShortcutTooltip";

type State = keyof StartFlagPositionsSettings;
type Part = keyof StartFlagLevels;
type Translate = ReturnType<typeof useTranslate>["t"];

const levelName = (t: Translate, level: StartFlagLevel) =>
    t(`timeline.startFlagPositions.level.${level}`);

/** Saves one level of one state, keeping paths no wider than dots. */
function setLevel(state: State, part: Part, level: StartFlagLevel) {
    const { uiSettings, setStartFlagPositions } = useUiSettingsStore.getState();
    const settings = uiSettings.startFlagPositions;
    const set = part === "dots" ? setStartFlagDots : setStartFlagPaths;
    setStartFlagPositions({
        ...settings,
        [state]: set(settings[state], level),
    });
}

/** One state's Dots and Paths rows: Off · Selected · All. */
function LevelsBlock({
    state,
    title,
    heading = title,
    levels,
}: {
    state: State;
    /** The block's name as text, for screen readers */
    title: string;
    /** What the block shows as its name, `title` by default */
    heading?: ReactNode;
    levels: StartFlagLevels;
}) {
    const { t } = useTranslate();
    return (
        <section
            aria-label={title}
            className="flex flex-col gap-6"
            data-testid={`start-flag-${state}`}
        >
            <h3 className="text-sub text-text-subtitle flex items-center gap-4">
                {heading}
            </h3>
            {(["dots", "paths"] as const).map((part) => (
                <div key={part} className="flex items-center gap-8">
                    <span className="text-body w-40 shrink-0">
                        {t(`timeline.startFlagPositions.${part}`)}
                    </span>
                    <SegmentedTextSwitch
                        ariaLabel={`${title}: ${t(`timeline.startFlagPositions.${part}`)}`}
                        selected={levels[part]}
                        setSelected={(level) =>
                            setLevel(state, part, level as StartFlagLevel)
                        }
                        options={START_FLAG_LEVEL_ORDER.map((level) => ({
                            value: level,
                            label: levelName(t, level),
                            testId: `start-flag-${state}-${part}-${level}`,
                        }))}
                    />
                </div>
            ))}
        </section>
    );
}

/**
 * Start flag positions (fork #331): one icon first on the transport's right, before Fit. In the
 * accent color while the field draws something (as the field publishes it), with a soft
 * highlight while N is held or latched (the Hold N state). Its popover sets both states' dots and
 * paths; paths never go wider than dots (`setStartFlagDots`, `setStartFlagPaths`).
 */
export function StartFlagPositionsButton() {
    const { t } = useTranslate();
    const settings = useUiSettingsStore((s) => s.uiSettings.startFlagPositions);
    const held = useStartFlagKeyStore((s) => s.held);
    const latched = useStartFlagKeyStore((s) => s.latched);
    const keyState = { held, latched };
    const hold = isStartFlagHoldActive(keyState);
    const overrides = useShortcutOverridesStore((s) => s.overrides);
    const key = getActionShortcutKeys("toggleStartFlagPositions", {
        overrides,
    })?.join(" + ");
    const levels = startFlagLevelsInEffect(settings, keyState);
    // What the field actually draws, as it publishes it (`useStartFlagOverlay`)
    const drawing = useStartFlagKeyStore((s) => s.drawn);
    const label = t("timeline.startFlagPositions.label");
    // With the action unbound there is no key to hold
    const holdTitle =
        key === undefined
            ? t("timeline.startFlagPositions.holdNoKey")
            : t("timeline.startFlagPositions.hold", { key });
    const stateLine = t("timeline.startFlagPositions.stateLine", {
        state: hold ? holdTitle : t("timeline.startFlagPositions.always"),
        dots: levelName(t, levels.dots),
        paths: levelName(t, levels.paths),
    });
    return (
        <Popover.Root>
            <ShortcutTooltip label={label} shortcut={key} hint={stateLine}>
                <Popover.Trigger asChild>
                    <button
                        type="button"
                        aria-label={`${label}: ${stateLine}`}
                        data-testid="start-flag-positions"
                        data-drawing={drawing}
                        data-hold={hold}
                        className={clsx(
                            "focus-visible:ring-accent rounded-4 enabled:hover:text-accent enabled:hover:bg-fg-2 flex size-24 items-center justify-center outline-hidden transition-[color,background-color] duration-150 focus-visible:ring-2",
                            drawing ? "text-accent" : "text-text",
                            hold && "bg-accent/10",
                        )}
                    >
                        <PathIcon
                            size={16}
                            weight={hold ? "bold" : "regular"}
                        />
                    </button>
                </Popover.Trigger>
            </ShortcutTooltip>
            <Popover.Portal>
                <Popover.Content
                    side="top"
                    align="end"
                    sideOffset={6}
                    aria-label={label}
                    className="border-stroke bg-modal text-text shadow-modal rounded-8 z-50 flex flex-col gap-12 border px-16 py-12 backdrop-blur-sm"
                >
                    <LevelsBlock
                        state="always"
                        title={t("timeline.startFlagPositions.always")}
                        levels={settings.always}
                    />
                    <LevelsBlock
                        state="hold"
                        title={holdTitle}
                        heading={
                            key === undefined ? (
                                holdTitle
                            ) : (
                                <>
                                    {t(
                                        "timeline.startFlagPositions.holdHeading",
                                    )}
                                    <Keycaps shortcut={key} />
                                </>
                            )
                        }
                        levels={settings.hold}
                    />
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}
