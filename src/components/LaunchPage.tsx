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
        <div className="flex bg-gray-700 text-white h-full w-full justify-center flex-col items-center text-center">
            <h1 className="text-5xl font-normal mb-1">Welcome to OpenMarch!</h1>
            <h4 className="font-normal text-xl mt-1">The open source drill writing software project</h4>
            <div className="my-8">
                <button className="btn-primary rounded mx-6 whitespace-nowrap text-lg" onClick={handleCreateNew}>
                    Create New
                </button>
                <button className="btn-primary rounded mx-6 whitespace-nowrap text-lg" onClick={handleOpenExisting}>
                    Open Existing
                </button>
            </div>
            <br />
            <div className="lg:w-2/5 mx-8">
                <p><strong>
                    WARNING - This software is currently not released for production.
                </strong></p>
                <p>
                    By using OpenMarch, you accept there may be glitches and quirks that come with using software that is still in development.
                </p>
            </div>
        </div>
    );
}
