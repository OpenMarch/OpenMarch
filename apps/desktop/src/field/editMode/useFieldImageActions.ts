import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslate } from "@tolgee/react";
import { toast } from "sonner";
import type { FieldProperties } from "@openmarch/core";
import { db } from "@/global/database/db";
import { setFieldImage } from "@/db-functions/fieldImage";
import { fieldPropertiesKeys } from "@/hooks/queries/useFieldProperties";
import { fieldImageQueryOptions } from "@/view3d/window/useFieldImage";
import { useActionHandler } from "@/shortcuts/useActionHandler";
import { touchSafeAccept } from "@/utilities/fileAccept";
import type { FieldSettingsPatch } from "@/field/edits";

/** Asks for an image file; resolves with its bytes, or null when none was picked */
function pickImage(): Promise<Uint8Array | null> {
    return new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = touchSafeAccept("image/*");
        input.hidden = true;
        input.dataset.testid = "field-image-input";
        // In the page while it's open: some browsers only send `change` to an attached input
        document.body.appendChild(input);
        const done = (bytes: Uint8Array | null) => {
            input.remove();
            resolve(bytes);
        };
        input.addEventListener("change", () => {
            const file = input.files?.[0];
            if (!file) return done(null);
            void file
                .arrayBuffer()
                .then((buffer) => done(new Uint8Array(buffer)))
                .catch(() => done(null));
        });
        input.addEventListener("cancel", () => done(null));
        input.click();
    });
}

/** What importing an image also turns on, so it shows: the image, and its opacity if it's 0 */
export function settingsToShowImage(
    fp: Pick<FieldProperties, "showFieldImage" | "backgroundImageOpacity">,
): FieldSettingsPatch | null {
    const patch: FieldSettingsPatch = {
        ...(fp.showFieldImage ? {} : { showFieldImage: true }),
        ...(fp.backgroundImageOpacity === 0
            ? { backgroundImageOpacity: 1 }
            : {}),
    };
    return Object.keys(patch).length > 0 ? patch : null;
}

/**
 * Import image and Remove image (#824), the field's background image as actions: the Field panel's
 * buttons and the palette run them. Importing also turns the image on (and its opacity up from
 * 0), in the same undo step.
 */
export function useFieldImageActions(fp: FieldProperties | undefined) {
    const { t } = useTranslate();
    const queryClient = useQueryClient();
    const { data: image } = useQuery(fieldImageQueryOptions());
    const hasImage = !!image && image.byteLength > 0;
    const refresh = () =>
        queryClient.invalidateQueries({ queryKey: fieldPropertiesKeys.all });
    const write = async (bytes: Uint8Array | null) => {
        const show = bytes && fp ? settingsToShowImage(fp) : null;
        try {
            await setFieldImage({
                db,
                image: bytes,
                edits: show
                    ? [{ edit: "setFieldSettings", args: { patch: show } }]
                    : [],
            });
        } catch (error) {
            console.error("Field image change failed", error);
            toast.error(t("fieldEdits.issues.invalid"));
        }
        await refresh();
    };

    useActionHandler(
        "fieldEditImportImage",
        () => {
            void pickImage().then((bytes) => bytes && write(bytes));
        },
        { enabled: !!fp },
    );
    useActionHandler("fieldEditRemoveImage", () => void write(null), {
        enabled: hasImage,
    });
}
