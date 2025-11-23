declare module 'discrete-wavelets' {
    export function dwt(data: number[], wavelet: string, mode?: string): number[][]; // returns [cA, cD]
    export function idwt(cA: number[], cD: number[], wavelet: string, mode?: string): number[];
    export function wavedec(data: number[], wavelet: string, mode?: string, level?: number): number[][];
    export function waverec(coeffs: number[][], wavelet: string, mode?: string): number[];
}
