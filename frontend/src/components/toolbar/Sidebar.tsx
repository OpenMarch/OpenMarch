import { MarcherList } from "./MarcherList";
import { PageDetails } from "./PageDetails";
import { PageList } from "./PageList";
import { ListContainer, handleChildData } from "./ListContainer";

export function Sidebar() {
    return (
        <div className="sidebar">
            <MarcherList />

            <PageDetails />
            <PageList />
        </div>
    );
}
