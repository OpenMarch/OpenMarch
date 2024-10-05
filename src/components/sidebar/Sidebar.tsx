import MarcherEditor from "@/components/marcher/MarcherEditor";
import PageEditor from "@/components/page/PageEditor";

function Sidebar() {
    return (
        <div className="flex w-[17.5rem] min-w-0 flex-col gap-16 rounded-6 border border-stroke bg-fg-1 p-12">
            <PageEditor />
            <MarcherEditor />
        </div>
    );
}

export default Sidebar;
