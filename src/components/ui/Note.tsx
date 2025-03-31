import React from "react";
import {
    Info,
    CheckCircle,
    Warning,
    SealWarning,
    BugBeetle,
} from "@phosphor-icons/react";

export const InfoNote = ({ children }: { children: React.ReactNode }) => {
    return (
        <div className="flex h-fit w-fit items-center gap-8 px-4 py-2">
            <Info size={24} className="text-text" />
            <p className="text-body leading-none text-text">{children}</p>
        </div>
    );
};

export const SuccessNote = ({ children }: { children: React.ReactNode }) => {
    return (
        <div className="flex h-fit w-fit items-center gap-8 px-4 py-2">
            <CheckCircle size={24} className="text-green" />
            <p className="text-body leading-none text-text">{children}</p>
        </div>
    );
};

export const WarningNote = ({ children }: { children: React.ReactNode }) => {
    return (
        <div className="flex h-fit w-fit items-center gap-8 px-4 py-2">
            <Warning size={24} className="text-text" />
            <p className="text-body leading-none">{children}</p>
        </div>
    );
};
export const BugNote = ({ children }: { children: React.ReactNode }) => {
    return (
        <div className="flex h-fit w-fit items-center gap-8 px-4 py-2">
            <BugBeetle size={24} className="text-text" />
            <p className="text-body leading-none text-text">{children}</p>
        </div>
    );
};

export const DangerNote = ({ children }: { children: React.ReactNode }) => {
    return (
        <div className="flex h-fit w-full items-center gap-8 px-4 py-2">
            <SealWarning size={24} className="text-red" />
            <p className="w-full text-body leading-none text-text">
                {children}
            </p>
        </div>
    );
};
