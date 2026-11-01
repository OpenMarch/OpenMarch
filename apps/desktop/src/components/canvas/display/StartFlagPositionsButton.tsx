import * as Popover from "@radix-ui/react-popover";
import { PathIcon } from "@phosphor-icons/react";
import { SegmentedTextSwitch, Switch } from "@openmarch/ui";
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
import {
    Keycaps,
    ShortcutTooltip,
} from "@/components/timeline/ShortcutTooltip";
import { DISPLAY_BUTTON_CLASS, DisplayCaption } from "./displayButton";

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
 * Start flag positions (fork #331), on the field's display bar (it was first on the transport's
 * right until display settings moved off the timeline). In the accent color while the field draws
 * something (as the field publishes it), with a soft highlight while N is held or latched (the
 * Hold N state). Its popover sets both states' dots and paths; paths never go wider than dots
 * (`setStartFlagDots`, `setStartFlagPaths`). Next paths (M) sits under them, the other path
 * overlay.
 */
export function StartFlagPositionsButton() {
    const { t } = useTranslate();
    const settings = useUiSettingsStore((s) => s.uiSettings.startFlagPositions);
    const nextPaths = useUiSettingsStore((s) => s.uiSettings.nextPaths);
    const held = useStartFlagKeyStore((s) => s.held);
    const latched = useStartFlagKeyStore((s) => s.latched);
    const keyState = { held, latched };
    const hold = isStartFlagHoldActive(keyState);
    const overrides = useShortcutOverridesStore((s) => s.overrides);
    const nextPathsKey = getActionShortcutKeys("toggleNextPagePaths", {
        overrides,
    })?.join(" + ");
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
            <ShortcutTooltip
                label={label}
                shortcut={key}
                hint={stateLine}
                side="left"
            >
                <Popover.Trigger asChild>
                    <button
                        type="button"
                        aria-label={`${label}: ${stateLine}`}
                        data-testid="start-flag-positions"
                        data-drawing={drawing}
                        data-hold={hold}
                        className={clsx(
                            DISPLAY_BUTTON_CLASS,
                            drawing ? "text-accent" : "text-text",
                            hold && "bg-accent/10",
                        )}
                    >
                        <PathIcon
                            size={16}
                            weight={hold ? "bold" : "regular"}
                        />
                        <DisplayCaption>
                            {t("timeline.startFlagPositions.paths")}
                        </DisplayCaption>
                    </button>
                </Popover.Trigger>
            </ShortcutTooltip>
            <Popover.Portal>
                <Popover.Content
                    side="left"
                    align="start"
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
                    <label className="border-stroke flex items-center justify-between gap-8 border-t pt-12">
                        <span className="text-body flex items-center gap-4">
                            {t("toolbar.view.nextPaths")}
                            {nextPathsKey !== undefined && (
                                <Keycaps shortcut={nextPathsKey} />
                            )}
                        </span>
                        <Switch
                            data-testid="field-display-next-paths"
                            checked={nextPaths}
                            onCheckedChange={(checked) => {
                                const { uiSettings, setUiSettings } =
                                    useUiSettingsStore.getState();
                                setUiSettings({
                                    ...uiSettings,
                                    nextPaths: checked,
                                });
                            }}
                        />
                    </label>
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}
