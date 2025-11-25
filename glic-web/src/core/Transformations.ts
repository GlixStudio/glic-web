import wt from 'discrete-wavelets';
import { customDwt, customIdwt, getCustomWaveletFilters, isCustomWavelet } from './CustomWavelets';

export const TRANSTYPE_RANDOM = -1;
export const TRANSTYPE_FWT = 0;
export const TRANSTYPE_WPT = 1;
export const TRANSTYPENO = 2;

export const WAVELET_RANDOM = -1;
export const WAVELET_NONE = 0;
export const HAARORTHOGONAL = 1; // Haar
export const BIORTHOGONAL11 = 2; // bior1.1
export const BIORTHOGONAL13 = 3; // bior1.3
export const BIORTHOGONAL15 = 4; // bior1.5
export const BIORTHOGONAL22 = 5; // bior2.2
export const BIORTHOGONAL24 = 6; // bior2.4
export const BIORTHOGONAL26 = 7; // bior2.6
export const BIORTHOGONAL28 = 8; // bior2.8
export const BIORTHOGONAL31 = 9; // bior3.1
export const BIORTHOGONAL33 = 10; // bior3.3
export const BIORTHOGONAL35 = 11; // bior3.5
export const BIORTHOGONAL37 = 12; // bior3.7
export const BIORTHOGONAL39 = 13; // bior3.9
export const BIORTHOGONAL44 = 14; // bior4.4
export const BIORTHOGONAL55 = 15; // bior5.5
export const BIORTHOGONAL68 = 16; // bior6.8
export const COIFLET1 = 17; // coif1
export const COIFLET2 = 18; // coif2
export const COIFLET3 = 19; // coif3
export const COIFLET4 = 20; // coif4
export const COIFLET5 = 21; // coif5
export const SYMLET2 = 22; // sym2
export const SYMLET3 = 23; // sym3
export const SYMLET4 = 24; // sym4
export const SYMLET5 = 25; // sym5
export const SYMLET6 = 26; // sym6
export const SYMLET7 = 27; // sym7
export const SYMLET8 = 28; // sym8
export const SYMLET9 = 29; // sym9
export const SYMLET10 = 30; // sym10
export const SYMLET11 = 31; // sym11
export const SYMLET12 = 32; // sym12
export const SYMLET13 = 33; // sym13
export const SYMLET14 = 34; // sym14
export const SYMLET15 = 35; // sym15
export const SYMLET16 = 36; // sym16
export const SYMLET17 = 37; // sym17
export const SYMLET18 = 38; // sym18
export const SYMLET19 = 39; // sym19
export const SYMLET20 = 40; // sym20
export const LEGENDRE1 = 41; // Not supported directly, mapping to nearest or Haar
export const LEGENDRE2 = 42;
export const LEGENDRE3 = 43;
export const DAUBECHIES2 = 44; // db2
export const DAUBECHIES3 = 45; // db3
export const DAUBECHIES4 = 46; // db4
export const DAUBECHIES5 = 47; // db5
export const DAUBECHIES6 = 48; // db6
export const DAUBECHIES7 = 49; // db7
export const DAUBECHIES8 = 50; // db8
export const DAUBECHIES9 = 51; // db9
export const DAUBECHIES10 = 52; // db10
export const DAUBECHIES11 = 53; // db11
export const DAUBECHIES12 = 54; // db12
export const DAUBECHIES13 = 55; // db13
export const DAUBECHIES14 = 56; // db14
export const DAUBECHIES15 = 57; // db15
export const DAUBECHIES16 = 58; // db16
export const DAUBECHIES17 = 59; // db17
export const DAUBECHIES18 = 60; // db18
export const DAUBECHIES19 = 61; // db19
export const DAUBECHIES20 = 62; // db20
export const BATTLE23 = 63; // Not supported
export const CDF53 = 64; // Not supported
export const CDF97 = 65; // Not supported
export const DISCRETEMAYER = 66; // dmey
export const HAAR = 67; // haar

export const WAVELETNO = 68;

// List of supported wavelets by discrete-wavelets library
// Note: Some higher-order wavelets (sym9+, some db16+) may fail at runtime
// The caching mechanism will automatically fallback to a random working wavelet if a wavelet fails
// Custom wavelets (cdf53, cdf97, battle23, legendre1-3) are implemented separately
const SUPPORTED_WAVELETS = new Set([
    'haar', 'db2', 'db3', 'db4', 'db5', 'db6', 'db7', 'db8', 'db9', 'db10',
    'db11', 'db12', 'db13', 'db14', 'db15', 'db16', 'db17', 'db18', 'db19', 'db20',
    'coif1', 'coif2', 'coif3', 'coif4', 'coif5',
    'sym2', 'sym3', 'sym4', 'sym5', 'sym6', 'sym7', 'sym8', 'sym9', 'sym10',
    'sym11', 'sym12', 'sym13', 'sym14', 'sym15', 'sym16', 'sym17', 'sym18', 'sym19', 'sym20',
    'bior1.1', 'bior1.3', 'bior1.5', 'bior2.2', 'bior2.4', 'bior2.6', 'bior2.8',
    'bior3.1', 'bior3.3', 'bior3.5', 'bior3.7', 'bior3.9', 'bior4.4', 'bior5.5', 'bior6.8',
    // Note: 'dmey' is listed here but may fail - custom implementation available
    'dmey',
    // Custom wavelets (not supported by discrete-wavelets)
    'cdf53', 'cdf97', 'battle23', 'legendre1', 'legendre2', 'legendre3', 'sym9', 'bior3.1', 'dmey'
]);

// List of reliable wavelets that are known to work well (for random fallback)
// These are the most stable wavelets that rarely fail
// Prefer library wavelets over custom ones for maximum reliability
const RELIABLE_LIBRARY_WAVELETS = [
    'haar', 'db2', 'db3', 'db4', 'db5', 'db6', 'db7', 'db8',
    'coif1', 'coif2', 'coif3',
    'sym2', 'sym3', 'sym4', 'sym5', 'sym6', 'sym7', 'sym8',
    'bior1.1', 'bior1.3', 'bior2.2', 'bior2.4'
];

// Custom wavelets that are known to be stable (used as secondary fallback)
const RELIABLE_CUSTOM_WAVELETS = [
    'cdf53', 'cdf97'
];

// Get a random working wavelet for fallback
// Prefers library wavelets for maximum reliability, but can fall back to stable custom wavelets
function getRandomWorkingWavelet(preferLibrary: boolean = true): string {
    if (preferLibrary && RELIABLE_LIBRARY_WAVELETS.length > 0) {
        const randomIndex = Math.floor(Math.random() * RELIABLE_LIBRARY_WAVELETS.length);
        return RELIABLE_LIBRARY_WAVELETS[randomIndex];
    } else if (RELIABLE_CUSTOM_WAVELETS.length > 0) {
        const randomIndex = Math.floor(Math.random() * RELIABLE_CUSTOM_WAVELETS.length);
        return RELIABLE_CUSTOM_WAVELETS[randomIndex];
    }
    // Ultimate fallback
    return 'haar';
}

// Get wavelet display name for UI (includes ID)
export function getWaveletDisplayName(id: number): string {
    if (id === WAVELET_RANDOM) return 'Random (-1)';
    if (id === WAVELET_NONE) return 'None (0)';
    
    const name = getWaveletName(id);
    // Format: "WaveletName (ID)"
    const formatted = name.charAt(0).toUpperCase() + name.slice(1).replace(/([A-Z])/g, ' $1');
    return `${formatted} (${id})`;
}

export const getWaveletName = (id: number): string => {
    switch (id) {
        case HAARORTHOGONAL: return "haar";
        case BIORTHOGONAL11: return "bior1.1";
        case BIORTHOGONAL13: return "bior1.3";
        case BIORTHOGONAL15: return "bior1.5";
        case BIORTHOGONAL22: return "bior2.2";
        case BIORTHOGONAL24: return "bior2.4";
        case BIORTHOGONAL26: return "bior2.6";
        case BIORTHOGONAL28: return "bior2.8";
        case BIORTHOGONAL31: return "bior3.1";
        case BIORTHOGONAL33: return "bior3.3";
        case BIORTHOGONAL35: return "bior3.5";
        case BIORTHOGONAL37: return "bior3.7";
        case BIORTHOGONAL39: return "bior3.9";
        case BIORTHOGONAL44: return "bior4.4";
        case BIORTHOGONAL55: return "bior5.5";
        case BIORTHOGONAL68: return "bior6.8";
        case COIFLET1: return "coif1";
        case COIFLET2: return "coif2";
        case COIFLET3: return "coif3";
        case COIFLET4: return "coif4";
        case COIFLET5: return "coif5";
        case SYMLET2: return "sym2";
        case SYMLET3: return "sym3";
        case SYMLET4: return "sym4";
        case SYMLET5: return "sym5";
        case SYMLET6: return "sym6";
        case SYMLET7: return "sym7";
        case SYMLET8: return "sym8";
        case SYMLET9: return "sym9";
        case SYMLET10: return "sym10";
        case SYMLET11: return "sym11";
        case SYMLET12: return "sym12";
        case SYMLET13: return "sym13";
        case SYMLET14: return "sym14";
        case SYMLET15: return "sym15";
        case SYMLET16: return "sym16";
        case SYMLET17: return "sym17";
        case SYMLET18: return "sym18";
        case SYMLET19: return "sym19";
        case SYMLET20: return "sym20";
        // Legendre wavelets - custom implementation
        case LEGENDRE1: return "legendre1";
        case LEGENDRE2: return "legendre2";
        case LEGENDRE3: return "legendre3";
        case DAUBECHIES2: return "db2";
        case DAUBECHIES3: return "db3";
        case DAUBECHIES4: return "db4";
        case DAUBECHIES5: return "db5";
        case DAUBECHIES6: return "db6";
        case DAUBECHIES7: return "db7";
        case DAUBECHIES8: return "db8";
        case DAUBECHIES9: return "db9";
        case DAUBECHIES10: return "db10";
        case DAUBECHIES11: return "db11";
        case DAUBECHIES12: return "db12";
        case DAUBECHIES13: return "db13";
        case DAUBECHIES14: return "db14";
        case DAUBECHIES15: return "db15";
        case DAUBECHIES16: return "db16";
        case DAUBECHIES17: return "db17";
        case DAUBECHIES18: return "db18";
        case DAUBECHIES19: return "db19";
        case DAUBECHIES20: return "db20";
        // Battle-Lemarié and CDF wavelets - custom implementation
        case BATTLE23: return "battle23";
        case CDF53: return "cdf53";
        case CDF97: return "cdf97";
        case DISCRETEMAYER: return "dmey";
        case HAAR: return "haar";
        default: 
            // ID 68 is out of range (valid: -1 to 67), treat as invalid
            if (id === 68) {
                console.warn(`[WaveletTransform] Wavelet ID 68 is out of range (valid: -1 to 67), falling back to haar`);
            } else {
                console.warn(`[WaveletTransform] Unknown wavelet ID: ${id}, falling back to haar`);
            }
            return "haar"; // Fallback
    }
};

// Validate and potentially fix wavelet name
const validateWavelet = (waveletName: string, originalId: number): string => {
    if (SUPPORTED_WAVELETS.has(waveletName)) {
        return waveletName;
    }
    // If not supported, log warning and fallback to haar
    console.warn(`[WaveletTransform] Wavelet "${waveletName}" (ID: ${originalId}) is not supported by discrete-wavelets, falling back to "haar"`);
    return "haar";
};

export class WaveletTransform {
    wavelet: string;
    type: number;
    originalWaveletId: number;
    private _workingWavelet: string | null = null; // Cached working wavelet after first failure

    constructor(type: number, waveletId: number) {
        this.type = type;
        this.originalWaveletId = waveletId;
        const waveletName = getWaveletName(waveletId);
        this.wavelet = validateWavelet(waveletName, waveletId);
        
        // Log if fallback was used
        if (this.wavelet !== waveletName) {
            console.warn(`[WaveletTransform] Wavelet ID ${waveletId} mapped to "${this.wavelet}" (original: "${waveletName}")`);
        }
    }

    getName(): string {
        const displayWavelet = this._workingWavelet || this.wavelet;
        return `${displayWavelet} (${this.type === TRANSTYPE_FWT ? 'FWT' : 'WPT'})`;
    }

    // Get the working wavelet (use cached fallback if available)
    private getWorkingWavelet(): string {
        return this._workingWavelet || this.wavelet;
    }

    // Safe wrapper for dwt with error handling and caching
    private safeDwt(data: number[], wavelet: string): number[][] {
        // Use cached working wavelet if available
        const workingWavelet = this._workingWavelet || wavelet;
        
        // Check if this is a custom wavelet
        if (isCustomWavelet(workingWavelet)) {
            // Special case: dmey uses db20 as approximation (they're very similar)
            if (workingWavelet === 'dmey') {
                try {
                    return wt.dwt(data, 'db20');
                } catch (error) {
                    const fallback = getRandomWorkingWavelet();
                    console.warn(`[WaveletTransform] dmey approximation (db20) failed, using random fallback: ${fallback}`);
                    if (this._workingWavelet) {
                        throw error;
                    }
                    this._workingWavelet = fallback;
                    return wt.dwt(data, fallback);
                }
            }
            
            const filters = getCustomWaveletFilters(workingWavelet);
            if (filters) {
                try {
                    return customDwt(data, filters);
                } catch (error) {
                    const fallback = getRandomWorkingWavelet();
                    console.error(`[WaveletTransform] Error in custom dwt with wavelet "${workingWavelet}":`, error);
                    // Fallback to random working wavelet
                    if (this._workingWavelet) {
                        throw error;
                    }
                    this._workingWavelet = fallback;
                    return wt.dwt(data, fallback);
                }
            }
        }
        
        // Try library implementation first
        try {
            return wt.dwt(data, workingWavelet);
        } catch (error) {
            // If library fails, check if we have a custom implementation available
            if (!this._workingWavelet && isCustomWavelet(workingWavelet)) {
                // This shouldn't happen as we check above, but just in case
                const filters = getCustomWaveletFilters(workingWavelet);
                if (filters) {
                    try {
                        console.warn(`[WaveletTransform] Library failed for "${wavelet}", using custom implementation`);
                        return customDwt(data, filters);
                    } catch (customError) {
                        // Custom also failed, continue to fallback
                    }
                }
            }
            
            // If we're already using a fallback and it fails, something is seriously wrong
            if (this._workingWavelet) {
                console.error(`[WaveletTransform] Even fallback wavelet "${this._workingWavelet}" failed!`, error);
                throw error;
            }
            
            // First failure: check if custom implementation exists for this wavelet
            const customFilters = getCustomWaveletFilters(workingWavelet);
            if (customFilters) {
                try {
                    console.warn(`[WaveletTransform] Library failed for "${wavelet}" (ID: ${this.originalWaveletId}), using custom implementation`);
                    this._workingWavelet = workingWavelet; // Mark as using custom
                    return customDwt(data, customFilters);
                } catch (customError) {
                    console.error(`[WaveletTransform] Custom implementation also failed for "${wavelet}":`, customError);
                }
            }
            
            // No custom implementation available, use random fallback
            const fallback = getRandomWorkingWavelet();
            console.warn(`[WaveletTransform] Wavelet "${wavelet}" (ID: ${this.originalWaveletId}) failed in discrete-wavelets library. No custom implementation available. Caching random fallback: "${fallback}"`);
            this._workingWavelet = fallback;
            
            try {
                return wt.dwt(data, fallback);
            } catch (fallbackError) {
                console.error(`[WaveletTransform] Even fallback wavelet "${fallback}" failed!`, fallbackError);
                throw fallbackError;
            }
        }
    }

    // Safe wrapper for idwt with error handling and caching
    private safeIdwt(cA: number[], cD: number[], wavelet: string): number[] {
        // Use cached working wavelet if available
        const workingWavelet = this._workingWavelet || wavelet;
        
        // Check if this is a custom wavelet
        if (isCustomWavelet(workingWavelet)) {
            // Special case: dmey uses db20 as approximation (they're very similar)
            if (workingWavelet === 'dmey') {
                try {
                    return wt.idwt(cA, cD, 'db20');
                } catch (error) {
                    const fallback = getRandomWorkingWavelet();
                    console.warn(`[WaveletTransform] dmey approximation (db20) failed, using random fallback: ${fallback}`);
                    if (this._workingWavelet) {
                        throw error;
                    }
                    this._workingWavelet = fallback;
                    return wt.idwt(cA, cD, fallback);
                }
            }
            
            const filters = getCustomWaveletFilters(workingWavelet);
            if (filters) {
                try {
                    return customIdwt(cA, cD, filters);
                } catch (error) {
                    const fallback = getRandomWorkingWavelet();
                    console.error(`[WaveletTransform] Error in custom idwt with wavelet "${workingWavelet}":`, error);
                    // Fallback to random working wavelet
                    if (this._workingWavelet) {
                        throw error;
                    }
                    this._workingWavelet = fallback;
                    return wt.idwt(cA, cD, fallback);
                }
            }
        }
        
        // Try library implementation first
        try {
            return wt.idwt(cA, cD, workingWavelet);
        } catch (error) {
            // If library fails, check if we have a custom implementation available
            if (!this._workingWavelet && isCustomWavelet(workingWavelet)) {
                // This shouldn't happen as we check above, but just in case
                const filters = getCustomWaveletFilters(workingWavelet);
                if (filters) {
                    try {
                        console.warn(`[WaveletTransform] Library failed for "${wavelet}", using custom implementation`);
                        return customIdwt(cA, cD, filters);
                    } catch (customError) {
                        // Custom also failed, continue to fallback
                    }
                }
            }
            
            // If we're already using a fallback and it fails, something is seriously wrong
            if (this._workingWavelet) {
                console.error(`[WaveletTransform] Even fallback wavelet "${this._workingWavelet}" failed!`, error);
                throw error;
            }
            
            // First failure: check if custom implementation exists for this wavelet
            const customFilters = getCustomWaveletFilters(workingWavelet);
            if (customFilters) {
                try {
                    console.warn(`[WaveletTransform] Library failed for "${wavelet}" (ID: ${this.originalWaveletId}), using custom implementation`);
                    this._workingWavelet = workingWavelet; // Mark as using custom
                    return customIdwt(cA, cD, customFilters);
                } catch (customError) {
                    console.error(`[WaveletTransform] Custom implementation also failed for "${wavelet}":`, customError);
                }
            }
            
            // No custom implementation available, use random fallback
            const fallback = getRandomWorkingWavelet();
            console.warn(`[WaveletTransform] Wavelet "${wavelet}" (ID: ${this.originalWaveletId}) failed in discrete-wavelets library. No custom implementation available. Caching random fallback: "${fallback}"`);
            this._workingWavelet = fallback;
            
            try {
                return wt.idwt(cA, cD, fallback);
            } catch (fallbackError) {
                console.error(`[WaveletTransform] Even fallback wavelet "${fallback}" failed!`, fallbackError);
                throw fallbackError;
            }
        }
    }

    forward(data: number[][]): number[][] {
        // Flatten 2D array to 1D for discrete-wavelets if needed, or use their 2D support
        // discrete-wavelets supports dwt2 (2D DWT)
        // But GLIC uses JWave which might do multi-level decomposition?
        // GLIC's FastWaveletTransform usually implies multi-level.
        // discrete-wavelets `dwt` is single level. `wavedec` is multi-level.
        // For 2D, `dwt2` is single level. `wavedec2` is multi-level.

        // Check if data is power of 2. GLIC enforces this via segmentation.
        // We need to convert number[][] to flat array or whatever the lib expects.
        // discrete-wavelets expects array of numbers.

        // Wait, discrete-wavelets documentation says:
        // wt.dwt(signal, wavelet, mode)
        // wt.wavedec(signal, wavelet, mode, level)

        // For 2D? It seems discrete-wavelets is primarily 1D in the npm package I found?
        // Let's check the imports.
        // If it doesn't support 2D, I have to implement 2D separable transform myself (apply rows, then cols).

        // Assuming 1D support only for now, implementing 2D separable transform.
        // FWT: Standard recursive decomposition.
        // WPT: Wavelet Packet Transform (full tree).

        const size = data.length;
        // const levels = Math.log2(size);

        // Flatten data for processing? No, keep 2D.

        // Implementing 2D FWT using 1D DWT
        // For FWT, we decompose LL band recursively.

        const currentData = data.map(row => [...row]); // Clone

        if (this.type === TRANSTYPE_FWT) {
            // FWT
            let currSize = size;
            while (currSize > 1) {
                // Apply to rows
                for (let i = 0; i < currSize; i++) {
                    const row = currentData[i].slice(0, currSize);
                    const coeffs = this.safeDwt(row, this.getWorkingWavelet());
                    // coeffs is [cA, cD] (approx, detail)
                    // interleave or concat? JWave usually does [cA | cD]
                    // discrete-wavelets returns [approx, detail] arrays.
                    const rowRes = [...coeffs[0], ...coeffs[1]];
                    for (let j = 0; j < currSize; j++) {
                        currentData[i][j] = rowRes[j];
                    }
                }

                // Apply to cols
                for (let j = 0; j < currSize; j++) {
                    const col = [];
                    for (let i = 0; i < currSize; i++) col.push(currentData[i][j]);
                    const coeffs = this.safeDwt(col, this.getWorkingWavelet());
                    const colRes = [...coeffs[0], ...coeffs[1]];
                    for (let i = 0; i < currSize; i++) {
                        currentData[i][j] = colRes[i];
                    }
                }

                currSize /= 2;
            }
        } else {
            // WPT - Full decomposition
            // This is more complex. JWave's WPT decomposes ALL bands, not just LL.
            // Recursive function needed.
            this.wpt(currentData, 0, 0, size);
        }

        return currentData;
    }

    private wpt(data: number[][], x: number, y: number, size: number) {
        if (size <= 1) return;

        // Apply to rows in this block
        for (let i = 0; i < size; i++) {
            const row = [];
            for (let j = 0; j < size; j++) row.push(data[x + i][y + j]);
            const coeffs = this.safeDwt(row, this.getWorkingWavelet());
            const rowRes = [...coeffs[0], ...coeffs[1]];
            for (let j = 0; j < size; j++) data[x + i][y + j] = rowRes[j];
        }

        // Apply to cols
        for (let j = 0; j < size; j++) {
            const col = [];
            for (let i = 0; i < size; i++) col.push(data[x + i][y + j]);
            const coeffs = this.safeDwt(col, this.getWorkingWavelet());
            const colRes = [...coeffs[0], ...coeffs[1]];
            for (let i = 0; i < size; i++) data[x + i][y + j] = colRes[i];
        }

        const half = size / 2;
        this.wpt(data, x, y, half); // LL
        this.wpt(data, x, y + half, half); // LH
        this.wpt(data, x + half, y, half); // HL
        this.wpt(data, x + half, y + half, half); // HH
    }

    reverse(data: number[][]): number[][] {
        const size = data.length;
        const currentData = data.map(row => [...row]); // Clone

        if (this.type === TRANSTYPE_FWT) {
            // Inverse FWT
            // Start from smallest level (2x2) and go up
            let currSize = 2;
            while (currSize <= size) {
                // Inverse cols first
                for (let j = 0; j < currSize; j++) {
                    const col = [];
                    for (let i = 0; i < currSize; i++) col.push(currentData[i][j]);
                    const half = currSize / 2;
                    const cA = col.slice(0, half);
                    const cD = col.slice(half, currSize);
                    const rec = this.safeIdwt(cA, cD, this.getWorkingWavelet());
                    for (let i = 0; i < currSize; i++) currentData[i][j] = rec[i];
                }

                // Inverse rows
                for (let i = 0; i < currSize; i++) {
                    const row = currentData[i].slice(0, currSize);
                    const half = currSize / 2;
                    const cA = row.slice(0, half);
                    const cD = row.slice(half, currSize);
                    const rec = this.safeIdwt(cA, cD, this.getWorkingWavelet());
                    for (let j = 0; j < currSize; j++) currentData[i][j] = rec[j];
                }

                currSize *= 2;
            }
        } else {
            // Inverse WPT
            this.iwpt(currentData, 0, 0, size);
        }

        return currentData;
    }

    private iwpt(data: number[][], x: number, y: number, size: number) {
        if (size <= 1) return;

        const half = size / 2;
        this.iwpt(data, x, y, half);
        this.iwpt(data, x, y + half, half);
        this.iwpt(data, x + half, y, half);
        this.iwpt(data, x + half, y + half, half);

        // Inverse cols
        for (let j = 0; j < size; j++) {
            const col = [];
            for (let i = 0; i < size; i++) col.push(data[x + i][y + j]);
            const cA = col.slice(0, half);
            const cD = col.slice(half, size);
            const rec = this.safeIdwt(cA, cD, this.getWorkingWavelet());
            for (let i = 0; i < size; i++) data[x + i][y + j] = rec[i];
        }

        // Inverse rows
        for (let i = 0; i < size; i++) {
            const row = [];
            for (let j = 0; j < size; j++) row.push(data[x + i][y + j]);
            const cA = row.slice(0, half);
            const cD = row.slice(half, size);
            const rec = this.safeIdwt(cA, cD, this.getWorkingWavelet());
            for (let j = 0; j < size; j++) data[x + i][y + j] = rec[j];
        }
    }
}

export class CompressorMagnitude {
    threshold: number;

    constructor(threshold: number) {
        this.threshold = threshold;
    }

    compress(data: number[][]): number[][] {
        const size = data.length;
        const res = new Array(size);
        for (let x = 0; x < size; x++) {
            res[x] = new Array(size);
            for (let y = 0; y < size; y++) {
                if (Math.abs(data[x][y]) <= this.threshold) {
                    res[x][y] = 0;
                } else {
                    res[x][y] = data[x][y];
                }
            }
        }
        return res;
    }
}
