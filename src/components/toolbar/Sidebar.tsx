import MarcherEditor from "../marcher/MarcherEditor";
import PageEditor from "../page/PageEditor";

function Sidebar() {
    return (
        <div className="flex flex-col gap-16 rounded-6 border border-stroke bg-fg-1 p-16">
            <PageEditor />
            <MarcherEditor />
        </div>
    );
}

export default Sidebar;
