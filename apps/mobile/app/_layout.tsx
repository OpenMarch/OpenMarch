/**
 * @license Business Source License 1.1
 * See LICENSE.txt for usage restrictions and change date.
 */

import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";

export default function RootLayout() {
    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <Stack />
        </GestureHandlerRootView>
    );
}
