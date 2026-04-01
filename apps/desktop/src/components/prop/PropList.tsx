import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    allPropsQueryOptions,
    deletePropsMutationOptions,
} from "@/hooks/queries";
import {
    AlertDialogAction,
    AlertDialogCancel,
    Button,
    Switch,
} from "@openmarch/ui";
import {
    TrashIcon,
    PencilSimpleIcon,
    EyeIcon,
    EyeSlashIcon,
} from "@phosphor-icons/react";
import { T } from "@tolgee/react";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { dbMarcherToMarcher } from "@/global/classes/Marcher";
import { PropWithMarcher } from "@/global/classes/Prop";
import { useAlertModalStore } from "@/stores/AlertModalStore";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";

/** Resolve effective name-visibility for a single prop */
export function getPropNameVisible(
    propId: number,
    showPropNames: boolean,
    overrides: Record<string, boolean>,
): boolean {
    return overrides[propId.toString()] ?? showPropNames;
}

interface PropListProps {
    onEditProp?: (prop: PropWithMarcher) => void;
}

export default function PropList({ onEditProp }: PropListProps) {
    const queryClient = useQueryClient();
    const { data: props, isLoading } = useQuery(allPropsQueryOptions());
    const deletePropsMutation = useMutation(
        deletePropsMutationOptions(queryClient),
    );
    const { setSelectedMarchers } = useSelectedMarchers()!;
    const { uiSettings, setUiSettings } = useUiSettingsStore();

    const {
        setTitle: setAlertTitle,
        setContent: setAlertContent,
        setActions: setAlertActions,
        setOpen: setAlertOpen,
    } = useAlertModalStore();

    const handleDelete = (propId: number) => {
        setAlertTitle("inspector.prop.deleteConfirmTitle");
        setAlertContent(
            <T keyName="inspector.prop.deleteConfirmDescription" />,
        );
        setAlertActions(
            <div className="flex justify-end gap-16">
                <AlertDialogAction>
                    <Button
                        variant="red"
                        size="compact"
                        onClick={() => {
                            setAlertOpen(false);
                            deletePropsMutation.mutate(new Set([propId]));
                        }}
                    >
                        <T keyName="marchers.deleteButton" />
                    </Button>
                </AlertDialogAction>
                <AlertDialogCancel>
                    <Button
                        variant="secondary"
                        size="compact"
                        onClick={() => setAlertOpen(false)}
                    >
                        <T keyName="marchers.cancelDeleteButton" />
                    </Button>
                </AlertDialogCancel>
            </div>,
        );
        setAlertOpen(true);
    };

    const handleSelect = (prop: PropWithMarcher) => {
        setSelectedMarchers([dbMarcherToMarcher(prop.marcher)]);
    };

    // Derive global checkbox state from effective per-prop visibility
    const allVisibleState = useMemo(() => {
        if (!props || props.length === 0) return false;
        const visibilities = props.map((p) =>
            getPropNameVisible(
                p.id,
                uiSettings.showPropNames,
                uiSettings.propNameOverrides,
            ),
        );
        if (visibilities.every(Boolean)) return "all";
        if (visibilities.every((v) => !v)) return "none";
        return "mixed";
    }, [props, uiSettings.showPropNames, uiSettings.propNameOverrides]);

    const handleGlobalToggle = () => {
        const showAll = allVisibleState !== "all";
        setUiSettings({
            ...uiSettings,
            showPropNames: showAll,
            propNameOverrides: {},
        });
    };

    const handleTogglePropVisibility = (propId: number) => {
        const key = propId.toString();
        const isHidden = !!uiSettings.hiddenPropIds[key];
        setUiSettings({
            ...uiSettings,
            hiddenPropIds: {
                ...uiSettings.hiddenPropIds,
                [key]: !isHidden,
            },
        });
    };

    if (isLoading) {
        return <div className="text-text/50">Loading props...</div>;
    }

    if (!props || props.length === 0) {
        return (
            <div className="text-text/50 py-16 text-center">
                No props yet. Add one to get started.
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-8">
            {/* Global show-all names toggle */}
            <div className="text-text/70 flex items-center justify-between px-4 pb-4 text-sm">
                <span>Show all names</span>
                <Switch
                    checked={allVisibleState === "all"}
                    onCheckedChange={handleGlobalToggle}
                />
            </div>

            {props.map((prop) => {
                const isHidden = !!uiSettings.hiddenPropIds[prop.id.toString()];
                return (
                    <div
                        key={prop.id}
                        className="bg-fg-2 border-stroke hover:bg-fg-3 rounded-6 flex cursor-pointer items-center justify-between border p-12 transition-colors"
                        onClick={() => handleSelect(prop)}
                    >
                        <div className="flex items-center gap-8">
                            <button
                                title={isHidden ? "Show prop" : "Hide prop"}
                                aria-label={
                                    isHidden ? "Show prop" : "Hide prop"
                                }
                                className="text-text/50 hover:text-text shrink-0 transition-colors"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleTogglePropVisibility(prop.id);
                                }}
                            >
                                {isHidden ? (
                                    <EyeSlashIcon size={16} />
                                ) : (
                                    <EyeIcon size={16} />
                                )}
                            </button>
                            <div className="flex flex-col">
                                <span className="font-medium">
                                    {prop.marcher.name ||
                                        `${prop.marcher.drill_prefix}${prop.marcher.drill_order}`}
                                </span>
                                <span className="text-text/50 text-sm">
                                    {prop.surface_type} •{" "}
                                    {prop.default_width?.toFixed(1) || "?"} x{" "}
                                    {prop.default_height?.toFixed(1) || "?"} ft
                                </span>
                            </div>
                        </div>
                        <div className="flex gap-4">
                            {onEditProp && (
                                <Button
                                    variant="secondary"
                                    size="compact"
                                    aria-label="Edit prop"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onEditProp(prop);
                                    }}
                                >
                                    <PencilSimpleIcon size={16} />
                                </Button>
                            )}
                            <Button
                                variant="red"
                                size="compact"
                                aria-label="Delete prop"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(prop.id);
                                }}
                            >
                                <TrashIcon size={16} />
                            </Button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
