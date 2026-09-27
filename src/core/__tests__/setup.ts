// Minimal ImageData polyfill for Node-based tests (the codec only touches
// data/width/height).
if (typeof globalThis.ImageData === 'undefined') {
    class NodeImageData {
        readonly data: Uint8ClampedArray;
        readonly width: number;
        readonly height: number;
        readonly colorSpace = 'srgb';

        constructor(dataOrWidth: Uint8ClampedArray | number, widthOrHeight: number, height?: number) {
            if (typeof dataOrWidth === 'number') {
                this.width = dataOrWidth;
                this.height = widthOrHeight;
                this.data = new Uint8ClampedArray(this.width * this.height * 4);
            } else {
                this.data = dataOrWidth;
                this.width = widthOrHeight;
                this.height = height ?? dataOrWidth.length / 4 / widthOrHeight;
            }
        }
    }
    // @ts-expect-error assigning polyfill
    globalThis.ImageData = NodeImageData;
}

export {};
