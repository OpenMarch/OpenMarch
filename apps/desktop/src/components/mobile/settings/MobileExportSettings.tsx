import {
    Dialog,
    DialogTrigger,
    Button,
    DialogContent,
    DialogTitle,
} from "@openmarch/ui";
import { GearSixIcon } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentProduction } from "../queries/useProductions";
import { productionKeys } from "../queries/useProductions";
import DetachButton from "../DetachButton";
import { AudioFileSettings } from "./AudioFileSettings";
import { audioFilesByProductionQueryOptions } from "../queries/useAudioFiles";
import { useAccessToken } from "@/auth/useAuth";

export const MobileExportSettingsDialog = () => {
    const prefetchSettingsData = usePrefetchSettingsDataFunction();
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="secondary" onMouseOver={prefetchSettingsData}>
                    <GearSixIcon size={16} /> Settings
                </Button>
            </DialogTrigger>
            <DialogContent className="flex h-fit w-full max-w-[512px] flex-col gap-16">
                <DialogTitle>Mobile app settings</DialogTitle>
                <MobileExportSettingsContent />
            </DialogContent>
        </Dialog>
    );
};

const usePrefetchSettingsDataFunction = () => {
    const { data: production } = useCurrentProduction();
    const productionId = production?.id;
    const { getAccessToken } = useAccessToken();
    const queryClient = useQueryClient();

    if (productionId) {
        return () => {
            void queryClient.prefetchQuery(
                audioFilesByProductionQueryOptions(
                    productionId,
                    getAccessToken,
                ),
            );
        };
    } else {
        return () => {};
    }
};

const MobileExportSettingsContent = () => {
    const queryClient = useQueryClient();
    const { data: production } = useCurrentProduction();

    if (!production) return <div>No production found</div>;

    return (
        <div className="flex flex-col gap-16">
            <AudioFileSettings
                production={production}
                setDefaultAudioFileId={() => {
                    void queryClient.invalidateQueries({
                        queryKey: productionKeys.byId(production.id),
                    });
                }}
            />
            <DetachButton variant="secondary" />
        </div>
    );
};
