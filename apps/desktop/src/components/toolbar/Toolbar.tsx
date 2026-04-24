import { SegmentedTextSwitch } from "@openmarch/ui";
import EditorToolbar from "@/components/workspace/editor/EditorToolbar";
import LightDesignerToolbar from "@/components/workspace/lightDesigner/LightDesignerToolbar";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useTimingObjects } from "@/hooks";
import { allLightingScenesQueryOptions } from "@/hooks/queries";
import {
    buildOrderedSceneStarts,
    findSceneIdForPageId,
    resolveLightingInspectorSelectedPageId,
} from "@/components/timeline/SceneTimeline.utils";
import { useQuery } from "@tanstack/react-query";
import {
    useWorkspaceViewStore,
    type WorkspaceViewMode,
} from "@/stores/WorkspaceViewStore";

const toolbarModeOptions = [
    { value: "editor", label: "Editor" },
    { value: "lightDesigner", label: "Light Designer" },
];

export default function Toolbar() {
    const mode = useWorkspaceViewStore.use.mode();
    const setMode = useWorkspaceViewStore.use.setMode();
    const { selectedPage, setSelectedPage } = useSelectedPage()!;
    const { pages } = useTimingObjects()!;
    const { data: scenes = [] } = useQuery(allLightingScenesQueryOptions());

    const setSelected = (value: string) => {
        const nextMode = value as WorkspaceViewMode;
        if (nextMode === "lightDesigner" && selectedPage && pages.length > 0) {
            const orderedStarts = buildOrderedSceneStarts(pages, scenes);
            const activeSceneId = findSceneIdForPageId(
                pages,
                orderedStarts,
                selectedPage.id,
            );
            const fallbackStartPageId = orderedStarts[0]?.startPageId;
            const targetStartPageId =
                orderedStarts.find((s) => s.sceneId === activeSceneId)
                    ?.startPageId ?? fallbackStartPageId;
            if (targetStartPageId != null) {
                const pageIdToSelect = resolveLightingInspectorSelectedPageId(
                    pages,
                    targetStartPageId,
                );
                if (pageIdToSelect != null) {
                    setSelectedPage({ id: pageIdToSelect });
                }
            }
        }
        setMode(nextMode);
    };

    return (
        <>
            {mode === "editor" ? <EditorToolbar /> : <LightDesignerToolbar />}
            <SegmentedTextSwitch
                options={toolbarModeOptions}
                selected={mode}
                setSelected={setSelected}
                className="absolute top-0 right-0"
                ariaLabel="Workspace mode"
            />
        </>
    );
}
