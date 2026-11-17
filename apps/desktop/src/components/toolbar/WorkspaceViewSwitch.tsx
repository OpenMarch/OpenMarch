import clsx from "clsx";
import { T, useTranslate } from "@tolgee/react";
import { SegmentedTextSwitch } from "@openmarch/ui";
import { usePreviewModeStore } from "@/stores/PreviewModeStore";
import { runAction } from "@/shortcuts/registry";

const OPTIONS = [
    {
        value: "editor",
        label: <T keyName="workspace.editor" />,
        testId: "workspace-view-editor",
    },
    {
        value: "preview",
        label: <T keyName="workspace.preview" />,
        testId: "workspace-view-preview",
    },
];

/** Editor, or Preview, which watches the show without editing it (`PreviewModeStore`). */
export default function WorkspaceViewSwitch({
    className,
}: {
    className?: string;
}) {
    const { t } = useTranslate();
    const preview = usePreviewModeStore((s) => s.isPreview);
    return (
        <SegmentedTextSwitch
            options={OPTIONS}
            selected={preview ? "preview" : "editor"}
            // The same action as Alt+P and the palette (docs/conventions/tablet-parity.md)
            setSelected={(v) => {
                if ((v === "preview") !== preview) runAction("togglePreview");
            }}
            ariaLabel={t("workspace.label")}
            // One line in the touch title bar; the other switches may wrap
            className={clsx("touch:flex-nowrap", className)}
            testId="workspace-view-switch"
        />
    );
}
