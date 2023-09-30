import MarcherList from "./MarcherList";
import PageList from "./PageList";
import MarcherPageContainer from "./marcherPage/MarcherPageContainer";

function Sidebar() {
    return (
        <div className="sidebar">
            <MarcherList />
            <MarcherPageContainer />
            <PageList />
        </div>
    );
}

export default Sidebar;
