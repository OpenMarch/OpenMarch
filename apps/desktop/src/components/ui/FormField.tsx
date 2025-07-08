import * as Form from "@radix-ui/react-form";
import * as Tooltip from "@radix-ui/react-tooltip";
import { TooltipContents } from "@openmarch/ui";
import { InfoIcon } from "@phosphor-icons/react";
import { twMerge } from "tailwind-merge";
import { clsx } from "clsx";
import { forwardRef } from "react";

interface FormFieldProps {
    label: string;
    children: React.ReactNode;
    tooltip?: string;
    className?: string;
}

const FormField = forwardRef<HTMLDivElement, FormFieldProps>(
    ({ label, children, tooltip, className }, ref) => {
        return (
            <Form.Field
                name={label}
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
                                <TooltipContents side="right">
                                    {tooltip}
                                </TooltipContents>
                            </Tooltip.Root>
                        </Tooltip.TooltipProvider>
                    )}
                </div>
                <Form.Control asChild>{children}</Form.Control>
                <Form.Message
                    match={"valueMissing"}
                    className="text-sub text-red leading-none"
                >
                    Please enter a value.
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
                                <TooltipContents side="right">
                                    {tooltip}
                                </TooltipContents>
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
