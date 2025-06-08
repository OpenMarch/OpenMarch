import MarcherEditor from "./MarcherEditor";
import PageEditor from "./PageEditor";
import AlignmentEditor from "./AlignmentEditor";
import ShapeEditor from "./ShapeEditor";
import CoordinateRoundingSettings from "../field/CoordinateRoundingSettings";

function Sidebar() {
    return (
        <div className="rounded-6 border-stroke bg-fg-1 flex w-xs min-w-0 flex-col gap-48 overflow-y-scroll border p-12">
            <PageEditor />
            <MarcherEditor />
            <ShapeEditor />
            <AlignmentEditor />
            <div className="flex-grow" />
            <CoordinateRoundingSettings />
        </div>
    );
}

export default Sidebar;
