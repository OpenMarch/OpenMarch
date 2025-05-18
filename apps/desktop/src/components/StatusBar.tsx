import { useAlignmentEventStore } from "@/stores/AlignmentEventStore";

export default function StatusBar() {
    const { alignmentEvent } = useAlignmentEventStore();
    return (
        <div className="flex h-fit w-full items-center justify-between px-24 py-8 text-text">
            <div className="flex items-center gap-12">
                <p className="text-sub leading-none">
                    Cursor Mode: {alignmentEvent}
                </p>
            </div>
            <div className="flex items-center gap-12">
                <p className="text-sub leading-none">OpenMarch</p>
            </div>
        </div>
    );
}

// -------- theme switcher ---------
