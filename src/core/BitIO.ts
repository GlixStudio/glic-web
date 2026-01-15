export class BitOutput {
    private buffer: number[] = [];
    private currentByte: number = 0;
    private bitCount: number = 0;

    writeBoolean(b: boolean) {
        this.writeBits(b ? 1 : 0, 1);
    }

    writeBits(value: number, bits: number) {
        for (let i = bits - 1; i >= 0; i--) {
            const bit = (value >>> i) & 1;
            this.currentByte = (this.currentByte << 1) | bit;
            this.bitCount++;
            if (this.bitCount === 8) {
                this.buffer.push(this.currentByte);
                this.currentByte = 0;
                this.bitCount = 0;
            }
        }
    }

    writeInt(unsigned: boolean, bits: number, value: number) {
        if (unsigned) {
            this.writeBits(value, bits);
        } else {
            // Signed: assume 2's complement
            // Mask to bits length
            const mask = (1 << bits) - 1;
            this.writeBits(value & mask, bits);
        }
    }

    align(bytes: number) {
        if (this.bitCount > 0) {
            this.currentByte <<= (8 - this.bitCount);
            this.buffer.push(this.currentByte);
            this.currentByte = 0;
            this.bitCount = 0;
        }
        while (this.buffer.length % bytes !== 0) {
            this.buffer.push(0);
        }
    }

    toByteArray(): Uint8Array {
        // Flush remaining bits if any (though align usually handles this)
        if (this.bitCount > 0) {
            const tempByte = this.currentByte << (8 - this.bitCount);
            return new Uint8Array([...this.buffer, tempByte]);
        }
        return new Uint8Array(this.buffer);
    }

    size(): number {
        return this.buffer.length + (this.bitCount > 0 ? 1 : 0);
    }
}

export class BitInput {
    private data: Uint8Array;
    private byteIndex: number = 0;
    private bitIndex: number = 0; // 0-7, current bit position in byte (MSB first)

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
                throw new Error("EOF");
            }
            const bit = (this.data[this.byteIndex] >>> (7 - this.bitIndex)) & 1;
            value = (value << 1) | bit;
            this.bitIndex++;
            if (this.bitIndex === 8) {
                this.byteIndex++;
                this.bitIndex = 0;
            }
        }
        return value;
    }

    readInt(unsigned: boolean, bits: number): number {
        const val = this.readBits(bits);
        if (unsigned) {
            return val;
        } else {
            // Sign extend
            const signBit = 1 << (bits - 1);
            if (val & signBit) {
                return val - (1 << bits);
            }
            return val;
        }
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
