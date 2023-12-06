import FileControls from './FileControls';
import ModalLauncher from './ModalLauncher';
import PlaybackControls from './PlaybackControls';
import { Container } from 'react-bootstrap';
import PageList from './page/PageList';
import MarcherListModal from './marcher/MarcherListModal';

function Topbar() {
    return (
        <Container fluid className="topbar p-3">
            <FileControls />
            <ModalLauncher
                components={[<PageList />]}
                launchButton="Pages"
                header="Pages"
            />
            <MarcherListModal />

            {/* <NewMarcherForm />
            <EditPageForm />
            <EditMarcherPageForm />
            <EditMarcherForm /> */}

            <PlaybackControls />
        </Container>
    );
}

export default Topbar;
