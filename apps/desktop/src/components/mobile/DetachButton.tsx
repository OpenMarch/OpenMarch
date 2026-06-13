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
import { T, useTolgee } from "@tolgee/react";

export default function DetachButton(props: ButtonProps) {
    const { t } = useTolgee();
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
                t("mobileExport.detach.failed"),
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
                    <LinkBreakIcon /> <T keyName="mobileExport.detach.button" />
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
                        <T keyName="mobileExport.detach.confirm" />
                    </div>
                    <div className="flex gap-8">
                        <Button
                            variant="secondary"
                            onClick={() => setOpen(false)}
                            size="compact"
                            className="w-full"
                            disabled={isPending}
                        >
                            <T keyName="mobileExport.detach.cancel" />
                        </Button>
                        <Button
                            variant="red"
                            onClick={handleDetach}
                            size="compact"
                            className="w-full"
                            disabled={isPending}
                        >
                            <T keyName="mobileExport.detach.confirmButton" />
                        </Button>
                    </div>
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}
