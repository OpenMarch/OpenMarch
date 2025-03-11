import { Button } from "./ui/Button";
import { WarningNote } from "./ui/Note";

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
        <div className="flex h-full min-h-0 w-full min-w-0 gap-6 p-6">
            <div className="flex h-full w-full flex-col items-start justify-center gap-32 p-32">
                <h1 className="text-[4rem] leading-none">
                    Welcome to OpenMarch
                </h1>
                <h4 className="text-h4">The open source drill writing app</h4>
                <div className="flex gap-12">
                    <Button onClick={handleCreateNew}>Create New</Button>
                    <Button onClick={handleOpenExisting} variant="secondary">
                        Open Existing
                    </Button>
                </div>
                <WarningNote>
                    OpenMarch is still in development. By using it, you accept
                    there may be potential glitches and bugs.
                </WarningNote>
            </div>
            <img
                src="/placeholder.jpg"
                alt="Placeholder"
                className="h-full w-full rounded-6"
            />
        </div>
    );
}
