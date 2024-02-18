import { ReactNode, createContext, useContext, useEffect, useState } from 'react';
import { FieldProperties } from '../global/Interfaces';
import { getFieldProperties } from '@/api/api';

// Define the type for the context value
type FieldPropertiesContextProps = {
    fieldProperties: FieldProperties | undefined;
};

const FieldPropertiesContext = createContext<FieldPropertiesContextProps | undefined>(undefined);

export function FieldPropertiesProvider({ children }: { children: ReactNode }) {
    const [fieldProperties, setFieldProperties] = useState<FieldProperties>();

    // Send the selected page to the electron main process
    useEffect(() => {
        getFieldProperties().then((fieldPropertiesResult) => {
            setFieldProperties(fieldPropertiesResult);
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
