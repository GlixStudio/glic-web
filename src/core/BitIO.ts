// Bit-level I/O matching the semantics of the jinahya bit-io library used by the
// original GLIC (MSB-first within bytes; signed ints are two's complement in `bits` bits).

export class BitOutput {
    private buf: Uint8Array = new Uint8Array(4096);
    private len = 0;
    private currentByte = 0;
    private bitCount = 0;

    private ensure(extra: number) {
        if (this.len + extra <= this.buf.length) return;
        let cap = this.buf.length * 2;
        while (cap < this.len + extra) cap *= 2;
        const next = new Uint8Array(cap);
        next.set(this.buf.subarray(0, this.len));
        this.buf = next;
    }

    private pushByte(b: number) {
        this.ensure(1);
        this.buf[this.len++] = b & 0xff;
    }

    writeBoolean(b: boolean) {
        this.writeBits(b ? 1 : 0, 1);
    }

    writeBits(value: number, bits: number) {
        for (let i = bits - 1; i >= 0; i--) {
            const bit = (value >>> i) & 1;
            this.currentByte = (this.currentByte << 1) | bit;
            this.bitCount++;
            if (this.bitCount === 8) {
                this.pushByte(this.currentByte);
                this.currentByte = 0;
                this.bitCount = 0;
            }
        }
    }

    writeInt(unsigned: boolean, bits: number, value: number) {
        if (bits < 1 || bits > 32) throw new Error(`writeInt: invalid bit count ${bits}`);
        if (unsigned) {
            this.writeBits(value, bits);
        } else {
            // two's complement truncated to `bits`
            const mask = bits === 32 ? 0xffffffff : (1 << bits) - 1;
            this.writeBits(value & mask, bits);
        }
    }

    align(bytes: number) {
        if (this.bitCount > 0) {
            this.pushByte(this.currentByte << (8 - this.bitCount));
            this.currentByte = 0;
            this.bitCount = 0;
        }
        while (this.len % bytes !== 0) {
            this.pushByte(0);
        }
    }

    toByteArray(): Uint8Array {
        if (this.bitCount > 0) {
            const res = new Uint8Array(this.len + 1);
            res.set(this.buf.subarray(0, this.len));
            res[this.len] = (this.currentByte << (8 - this.bitCount)) & 0xff;
            return res;
        }
        return this.buf.slice(0, this.len);
    }

    size(): number {
        return this.len + (this.bitCount > 0 ? 1 : 0);
    }
}

export class BitInput {
    private data: Uint8Array;
    private byteIndex = 0;
    private bitIndex = 0; // 0-7, MSB first

    constructor(data: Uint8Array) {
        this.data = data;
    }

    readBoolean(): boolean {
        return this.readBits(1) === 1;
    }

    readBits(bits: number): number {
        let value = 0;
        for (let i = 0; i < bits; i++) {
            if (this.byteIndex >= this.data.length) {
                throw new Error('EOF');
            }
            const bit = (this.data[this.byteIndex] >>> (7 - this.bitIndex)) & 1;
            value = ((value << 1) | bit) >>> 0;
            this.bitIndex++;
            if (this.bitIndex === 8) {
                this.byteIndex++;
                this.bitIndex = 0;
            }
        }
        return value;
    }

    readInt(unsigned: boolean, bits: number): number {
        if (bits < 1 || bits > 32) throw new Error(`readInt: invalid bit count ${bits}`);
        const val = this.readBits(bits);
        if (unsigned || bits === 32) return unsigned ? val : val | 0;
        const signBit = 1 << (bits - 1);
        return val & signBit ? val - (1 << bits) : val;
    }

    align(bytes: number) {
        if (this.bitIndex > 0) {
            this.byteIndex++;
            this.bitIndex = 0;
        }
        while (this.byteIndex % bytes !== 0) {
            this.byteIndex++;
        }
    }
}
