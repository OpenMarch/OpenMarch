import MarcherEditor from "./MarcherEditor";
import PageEditor from "./PageEditor";
import AlignmentEditor from "./AlignmentEditor";
import ShapeEditor from "./ShapeEditor";
import CoordinateRoundingSettings from "../field/CoordinateRoundingSettings";

function Inspector() {
    return (
        <div className="rounded-6 border-stroke bg-fg-1 flex w-xs min-w-0 flex-col gap-8 overflow-y-auto border p-12">
            <p className="text-body text-text/60">Inspector</p>
            <div className="flex flex-col gap-48">
                <PageEditor />
                <MarcherEditor />
                <ShapeEditor />
                <AlignmentEditor />
                <CoordinateRoundingSettings />
            </div>
        </div>
    );
}

export default Inspector;
