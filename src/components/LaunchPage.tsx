import { Button, Col, Row } from "react-bootstrap";

interface LaunchPageProps {
    setDatabaseIsReady: (isReady: boolean) => void;
}

export default function LaunchPage({ setDatabaseIsReady }: LaunchPageProps) {
    async function handleCreateNew() {
        const dataBaseIsReady = await window.electron.databaseCreate();
        setDatabaseIsReady(dataBaseIsReady > 0);
    }

    async function handleOpenExisting() {
        const dataBaseIsReady = await window.electron.databaseLoad();
        setDatabaseIsReady(dataBaseIsReady > 0);
    }

    return (
        <div className="launch-page">
            <h1>Welcome to OpenMarch!</h1>
            <h4>The open source drill writing software project</h4>
            <Row>
                <Col style={{ display: 'flex', flexDirection: 'row', alignItems: 'stretch' }}>
                    <Button style={{ margin: '10px', whiteSpace: 'nowrap' }} onClick={handleCreateNew}>
                        Create New
                    </Button>
                    <Button style={{ margin: '10px', whiteSpace: 'nowrap' }} onClick={handleOpenExisting}>
                        Open Existing
                    </Button>
                </Col>
            </Row>
            <br />
            <p style={{ justifyContent: 'center' }}>
                NOTE: This software is currently not released for production.
            </p>
            <p>
                By using OpenMarch, you accept there may be glitches and quirks that come with using software that is still in development.
            </p>
        </div>
    );
}
