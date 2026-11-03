import { T, useTranslate } from "@tolgee/react";
import { SegmentedTextSwitch } from "@openmarch/ui";
import { usePreviewModeStore } from "@/stores/PreviewModeStore";

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
    const setPreview = usePreviewModeStore((s) => s.setPreview);
    return (
        <SegmentedTextSwitch
            options={OPTIONS}
            selected={preview ? "preview" : "editor"}
            setSelected={(v) => setPreview(v === "preview")}
            ariaLabel={t("workspace.label")}
            className={className}
            testId="workspace-view-switch"
        />
    );
}
