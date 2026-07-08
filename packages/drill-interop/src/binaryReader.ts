/**
 * Minimal cursor over a big-endian byte buffer. The drill document stores every
 * multi-byte integer big-endian, matching Java's `DataInputStream`.
 */
export class BinaryReader {
    private readonly view: DataView;
    private readonly bytes: Uint8Array;
    private offset = 0;

    constructor(bytes: Uint8Array) {
        this.bytes = bytes;
        this.view = new DataView(
            bytes.buffer,
            bytes.byteOffset,
            bytes.byteLength,
        );
    }

    get position(): number {
        return this.offset;
    }

    get remaining(): number {
        return this.bytes.byteLength - this.offset;
    }

    seek(offset: number): void {
        this.offset = offset;
    }

    skip(count: number): void {
        this.offset += count;
    }

    u16(): number {
        const value = this.view.getUint16(this.offset, false);
        this.offset += 2;
        return value;
    }

    i32(): number {
        const value = this.view.getInt32(this.offset, false);
        this.offset += 4;
        return value;
    }

    u32(): number {
        const value = this.view.getUint32(this.offset, false);
        this.offset += 4;
        return value;
    }

    /** Reads an unsigned 64-bit integer as a decimal string (avoids precision loss). */
    u64String(): string {
        const high = this.view.getUint32(this.offset, false);
        const low = this.view.getUint32(this.offset + 4, false);
        this.offset += 8;
        return (BigInt(high) * 4294967296n + BigInt(low)).toString();
    }

    /** Reads `length` bytes as a Latin-1/ASCII string without advancing beyond them. */
    ascii(length: number): string {
        let result = "";
        for (let i = 0; i < length; i++) {
            result += String.fromCharCode(this.bytes[this.offset + i]!);
        }
        this.offset += length;
        return result;
    }

    /**
     * Reads `length` bytes as UTF-8. Use this for human-authored text (titles,
     * set notes) that may contain smart quotes, dashes, or accents; reading such
     * bytes as Latin-1 produces mojibake (e.g. `It's` -> `Itâ€™s`).
     */
    utf8(length: number): string {
        const text = BinaryReader.utf8Decoder.decode(
            this.bytes.subarray(this.offset, this.offset + length),
        );
        this.offset += length;
        return text;
    }

    private static readonly utf8Decoder = new TextDecoder("utf-8");

    /** Reads a raw slice of `length` bytes. */
    slice(length: number): Uint8Array {
        const result = this.bytes.subarray(this.offset, this.offset + length);
        this.offset += length;
        return result;
    }

    /** Peeks the next four bytes as an ASCII tag without advancing. */
    peekTag(): string {
        if (this.remaining < 4) return "";
        let result = "";
        for (let i = 0; i < 4; i++) {
            result += String.fromCharCode(this.bytes[this.offset + i]!);
        }
        return result;
    }
}
