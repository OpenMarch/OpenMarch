import MarcherEditor from "../marcher/MarcherEditor";
import PageEditor from "../page/PageEditor";

function Sidebar({ className = "" }: { className?: string }) {
    return (
        <div className={`box-border bg-gray-700 border-gray-500 border-0 border-r-2 border-solid text-white w-full h-full ${className}`}>
            <div className="pl-4">
                <PageEditor />
                <MarcherEditor />
            </div>
        </div>
    );
}

export default Sidebar;
