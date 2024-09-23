import MarcherLineEditor from "../editors/MarcherLineEditor";
import MarcherEditor from "../marcher/MarcherEditor";
import PageEditor from "../page/PageEditor";

function Sidebar({ className = "" }: { className?: string }) {
    return (
        <div className={`bg-gray-800 text-white w-full h-full ${className}`}>
            <PageEditor />
            <MarcherEditor />
            <MarcherLineEditor />
        </div>
    );
}

export default Sidebar;
