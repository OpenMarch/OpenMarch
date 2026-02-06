import { useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ListFormProps } from "../../global/Interfaces";
import Marcher from "@/global/classes/Marcher";
import { Button, TooltipClassName } from "@openmarch/ui";
import {
    DotsThreeOutlineIcon,
    PencilIcon,
    TrashIcon,
} from "@phosphor-icons/react";
import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import FormButtons from "../FormButtons";
import { AlertDialogAction, AlertDialogCancel } from "@openmarch/ui";
import { T, useTolgee } from "@tolgee/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    allMarchersQueryOptions,
    deleteMarchersMutationOptions,
    updateMarchersMutationOptions,
} from "@/hooks/queries";
import { ModifiedMarcherArgs } from "@/db-functions";
import { MarcherFormContents } from "./MarchersModal";
import {
    Tooltip,
    TooltipContent,
    TooltipPortal,
    TooltipTrigger,
} from "@radix-ui/react-tooltip";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import clsx from "clsx";

// eslint-disable-next-line max-lines-per-function
export default function MarcherList({
    submitActivatorStateProp = undefined,
    cancelActivatorStateProp = undefined,
}: ListFormProps) {
    const queryClient = useQueryClient();
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
        setLocalMarchers(marchers);
        deletionsRef.current = [];
        changesRef.current = {};
    }

    // Update local marchers when marchers are fetched
    useEffect(() => {
        setLocalMarchers(marchers);
    }, [marchers]);

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
                <div className="flex h-32 w-full items-center justify-between">
                    <p className="text-body text-text">
                        <T keyName="marchers.listTitle" />
                    </p>
                    <div className="flex gap-8">
                        {localMarchers &&
                        marchers.length > 0 &&
                        deletionsRef.current.length > 0 ? (
                            <FormButtons
                                variant="primary"
                                size="compact"
                                handleCancel={handleCancel}
                                handleSubmit={handleSubmit}
                                isDangerButton={true}
                                alertDialogTitle={t("marchers.deleteTitle")}
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
                                                return marcherName || "Unknown";
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
                            <div
                                id="key"
                                className="grid grid-cols-[1fr_2fr_2fr_1fr] grid-rows-1"
                            >
                                <div>
                                    <p className="text-sub text-text/90 font-mono">
                                        <T keyName="marchers.list.drillNumberTitle" />
                                    </p>
                                </div>
                                <div>
                                    <p className="text-sub text-text/90">
                                        <T keyName="marchers.list.sectionTitle" />
                                    </p>
                                </div>
                                <div>
                                    <p className="text-sub text-text/90">
                                        <T keyName="marchers.list.nameTitle" />
                                    </p>
                                </div>
                                <div>{/* actions */}</div>
                            </div>
                            <VirtualizedMarcherRows
                                localMarchers={localMarchers}
                                handleDeleteMarcher={handleDeleteMarcher}
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
    handleDeleteMarcher: (marcherId: number) => void;
}

const ROW_HEIGHT = 34;

function VirtualizedMarcherRows({
    localMarchers,
    handleDeleteMarcher,
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
                                onDelete={handleDeleteMarcher}
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
    onDelete: (marcherId: number) => void;
}

function MarcherRow({ marcher, onDelete }: MarcherRowProps) {
    const { setContent } = useSidebarModalStore();
    const [open, setOpen] = useState(false);

    return (
        <div
            data-testid={`marcher row`}
            id={`${marcher.drill_number} marcher row`}
            className="grid-rows-auto grid grid-cols-[1fr_2fr_2fr_1fr]"
        >
            <div data-testid="marcher-drill-number">
                <p className="text-body text-text font-mono">
                    {marcher.drill_prefix + marcher.drill_order}
                </p>
            </div>
            <div data-testid="marcher section">
                <p
                    className="text-body text-text"
                    data-testid="marcher-section"
                >
                    {marcher.section}
                </p>
            </div>
            <div className="truncate">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <p
                            className="text-body text-text truncate"
                            data-testid="marcher-name"
                        >
                            {marcher.name}
                        </p>
                    </TooltipTrigger>
                    <TooltipPortal>
                        <TooltipContent
                            side="bottom"
                            align="start"
                            className={clsx(
                                TooltipClassName,
                                "p-16 break-all whitespace-normal",
                            )}
                        >
                            <p
                                className="text-body text-text"
                                data-testid="marcher-name"
                            >
                                {marcher.name}
                            </p>
                        </TooltipContent>
                    </TooltipPortal>
                </Tooltip>
            </div>
            <div
                className="flex place-content-end gap-8"
                onMouseLeave={() => setOpen(false)}
            >
                <Dropdown.Root open={open} modal={false}>
                    <Dropdown.Trigger
                        onMouseEnter={() => setOpen(true)}
                        asChild
                    >
                        <Button variant="ghost" size="compact" content="icon">
                            <DotsThreeOutlineIcon size={18} />
                        </Button>
                    </Dropdown.Trigger>
                    <Dropdown.Portal>
                        <Dropdown.Content
                            side="right"
                            align="start"
                            className={clsx(
                                TooltipClassName,
                                "p-16 break-all whitespace-normal",
                            )}
                        >
                            <Button
                                variant="ghost"
                                className="hover:text-accent"
                                size="compact"
                                content="text"
                                type="button"
                                onClick={() => {
                                    setContent(
                                        <MarcherFormContents
                                            marcherIdToEdit={marcher.id}
                                        />,
                                        "marchers",
                                    );
                                }}
                            >
                                <PencilIcon size={18} />
                                <T keyName="marchers.list.editButton" />
                            </Button>
                            <Button
                                variant="ghost"
                                className="hover:text-red"
                                size="compact"
                                content="text"
                                type="button"
                                onClick={() => onDelete(marcher.id)}
                            >
                                <TrashIcon size={18} />
                                <T keyName="marchers.list.deleteButton" />
                            </Button>
                        </Dropdown.Content>
                    </Dropdown.Portal>
                </Dropdown.Root>
            </div>
        </div>
    );
}
