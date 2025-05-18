import React from "react";
import {
    InfoIcon,
    CheckCircleIcon,
    WarningIcon,
    SealWarningIcon,
    BugBeetleIcon,
} from "@phosphor-icons/react";

export const InfoNote = ({ children }: { children: React.ReactNode }) => {
    return (
        <div className="flex h-fit w-fit items-center gap-8 px-4 py-2">
            <InfoIcon size={24} />
            <p className="text-body leading-none">{children}</p>
        </div>
    );
};

export const SuccessNote = ({ children }: { children: React.ReactNode }) => {
    return (
        <div className="flex h-fit w-fit items-center gap-8 px-4 py-2">
            <CheckCircleIcon size={24} className="text-green" />
            <p className="text-body leading-none">{children}</p>
        </div>
    );
};

export const WarningNote = ({ children }: { children: React.ReactNode }) => {
    return (
        <div className="flex h-fit w-fit items-center gap-8 px-4 py-2">
            <WarningIcon size={24} className="text-yellow" />
            <p className="text-body leading-none">{children}</p>
        </div>
    );
};

export const DangerNote = ({ children }: { children: React.ReactNode }) => {
    return (
        <div className="flex h-fit w-fit items-center gap-8 px-4 py-2">
            <SealWarningIcon size={24} className="text-red" />
            <p className="text-body leading-none">{children}</p>
        </div>
    );
};

export const BugNote = ({ children }: { children: React.ReactNode }) => {
    return (
        <div className="flex h-fit w-fit items-center gap-8 px-4 py-2">
            <BugBeetleIcon size={24} className="text-accent" />
            <p className="text-body leading-none">{children}</p>
        </div>
    );
};
