import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { T, useTolgee } from "@tolgee/react";
import { Button, Input } from "@openmarch/ui";
import {
    ArrowCounterClockwiseIcon,
    MagnifyingGlassIcon,
    PlusIcon,
    XIcon,
} from "@phosphor-icons/react";
import {
    bindingFromEvent,
    formatBinding,
    formatBindingKeys,
} from "@/shortcuts/bindings";
import {
    ACTION_IDS,
    TAP_BEATS_ACTION_IDS,
    getActionDefinition,
    type ActionCategory,
    type ActionId,
} from "@/shortcuts/definitions";
import { findBindingOwners, getDisplayBindings } from "@/shortcuts/keymap";
import { getActionLabel, type Translate } from "@/shortcuts/labels";
import { isMacPlatform } from "@/shortcuts/platform";
import { searchItems } from "@/shortcuts/search";
import Keycaps from "@/components/ui/Keycaps";
import { useShortcutOverridesStore } from "@/stores/ShortcutOverridesStore";

/** What the settings view shows as one group; the command palette still groups by raw category. */
const DISPLAY_GROUPS: readonly {
    id: ActionCategory;
    categories: readonly ActionCategory[];
}[] = [
    { id: "file", categories: ["file"] },
    { id: "edit", categories: ["edit"] },
    { id: "timeline", categories: ["navigation", "playback", "timeline"] },
    { id: "movement", categories: ["movement"] },
    { id: "alignment", categories: ["alignment"] },
    { id: "batchEdit", categories: ["batchEdit"] },
    { id: "select", categories: ["select"] },
    { id: "cursor", categories: ["cursor"] },
    { id: "shape", categories: ["shape"] },
    { id: "ui", categories: ["ui"] },
];

const TAP_BEATS_ROW_ID = "tapBeats";
const TAP_BEATS_DIGITS = Array.from({ length: 9 }, (_, i) => String(i + 1));

interface PendingConflict {
    id: ActionId;
    binding: string;
    owners: ActionId[];
}

/** Captures the next key press, ahead of the shortcut dispatcher and any dialog's Escape handling. */
function useKeyRecorder(
    active: boolean,
    isMac: boolean,
    onRecord: (binding: string) => void,
    onCancel: () => void,
) {
    const callbacks = useRef({ onRecord, onCancel });
    useLayoutEffect(() => {
        callbacks.current = { onRecord, onCancel };
    });

    useEffect(() => {
        if (!active) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.isComposing) return;
            event.preventDefault();
            event.stopPropagation();
            const bare =
                !event.ctrlKey &&
                !event.metaKey &&
                !event.altKey &&
                !event.shiftKey;
            if (bare && event.key === "Escape") {
                callbacks.current.onCancel();
                return;
            }
            const binding = bindingFromEvent(event, isMac);
            if (binding) callbacks.current.onRecord(binding);
        };
        window.addEventListener("keydown", onKeyDown, { capture: true });
        return () =>
            window.removeEventListener("keydown", onKeyDown, {
                capture: true,
            });
    }, [active, isMac]);
}

interface Row {
    /** The nine "tap N beats" actions are folded into one read-only row. */
    id: ActionId | typeof TAP_BEATS_ROW_ID;
    category: ActionCategory;
    label: string;
    bindings: string[];
    formatted: string[];
}

function TapBeatsRow({ row }: { row: Row }) {
    return (
        <li className="flex min-h-[48px] items-center justify-between gap-16 py-12">
            <span className="text-body text-text">{row.label}</span>
            <Keycaps keys={["1–9"]} />
        </li>
    );
}

function ShortcutRow({
    row,
    isOverridden,
    isRecording,
    conflict,
    t,
    isMac,
    onStartRecording,
    onRemove,
    onReset,
    onReassign,
    onDismissConflict,
}: {
    row: Row & { id: ActionId };
    isOverridden: boolean;
    isRecording: boolean;
    conflict: PendingConflict | null;
    t: Translate;
    isMac: boolean;
    onStartRecording: () => void;
    onRemove: (binding: string) => void;
    onReset: () => void;
    onReassign: () => void;
    onDismissConflict: () => void;
}) {
    return (
        <li className="group/row flex flex-col gap-4 py-12">
            <div className="flex min-h-[24px] items-center justify-between gap-16">
                <span className="text-body text-text min-w-0">{row.label}</span>
                <div className="flex flex-wrap items-center justify-end gap-4">
                    {row.bindings.map((binding, i) => (
                        <span key={binding} className="flex items-center gap-2">
                            <Keycaps keys={formatBindingKeys(binding, isMac)} />
                            <button
                                type="button"
                                className="hover:text-red text-text-subtitle rounded-full p-2 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
                                aria-label={t("settings.shortcuts.remove", {
                                    binding: row.formatted[i],
                                })}
                                onClick={() => onRemove(binding)}
                            >
                                <XIcon size={12} />
                            </button>
                        </span>
                    ))}
                    {isRecording ? (
                        <span
                            role="status"
                            className="border-accent text-accent rounded-6 text-sub border px-6 py-2"
                        >
                            <T keyName="settings.shortcuts.recording" />
                        </span>
                    ) : (
                        <button
                            type="button"
                            className={`hover:text-accent text-text-subtitle rounded-6 p-4 ${row.bindings.length > 0 ? "opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100" : ""}`}
                            aria-label={t("settings.shortcuts.add", {
                                action: row.label,
                            })}
                            onClick={onStartRecording}
                        >
                            <PlusIcon size={14} />
                        </button>
                    )}
                    {isOverridden && (
                        <button
                            type="button"
                            className="hover:text-accent text-text-subtitle rounded-6 p-4"
                            aria-label={t("settings.shortcuts.reset", {
                                action: row.label,
                            })}
                            onClick={onReset}
                        >
                            <ArrowCounterClockwiseIcon size={14} />
                        </button>
                    )}
                </div>
            </div>
            {conflict && (
                <div
                    role="alert"
                    className="bg-fg-2 rounded-6 flex flex-wrap items-center justify-between gap-8 px-8 py-6"
                >
                    <span className="text-sub text-text">
                        {t("settings.shortcuts.conflict", {
                            binding: formatBinding(conflict.binding, isMac),
                            actions: conflict.owners
                                .map((owner) => getActionLabel(owner, t))
                                .join(", "),
                        })}
                    </span>
                    <div className="flex gap-6">
                        <Button size="compact" onClick={onReassign}>
                            <T keyName="settings.shortcuts.reassign" />
                        </Button>
                        <Button
                            size="compact"
                            variant="secondary"
                            onClick={onDismissConflict}
                        >
                            <T keyName="settings.shortcuts.cancel" />
                        </Button>
                    </div>
                </div>
            )}
        </li>
    );
}

export default function ShortcutSettings() {
    const { t: tolgeeT } = useTolgee();
    const t: Translate = useCallback(
        (key, params) => tolgeeT(key, params as never),
        [tolgeeT],
    );
    const isMac = isMacPlatform();
    const { overrides, addBinding, removeBinding, resetAction, resetAll } =
        useShortcutOverridesStore();
    const [query, setQuery] = useState("");
    const [recording, setRecording] = useState<ActionId | null>(null);
    const [pending, setPending] = useState<PendingConflict | null>(null);

    useKeyRecorder(
        recording !== null,
        isMac,
        (binding) => {
            if (!recording) return;
            const owners = findBindingOwners(
                recording,
                binding,
                overrides,
                isMac,
            );
            if (owners.length > 0)
                setPending({ id: recording, binding, owners });
            else addBinding(recording, binding);
            setRecording(null);
        },
        () => setRecording(null),
    );

    const rows = useMemo<Row[]>(
        () => [
            ...ACTION_IDS.filter(
                (id) => !TAP_BEATS_ACTION_IDS.includes(id),
            ).map((id) => {
                const bindings = getDisplayBindings(id, overrides, isMac);
                return {
                    id,
                    category: getActionDefinition(id).category,
                    label: getActionLabel(id, t),
                    bindings,
                    formatted: bindings.map((b) => formatBinding(b, isMac)),
                };
            }),
            {
                id: TAP_BEATS_ROW_ID,
                category: "timeline",
                label: t("settings.shortcuts.tapBeats"),
                bindings: TAP_BEATS_DIGITS,
                formatted: TAP_BEATS_DIGITS,
            },
        ],
        [overrides, isMac, t],
    );

    const visible = searchItems(rows, query, (row) => [
        row.label,
        ...row.formatted,
    ]);

    return (
        <div className="flex flex-col gap-24">
            <div className="bg-bg-1 sticky top-0 z-10 flex items-center gap-8 pb-8">
                <div className="relative grow">
                    <MagnifyingGlassIcon
                        size={16}
                        aria-hidden
                        className="text-text-subtitle pointer-events-none absolute top-1/2 left-12 -translate-y-1/2"
                    />
                    <Input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={t("settings.shortcuts.search")}
                        aria-label={t("settings.shortcuts.search")}
                        // Hide WebKit's built-in blue clear button; ours below matches the theme.
                        className="w-full pr-36 pl-36 [&::-webkit-search-cancel-button]:appearance-none"
                    />
                    {query !== "" && (
                        <button
                            type="button"
                            className="text-text-subtitle hover:text-text absolute top-1/2 right-8 -translate-y-1/2 rounded-full p-4"
                            aria-label={t("settings.shortcuts.clearSearch")}
                            onClick={() => setQuery("")}
                        >
                            <XIcon size={14} />
                        </button>
                    )}
                </div>
                {Object.keys(overrides).length > 0 && (
                    <Button
                        variant="secondary"
                        size="compact"
                        onClick={() => {
                            setPending(null);
                            resetAll();
                        }}
                    >
                        <T keyName="settings.shortcuts.resetAll" />
                    </Button>
                )}
            </div>

            {visible.length === 0 && (
                <p className="text-body text-text-subtitle px-8 py-8">
                    <T keyName="settings.shortcuts.noResults" />
                </p>
            )}

            {DISPLAY_GROUPS.map(({ id: groupId, categories }) => {
                const groupRows = categories.flatMap((category) =>
                    visible.filter((row) => row.category === category),
                );
                if (groupRows.length === 0) return null;
                return (
                    // Same look as SettingsPanel, but a list, so the rows stay <li>s.
                    <div key={groupId} className="flex flex-col gap-8">
                        <h2 className="text-sub text-text-subtitle font-medium">
                            <T
                                keyName={`settings.shortcuts.category.${groupId}`}
                            />
                        </h2>
                        <ul className="bg-fg-1 rounded-6 divide-stroke flex flex-col divide-y px-16">
                            {groupRows.map((row) =>
                                row.id === TAP_BEATS_ROW_ID ? (
                                    <TapBeatsRow key={row.id} row={row} />
                                ) : (
                                    <ShortcutRow
                                        key={row.id}
                                        row={row as Row & { id: ActionId }}
                                        isOverridden={
                                            overrides[row.id as ActionId] !==
                                            undefined
                                        }
                                        isRecording={recording === row.id}
                                        conflict={
                                            pending?.id === row.id
                                                ? pending
                                                : null
                                        }
                                        t={t}
                                        isMac={isMac}
                                        onStartRecording={() => {
                                            setPending(null);
                                            setRecording(row.id as ActionId);
                                        }}
                                        onRemove={(binding) =>
                                            removeBinding(
                                                row.id as ActionId,
                                                binding,
                                            )
                                        }
                                        onReset={() =>
                                            resetAction(row.id as ActionId)
                                        }
                                        onReassign={() => {
                                            if (!pending) return;
                                            addBinding(
                                                pending.id,
                                                pending.binding,
                                                pending.owners,
                                            );
                                            setPending(null);
                                        }}
                                        onDismissConflict={() =>
                                            setPending(null)
                                        }
                                    />
                                ),
                            )}
                        </ul>
                    </div>
                );
            })}
        </div>
    );
}
