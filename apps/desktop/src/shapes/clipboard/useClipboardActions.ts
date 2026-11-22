import tolgee from "@/global/singletons/Tolgee";
import {
    useActionHandler,
    useActionHandlerGroup,
} from "@/shortcuts/useActionHandler";
import { useEditorReadiness } from "@/shortcuts/handlers/useEditorReadiness";
import { useShapeShown } from "../tool/shapeToolStore";
import { copyFormation, pasteFormation } from "./copyPaste";
import {
    clearPicture,
    setPasteAs,
    useCopiedPictureStore,
} from "./pictureStore";
import { useQuery } from "@tanstack/react-query";
import { fieldPropertiesQueryOptions } from "@/hooks/queries/useFieldProperties";
import { pictureSummary } from "./picture";

/**
 * Copy, Paste and Paste exactly (#961), for their keys, the field's menu and the command palette
 * alike. Each needs performers selected (a prop takes no spot), and no shape open and showing:
 * that one is placed or discarded first. The pastes also need something copied. Unavailable,
 * their keys are left alone, so Ctrl/Cmd+C and V keep working on text.
 */
export function useClipboardActions(): void {
    const { ready, selectedPerformers } = useEditorReadiness();
    const shapeShown = useShapeShown();
    const copied = useCopiedPictureStore((s) => s.picture !== null);
    const selected = ready && !shapeShown && selectedPerformers.length > 0;
    const ids = () => selectedPerformers.map((m) => m.id);
    // Why they're greyed out, for the palette and the field menu's ?
    const openShape = () =>
        shapeShown
            ? tolgee.t(
                  "shapes.clipboard.reasonOpenShape",
                  "Place or discard the open shape first",
              )
            : undefined;
    const noSelection = selectedPerformers.length === 0;
    useActionHandler("copyFormation", () => void copyFormation(ids()), {
        enabled: selected,
        ignoreRepeat: true,
        disabledReason: () =>
            !ready
                ? undefined
                : (openShape() ??
                  (noSelection
                      ? tolgee.t(
                            "shapes.clipboard.reasonSelectToCopy",
                            "Select marchers to copy them",
                        )
                      : undefined)),
    });
    useActionHandlerGroup(
        ["pasteFormation", "pasteFormationInPlace"],
        (id) =>
            void pasteFormation(ids(), {
                inPlace: id === "pasteFormationInPlace",
            }),
        {
            enabled: selected && copied,
            ignoreRepeat: true,
            disabledReason: () =>
                !ready
                    ? undefined
                    : (openShape() ??
                      (!copied
                          ? tolgee.t(
                                "shapes.clipboard.reasonNothingCopied",
                                "Copy marchers first",
                            )
                          : noSelection
                            ? tolgee.t(
                                  "shapes.clipboard.reasonSelectToPaste",
                                  "Select the marchers to paste onto",
                              )
                            : undefined)),
        },
    );
    // Empty the clipboard (the Clipboard card's Clear)
    useActionHandler("clearClipboard", clearPicture, {
        enabled: ready && copied,
        ignoreRepeat: true,
        disabledReason: () =>
            ready && !copied
                ? tolgee.t("shapes.clipboard.reasonEmpty", "Nothing is copied")
                : undefined,
    });
    // A copied shape pastes as the shape or as its exact positions (the Clipboard card's switch)
    const picture = useCopiedPictureStore((s) => s.picture);
    const asPositions = useCopiedPictureStore((s) => s.pasteAs === "positions");
    const { data: fieldProperties } = useQuery(fieldPropertiesQueryOptions());
    const stepPx = fieldProperties?.pixelsPerStep;
    const shapeCopied =
        !!picture &&
        !!stepPx &&
        pictureSummary(picture, stepPx).type === "shape";
    useActionHandler(
        "pasteAsPositions",
        () => setPasteAs(asPositions ? "shape" : "positions"),
        {
            enabled: ready && shapeCopied,
            ignoreRepeat: true,
            disabledReason: () =>
                !ready
                    ? undefined
                    : !picture
                      ? tolgee.t(
                            "shapes.clipboard.reasonNothingCopied",
                            "Copy marchers first",
                        )
                      : !shapeCopied
                        ? tolgee.t(
                              "shapes.clipboard.reasonNotAShape",
                              "Copy a whole shape first",
                          )
                        : undefined,
            // Names what it does now: the way back once positions are picked
            label: asPositions
                ? tolgee.t("actions.edit.pasteAsShape")
                : undefined,
        },
    );
}
