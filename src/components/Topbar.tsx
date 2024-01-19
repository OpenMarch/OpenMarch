import FileControls from './FileControls';
import PlaybackControls from './PlaybackControls';
import { Container } from 'react-bootstrap';
import MarcherListModal from './marcher/MarcherListModal';
import PageListModal from './page/PageListModal';

function Topbar() {
    return (
        <Container fluid className="topbar p-3">
            <FileControls />
            <MarcherListModal />
            <PageListModal />

            <PlaybackControls />
        </Container>
    );
}

export default Topbar;
