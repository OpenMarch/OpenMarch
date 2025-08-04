import {
    ReactNode,
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
} from "react";
import { FieldProperties } from "@openmarch/core";
import { ReadableCoords } from "@/global/classes/ReadableCoords";
import {
    getFieldProperties,
    updateFieldProperties,
} from "@/global/classes/FieldProperties";

// Define the type for the context value
type FieldPropertiesContextProps = {
    fieldProperties: FieldProperties | undefined;
    setFieldProperties: (fieldProperties: FieldProperties) => void;
    fetchFieldProperties: () => Promise<void>;
};

const FieldPropertiesContext = createContext<
    FieldPropertiesContextProps | undefined
>(undefined);

export function FieldPropertiesProvider({ children }: { children: ReactNode }) {
    const [fieldProperties, setFieldPropertiesState] =
        useState<FieldProperties>();

    const setFieldProperties = useCallback(
        async (fieldProperties: FieldProperties, updateDatabase = true) => {
            const newFieldProperties = new FieldProperties(fieldProperties);
            if (updateDatabase) {
                await updateFieldProperties(newFieldProperties);
            }
            setFieldPropertiesState(newFieldProperties);
            // Set the field properties for the ReadableCoords class
            ReadableCoords.setFieldProperties(newFieldProperties);
        },
        [],
    );

    const fetchFieldProperties = useCallback(async () => {
        const fieldProperties = await getFieldProperties();
        setFieldProperties(fieldProperties, false);
    }, [setFieldProperties]);

    // Fetch the field properties from the main process and set the state
    useEffect(() => {
        fetchFieldProperties();
    }, [fetchFieldProperties]);

    // Create the context value object
    const contextValue: FieldPropertiesContextProps = {
        fieldProperties,
        setFieldProperties,
        fetchFieldProperties,
    };

    return (
        <FieldPropertiesContext.Provider value={contextValue}>
            {children}
        </FieldPropertiesContext.Provider>
    );
}

export function useFieldProperties() {
    return useContext(FieldPropertiesContext);
}
