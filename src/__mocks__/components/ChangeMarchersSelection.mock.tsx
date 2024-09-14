import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useMarcherStore } from "@/stores/MarcherStore";

/**
 * This component should be used for testing purposes only.
 *
 * @returns A component with a list of marchers by json string.
 * This component also lets the user change the selected marchers by checking a box next to their drill number.
 */
export function ChangeMarchersSelection() {
    const { selectedMarchers, setSelectedMarchers } = useSelectedMarchers()!;
    const { marchers } = useMarcherStore();

    return (
        <div>
            <p>Displays all of the information for every object via JSON.</p>
            <p>Changes selected marchers state based on check boxes.</p>
            <ol title="selectedMarchers list">
                {selectedMarchers.map((marcher) => (
                    <li key={marcher.id_for_html}>{JSON.stringify(marcher)}</li>
                ))}
            </ol>
            {marchers.map((marcher) => (
                <div key={marcher.id_for_html}>
                    <label>
                        <input
                            type="checkbox"
                            checked={selectedMarchers.some(
                                (selectedMarcher) =>
                                    selectedMarcher.id === marcher.id
                            )}
                            onChange={() => {
                                if (
                                    selectedMarchers.some(
                                        (selectedMarcher) =>
                                            selectedMarcher.id === marcher.id
                                    )
                                ) {
                                    // If the marcher is already selected, unselect it
                                    setSelectedMarchers(
                                        selectedMarchers.filter(
                                            (selectedMarcher) =>
                                                selectedMarcher.id !==
                                                marcher.id
                                        )
                                    );
                                } else {
                                    // If the marcher is not selected, select it
                                    setSelectedMarchers([
                                        ...selectedMarchers,
                                        marcher,
                                    ]);
                                }
                            }}
                        />
                        {marcher.id_for_html}
                    </label>
                </div>
            ))}
        </div>
    );
}
