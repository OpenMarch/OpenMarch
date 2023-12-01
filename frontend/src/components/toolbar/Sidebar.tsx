import MarcherEditor from "./MarcherEditor";
import PageEditor from "./PageEditor";

function Sidebar() {
    return (
        <div className="sidebar">
            <PageEditor />
            <MarcherEditor />
        </div>
    );
}

export default Sidebar;
