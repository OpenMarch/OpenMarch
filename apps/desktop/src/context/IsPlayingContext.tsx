import { ReactNode, createContext, useContext, useState } from "react";
import { analytics } from "@/utilities/analytics";

// Define the type for the context value
type IsPlayingContextProps = {
    isPlaying: boolean;
    setIsPlaying: (isPlaying: boolean) => void;
};

const IsPlayingContext = createContext<IsPlayingContextProps | undefined>(
    undefined,
);

export function IsPlayingProvider({ children }: { children: ReactNode }) {
    const [isPlaying, setIsPlaying] = useState<boolean>(false);

    // Create the context value object
    const contextValue: IsPlayingContextProps = {
        isPlaying,
        setIsPlaying: (newIsPlaying) => {
            if (newIsPlaying !== isPlaying) {
                analytics.trackPlaybackState(newIsPlaying);
            }
            setIsPlaying(newIsPlaying);
        },
    };

    return (
        <IsPlayingContext.Provider value={contextValue}>
            {children}
        </IsPlayingContext.Provider>
    );
}

export function useIsPlaying() {
    return useContext(IsPlayingContext);
}
