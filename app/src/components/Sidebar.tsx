import MarcherEditor from "./marcher/MarcherEditor";
import PageEditor from "./page/PageEditor";

function Sidebar() {
    return (
        <div className="sidebar">
            <PageEditor />
            <MarcherEditor />
        </div>
    );
}

export default Sidebar;
