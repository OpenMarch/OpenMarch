import { T, useTranslate } from "@tolgee/react";
import { SegmentedTextSwitch } from "@openmarch/ui";
import {
    useWorkspaceViewStore,
    type WorkspaceView,
} from "@/stores/WorkspaceViewStore";
import { useIsBasicMode } from "@/stores/EditorModeStore";
import { usePreviewModeStore } from "@/stores/PreviewModeStore";

const EDITOR = {
    value: "editor",
    label: <T keyName="visuals.workspace.editor" />,
    testId: "workspace-view-editor",
};
const VISUALS = {
    value: "visuals",
    label: <T keyName="visuals.workspace.visuals" />,
    testId: "workspace-view-visuals",
};
const PREVIEW = {
    value: "preview",
    label: <T keyName="visuals.workspace.preview" />,
    testId: "workspace-view-preview",
};

/**
 * Editor, Visuals (performer-behavior.md section 7.1) or Preview, which watches the show without
 * editing it (`PreviewModeStore`). Basic has no Visuals mode (UI-19): Editor or Preview.
 */
export default function WorkspaceViewSwitch({
    className,
}: {
    className?: string;
}) {
    const { t } = useTranslate();
    const basic = useIsBasicMode();
    const view = useWorkspaceViewStore((s) => s.view);
    const setView = useWorkspaceViewStore((s) => s.setView);
    const preview = usePreviewModeStore((s) => s.isPreview);
    const setPreview = usePreviewModeStore((s) => s.setPreview);
    return (
        <SegmentedTextSwitch
            options={basic ? [EDITOR, PREVIEW] : [EDITOR, VISUALS, PREVIEW]}
            selected={preview ? "preview" : basic ? "editor" : view}
            setSelected={(v) => {
                if (v === "preview") {
                    setPreview(true);
                    return;
                }
                setPreview(false);
                setView(v as WorkspaceView);
            }}
            ariaLabel={t("visuals.workspace.label")}
            className={className}
            testId="workspace-view-switch"
        />
    );
}
