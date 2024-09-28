import { Minus, Square, X } from "@phosphor-icons/react";

export default function TitleBar() {
    return (
        <div className="main-app-titlebar flex h-fit w-full items-center justify-between px-24 py-0 text-text">
            <div className="flex items-center gap-12">
                <p className="text-body leading-none">Status Bar</p>
            </div>
            <div className="flex items-center gap-12">
                <p className="text-body leading-none">OpenMarch</p>
            </div>
        </div>
    );
}
