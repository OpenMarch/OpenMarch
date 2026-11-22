import { T, useTolgee } from "@tolgee/react";
import { useCallback, useEffect, useState } from "react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTriggerButton,
} from "@openmarch/ui";
import SettingRow from "@/settings/SettingRow";
import {
    LIST_DISPLAYS_CHANNEL,
    OPEN_ON_LAST,
    WINDOW_OPEN_ON_SETTINGS,
    type DisplayListing,
    type DisplaysResponse,
    type PlacedWindow,
} from "@/settings/windowPlacementSettings";

type Translate = ReturnType<typeof useTolgee>["t"];

/** "DELL U2720Q · 2560 × 1440 (main)", or "Display 2 · 1920 × 1080" where the system gives no name */
export function displayName(display: DisplayListing, t: Translate): string {
    const size = `${display.width} × ${display.height}`;
    const name = display.label
        ? t("settings.general.windowDisplay.namedDisplay", {
              name: display.label,
              size,
          })
        : t("settings.general.windowDisplay.display", {
              number: String(display.number),
              size,
          });
    return display.primary
        ? t("settings.general.windowDisplay.main", { display: name })
        : name;
}

const ROWS: { kind: PlacedWindow; labelKey: string; id: string }[] = [
    {
        kind: "editor",
        labelKey: "settings.general.editorDisplay",
        id: "editor-display",
    },
    {
        kind: "view3d",
        labelKey: "settings.general.view3dDisplay",
        id: "view3d-display",
    },
];

/**
 * Settings › General: the display the editor and the 3D View open on. Desktop only. Each opens
 * where it was left unless a display is chosen; choosing one moves the open window there.
 */
export default function WindowDisplaySettings() {
    const { t } = useTolgee(["language"]);
    // Null until main answers
    const [response, setResponse] = useState<DisplaysResponse | null>(null);
    const displays = response?.displays ?? [];
    const [choices, setChoices] = useState<Record<PlacedWindow, string>>({
        editor: OPEN_ON_LAST,
        view3d: OPEN_ON_LAST,
    });

    // Asked again whenever a menu opens, so a display plugged in since shows up
    const loadDisplays = useCallback(() => {
        void window.electron
            .invoke(LIST_DISPLAYS_CHANNEL)
            .then((answer: DisplaysResponse | undefined) =>
                setResponse(answer ?? null),
            );
    }, []);

    useEffect(() => {
        let isMounted = true;
        loadDisplays();
        void Promise.all(
            ROWS.map(({ kind }) =>
                window.electron.invoke(
                    "settings:get",
                    WINDOW_OPEN_ON_SETTINGS[kind],
                ),
            ),
        ).then((values: unknown[]) => {
            if (!isMounted) return;
            setChoices((current) => {
                const next = { ...current };
                ROWS.forEach(({ kind }, index) => {
                    const value = values[index];
                    if (typeof value === "string") next[kind] = value;
                });
                return next;
            });
        });
        return () => {
            isMounted = false;
        };
    }, [loadDisplays]);

    const choose = (kind: PlacedWindow, value: string) => {
        setChoices((c) => ({ ...c, [kind]: value }));
        window.electron.send("settings:set", {
            [WINDOW_OPEN_ON_SETTINGS[kind]]: value,
        });
    };

    // Linux under Wayland: the system decides where windows go
    if (response && !response.supported) return null;

    return (
        <>
            {ROWS.map(({ kind, labelKey, id }) => {
                const choice = choices[kind];
                const chosen = displays.find((d) => String(d.id) === choice);
                // A display chosen before that isn't plugged in now
                const missing =
                    response !== null && choice !== OPEN_ON_LAST && !chosen;
                const label =
                    choice === OPEN_ON_LAST
                        ? t("settings.general.windowDisplay.last")
                        : chosen
                          ? displayName(chosen, t)
                          : t("settings.general.windowDisplay.disconnected");
                return (
                    <SettingRow
                        key={kind}
                        label={<T keyName={labelKey} />}
                        htmlFor={id}
                        description={
                            missing && (
                                <T keyName="settings.general.windowDisplay.disconnected.description" />
                            )
                        }
                    >
                        <Select
                            value={choice}
                            onValueChange={(value) => choose(kind, value)}
                            onOpenChange={(open) => open && loadDisplays()}
                        >
                            <SelectTriggerButton
                                id={id}
                                label={label}
                                className="min-w-[120px]"
                                data-testid={`settings-${id}`}
                            />
                            <SelectContent>
                                <SelectItem value={OPEN_ON_LAST}>
                                    <T keyName="settings.general.windowDisplay.last" />
                                </SelectItem>
                                {displays.map((display) => (
                                    <SelectItem
                                        key={display.id}
                                        value={String(display.id)}
                                    >
                                        {displayName(display, t)}
                                    </SelectItem>
                                ))}
                                {missing && (
                                    <SelectItem value={choice}>
                                        <T keyName="settings.general.windowDisplay.disconnected" />
                                    </SelectItem>
                                )}
                            </SelectContent>
                        </Select>
                    </SettingRow>
                );
            })}
        </>
    );
}
