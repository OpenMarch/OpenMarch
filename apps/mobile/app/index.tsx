/**
 * @license Business Source License 1.1
 * See LICENSE.txt for usage restrictions and change date.
 */

import FieldGrid from "@/components/FieldGrid";
import * as ScreenOrientation from "expo-screen-orientation";
import { useEffect } from "react";

export default function Index() {
    useEffect(() => {
        ScreenOrientation.lockAsync(
            ScreenOrientation.OrientationLock.LANDSCAPE,
        );
    }, []);
    return <FieldGrid />;
}
