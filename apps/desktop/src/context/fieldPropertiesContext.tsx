import {
    ReactNode,
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
} from "react";
import { FieldProperties } from "@openmarch/core/field";
import { ReadableCoords } from "@/global/classes/ReadableCoords";

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

    const fetchFieldProperties = useCallback(async () => {
        window.electron.getFieldProperties().then((fieldPropertiesResult) => {
            if (!fieldPropertiesResult.success) {
                throw new Error(
                    "Could not get field properties " +
                        fieldPropertiesResult.error,
                );
            }
            const newFieldProperties = new FieldProperties(
                fieldPropertiesResult.data,
            );
            setFieldProperties(newFieldProperties, false);
        });
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
