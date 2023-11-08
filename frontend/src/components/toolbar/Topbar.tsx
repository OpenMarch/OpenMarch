import FileControls from './FileControls';
import PlaybackControls from './PlaybackControls';
import NewMarcherForm from './NewMarcherForm';
import EditPageForm from './EditPageForm';
import { Container } from 'react-bootstrap';
import EditMarcherPage from './marcherPage/EditMarcherPage';
import EditMarcherForm from './EditMarcherForm';

function Topbar() {
    return (
        <Container fluid className="topbar p-3">
            <FileControls />
            <PlaybackControls />

            <NewMarcherForm />
            <EditPageForm />
            <EditMarcherPage />
            <EditMarcherForm />
        </Container>
    );
}

export default Topbar;
