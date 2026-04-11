import { SegmentedTextSwitch } from "@openmarch/ui";
import EditorToolbar from "@/components/workspace/editor/EditorToolbar";
import LightDesignerToolbar from "@/components/workspace/lightDesigner/LightDesignerToolbar";
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

    const setSelected = (value: string) => {
        setMode(value as WorkspaceViewMode);
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
