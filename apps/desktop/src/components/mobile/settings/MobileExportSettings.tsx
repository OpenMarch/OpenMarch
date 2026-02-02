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
            <DialogContent className="flex w-full max-w-[512px] flex-col gap-16 overflow-y-auto">
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
            <section
                className="flex flex-col gap-8"
                aria-describedby="Background image"
            >
                <h3 className="text-body text-text-subtitle font-medium">
                    Background image
                </h3>
                {production.background_image_url ? (
                    <img
                        src={production.background_image_url}
                        alt="Production background"
                        className="rounded-6 border-stroke bg-bg-1 h-auto w-full border object-contain"
                    />
                ) : (
                    <p className="text-body text-text-disabled">
                        No background image
                    </p>
                )}
                <p className="text-sub text-text-subtitle">
                    The background image is automatically synced when you upload
                    a new revision. To change it, change the background image in
                    field editor and upload a new revision.
                </p>
            </section>
            <section
                className="flex flex-col gap-8"
                aria-describedby="Detach production"
            >
                <h3 className="text-body text-text-subtitle font-medium">
                    Detach production
                </h3>
                <DetachButton variant="secondary" />
            </section>
        </div>
    );
};
