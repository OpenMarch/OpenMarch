import { MarcherList } from "./MarcherList";
import { PageDetails } from "./PageDetails";
import { PageList } from "./PageList";
import { ListContainer } from "./ListContainer";

export function Sidebar() {
    return (
        <div className="sidebar">
            <ListContainer header="Marchers">
                <MarcherList />
            </ListContainer>

            <PageDetails />
            <ListContainer header="Pages">
                <PageList />
            </ListContainer>
        </div>
    );
}
