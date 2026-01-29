import { Button, ButtonProps } from "@openmarch/ui";
import { LinkBreakIcon } from "@phosphor-icons/react";
import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    updateWorkspaceSettingsMutationOptions,
    workspaceSettingsQueryOptions,
} from "@/hooks/queries/useWorkspaceSettings";
import { conToastError } from "@/utilities/utils";

export default function DetachButton(props: ButtonProps) {
    const [open, setOpen] = useState(false);
    const { onClick, ...restProps } = props;
    const queryClient = useQueryClient();
    const { mutate: updateWorkspaceSettings, isPending } = useMutation(
        updateWorkspaceSettingsMutationOptions(queryClient),
    );
    const { data: workspaceSettings } = useQuery(
        workspaceSettingsQueryOptions(),
    );

    const handleDetach = () => {
        if (!workspaceSettings) {
            conToastError(
                "Failed to detach file from production",
                new Error("Workspace settings not found"),
            );
            return;
        }
        updateWorkspaceSettings({
            ...workspaceSettings,
            otmProductionId: undefined,
        });
        setOpen(false);
    };

    return (
        <Popover.Root open={open} onOpenChange={setOpen}>
            <Popover.Trigger asChild>
                <Button {...restProps} className="w-full">
                    <LinkBreakIcon /> Detach File from Production
                </Button>
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Content
                    className="bg-modal rounded-6 shadow-modal border-stroke z-[1000] flex max-w-[32rem] flex-col gap-12 border p-16 text-center outline-none"
                    side="bottom"
                    sideOffset={8}
                    align="center"
                    onCloseAutoFocus={(e) => {
                        e.preventDefault();
                    }}
                >
                    <div className="text-text text-sm">
                        Are you sure you want to detach this file from the OTM
                        Production? This means you will not be able to upload
                        revisions to the mobile app. You can always re-attach it
                        later
                    </div>
                    <div className="flex gap-8">
                        <Button
                            variant="secondary"
                            onClick={() => setOpen(false)}
                            size="compact"
                            className="w-full"
                            disabled={isPending}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="red"
                            onClick={handleDetach}
                            size="compact"
                            className="w-full"
                            disabled={isPending}
                        >
                            Yes, Detach
                        </Button>
                    </div>
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}
