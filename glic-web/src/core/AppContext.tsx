import React, { createContext, useContext, useState, type ReactNode } from 'react';
import { CodecConfig } from './Codec';

export interface ImageFilters {
  hue: number;
  saturation: number;
  lightness: number;
  brightness: number;
  contrast: number;
}

interface AppState {
  config: CodecConfig;
  setConfig: (c: CodecConfig) => void;
  originalImage: ImageData | null;
  setOriginalImage: (img: ImageData | null) => void;
  processedImage: string | null; // URL
  setProcessedImage: (url: string | null) => void;
  encodedBlob: Blob | null;
  setEncodedBlob: (blob: Blob | null) => void;
  isProcessing: boolean;
  setIsProcessing: (b: boolean) => void;
  filters: ImageFilters;
  setFilters: (f: ImageFilters) => void;
}

const AppContext = createContext<AppState | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [config, setConfig] = useState<CodecConfig>(new CodecConfig());
  const [originalImage, setOriginalImage] = useState<ImageData | null>(null);
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [encodedBlob, setEncodedBlob] = useState<Blob | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [filters, setFilters] = useState<ImageFilters>({
    hue: 0,
    saturation: 100,
    lightness: 100,
    brightness: 100,
    contrast: 100
  });

  return (
    <AppContext.Provider value={{
      config,
      setConfig,
      originalImage,
      setOriginalImage,
      processedImage,
      setProcessedImage,
      encodedBlob,
      setEncodedBlob,
      isProcessing,
      setIsProcessing,
      filters,
      setFilters
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used within AppProvider");
  return context;
};
