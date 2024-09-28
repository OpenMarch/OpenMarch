import { useSelectedMarcherLinesStore } from "@/stores/selection/SelectedMarcherLineStore";

export default function MarcherLineEditor() {
    const { selectedMarcherLines } = useSelectedMarcherLinesStore();

    return (
        <div>
            {selectedMarcherLines.length > 0 && (
                <div>
                    {selectedMarcherLines.length > 1 ? (
                        // Multiple marcher lines selected
                        <h3 className="pl-4 py-2 text-xl border-0 border-solid border-y-2 border-y-gray-500 bg-gray-700 mt-0">
                            Lines {`(${selectedMarcherLines.length})`}
                        </h3>
                    ) : (
                        <div>
                            <h3 className="pl-4 py-2 text-xl border-0 border-solid border-y-2 border-y-gray-500 bg-gray-700 mt-0">
                                Line
                            </h3>
                            <div>
                                Details {selectedMarcherLines[0].x1},{" "}
                                {selectedMarcherLines[0].y1},{" "}
                                {selectedMarcherLines[0].x2},{" "}
                                {selectedMarcherLines[0].y2}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
