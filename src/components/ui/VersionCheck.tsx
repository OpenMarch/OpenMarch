import { useState, useEffect } from "react"; 
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "../ui/Dialog"; 
import { BowlSteam } from "@phosphor-icons/react"; 

import { version as currentVersion } from "../../../package.json";
export default function SettingsModal() { 
    const [isOpen, setIsOpen] = useState(false);
    const [latestVersion, setLatestVersion] = useState<string | null>(null);
    const [changelog, setChangelog] = useState<string | null>(null);
    const [downloadUrls, setDownloadUrls] = useState<any>({});
    const [error, setError] = useState<string | null>(null); 
    const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);

    const fetchLatestVersion = async () => {
        try {
            const response = await fetch('https://api.github.com/repos/OpenMarch/OpenMarch/releases/latest');
            const data = await response.json();
            if (data.tag_name) {
                setLatestVersion(data.tag_name);
                setChangelog(data.body);

                // Check if the installed version is outdated
                if (compareVersions(data.tag_name, currentVersion)) {
                    setIsUpdateAvailable(true);
                } else {
                    setIsUpdateAvailable(false);
                }

                // Find the download URLs for Windows, macOS, and Linux
                const assetUrls: any = {
                    windows: null,
                    mac: null,
                    linux: null,
                };

                data.assets.forEach((asset: any) => {
                    if (asset.name.endsWith(".exe")) {
                        assetUrls.windows = asset.browser_download_url;
                    } else if (asset.name.endsWith(".dmg")) {
                        assetUrls.mac = asset.browser_download_url;
                    } else if (asset.name.endsWith(".AppImage") || asset.name.endsWith(".tar.gz")) {
                        assetUrls.linux = asset.browser_download_url;
                    }
                });

                setDownloadUrls(assetUrls);
            } else {
                setError("Unable to fetch latest version.");
            }
        } catch (err) {
            setError("An error occurred while fetching the version.");
        }
    };

    useEffect(() => {
        setIsOpen(true); // Open popup on app load
        fetchLatestVersion(); // Fetch the latest 
    }, []);

    const compareVersions = (latest: string, current: string): boolean => {
        const latestParts = latest.split('.').map(Number);
        const currentParts = current.split('.').map(Number);
        
        for (let i = 0; i < latestParts.length; i++) {
            if (latestParts[i] > (currentParts[i] || 0)) {
                return true; 
            } else if (latestParts[i] < (currentParts[i] || 0)) {
                return false;
            }
        }
        return false;
    };

    function SettingsModalContents() { 
        return ( 
            <div className="flex flex-col gap-48"> 
                <div className="flex flex-col gap-16"> 
                    <div className="flex w-full items-center justify-between gap-16"> 
                        <p className="text-body">
                            {error ? `Error: ${error}` : `Latest Version: ${latestVersion ?? "Fetching..."}`}
                        </p> 
                    </div> 

                    {/* Displays the changelog if available */}
                    {changelog && (
                        <div className="mt-4 text-sm max-h-[400px] overflow-auto">
                            <h3 className="font-bold">Changelog:</h3>
                            <pre>{changelog}</pre>
                        </div>
                    )}

                    {/* Show the isntall button only if an update is available */}
                    {isUpdateAvailable && downloadUrls.windows && (
                        <button
                            onClick={() => window.open(downloadUrls.windows, "_blank")}
                            className="mt-4 bg-blue-600 text-white py-2 px-4 rounded"
                        >
                            Install Latest Version for Windows
                        </button>
                    )}

                    {isUpdateAvailable && downloadUrls.mac && (
                        <button
                            onClick={() => window.open(downloadUrls.mac, "_blank")}
                            className="mt-4 bg-blue-600 text-white py-2 px-4 rounded"
                        >
                            Install Latest Version for macOS
                        </button>
                    )}

                    {isUpdateAvailable && downloadUrls.linux && (
                        <button
                            onClick={() => window.open(downloadUrls.linux, "_blank")}
                            className="mt-4 bg-blue-600 text-white py-2 px-4 rounded"
                        >
                            Install Latest Version for Linux
                        </button>
                    )}

                    {!isUpdateAvailable && (
                        <p className="mt-4 text-green-500">You are up-to-date!</p>
                    )}
                </div> 
            </div> 
        ); 
    } 
    
    return ( 
        <Dialog open={isOpen} onOpenChange={setIsOpen}> 
            <DialogTrigger
                asChild
                className="titlebar-button flex cursor-pointer items-center gap-6 outline-none duration-150 ease-out hover:text-accent focus-visible:-translate-y-4 disabled:pointer-events-none disabled:opacity-50"
            >
                <BowlSteam size={18} />
            </DialogTrigger>
            <DialogContent className="w-[60rem] max-w-full">
                <DialogTitle>Version Out Of Date!</DialogTitle>
                <SettingsModalContents />
            </DialogContent>
        </Dialog>
    ); 
}
