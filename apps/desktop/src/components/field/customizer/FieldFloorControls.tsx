/**
 * The show's floor in Field settings → Image (ADR 0002 D-23, owner decision Q82). "Upload
 * floor…" starts an import through the same review as the Assets panel, pre-filled as a Base
 * floor at the field's size; once the show holds its copy, it becomes the floor, which is the
 * field image in 2D, exports and 3D. "Remove floor" clears it. Both are undoable.
 */
import { useQueryClient } from "@tanstack/react-query";
import { T, useTranslate } from "@tolgee/react";
import { Button } from "@openmarch/ui";
import type { FieldProperties } from "@openmarch/core";
import { db } from "@/global/database/db";
import { setFieldFloor } from "@/db-functions/fieldFloorEdits";
import { useAssetsStore } from "@/components/assets/assetsStore";
import { editorImportClient } from "@/view3d/library/importClient";
import { fieldFloorSize } from "@/view3d/core/field/floorSize";
import { fieldPropertiesKeys } from "@/hooks/queries/useFieldProperties";
import { useShowLibrary } from "@/hooks/queries/useShowLibrary";
import type { ImportedVersion } from "@/view3d/library/showLibraryEmbed";

export default function FieldFloorControls({
    fieldProperties,
}: {
    fieldProperties: FieldProperties;
}) {
    const { t } = useTranslate();
    const queryClient = useQueryClient();
    const reviewing = useAssetsStore((s) => s.review !== null);
    const startImport = useAssetsStore((s) => s.startImport);
    const { data: showItems } = useShowLibrary();
    const floor = fieldProperties.floor;
    const floorName = floor
        ? showItems?.find(
              (item) =>
                  item.itemId === floor.itemId &&
                  item.versionHash === floor.versionHash,
          )?.name
        : undefined;

    const refresh = () =>
        queryClient.invalidateQueries({ queryKey: fieldPropertiesKeys.all });

    const uploadFloor = () => {
        const size = fieldFloorSize(fieldProperties);
        startImport(editorImportClient(), {
            purpose: "artwork",
            context: {
                surface: "baseFloor",
                size: {
                    width: { m: size.widthM },
                    height: { m: size.heightM },
                    source: "slot",
                    templateId: null,
                },
                // An image of another shape keeps it, placed on the field as before
                fit: fieldProperties.imageFillOrFit === "fill" ? "fill" : "fit",
            },
            onEmbedded: async (saved: ImportedVersion[]) => {
                // One floor per show: a multi-page PDF's first page
                const first = saved[0];
                if (!first) return;
                await setFieldFloor({
                    db,
                    floor: {
                        itemId: first.item.id,
                        versionHash: first.versionHash,
                    },
                    // Shown in full, as the old Import Image did
                    patch: { showFieldImage: true, backgroundImageOpacity: 1 },
                });
                await refresh();
            },
        });
    };

    const removeFloor = async () => {
        await setFieldFloor({ db, floor: null });
        await refresh();
    };

    return (
        <div className="flex flex-col gap-8">
            <div
                className="text-sub text-text-subtitle"
                data-testid="field-floor-name"
            >
                {floor ? (
                    (floorName ?? t("fieldProperties.messages.floorUnnamed"))
                ) : (
                    <T keyName="fieldProperties.messages.noFloor" />
                )}
            </div>
            <div className="flex h-fit min-h-0 items-center gap-8">
                <Button
                    tooltipText={t("fieldProperties.tooltips.uploadFloor")}
                    tooltipSide="right"
                    variant="primary"
                    type="button"
                    size="compact"
                    disabled={reviewing}
                    onClick={uploadFloor}
                    data-testid="field-upload-floor"
                >
                    <T keyName="fieldProperties.buttons.uploadFloor" />
                </Button>
                {floor && (
                    <Button
                        variant="secondary"
                        type="button"
                        size="compact"
                        onClick={() => void removeFloor()}
                        data-testid="field-remove-floor"
                    >
                        <T keyName="fieldProperties.buttons.removeFloor" />
                    </Button>
                )}
            </div>
        </div>
    );
}
