import FileControls from './FileControls';
import PlaybackControls from './PlaybackControls';
import NewMarcherForm from './NewMarcherForm';
import EditPageForm from './EditPageForm';
import { Container } from 'react-bootstrap';
import EditMarcherPageForm from './marcherPage/EditMarcherPageForm';
import EditMarcherForm from './EditMarcherForm';

function Topbar() {
    return (
        <Container fluid className="topbar p-3">
            {/* <FileControls />

            <NewMarcherForm />
            <EditPageForm />
            <EditMarcherPageForm />
            <EditMarcherForm /> */}

            <PlaybackControls />
        </Container>
    );
}

export default Topbar;
