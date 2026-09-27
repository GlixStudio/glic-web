export interface ImageFilters {
    hue: number;
    saturation: number;
    brightness: number;
    contrast: number;
}

export const DEFAULT_FILTERS: ImageFilters = { hue: 0, saturation: 100, brightness: 100, contrast: 100 };

export const filtersToCss = (f: ImageFilters) =>
    `hue-rotate(${f.hue}deg) saturate(${f.saturation}%) brightness(${f.brightness}%) contrast(${f.contrast}%)`;
