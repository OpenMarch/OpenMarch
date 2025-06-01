class Plugin {
    name: string;
    version: string;
    description: string;
    author: string;
    file: string;

    private static plugins: Plugin[] = [];

    static getPlugins(): Plugin[] {
        if (!Plugin.plugins) {
            Plugin.plugins = [];
        }
        return Plugin.plugins;
    }

    constructor(
        name: string,
        version: string,
        description: string,
        author: string,
        file: string,
    ) {
        this.name = name;
        this.version = version;
        this.description = description;
        this.author = author;
        this.file = file;

        Plugin.plugins.push(this);
    }

    equals(pluginMetadata: PluginMetadata): Boolean {
        return (
            this.name === pluginMetadata.name &&
            this.version === pluginMetadata.version &&
            this.description === pluginMetadata.description &&
            this.author === pluginMetadata.author
        );
    }

    static remove(plugin: Plugin) {
        const index = this.plugins.findIndex((p) => p === plugin);
        if (index !== -1) {
            this.plugins.splice(index, 1);
        }
    }

    static getMetadata(code: string): PluginMetadata | null {
        const meta: Record<string, string> = {};
        const metaRegex =
            /^\s*\/\/\s*(Name|Description|Version|Author):\s*(.+)$/gim;
        let match;
        while ((match = metaRegex.exec(code))) {
            meta[match[1].toLowerCase()] = match[2].trim();
        }

        if (meta.name && meta.version && meta.description && meta.author) {
            return {
                name: meta.name,
                version: meta.version,
                description: meta.description,
                author: meta.author,
            };
        } else {
            throw new Error(`Plugin is missing required metadata.`);
        }
    }
}

export interface PluginMetadata {
    name: string;
    version: string;
    description: string;
    author: string;
    download_url?: string;
}

export default Plugin;
