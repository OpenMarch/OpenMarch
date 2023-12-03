import FileControls from './FileControls';
import ModalLauncher from './ModalLauncher';
import PlaybackControls from './PlaybackControls';
import { Container } from 'react-bootstrap';
import PageList from './page/PageList';
// import MarcherList from './marcher/MarcherList';
import NewMarcherForm from './marcher/NewMarcherForm';

function Topbar() {
    return (
        <Container fluid className="topbar p-3">
            <FileControls />
            <ModalLauncher
                components={[<PageList />]}
                buttonContent="Pages"
                header="Pages"
            />
            <ModalLauncher
                components={[<NewMarcherForm />]}
                buttonContent="Marchers"
                header="Marchers"
            />

            {/* <NewMarcherForm />
            <EditPageForm />
            <EditMarcherPageForm />
            <EditMarcherForm /> */}

            <PlaybackControls />
        </Container>
    );
}

export default Topbar;
