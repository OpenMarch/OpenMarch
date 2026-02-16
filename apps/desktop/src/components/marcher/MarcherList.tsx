import {
    RefObject,
    useEffect,
    useMemo,
    useRef,
    useState,
    type MutableRefObject,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ListFormProps } from "../../global/Interfaces";
import Marcher from "@/global/classes/Marcher";
import { SECTIONS, getTranslatedSectionName } from "@/global/classes/Sections";
import { Button } from "@openmarch/ui";
import { TrashIcon } from "@phosphor-icons/react";
import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import { Input } from "@openmarch/ui";
import FormButtons from "../FormButtons";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTriggerText,
} from "@openmarch/ui";
import { AlertDialogAction, AlertDialogCancel } from "@openmarch/ui";
import { T, useTolgee } from "@tolgee/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    allMarchersQueryOptions,
    deleteMarchersMutationOptions,
    updateMarchersMutationOptions,
} from "@/hooks/queries";
import { ModifiedMarcherArgs } from "@/db-functions";

type SectionOption = {
    value: string;
    label: string;
};

// eslint-disable-next-line max-lines-per-function
export default function MarcherList({
    hasHeader = false,
    isEditingStateProp = undefined,
    submitActivatorStateProp = undefined,
    cancelActivatorStateProp = undefined,
}: ListFormProps) {
    const queryClient = useQueryClient();
    const { isOpen } = useSidebarModalStore();
    const [isEditingLocal, setIsEditingLocal] = useState(false);
    const [isEditing, setIsEditing] = isEditingStateProp || [
        isEditingLocal,
        setIsEditingLocal,
    ];
    const { mutate: deleteMarchers } = useMutation(
        deleteMarchersMutationOptions(queryClient),
    );
    const { mutate: updateMarchers } = useMutation(
        updateMarchersMutationOptions(queryClient),
    );
    const { t } = useTolgee();
    const [submitActivator, setSubmitActivator] = submitActivatorStateProp || [
        false,
        undefined,
    ];
    const [cancelActivator, setCancelActivator] = cancelActivatorStateProp || [
        false,
        undefined,
    ];
    const {
        data: marchers,
        isSuccess: marchersSuccess,
        isLoading: marchersLoading,
        isError: marchersError,
    } = useQuery(allMarchersQueryOptions());

    // localMarchers are the marchers that are displayed in the table
    const [localMarchers, setLocalMarchers] = useState<Marcher[]>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const changesRef = useRef<{ [key: number | string]: any }>({});
    const deletionsRef = useRef<number[]>([]);

    async function handleSubmit() {
        setIsEditing(false);

        const modifiedMarchers: ModifiedMarcherArgs[] = [];

        for (const [pageId, changes] of Object.entries(changesRef.current))
            modifiedMarchers.push({ id: Number(pageId), ...changes });

        if (deletionsRef.current.length > 0) {
            const marcherIdsSet = new Set(deletionsRef.current.map((id) => id));
            await deleteMarchers(marcherIdsSet);
        }

        const result = updateMarchers(modifiedMarchers);
        changesRef.current = {};
        deletionsRef.current = [];
        return result;
    }

    function handleDeleteMarcher(marcherId: number) {
        deletionsRef.current.push(marcherId);
        setLocalMarchers(
            localMarchers?.filter((marcher) => marcher.id !== marcherId),
        );
    }

    function handleCancel() {
        setIsEditing(false);
        setLocalMarchers(marchers?.filter((m) => m.type !== "prop"));
        deletionsRef.current = [];
        changesRef.current = {};
    }

    const handleChange = (
        value: string,
        attribute: string,
        marcherId: number,
    ) => {
        // create an entry for the marcher if it doesn't exist
        if (!changesRef.current[marcherId]) changesRef.current[marcherId] = {};

        // record the change
        changesRef.current[marcherId][attribute] = value;
    };

    const sectionOptions = useMemo<SectionOption[]>(() => {
        return Object.values(SECTIONS).map((section) => ({
            value: section.name,
            label: getTranslatedSectionName(section.name, t) ?? section.name,
        }));
    }, [t]);

    const sectionLabelMap = useMemo<Record<string, string>>(() => {
        return sectionOptions.reduce<Record<string, string>>((acc, option) => {
            acc[option.value] = option.label;
            return acc;
        }, {});
    }, [sectionOptions]);

    const selectPlaceholder = t("marchers.list.selectSection");

    // Update local marchers when marchers are fetched (filter out props)
    useEffect(() => {
        setLocalMarchers(marchers?.filter((m) => m.type !== "prop"));
    }, [marchers]);

    // Turn off editing if the modal closes
    useEffect(() => {
        setIsEditing(false);
    }, [isOpen, setIsEditing]);

    // Activate submit with an external activator (like a button in a parent component)
    useEffect(() => {
        if (submitActivator) {
            void handleSubmit();
            setSubmitActivator && setSubmitActivator(false);
        }
        // eslint-disable-next-line
    }, [submitActivator, setSubmitActivator]);

    // Activate cancel with an external activator (like a button in a parent component)
    useEffect(() => {
        if (cancelActivator) {
            handleCancel();
            setCancelActivator && setCancelActivator(false);
        }
        // eslint-disable-next-line
    }, [cancelActivator, setCancelActivator]);

    if (marchersLoading) {
        return <div>Loading...</div>;
    }

    if (marchersError) {
        console.error(marchersError);
        return <div>Error loading marchers</div>;
    }

    if (marchersSuccess && marchers.length > 0)
        return (
            <form
                id={"marcherListForm"}
                onSubmit={(event) => {
                    event.preventDefault();
                    void handleSubmit();
                }}
                className="text-body text-text flex h-full flex-col gap-16 select-text"
            >
                <div className="flex w-full items-center justify-between">
                    <p className="text-body text-text">
                        <T keyName="marchers.listTitle" />
                    </p>
                    <div className="flex gap-8">
                        {!isEditingStateProp &&
                        localMarchers &&
                        marchers.length > 0 ? (
                            <>
                                {deletionsRef.current.length > 0 ? (
                                    <FormButtons
                                        variant="primary"
                                        size="compact"
                                        handleCancel={handleCancel}
                                        editButton={t("marchers.editButton")}
                                        isEditingProp={isEditing}
                                        setIsEditingProp={setIsEditing}
                                        handleSubmit={handleSubmit}
                                        isDangerButton={true}
                                        alertDialogTitle={t(
                                            "marchers.deleteTitle",
                                        )}
                                        alertDialogDescription={t(
                                            "marchers.deleteWarning",
                                            {
                                                marchers: deletionsRef.current
                                                    .map((marcherId) => {
                                                        const marcherName =
                                                            marchers?.find(
                                                                (marcher) =>
                                                                    marcher.id ===
                                                                    marcherId,
                                                            )?.drill_number;
                                                        return (
                                                            marcherName ||
                                                            "Unknown"
                                                        );
                                                    })
                                                    .join(", "),
                                            },
                                        )}
                                        alertDialogActions={
                                            <>
                                                <AlertDialogAction>
                                                    <Button
                                                        variant="red"
                                                        size="compact"
                                                        onClick={handleSubmit}
                                                    >
                                                        <T keyName="marchers.deleteButton" />
                                                    </Button>
                                                </AlertDialogAction>
                                                <AlertDialogCancel>
                                                    <Button
                                                        variant="secondary"
                                                        size="compact"
                                                        onClick={handleCancel}
                                                    >
                                                        <T keyName="marchers.cancelDeleteButton" />
                                                    </Button>
                                                </AlertDialogCancel>
                                            </>
                                        }
                                    />
                                ) : (
                                    <FormButtons
                                        variant="secondary"
                                        size="compact"
                                        handleCancel={handleCancel}
                                        editButton={t("marchers.editButton")}
                                        isEditingProp={isEditing}
                                        setIsEditingProp={setIsEditing}
                                        handleSubmit={handleSubmit}
                                    />
                                )}
                            </>
                        ) : (
                            // exists to ensure default submit behavior
                            <button type="submit" hidden={true} />
                        )}
                    </div>
                </div>
                <div
                    id="table"
                    className="flex min-h-0 w-[27rem] min-w-0 flex-1 flex-col gap-10"
                >
                    {localMarchers && marchers.length > 0 && (
                        <>
                            <div id="key" className="flex items-center gap-4">
                                <div className="w-[13%]">
                                    <p className="text-sub text-text/90 font-mono">
                                        <T keyName="marchers.list.drillNumberTitle" />
                                    </p>
                                </div>
                                <div className="w-[45%]">
                                    <p className="text-sub text-text/90">
                                        <T keyName="marchers.list.sectionTitle" />
                                    </p>
                                </div>
                                <div className="w-[45%]">
                                    <p className="text-sub text-text/90">
                                        <T keyName="marchers.list.nameTitle" />
                                    </p>
                                </div>
                            </div>
                            <VirtualizedMarcherRows
                                localMarchers={localMarchers}
                                isEditing={isEditing}
                                handleChange={handleChange}
                                handleDeleteMarcher={handleDeleteMarcher}
                                sectionOptions={sectionOptions}
                                sectionLabelMap={sectionLabelMap}
                                selectPlaceholder={selectPlaceholder}
                                changesRef={changesRef}
                            />
                        </>
                    )}
                </div>
            </form>
        );
    return (
        <div className="flex flex-col">
            <p className="text-body text-text/90">
                <T keyName="marchers.list.noMarchers" />
            </p>
        </div>
    );
}

interface VirtualizedMarcherRowsProps {
    localMarchers: Marcher[];
    isEditing: boolean;
    handleChange: (value: string, attribute: string, marcherId: number) => void;
    handleDeleteMarcher: (marcherId: number) => void;
    sectionOptions: SectionOption[];
    sectionLabelMap: Record<string, string>;
    selectPlaceholder: string;
    changesRef: RefObject<{ [key: number | string]: unknown }>;
}

const ROW_HEIGHT = 34;

function VirtualizedMarcherRows({
    localMarchers,
    isEditing,
    handleChange,
    handleDeleteMarcher,
    sectionOptions,
    sectionLabelMap,
    selectPlaceholder,
    changesRef,
}: VirtualizedMarcherRowsProps) {
    const parentRef = useRef<HTMLDivElement>(null);

    const rowVirtualizer = useVirtualizer({
        count: localMarchers.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => ROW_HEIGHT,
        overscan: 5,
    });

    return (
        <div
            ref={parentRef}
            className="flex-1 overflow-auto pr-8"
            style={{ minHeight: 0 }}
        >
            <div
                style={{
                    height: `${rowVirtualizer.getTotalSize()}px`,
                    width: "100%",
                    position: "relative",
                }}
            >
                {rowVirtualizer.getVirtualItems().map((virtualItem) => {
                    const marcher = localMarchers[virtualItem.index];
                    return (
                        <div
                            key={marcher.id}
                            style={{
                                position: "absolute",
                                top: 0,
                                left: 0,
                                width: "100%",
                                height: `${virtualItem.size}px`,
                                transform: `translateY(${virtualItem.start}px)`,
                            }}
                        >
                            <MarcherRow
                                marcher={marcher}
                                isEditing={isEditing}
                                onChange={handleChange}
                                onDelete={handleDeleteMarcher}
                                sectionOptions={sectionOptions}
                                sectionLabelMap={sectionLabelMap}
                                selectPlaceholder={selectPlaceholder}
                                changesRef={changesRef}
                            />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

interface MarcherRowProps {
    marcher: Marcher;
    isEditing: boolean;
    onChange: (value: string, attribute: string, marcherId: number) => void;
    onDelete: (marcherId: number) => void;
    sectionOptions: SectionOption[];
    sectionLabelMap: Record<string, string>;
    selectPlaceholder: string;
    changesRef: MutableRefObject<{ [key: number | string]: unknown }>;
}

function MarcherRow({
    marcher,
    isEditing,
    onChange,
    onDelete,
    sectionOptions,
    sectionLabelMap,
    selectPlaceholder,
    changesRef,
}: MarcherRowProps) {
    const pendingChanges =
        (changesRef.current[marcher.id] as Record<string, unknown>) || {};
    const pendingSection =
        (pendingChanges.section as string | undefined) ?? marcher.section;
    const pendingName =
        (pendingChanges.name as string | undefined) ?? marcher.name ?? "";

    const sectionLabel =
        (pendingSection && sectionLabelMap[pendingSection]) ||
        sectionLabelMap[marcher.section] ||
        selectPlaceholder;

    return (
        <div
            data-testid={`marcher row`}
            id={`${marcher.drill_number} marcher row`}
            className="flex items-center gap-4"
        >
            <div className="w-[13%]" data-testid="marcher-drill-number">
                <p className="text-body text-text font-mono">
                    {marcher.drill_prefix + marcher.drill_order}
                </p>
            </div>
            <div className="w-[45%]" data-testid="marcher section">
                {isEditing ? (
                    <Select
                        defaultValue={pendingSection}
                        aria-label="Marcher section input"
                        disabled={!isEditing}
                        onValueChange={(value: string) =>
                            onChange(value, "section", marcher.id)
                        }
                    >
                        <SelectTriggerText label={sectionLabel} />
                        <SelectContent>
                            {sectionOptions.map((section) => (
                                <SelectItem
                                    key={`${marcher.id}-${section.value}`}
                                    value={section.value}
                                >
                                    {section.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                ) : (
                    <p
                        className="text-body text-text"
                        data-testid="marcher-section"
                    >
                        {sectionLabel}
                    </p>
                )}
            </div>
            <div className="flex w-[45%] items-center gap-6">
                {isEditing ? (
                    <Input
                        className="w-full"
                        type="text"
                        compact
                        aria-label="Marcher name input"
                        title="Marcher name input"
                        defaultValue={pendingName}
                        disabled={!isEditing}
                        key={marcher.id}
                        onChange={(event) =>
                            onChange(event.target.value, "name", marcher.id)
                        }
                    />
                ) : (
                    <p
                        className="text-body text-text"
                        data-testid="marcher-name"
                    >
                        {pendingName}
                    </p>
                )}
                {isEditing && (
                    <Button
                        variant="red"
                        size="compact"
                        content="icon"
                        onClick={() => onDelete(marcher.id)}
                    >
                        <TrashIcon size={18} />
                    </Button>
                )}
            </div>
        </div>
    );
}
