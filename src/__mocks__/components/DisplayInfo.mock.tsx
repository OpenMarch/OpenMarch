import * as Interface from '@/global/Interfaces';

/**
 * A component that displays all of the information for every object in the array via an unordered list of json strings.
 *
 * This component should be used for testing purposes only.
 *
 * @param objects
 * @returns an unordered list of json strings representing the objects in the array
 */
export function DisplayInfo({ objects }: { objects: Interface.Marcher[] | Interface.Page[] | Interface.MarcherPage[] }) {
    return (
        <div>
            <p>Displays all of the information for every object via JSON</p>
            <ol title='object list'>
                {objects.map((object) => (
                    <li key={object.id_for_html}>
                        {JSON.stringify(object)}
                    </li>
                ))}
            </ol>
        </div>
    );
}
