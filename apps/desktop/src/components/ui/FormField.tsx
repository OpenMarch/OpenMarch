import * as Form from "@radix-ui/react-form";
import * as Tooltip from "@radix-ui/react-tooltip";
import { TooltipClassName } from "@openmarch/ui";
import { InfoIcon } from "@phosphor-icons/react";
import { twMerge } from "tailwind-merge";
import { clsx } from "clsx";
import { forwardRef } from "react";
import { T } from "@tolgee/react";

interface FormFieldProps {
    label: string | React.ReactNode;
    children: React.ReactNode;
    tooltip?: string;
    className?: string;
    name?: string;
}

const FormField = forwardRef<HTMLDivElement, FormFieldProps>(
    ({ label, children, tooltip, className, name }, ref) => {
        // Use name prop if provided, otherwise convert label to string for Form.Field name
        const fieldName = name || (typeof label === "string" ? label : "field");

        return (
            <Form.Field
                name={fieldName}
                className={twMerge(
                    clsx(
                        "flex items-center justify-between gap-6 px-12",
                        className,
                    ),
                )}
                ref={ref}
            >
                <div className="flex items-center gap-4">
                    <Form.Label className="text-body text-text/80 w-full">
                        {label}
                    </Form.Label>
                    {tooltip && (
                        <Tooltip.TooltipProvider>
                            <Tooltip.Root>
                                <Tooltip.Trigger type="button">
                                    <InfoIcon
                                        size={18}
                                        className="text-text/60"
                                    />
                                </Tooltip.Trigger>
                                <Tooltip.Portal>
                                    <Tooltip.Content
                                        className={TooltipClassName}
                                        side="right"
                                    >
                                        {tooltip}
                                    </Tooltip.Content>
                                </Tooltip.Portal>
                            </Tooltip.Root>
                        </Tooltip.TooltipProvider>
                    )}
                </div>
                <Form.Control asChild>{children}</Form.Control>
                <Form.Message
                    match={"valueMissing"}
                    className="text-sub text-red leading-none"
                >
                    <T keyName="formField.valueMissing" />
                </Form.Message>
            </Form.Field>
        );
    },
);

/**
 * Doesn't use the Radix form components, uses static HTML
 */
const StaticFormField = forwardRef<HTMLDivElement, FormFieldProps>(
    ({ label, children, tooltip, className }, ref) => {
        return (
            <div
                className={twMerge(
                    clsx(
                        "flex items-center justify-between gap-6 px-12",
                        className,
                    ),
                )}
                ref={ref}
            >
                <div className="flex items-center gap-4">
                    <label className="text-body text-text/80 w-full">
                        {label}
                    </label>
                    {tooltip && (
                        <Tooltip.TooltipProvider>
                            <Tooltip.Root>
                                <Tooltip.Trigger type="button">
                                    <InfoIcon
                                        size={18}
                                        className="text-text/60"
                                    />
                                </Tooltip.Trigger>
                                <Tooltip.Portal>
                                    <Tooltip.Content
                                        className={TooltipClassName}
                                        side="right"
                                    >
                                        {tooltip}
                                    </Tooltip.Content>
                                </Tooltip.Portal>
                            </Tooltip.Root>
                        </Tooltip.TooltipProvider>
                    )}
                </div>
                {children}
            </div>
        );
    },
);

FormField.displayName = "FormField";
StaticFormField.displayName = "StaticFormField";

export { StaticFormField };
export default FormField;
