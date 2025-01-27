import {
    ReactNode,
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
} from "react";
import FieldProperties from "@/global/classes/FieldProperties";
import { ReadableCoords } from "@/global/classes/ReadableCoords";

// Define the type for the context value
type FieldPropertiesContextProps = {
    fieldProperties: FieldProperties | undefined;
    setFieldProperties: (fieldProperties: FieldProperties) => void;
};

const FieldPropertiesContext = createContext<
    FieldPropertiesContextProps | undefined
>(undefined);

export function FieldPropertiesProvider({ children }: { children: ReactNode }) {
    const [fieldProperties, setFieldPropertiesState] =
        useState<FieldProperties>();

    const setFieldProperties = useCallback(
        (fieldProperties: FieldProperties, updateDatabase = true) => {
            const newFieldProperties = new FieldProperties(fieldProperties);
            if (updateDatabase) {
                window.electron.updateFieldProperties(newFieldProperties);
            }
            setFieldPropertiesState(newFieldProperties);
            // Set the field properties for the ReadableCoords class
            ReadableCoords.setFieldProperties(newFieldProperties);
        },
        [],
    );

    // Fetch the field properties from the main process and set the state
    useEffect(() => {
        window.electron.getFieldProperties().then((fieldPropertiesResult) => {
            const newFieldProperties = new FieldProperties(
                fieldPropertiesResult,
            );
            setFieldProperties(newFieldProperties, false);
        });
    }, [setFieldProperties]);

    // Create the context value object
    const contextValue: FieldPropertiesContextProps = {
        fieldProperties,
        setFieldProperties, // TODO update this in the database
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
