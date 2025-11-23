import { encode, CodecConfig } from '../core/Codec';

self.onmessage = async (e: MessageEvent) => {
    const { type, imageData, config } = e.data;

    if (type === 'encode') {
        try {
            // Reconstruct CodecConfig from plain object
            const ccfg = new CodecConfig();
            Object.assign(ccfg, config);

            const { blob, preview } = await encode(imageData, ccfg);
            self.postMessage({ type: 'success', blob, preview });
        } catch (error) {
            self.postMessage({ type: 'error', error: (error as Error).message });
        }
    }
};
