import MarcherEditor from "../marcher/MarcherEditor";
import PageEditor from "../page/PageEditor";

function Sidebar({ className = "" }: { className?: string }) {
    return (
        <div className={`box-border bg-gray-800 border-gray-500 border-0 border-r-2 border-solid text-white w-full h-full ${className}`}>
            <PageEditor />
            <MarcherEditor />
        </div>
    );
}

export default Sidebar;
