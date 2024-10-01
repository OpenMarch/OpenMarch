import React from "react";
import { useSidebarMenuStore } from "@/stores/ui/sidebarModalStore";

export default function TextFormattingMenu() {
    const { isSidebarModalOpen } = useSidebarMenuStore();
    return (
        <div
            className={`shadow-fg-1 backdrop-blur-32 bg-modal absolute left-0 top-0 z-40 h-full min-h-0 rounded-6 border border-stroke p-32 ${
                isSidebarModalOpen ? "block" : "hidden"
            }`}
        >
            <h2 className="text-h2">Text</h2>
        </div>
    );
}
