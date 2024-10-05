import React from "react";
import { FaX } from "react-icons/fa6";

/** A series of components for a styled form in OpenMarch */

interface GroupProps extends React.HTMLAttributes<HTMLDivElement> {
    className?: string;
    children?: React.ReactNode;
}

/**
 * Use a form group to style the placement of
 *
 * @className string - Additional classes to apply to the label
 * @children React.ReactNode - The content of the label
 * @returns A styled <label> element
 */
export function Group({ className, children, ...rest }: GroupProps) {
    return (
        <div className={`${className} m-1 flex flex-col gap-2`} {...rest}>
            {children}
        </div>
    );
}

interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
    className?: string;
    children: React.ReactNode;
}

/**
 * @className string - Additional classes to apply to the label
 * @children React.ReactNode - The content of the label
 * @returns A styled <label> element
 */
export function Label({ children, className, ...rest }: LabelProps) {
    return (
        <label className={`${className}`} {...rest}>
            {children}
        </label>
    );
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    className?: string;
    isInvalid?: boolean;
    invalidMessage?: string;
}

/**
 * @className string - Additional classes to apply to the input
 * @isInvalid boolean - Whether the input is invalid
 * @invalidMessage string - The message to display if the input is invalid
 * @returns A styled <input> element
 */
export function Input({
    className,
    isInvalid = false,
    invalidMessage = "Enter a valid input",
    ...rest
}: InputProps) {
    return (
        <>
            <input
                className={`rounded p-1 border-solid ${isInvalid ? "ring-red-500 bg-red-100 border-0 ring-2" : "border border-black"} ${className}`}
                {...rest}
            />
            {isInvalid && (
                <p className="text-xs text-red-600 m-0">{invalidMessage}</p>
            )}
        </>
    );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
    className?: string;
    children: React.ReactNode;
    isInvalid?: boolean;
    invalidMessage?: string;
}

/**
 * @className string - Additional classes to apply to the select
 * @isInvalid boolean - Whether the select is invalid
 * @invalidMessage string - The message to display if the select is invalid
 * @children React.ReactNode - The content of the select
 * @returns A styled <select> element
 */
export function Select({
    className,
    isInvalid = false,
    invalidMessage = "Select a valid entry",
    children,
    ...rest
}: SelectProps) {
    return (
        <select
            className={`rounded p-1 ${isInvalid ? "ring-red-500 bg-red-100 border-0 ring-2" : "border border-black"} ${className}`}
            {...rest}
        >
            {children}
        </select>
    );
}

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label: string;
    className?: string;
}

/**
 * @label string - The text to display next to the checkbox
 * @className string - Additional classes to apply to the checkbox
 * @returns A styled <input type="checkbox"> element
 */
export function Check({ label, className, ...rest }: CheckboxProps) {
    return (
        <label className={`flex items-center ${className}`}>
            <input
                type="checkbox"
                className={`rounded p-1 border" border-black ${className}`}
                {...rest}
            />
            <span className="ml-2">{label}</span>
        </label>
    );
}

interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
    className?: string;
    type: "success" | "warning" | "error";
    onClose: () => void;
    dismissible: boolean;
    children: React.ReactNode;
}

export function Alert({
    children,
    className,
    type,
    onClose,
    dismissible,
    ...rest
}: AlertProps) {
    let classNameToUse = `overflow transition-all duration-250 rounded p-2 w-92 h-full ${className ? className : ""}`;
    switch (type) {
        case "success":
            classNameToUse +=
                " bg-green-100 text-green-900 border-green-500 border-2 border-solid";
            break;
        case "warning":
            classNameToUse +=
                " bg-yellow-100 text-yellow-900 border-yellow-500 border-2 border-solid";
            break;
        case "error":
            classNameToUse +=
                " bg-red-100 text-red-900 border-red-500 border-2 border-solid";
            break;
    }
    return (
        <div
            className={`flex ${classNameToUse} alert-${type}`}
            title="form alert"
            {...rest}
        >
            <div className="max-w-[90%] flex-grow">{children}</div>
            <FaX
                className="hover:text-gray-400 cursor-pointer transition-colors duration-150"
                onClick={onClose}
            />
        </div>
    );
}
