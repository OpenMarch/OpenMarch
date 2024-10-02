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
        <div className="bg-gray-700 flex h-full w-full flex-col items-center justify-center text-center text-white">
            <h1 className="mb-1 text-h1 font-normal">Welcome to OpenMarch!</h1>
            <h4 className="text-xl mt-1 font-normal">
                The open source drill writing software project
            </h4>
            <div className="my-8">
                <button
                    className="btn-primary rounded text-lg mx-6 whitespace-nowrap"
                    onClick={handleCreateNew}
                >
                    Create New
                </button>
                <button
                    className="btn-primary rounded text-lg mx-6 whitespace-nowrap"
                    onClick={handleOpenExisting}
                >
                    Open Existing
                </button>
            </div>
            <br />
            <div className="mx-8 lg:w-2/5">
                <p>
                    <strong>
                        WARNING - This software is currently not released for
                        production.
                    </strong>
                </p>
                <p>
                    By using OpenMarch, you accept there may be glitches and
                    quirks that come with using software that is still in
                    development.
                </p>
            </div>
        </div>
    );
}
