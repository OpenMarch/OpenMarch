import { Minus, Square, X } from "@phosphor-icons/react";

export default function TitleBar() {
    const isMacOS = window.electron.isMacOS || false;

    console.log("is macOS: " + isMacOS);

    function WindowsControls() {
        return (
            <div id="windows-icons" className="flex">
                <button
                    className="window-control-btn cursor-pointer px-16 py-8 duration-150 ease-out hover:text-accent"
                    onClick={() => {
                        window.electron.minimizeWindow();
                    }}
                >
                    <Minus size={20} />
                </button>
                <button
                    className="window-control-btn cursor-pointer px-16 py-8 duration-150 ease-out hover:text-accent"
                    onClick={() => {
                        window.electron.maximizeWindow();
                    }}
                >
                    <Square size={20} />
                </button>
                <button
                    className="window-control-btn cursor-pointer px-16 py-8 pr-24 duration-150 ease-out hover:text-red"
                    onClick={() => {
                        window.electron.closeWindow();
                    }}
                >
                    <X size={20} />
                </button>
            </div>
        );
    }
    return (
        <div className="main-app-titlebar flex h-fit w-full items-center justify-between text-text">
            <div
                className={`flex items-center gap-12 px-24 py-8 ${isMacOS && "ml-64"}`}
            >
                <p className="text-body leading-none">OpenMarch</p>
                <p className="text-body leading-none opacity-50">0.0.2</p>
            </div>
            {!isMacOS && <WindowsControls />}
        </div>
    );
}
