import { encode, CodecConfig, cloneConfig } from '../core/Codec';

self.onmessage = (e: MessageEvent) => {
    const { type, imageData, config } = e.data;

    if (type === 'encode') {
        try {
            const ccfg = Object.assign(new CodecConfig(), config);
            const { file, preview, resolvedConfig } = encode(imageData, cloneConfig(ccfg));
            const blob = new Blob([file.buffer as ArrayBuffer], { type: 'application/octet-stream' });
            self.postMessage({ type: 'success', blob, preview, resolvedConfig });
        } catch (error) {
            self.postMessage({ type: 'error', error: (error as Error).message });
        }
    }
};
