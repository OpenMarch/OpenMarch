import MarcherEditor from "../marcher/MarcherEditor";
import PageEditor from "../page/PageEditor";

function Sidebar() {
    return (
        <div className="flex w-[15rem] flex-col gap-16 rounded-6 border border-stroke bg-fg-1 p-8">
            <PageEditor />
            <MarcherEditor />
        </div>
    );
}

export default Sidebar;
