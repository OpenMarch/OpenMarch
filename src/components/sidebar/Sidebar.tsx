import MarcherLineEditor from "./MarcherLineEditor";
import MarcherEditor from "./MarcherEditor";
import PageEditor from "./PageEditor";
import AlignmentEditor from "./AlignmentEditor";

function Sidebar({ className = "" }: { className?: string }) {
    return (
        <div className={` bg-gray-800 text-white w-full h-full ${className}`}>
            <PageEditor />
            <MarcherEditor />
            <MarcherLineEditor />
            <AlignmentEditor />
        </div>
    );
}

export default Sidebar;
