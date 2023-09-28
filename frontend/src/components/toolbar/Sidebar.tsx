import { MarcherList } from "./MarcherList";
import { MarcherPageContainer } from "./marcherPage/MarcherPageContainer";
import { PageList } from "./PageList";

export function Sidebar() {
    return (
        <div className="sidebar">
            <MarcherList />
            <MarcherPageContainer />
            <PageList />
        </div>
    );
}
