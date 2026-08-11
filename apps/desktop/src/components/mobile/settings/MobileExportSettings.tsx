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
import DetachButton from "../DetachButton";
import { AudioFileSettings } from "./AudioFileSettings";
import { getGetApiEditorV1ProductionsIdQueryKey } from "@/api/generated/productions/productions";
import { getGetApiEditorV1ProductionsProductionIdAudioFilesQueryOptions } from "@/api/generated/audio-files/audio-files";
import { useTolgee } from "@tolgee/react";

export const MobileExportSettingsDialog = () => {
    const { t } = useTolgee();
    const prefetchSettingsData = usePrefetchSettingsDataFunction();
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="secondary" onMouseOver={prefetchSettingsData}>
                    <GearSixIcon size={16} />{" "}
                    {t("mobileExport.settings.button")}
                </Button>
            </DialogTrigger>
            <DialogContent className="flex w-full max-w-[512px] flex-col gap-16 overflow-y-auto">
                <DialogTitle>{t("mobileExport.settings.title")}</DialogTitle>
                <MobileExportSettingsContent />
            </DialogContent>
        </Dialog>
    );
};

const usePrefetchSettingsDataFunction = () => {
    const { data: production } = useCurrentProduction();
    const productionId = production?.id;
    const queryClient = useQueryClient();

    if (productionId) {
        return () => {
            void queryClient.prefetchQuery(
                getGetApiEditorV1ProductionsProductionIdAudioFilesQueryOptions(
                    productionId,
                ),
            );
        };
    } else {
        return () => {};
    }
};

const MobileExportSettingsContent = () => {
    const { t } = useTolgee();
    const queryClient = useQueryClient();
    const { data: production } = useCurrentProduction();

    if (!production)
        return <div>{t("mobileExport.settings.noProduction")}</div>;

    return (
        <div className="flex flex-col gap-16">
            <AudioFileSettings
                production={production}
                setDefaultAudioFileId={() => {
                    void queryClient.invalidateQueries({
                        queryKey: getGetApiEditorV1ProductionsIdQueryKey(
                            production.id,
                        ),
                    });
                }}
            />
            <section
                className="flex flex-col gap-8"
                aria-describedby="Background image"
            >
                <h3 className="text-body text-text-subtitle font-medium">
                    {t("mobileExport.settings.backgroundImage.title")}
                </h3>
                {production.background_image_url ? (
                    <img
                        src={production.background_image_url}
                        alt={t("mobileExport.settings.backgroundImage.alt")}
                        className="rounded-6 border-stroke bg-bg-1 h-auto w-full border object-contain"
                    />
                ) : (
                    <p className="text-body text-text-disabled">
                        {t("mobileExport.settings.backgroundImage.empty")}
                    </p>
                )}
                <p className="text-sub text-text-subtitle">
                    {t("mobileExport.settings.backgroundImage.help")}
                </p>
            </section>
            <section
                className="flex flex-col gap-8"
                aria-describedby="Detach production"
            >
                <h3 className="text-body text-text-subtitle font-medium">
                    {t("mobileExport.settings.detach.title")}
                </h3>
                <DetachButton variant="secondary" />
            </section>
        </div>
    );
};
