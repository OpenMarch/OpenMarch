import FileControls from './FileControls';
import PlaybackControls from './PlaybackControls';
import NewMarcherForm from './NewMarcherForm';
import EditPageForm from './EditPageForm';
import { Container } from 'react-bootstrap';

function Topbar() {
    return (
        <Container fluid className="topbar p-3">
            <FileControls />
            <PlaybackControls />

            <NewMarcherForm />
            <EditPageForm />
        </Container>
    );
}

export default Topbar;
