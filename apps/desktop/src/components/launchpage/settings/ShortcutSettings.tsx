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
    CaretRightIcon,
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

const CATEGORY_ORDER: readonly ActionCategory[] = [
    "file",
    "edit",
    "navigation",
    "playback",
    "movement",
    "alignment",
    "batchEdit",
    "select",
    "cursor",
    "shape",
    "ui",
    "timeline",
];

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
    id: ActionId;
    category: ActionCategory;
    label: string;
    bindings: string[];
    formatted: string[];
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
    row: Row;
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
        <li className="group/row flex flex-col gap-4 py-8">
            <div className="flex min-h-[2rem] items-center justify-between gap-8">
                <span className="text-body text-text-subtitle">
                    {row.label}
                </span>
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
        () =>
            ACTION_IDS.map((id) => {
                const bindings = getDisplayBindings(id, overrides, isMac);
                return {
                    id,
                    category: getActionDefinition(id).category,
                    label: getActionLabel(id, t),
                    bindings,
                    formatted: bindings.map((b) => formatBinding(b, isMac)),
                };
            }),
        [overrides, isMac, t],
    );

    const normalizedQuery = query.trim();
    const visible = searchItems(rows, query, (row) => [
        row.label,
        ...row.formatted,
    ]);

    return (
        <div className="flex flex-col gap-16">
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

            {CATEGORY_ORDER.map((category) => {
                const categoryRows = visible.filter(
                    (row) => row.category === category,
                );
                if (categoryRows.length === 0) return null;
                return (
                    // Re-keyed on search so groups open while searching and collapse again after.
                    <details
                        key={`${category}-${normalizedQuery !== ""}`}
                        open={normalizedQuery !== "" || undefined}
                        className="group/category"
                    >
                        <summary className="text-sub text-text-subtitle hover:text-text flex cursor-pointer list-none items-center gap-6 py-6 select-none [&::-webkit-details-marker]:hidden">
                            <CaretRightIcon
                                size={12}
                                aria-hidden
                                className="transition-transform duration-150 group-open/category:rotate-90"
                            />
                            <T
                                keyName={`settings.shortcuts.category.${category}`}
                            />
                            <span className="text-text-disabled ml-auto tabular-nums">
                                {categoryRows.length}
                            </span>
                        </summary>
                        {/* Same look as SettingsPanel, but a list, so the rows stay <li>s. */}
                        <ul className="bg-fg-1 rounded-6 divide-stroke flex flex-col divide-y px-16">
                            {categoryRows.map((row) => (
                                <ShortcutRow
                                    key={row.id}
                                    row={row}
                                    isOverridden={
                                        overrides[row.id] !== undefined
                                    }
                                    isRecording={recording === row.id}
                                    conflict={
                                        pending?.id === row.id ? pending : null
                                    }
                                    t={t}
                                    isMac={isMac}
                                    onStartRecording={() => {
                                        setPending(null);
                                        setRecording(row.id);
                                    }}
                                    onRemove={(binding) =>
                                        removeBinding(row.id, binding)
                                    }
                                    onReset={() => resetAction(row.id)}
                                    onReassign={() => {
                                        if (!pending) return;
                                        addBinding(
                                            pending.id,
                                            pending.binding,
                                            pending.owners,
                                        );
                                        setPending(null);
                                    }}
                                    onDismissConflict={() => setPending(null)}
                                />
                            ))}
                        </ul>
                    </details>
                );
            })}
        </div>
    );
}
