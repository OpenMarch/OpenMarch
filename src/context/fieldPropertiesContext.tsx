import {
    ReactNode,
    createContext,
    useContext,
    useEffect,
    useState,
} from "react";
import FieldProperties from "@/global/classes/FieldProperties";
import { ReadableCoords } from "@/global/classes/ReadableCoords";

// Define the type for the context value
type FieldPropertiesContextProps = {
    fieldProperties: FieldProperties | undefined;
};

const FieldPropertiesContext = createContext<
    FieldPropertiesContextProps | undefined
>(undefined);

export function FieldPropertiesProvider({ children }: { children: ReactNode }) {
    const [fieldProperties, setFieldProperties] = useState<FieldProperties>();

    // Fetch the field properties from the main process and set the state
    useEffect(() => {
        window.electron.getFieldProperties().then((fieldPropertiesResult) => {
            setFieldProperties(fieldPropertiesResult);
            // Set the field properties for the ReadableCoords class
            ReadableCoords.setFieldProperties(fieldPropertiesResult);
        });
    }, []);

    // Create the context value object
    const contextValue: FieldPropertiesContextProps = {
        fieldProperties,
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
