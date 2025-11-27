import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../core/AppContext';
import { Slider } from './controls/Slider';
import { Select } from './controls/Select';
import { COLORSPACES, getColorSpaceName } from '../core/ColorSpaces';
import { predict_name, MAX_PRED } from '../core/Predictions';
import { WAVELETNO, getWaveletDisplayName } from '../core/Transformations';
import { CodecConfig } from '../core/Codec';
import { Play, Download, Settings, Layers, Image as ImageIcon, ChevronDown, ChevronUp, Undo2, Info } from 'lucide-react';
import presetsData from '../core/presets.json';
import JSZip from 'jszip';
import GIF from 'gif.js';

const TABS = ['Global', 'Ch 1', 'Ch 2', 'Ch 3'];

// Type for the preset data structure
type PresetData = {
  [key: string]: number | number[];
};

export const Sidebar: React.FC = () => {
  const { config, setConfig, originalImage, isProcessing, setIsProcessing, processedImage, setProcessedImage, encodedBlob, setEncodedBlob, filters, setFilters } = useApp();
  const [activeTab, setActiveTab] = useState(0);
  const [selectedPreset, setSelectedPreset] = useState<string>('default');
  const [customPresets, setCustomPresets] = useState<Record<string, CodecConfig>>({});
  const [tileSize, setTileSize] = useState<number>(16);
  const [animationFormat, setAnimationFormat] = useState<'gif' | 'webm' | 'mp4'>('gif');
  const [animationFps, setAnimationFps] = useState<number>(10);
  const [isGeneratingAnimation, setIsGeneratingAnimation] = useState(false);
  const [animationQuality, setAnimationQuality] = useState<number>(80);
  const [animationProgress, setAnimationProgress] = useState<number>(0);
  const [filtersExpanded, setFiltersExpanded] = useState<boolean>(true);
  const [tilesetExpanded, setTilesetExpanded] = useState<boolean>(true);
  const [previousProcessedImage, setPreviousProcessedImage] = useState<string | null>(null);
  const [showAbout, setShowAbout] = useState<boolean>(false);
  
  // Use ref to always get the latest config value
  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    const saved = localStorage.getItem('glic_custom_presets');
    if (saved) {
      try {
        setCustomPresets(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load custom presets", e);
      }
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Only trigger if not in an input field
      if (!['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        if (e.key === 'e' || e.key === 'E') {
          e.preventDefault();
          if (originalImage && !isProcessing) {
            handleEncode();
          }
        } else if (e.key === 'r' || e.key === 'R') {
          e.preventDefault();
          if (processedImage && !isProcessing) {
            handleReEncode();
          }
        } else if (e.key === 's' || e.key === 'S') {
          e.preventDefault();
          if (processedImage) {
            handleSaveImage();
          }
        } else if (e.key === 'g' || e.key === 'G') {
          e.preventDefault();
          if (encodedBlob) {
            handleSaveGlic();
          }
        } else if (e.key === 'i' || e.key === 'I') {
          e.preventDefault();
          handleImportGlic();
        } else if (e.key === 'u' || e.key === 'U') {
          e.preventDefault();
          if (previousProcessedImage && !isProcessing) {
            handleUndo();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [originalImage, processedImage, isProcessing, encodedBlob, previousProcessedImage]);

  const saveCustomPreset = () => {
    const name = prompt("Enter a name for your preset:");
    if (!name) return;
    
    const newPresets = { ...customPresets, [name]: config };
    setCustomPresets(newPresets);
    localStorage.setItem('glic_custom_presets', JSON.stringify(newPresets));
    setSelectedPreset(name);
    alert(`Preset '${name}' saved!`);
  };

  const updateConfig = (fn: (c: CodecConfig) => void) => {
    const newConfig = new CodecConfig();
    Object.assign(newConfig, config);
    // Deep copy arrays to trigger updates
    newConfig.min_block_size = [...config.min_block_size];
    newConfig.max_block_size = [...config.max_block_size];
    newConfig.segmentation_precision = [...config.segmentation_precision];
    newConfig.encoding_method = [...config.encoding_method];
    newConfig.prediction_method = [...config.prediction_method];
    newConfig.quantization_value = [...config.quantization_value];
    newConfig.clamp_method = [...config.clamp_method];
    newConfig.transform_type = [...config.transform_type];
    newConfig.transform_method = [...config.transform_method];
    newConfig.transform_compress = [...config.transform_compress];
    newConfig.transform_scale = [...config.transform_scale];
    
    fn(newConfig);
    setConfig(newConfig);
  };

  const applyPreset = (name: string) => {
    setSelectedPreset(name);

    // Check custom presets first
    if (customPresets[name]) {
        const newConfig = new CodecConfig();
        Object.assign(newConfig, customPresets[name]);
        // Ensure deep copy of arrays if they exist in the saved object
        // JSON.parse/stringify usually handles this but let's be safe if we add methods to CodecConfig later
        setConfig(newConfig);
        return;
    }

    const p = (presetsData as Record<string, PresetData>)[name];
    if (!p) return;

    const newConfig = new CodecConfig();

    // Helper to safely get number or array value
    const getVal = (key: string, def: number) => {
      const v = p[key];
      return typeof v === 'number' ? v : def;
    };

    // Global
    newConfig.colorspace = getVal('colorspace', 1);
    
    // Channels
    for (let i = 0; i < 3; i++) {
        // min/max are stored as slider values (exponent), need to convert to actual size
        newConfig.min_block_size[i] = Math.pow(2, getVal(`ch${i}min`, 2));
        newConfig.max_block_size[i] = Math.pow(2, getVal(`ch${i}max`, 8));
        newConfig.segmentation_precision[i] = getVal(`ch${i}thr`, 15); // 'thr' maps to precision/threshold
        newConfig.prediction_method[i] = getVal(`ch${i}pred`, 7);
        newConfig.quantization_value[i] = getVal(`ch${i}quant`, 0);
        
        // Clamp is stored as [float, float] in JSON, e.g. [1.0, 0.0] -> NONE(0), [0.0, 1.0] -> MOD256(1)
        const clampArr = p[`ch${i}clamp`];
        if (Array.isArray(clampArr) && clampArr.length >= 2) {
            newConfig.clamp_method[i] = clampArr[1] > 0.5 ? 1 : 0;
        } else {
            newConfig.clamp_method[i] = 0;
        }

        // Transform Type: RadioButton array [FWT, WPT, Random]
        // [1.0, 0.0, 0.0] -> FWT(0), [0.0, 1.0, 0.0] -> WPT(1), [0.0, 0.0, 1.0] -> Random(-1)
        const transTypeArr = p[`ch${i}transtype`];
        if (Array.isArray(transTypeArr) && transTypeArr.length >= 3) {
            if (transTypeArr[1] > 0.5) {
                newConfig.transform_type[i] = 1; // WPT
            } else if (transTypeArr[2] > 0.5) {
                newConfig.transform_type[i] = -1; // Random
            } else {
                newConfig.transform_type[i] = 0; // FWT (default)
            }
        } else {
            newConfig.transform_type[i] = 0; // Default to FWT
        }

        // transform_method (wavelet) - JSON has the actual wavelet ID value, not index
        // Clamp to valid range: -1 (RANDOM), 0 (NONE), or 1 to WAVELETNO-1 (67)
        const transVal = getVal(`ch${i}trans`, 0);
        if (transVal === -1 || (transVal >= 0 && transVal < WAVELETNO)) {
            newConfig.transform_method[i] = Math.round(transVal);
        } else {
            // ID 68 or higher is invalid, fall back to NONE
            console.warn(`[Preset] Invalid wavelet ID ${transVal} for channel ${i}, using NONE (0)`);
            newConfig.transform_method[i] = 0; // Default to NONE if invalid
        }
        
        newConfig.transform_compress[i] = getVal(`ch${i}compress`, 0);
        
        // transform_scale: Slider stores exponent (2-24), converted to 2^exponent
        // JSON has the slider value (which may be fractional due to conversion)
        // Always convert with 2^value since slider range is 2-24
        const scaleVal = getVal(`ch${i}scale`, 20);
        newConfig.transform_scale[i] = Math.pow(2, scaleVal);
        
        newConfig.encoding_method[i] = getVal(`ch${i}encoding`, 1);
    }

    setConfig(newConfig);
  };

  const handleEncode = () => {
    if (!originalImage) return;
    setIsProcessing(true);
    // Save current processed image before encoding (for undo)
    if (processedImage) {
      setPreviousProcessedImage(processedImage);
    }
    setEncodedBlob(null); // Clear previous result
    setProcessedImage(null); // Clear previous processed image
    
    const worker = new Worker(new URL('../workers/codec.worker.ts', import.meta.url), { type: 'module' });
    
    worker.onmessage = (e) => {
      if (e.data.type === 'success') {
        const { blob, preview } = e.data;
        
        // Create preview URL
        const canvas = document.createElement('canvas');
        canvas.width = preview.width;
        canvas.height = preview.height;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (ctx) {
          ctx.imageSmoothingEnabled = false;
          ctx.putImageData(preview, 0, 0);
          setProcessedImage(canvas.toDataURL('image/png'));
        }

        setEncodedBlob(blob);
        setIsProcessing(false);
      } else {
        console.error(e.data.error);
        setIsProcessing(false);
      }
      worker.terminate();
    };
    
    worker.postMessage({
      type: 'encode',
      imageData: originalImage,
      config: configRef.current
    });
  };

  const handleReEncode = () => {
    if (!processedImage) return;
    setIsProcessing(true);
    // Save current processed image before re-encoding (for undo)
    setPreviousProcessedImage(processedImage);
    setEncodedBlob(null); // Clear previous result
    
    // Convert the processed image URL back to ImageData
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) {
        setIsProcessing(false);
        return;
      }
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      
      const worker = new Worker(new URL('../workers/codec.worker.ts', import.meta.url), { type: 'module' });
      
      worker.onmessage = (e) => {
        if (e.data.type === 'success') {
          const { blob, preview } = e.data;
          
          // Create preview URL
          const canvas = document.createElement('canvas');
          canvas.width = preview.width;
          canvas.height = preview.height;
          const ctx = canvas.getContext('2d', { alpha: false });
          if (ctx) {
            ctx.imageSmoothingEnabled = false;
            ctx.putImageData(preview, 0, 0);
            setProcessedImage(canvas.toDataURL('image/png'));
          }

          setEncodedBlob(blob);
          setIsProcessing(false);
        } else {
          console.error(e.data.error);
          setIsProcessing(false);
        }
        worker.terminate();
      };
      
      worker.postMessage({
        type: 'encode',
        imageData: imageData,
        config: configRef.current
      });
    };
    img.src = processedImage;
  };

  const handleUndo = () => {
    if (previousProcessedImage) {
      // Create a new data URL with a timestamp to force canvas reload
      // This ensures the canvas properly updates even if the image data is similar
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (ctx) {
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(img, 0, 0);
          // Create a fresh data URL to force canvas update
          const newDataUrl = canvas.toDataURL('image/png');
          setProcessedImage(newDataUrl);
          setPreviousProcessedImage(null); // Clear undo history after undo
          setEncodedBlob(null); // Clear encoded blob since we're reverting
        }
      };
      img.src = previousProcessedImage;
    }
  };

  const getTimestampedFilename = (prefix: string, extension: string) => {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5); // YYYY-MM-DDTHH-MM-SS
    return `${prefix}_${timestamp}.${extension}`;
  };

  const handleSaveImage = () => {
    if (!processedImage) return;
    
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d', { alpha: false });
      
      if (!ctx) return;
      
      ctx.imageSmoothingEnabled = false;
      
      // Apply CSS filters to the canvas context
      ctx.filter = `hue-rotate(${filters.hue}deg) saturate(${filters.saturation}%) brightness(${filters.brightness}%) contrast(${filters.contrast}%)`;
      
      ctx.drawImage(img, 0, 0);
      
      // Convert to blob and download
      canvas.toBlob((blob) => {
        if (!blob) {
          alert('Failed to generate image blob');
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = getTimestampedFilename('glic-image', 'png');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 100);
      }, 'image/png');
    };
    
    img.src = processedImage;
  };

  const handleSaveGlic = () => {
    if (!encodedBlob) return;
    const url = URL.createObjectURL(encodedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = getTimestampedFilename('glic-output', 'glic');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  const handleImportGlic = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.glic';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const arrayBuffer = event.target?.result as ArrayBuffer;
          // TODO: Implement proper .glic file parsing
          // For now, just show an alert
          alert('GLIC import feature is under development. File size: ' + arrayBuffer.byteLength + ' bytes');
        } catch (error) {
          console.error('Error importing GLIC:', error);
          alert('Failed to import GLIC file');
        }
      };
      reader.readAsArrayBuffer(file);
    };
    input.click();
  };

  const resetFilters = () => {
    setFilters({
      hue: 0,
      saturation: 100,
      lightness: 100,
      brightness: 100,
      contrast: 100
    });
  };

  const updateFilter = (key: keyof typeof filters, value: number) => {
    setFilters({ ...filters, [key]: value });
  };

  const generateTileset = async () => {
    if (!processedImage) return;
    
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = async () => {
        try {
          const sourceCanvas = document.createElement('canvas');
          sourceCanvas.width = img.width;
          sourceCanvas.height = img.height;
          const sourceCtx = sourceCanvas.getContext('2d', { alpha: false });
          
          if (!sourceCtx) {
            alert('Failed to create canvas context');
            return;
          }
          
          sourceCtx.imageSmoothingEnabled = false;
          sourceCtx.filter = `hue-rotate(${filters.hue}deg) saturate(${filters.saturation}%) brightness(${filters.brightness}%) contrast(${filters.contrast}%)`;
          sourceCtx.drawImage(img, 0, 0);
          
          // Calculate number of tiles
          const tilesX = Math.floor(img.width / tileSize);
          const tilesY = Math.floor(img.height / tileSize);
          const totalTiles = tilesX * tilesY;
          
          if (totalTiles === 0) {
            alert(`Image is too small for ${tileSize}x${tileSize} tiles!`);
            return;
          }
          
          // Create zip file
          const zip = new JSZip();
          
          // Extract each tile as a separate file
          for (let y = 0; y < tilesY; y++) {
            for (let x = 0; x < tilesX; x++) {
              // Create a canvas for each individual tile
              const tileCanvas = document.createElement('canvas');
              tileCanvas.width = tileSize;
              tileCanvas.height = tileSize;
              const tileCtx = tileCanvas.getContext('2d', { alpha: false });
              
              if (!tileCtx) continue;
              
              tileCtx.imageSmoothingEnabled = false;
              
              // Extract tile data from source
              const tileData = sourceCtx.getImageData(
                x * tileSize, 
                y * tileSize, 
                tileSize, 
                tileSize
              );
              tileCtx.putImageData(tileData, 0, 0);
              
              // Convert tile to blob
              const tileDataUrl = tileCanvas.toDataURL('image/png');
              const tileBlob = await fetch(tileDataUrl).then(res => res.blob());
              
              // Add to zip with descriptive filename
              const filename = `tile_${x}_${y}.png`;
              zip.file(filename, tileBlob);
            }
          }
          
          // Generate zip file
          const zipBlob = await zip.generateAsync({ type: 'blob' });
          
          // Download the zip
          const url = URL.createObjectURL(zipBlob);
          const a = document.createElement('a');
          a.href = url;
          a.download = getTimestampedFilename(`tileset-${tileSize}x${tileSize}`, 'zip');
          a.style.display = 'none';
          document.body.appendChild(a);
          a.click();
          
          // Clean up
          setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }, 100);
        } catch (error) {
          console.error('Error generating tileset:', error);
          alert('Failed to generate tileset: ' + (error instanceof Error ? error.message : 'Unknown error'));
        }
      };
      
      img.onerror = () => {
        alert('Failed to load image for tileset generation');
      };
      
      img.src = processedImage;
    } catch (error) {
      console.error('Error in generateTileset:', error);
      alert('Failed to start tileset generation: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const generateAnimation = async () => {
    if (!processedImage) return;
    
    setIsGeneratingAnimation(true);
    setAnimationProgress(0);
    
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = async () => {
        try {
          const sourceCanvas = document.createElement('canvas');
          sourceCanvas.width = img.width;
          sourceCanvas.height = img.height;
          const sourceCtx = sourceCanvas.getContext('2d', { alpha: false });
          
          if (!sourceCtx) {
            alert('Failed to create canvas context');
            setIsGeneratingAnimation(false);
            return;
          }
          
          sourceCtx.imageSmoothingEnabled = false;
          sourceCtx.filter = `hue-rotate(${filters.hue}deg) saturate(${filters.saturation}%) brightness(${filters.brightness}%) contrast(${filters.contrast}%)`;
          sourceCtx.drawImage(img, 0, 0);
          
          // Calculate number of tiles
          const tilesX = Math.floor(img.width / tileSize);
          const tilesY = Math.floor(img.height / tileSize);
          const totalTiles = tilesX * tilesY;
          
          if (totalTiles === 0) {
            alert(`Image is too small for ${tileSize}x${tileSize} tiles!`);
            setIsGeneratingAnimation(false);
            return;
          }
          
          // Create frame canvases upfront (more efficient)
          const frameCanvases: HTMLCanvasElement[] = [];
          for (let y = 0; y < tilesY; y++) {
            for (let x = 0; x < tilesX; x++) {
              const frameCanvas = document.createElement('canvas');
              frameCanvas.width = tileSize;
              frameCanvas.height = tileSize;
              const frameCtx = frameCanvas.getContext('2d', { alpha: false });
              if (frameCtx) {
                frameCtx.imageSmoothingEnabled = false;
                const tileData = sourceCtx.getImageData(
                  x * tileSize, 
                  y * tileSize, 
                  tileSize, 
                  tileSize
                );
                frameCtx.putImageData(tileData, 0, 0);
                frameCanvases.push(frameCanvas);
              }
            }
          }
          
          if (animationFormat === 'gif') {
            // Generate GIF using gif.js with quality settings
            // Quality: 1-30 (lower = better quality, higher file size)
            const gifQuality = Math.max(1, Math.min(30, Math.round(30 * (100 - animationQuality) / 100)));
            
            const gif = new GIF({
              workers: 4, // More workers for faster processing
              quality: gifQuality,
              width: tileSize,
              height: tileSize,
              repeat: 0,
              workerScript: undefined // Use default worker
            });
            
            // Add all frames
            frameCanvases.forEach((frameCanvas) => {
              gif.addFrame(frameCanvas, { delay: 1000 / animationFps });
            });
            
            gif.on('finished', (blob: Blob) => {
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = getTimestampedFilename(`tileset-animation-${tileSize}x${tileSize}`, 'gif');
              a.style.display = 'none';
              document.body.appendChild(a);
              a.click();
              setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                setIsGeneratingAnimation(false);
                setAnimationProgress(0);
              }, 100);
            });
            
            gif.on('progress', (p: number) => {
              setAnimationProgress(Math.round(p * 100));
            });
            
            gif.render();
          } else {
            // For video, use a more efficient approach
            // Create all frames as images first, then encode
            const canvas = document.createElement('canvas');
            canvas.width = tileSize;
            canvas.height = tileSize;
            const ctx = canvas.getContext('2d', { alpha: false });
            
            if (!ctx) {
              alert('Failed to create canvas context');
              setIsGeneratingAnimation(false);
              return;
            }
            
            ctx.imageSmoothingEnabled = false;
            
            // Use higher frame rate for capture to ensure smooth playback
            const captureFps = Math.max(animationFps, 30);
            const stream = canvas.captureStream(captureFps);
            
            // Determine mime type and bitrate based on quality
            let mimeType = '';
            const bitrate = Math.round(1000000 + (animationQuality / 100) * 4000000); // 1-5 Mbps based on quality
            
            if (animationFormat === 'webm') {
              if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
                mimeType = 'video/webm;codecs=vp9';
              } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
                mimeType = 'video/webm;codecs=vp8';
              } else {
                mimeType = 'video/webm';
              }
            } else {
              // MP4 support is limited - most browsers don't support H.264 encoding
              // Fall back to WebM which is widely supported
              if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
                mimeType = 'video/webm;codecs=vp9';
                console.warn('MP4 encoding not supported in this browser. Using WebM instead.');
              } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
                mimeType = 'video/webm;codecs=vp8';
                console.warn('MP4 encoding not supported in this browser. Using WebM instead.');
              } else {
                mimeType = 'video/webm';
                console.warn('MP4 encoding not supported in this browser. Using WebM instead.');
              }
            }
            
            const mediaRecorder = new MediaRecorder(stream, {
              mimeType: mimeType,
              videoBitsPerSecond: bitrate
            });
            
            const chunks: Blob[] = [];
            
            mediaRecorder.ondataavailable = (e) => {
              if (e.data.size > 0) {
                chunks.push(e.data);
              }
            };
            
            mediaRecorder.onerror = (e) => {
              console.error('MediaRecorder error:', e);
              alert('Error recording animation. Your browser may not support this format.');
              setIsGeneratingAnimation(false);
              setAnimationProgress(0);
              stream.getTracks().forEach(track => track.stop());
            };
            
            mediaRecorder.onstop = () => {
              const blob = new Blob(chunks, { type: mimeType });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              // Always use webm extension since MP4 encoding isn't supported
              const extension = mimeType.includes('webm') ? 'webm' : 'mp4';
              a.download = getTimestampedFilename(`tileset-animation-${tileSize}x${tileSize}`, extension);
              a.style.display = 'none';
              document.body.appendChild(a);
              a.click();
              setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                setIsGeneratingAnimation(false);
                setAnimationProgress(0);
              }, 100);
            };
            
            mediaRecorder.start();
            
            // Draw frames more efficiently - batch updates
            let frameIndex = 0;
            const frameDelay = 1000 / animationFps;
            const startTime = performance.now();
            
            const drawFrame = () => {
              if (frameIndex < frameCanvases.length) {
                const frameCanvas = frameCanvases[frameIndex];
                ctx.clearRect(0, 0, tileSize, tileSize);
                ctx.drawImage(frameCanvas, 0, 0);
                
                frameIndex++;
                setAnimationProgress(Math.round((frameIndex / frameCanvases.length) * 100));
                
                // Use requestAnimationFrame for smoother timing
                const elapsed = performance.now() - startTime;
                const targetTime = frameIndex * frameDelay;
                const delay = Math.max(0, targetTime - elapsed);
                
                setTimeout(drawFrame, delay);
              } else {
                // Wait a bit for final frame to be recorded
                setTimeout(() => {
                  mediaRecorder.stop();
                  stream.getTracks().forEach(track => track.stop());
                }, frameDelay);
              }
            };
            
            drawFrame();
          }
        } catch (error) {
          console.error('Error generating animation:', error);
          alert('Failed to generate animation: ' + (error instanceof Error ? error.message : 'Unknown error'));
          setIsGeneratingAnimation(false);
          setAnimationProgress(0);
        }
      };
      
      img.onerror = () => {
        alert('Failed to load image for animation generation');
        setIsGeneratingAnimation(false);
        setAnimationProgress(0);
      };
      
      img.src = processedImage;
    } catch (error) {
      console.error('Error in generateAnimation:', error);
      alert('Failed to start animation generation: ' + (error instanceof Error ? error.message : 'Unknown error'));
      setIsGeneratingAnimation(false);
      setAnimationProgress(0);
    }
  };

  const renderGlobalSettings = () => (
    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-left-4 duration-300">
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-zinc-400 uppercase text-xs font-bold tracking-wider mb-2">
            <Settings className="w-3 h-3" /> Global Config
        </div>
        <div className="flex gap-2 items-end">
            <div className="flex-1">
                <Select
                    label="Preset"
                    value={selectedPreset}
                    options={[
                        ...Object.keys(customPresets).map(k => ({ label: `[Custom] ${k}`, value: k })),
                        ...Object.keys(presetsData).sort().map(k => ({ label: k, value: k }))
                    ]}
                    onChange={(v) => applyPreset(v as string)}
                />
            </div>
            <button 
                onClick={saveCustomPreset}
                className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg border border-zinc-700 transition-colors"
                title="Save current settings as preset"
            >
                <Download className="w-4 h-4 rotate-180" />
            </button>
            <button 
                onClick={() => alert(JSON.stringify(config, null, 2))}
                className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg border border-zinc-700 transition-colors"
                title="View Preset JSON"
            >
                <Settings className="w-4 h-4" />
            </button>
        </div>
        <Select
            label="Color Space"
            value={config.colorspace}
            options={Object.values(COLORSPACES).map(v => ({ label: getColorSpaceName(v as number), value: v }))}
            onChange={(v) => updateConfig(c => c.colorspace = v)}
        />
      </div>
    </div>
  );

  const renderChannelSettings = (ch: number) => (
    <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-right-4 duration-300">
      
      {/* Segmentation Section */}
      <div className="space-y-2.5 p-3 bg-zinc-900/50 rounded-lg border border-zinc-800/50">
        <div className="flex items-center gap-2 text-zinc-400 uppercase text-xs font-bold tracking-wider mb-2">
            <Layers className="w-3 h-3" /> Segmentation
        </div>
        <Slider
          label="Min Block Size (2^x)"
          value={Math.log2(config.min_block_size[ch])}
          min={1} max={8} step={1}
          onChange={(v) => updateConfig(c => c.min_block_size[ch] = Math.pow(2, v))}
        />
        <Slider
          label="Max Block Size (2^x)"
          value={Math.log2(config.max_block_size[ch])}
          min={1} max={10} step={1}
          onChange={(v) => updateConfig(c => c.max_block_size[ch] = Math.pow(2, v))}
        />
        <Slider
          label="Precision"
          value={config.segmentation_precision[ch]}
          min={1} max={100}
          onChange={(v) => updateConfig(c => c.segmentation_precision[ch] = v)}
        />
      </div>

      {/* Prediction Section */}
      <div className="space-y-2.5 p-3 bg-zinc-900/50 rounded-lg border border-zinc-800/50">
        <div className="flex items-center gap-2 text-zinc-400 uppercase text-xs font-bold tracking-wider mb-2">
            <ImageIcon className="w-3 h-3" /> Prediction
        </div>
        <Select
          label="Method"
          value={config.prediction_method[ch]}
          options={Array.from({ length: MAX_PRED + 3 }).map((_, i) => {
             const val = i - 3; // -3 to MAX_PRED-1
             return { label: predict_name(val), value: val };
          })}
          onChange={(v) => updateConfig(c => c.prediction_method[ch] = v)}
        />
      </div>

      {/* Quantization Section */}
      <div className="space-y-2.5 p-3 bg-zinc-900/50 rounded-lg border border-zinc-800/50">
        <div className="flex items-center gap-2 text-zinc-400 uppercase text-xs font-bold tracking-wider mb-2">
            <Settings className="w-3 h-3" /> Quantization
        </div>
        <Slider
          label="Value"
          value={config.quantization_value[ch]}
          min={0} max={255}
          onChange={(v) => updateConfig(c => c.quantization_value[ch] = v)}
        />
        <Select
          label="Clamping"
          value={config.clamp_method[ch]}
          options={[{ label: 'None (-255..255)', value: 0 }, { label: 'Mod 256', value: 1 }]}
          onChange={(v) => updateConfig(c => c.clamp_method[ch] = v)}
        />
      </div>

      {/* Transformation Section */}
      <div className="space-y-2.5 p-3 bg-zinc-900/50 rounded-lg border border-zinc-800/50">
        <div className="flex items-center gap-2 text-zinc-400 uppercase text-xs font-bold tracking-wider mb-2">
            <Layers className="w-3 h-3" /> Transformation
        </div>
        <Select
          label="Type"
          value={config.transform_type[ch]}
          options={[{ label: 'FWT', value: 0 }, { label: 'WPT', value: 1 }, { label: 'Random', value: -1 }]}
          onChange={(v) => updateConfig(c => c.transform_type[ch] = v)}
        />
        <Select
          label="Wavelet"
          value={config.transform_method[ch]}
          options={Array.from({ length: WAVELETNO + 1 }).map((_, i) => {
            const val = i - 1; // -1 to WAVELETNO - 1 (67)
            return { label: getWaveletDisplayName(val), value: val };
          })}
          onChange={(v) => updateConfig(c => c.transform_method[ch] = v)}
        />
        <Slider
          label="Compression"
          value={config.transform_compress[ch]}
          min={0} max={255}
          onChange={(v) => updateConfig(c => c.transform_compress[ch] = v)}
        />
        <Slider
          label="Scale"
          value={config.transform_scale[ch]}
          min={1} max={100}
          onChange={(v) => updateConfig(c => c.transform_scale[ch] = v)}
        />
      </div>
      
      {/* Encoding Section */}
      <div className="space-y-2.5 p-3 bg-zinc-900/50 rounded-lg border border-zinc-800/50">
         <div className="flex items-center gap-2 text-zinc-400 uppercase text-xs font-bold tracking-wider mb-2">
            <Download className="w-3 h-3" /> Encoding
        </div>
        <Select
            label="Method"
            value={config.encoding_method[ch]}
            options={[{label: 'RAW', value: 0}, {label: 'PACKED', value: 1}, {label: 'RLE', value: 2}]}
            onChange={(v) => updateConfig(c => c.encoding_method[ch] = v)}
        />
      </div>
    </div>
  );

  return (
    <div className="w-80 bg-zinc-950 border-r border-zinc-900 flex flex-col h-full shadow-2xl z-20">
      <div className="p-6 border-b border-zinc-900 bg-zinc-950">
        <h1 className="text-2xl font-black text-white tracking-tighter flex items-center gap-2">
            <span className="text-blue-500">GLIC</span> WEB
        </h1>
        <p className="text-xs text-zinc-500 mt-1">Glitch Image Codec Port</p>
      </div>
      
      <div className="flex border-b border-zinc-900 bg-zinc-950/50 backdrop-blur-sm">
        {TABS.map((tab, i) => (
          <button
            key={tab}
            className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-all ${
              activeTab === i 
                ? 'text-blue-500 border-b-2 border-blue-500 bg-zinc-900/50' 
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/30'
            }`}
            onClick={() => setActiveTab(i)}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Scrollable content area - contains all sections */}
      <div className="flex-1 overflow-y-auto custom-scrollbar bg-zinc-950">
        <div className="p-4 space-y-4">
          {/* Settings Section */}
          <div>
            {activeTab === 0 ? renderGlobalSettings() : renderChannelSettings(activeTab - 1)}
          </div>

          {/* Image Filters Section - Only show when there's a processed image */}
          {processedImage && (
            <div className="border-t border-zinc-800 pt-4">
              <div
                onClick={() => setFiltersExpanded(!filtersExpanded)}
                className="w-full flex items-center justify-between mb-3 group cursor-pointer"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setFiltersExpanded(!filtersExpanded);
                  }
                }}
              >
                <div className="flex items-center gap-2 text-zinc-400 uppercase text-xs font-bold tracking-wider group-hover:text-zinc-300 transition-colors">
                  <ImageIcon className="w-3 h-3" /> Image Adjustments
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      resetFilters();
                    }}
                    className="px-2 py-1 text-[10px] font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-900 hover:bg-zinc-800 rounded border border-zinc-800 hover:border-zinc-700 transition-all"
                  >
                    Reset
                  </button>
                  {filtersExpanded ? (
                    <ChevronUp className="w-4 h-4 text-zinc-500" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-zinc-500" />
                  )}
                </div>
              </div>
              {filtersExpanded && (
                <div className="space-y-2">
                  <Slider
                    label="Hue Rotate"
                    value={filters.hue}
                    min={-180}
                    max={180}
                    step={1}
                    onChange={(v) => updateFilter('hue', v)}
                  />
                  <Slider
                    label="Saturation"
                    value={filters.saturation}
                    min={0}
                    max={200}
                    step={1}
                    onChange={(v) => updateFilter('saturation', v)}
                  />
                  <Slider
                    label="Brightness"
                    value={filters.brightness}
                    min={0}
                    max={200}
                    step={1}
                    onChange={(v) => updateFilter('brightness', v)}
                  />
                  <Slider
                    label="Contrast"
                    value={filters.contrast}
                    min={0}
                    max={200}
                    step={1}
                    onChange={(v) => updateFilter('contrast', v)}
                  />
                </div>
              )}
            </div>
          )}

          {/* Tileset Generator Section - Only show when there's a processed image */}
          {processedImage && (
            <div className="border-t border-zinc-800 pt-4">
              <button
                onClick={() => setTilesetExpanded(!tilesetExpanded)}
                className="w-full flex items-center justify-between mb-3 group"
              >
                <div className="flex items-center gap-2 text-zinc-400 uppercase text-xs font-bold tracking-wider group-hover:text-zinc-300 transition-colors">
                  <Layers className="w-3 h-3" /> Tileset Generator
                </div>
                {tilesetExpanded ? (
                  <ChevronUp className="w-4 h-4 text-zinc-500" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-zinc-500" />
                )}
              </button>
              {tilesetExpanded && (
                <div className="space-y-3">
                  <Select
                    label="Tile Size"
                    value={tileSize}
                    options={[
                      { label: '16×16', value: 16 },
                      { label: '32×32', value: 32 },
                      { label: '64×64', value: 64 }
                    ]}
                    onChange={(v) => setTileSize(v as number)}
                  />
                  <button
                    onClick={generateTileset}
                    className="w-full py-2.5 rounded-lg font-bold text-sm bg-emerald-600 hover:bg-emerald-500 text-white transition-all transform active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20"
                  >
                    <Download className="w-4 h-4" /> Generate Tileset (ZIP)
                  </button>
                  
                  <div className="pt-2 border-t border-zinc-800">
                    <div className="flex items-center gap-2 text-zinc-400 uppercase text-xs font-bold tracking-wider mb-3">
                      <Play className="w-3 h-3" /> Animation
                    </div>
                    <div className="space-y-3">
                      <Select
                        label="Format"
                        value={animationFormat}
                        options={[
                          { label: 'GIF', value: 'gif' },
                          { label: 'WebM (Recommended)', value: 'webm' },
                          { label: 'MP4 (May use WebM)', value: 'mp4' }
                        ]}
                        onChange={(v) => setAnimationFormat(v as 'gif' | 'webm' | 'mp4')}
                      />
                      <Slider
                        label="FPS"
                        value={animationFps}
                        min={1}
                        max={60}
                        step={1}
                        onChange={(v) => setAnimationFps(v)}
                      />
                      <Slider
                        label="Quality"
                        value={animationQuality}
                        min={10}
                        max={100}
                        step={5}
                        onChange={(v) => setAnimationQuality(v)}
                      />
                      {isGeneratingAnimation && animationProgress > 0 && (
                        <div className="w-full bg-zinc-900 rounded-full h-2 overflow-hidden">
                          <div 
                            className="bg-purple-500 h-full transition-all duration-300"
                            style={{ width: `${animationProgress}%` }}
                          />
                        </div>
                      )}
                      <button
                        onClick={generateAnimation}
                        disabled={isGeneratingAnimation}
                        className={`w-full py-2.5 rounded-lg font-bold text-sm transition-all transform active:scale-95 flex items-center justify-center gap-2 shadow-lg ${
                          isGeneratingAnimation
                            ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                            : 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-900/20'
                        }`}
                      >
                        {isGeneratingAnimation ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            {animationProgress > 0 ? `Generating... ${animationProgress}%` : 'Generating...'}
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4 fill-current" /> Generate Animation
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Fixed action buttons at bottom */}
      <div className="p-3 border-t border-zinc-900 bg-zinc-950 z-10 flex flex-col gap-2 flex-shrink-0">
        <div className="flex gap-2">
            <button
            className={`flex-1 py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 transition-all transform active:scale-95 ${
                !originalImage || isProcessing
                ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-900/20'
            }`}
            onClick={handleEncode}
            disabled={!originalImage || isProcessing}
            title="Encode image (E)"
            >
            {isProcessing ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
                <>
                  <Play className="w-4 h-4 fill-current" /> 
                  <span className="text-sm">ENCODE</span>
                  <span className="text-[10px] opacity-60 font-normal">E</span>
                </>
            )}
            </button>
            
            <button
            className={`flex-1 py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 transition-all transform active:scale-95 ${
                !processedImage
                ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white border border-zinc-700'
            }`}
            onClick={handleSaveImage}
            disabled={!processedImage}
            title="Save processed image (S)"
            >
            <Download className="w-4 h-4" />
            <span className="text-sm">SAVE</span>
            <span className="text-[10px] opacity-60 font-normal">S</span>
            </button>
        </div>
        
        {processedImage && (
          <button
            className={`w-full py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 transition-all transform active:scale-95 ${
                isProcessing
                ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                : 'bg-purple-600 text-white hover:bg-purple-500 shadow-lg shadow-purple-900/20'
            }`}
            onClick={handleReEncode}
            disabled={isProcessing}
            title="Re-encode iteratively (R)"
          >
            {isProcessing ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
                <>
                  <Play className="w-4 h-4 fill-current" /> 
                  <span className="text-sm">RE-ENCODE</span>
                  <span className="text-[10px] opacity-60 font-normal">R</span>
                </>
            )}
          </button>
        )}
        
        {processedImage && previousProcessedImage && (
          <button
            className="w-full py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 transition-all transform active:scale-95 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white border border-zinc-700"
            onClick={handleUndo}
            title="Undo last encode (U)"
          >
            <Undo2 className="w-4 h-4" />
            <span className="text-sm">UNDO</span>
            <span className="text-[10px] opacity-60 font-normal">U</span>
          </button>
        )}
        
        <div className="flex gap-2 pt-1 border-t border-zinc-800">
          <button
              className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
                  !encodedBlob
                  ? 'text-zinc-600 bg-zinc-900 cursor-not-allowed'
                  : 'text-zinc-300 hover:text-zinc-100 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700'
              }`}
              onClick={handleSaveGlic}
              disabled={!encodedBlob}
              title="Save .glic file (G)"
          >
              <Download className="w-3 h-3" />
              <span>Save .glic</span>
              <span className="text-[9px] opacity-60 font-normal">G</span>
          </button>
          
          <button
              className="flex-1 py-2 rounded-lg text-xs font-medium text-zinc-300 hover:text-zinc-100 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 transition-all flex items-center justify-center gap-1.5"
              onClick={handleImportGlic}
              title="Import .glic file (I)"
          >
              <Settings className="w-3 h-3" />
              <span>Import</span>
              <span className="text-[9px] opacity-60 font-normal">I</span>
          </button>
        </div>
        
        {/* About Button */}
        <div className="pt-2 border-t border-zinc-800">
          <button
            className="w-full py-2 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 transition-all flex items-center justify-center gap-1.5"
            onClick={() => setShowAbout(true)}
            title="About this project"
          >
            <Info className="w-3 h-3" />
            <span>About</span>
          </button>
        </div>
        
        {/* Copyleft Text */}
        <div className="pt-2 pb-4 text-center">
          <p className="text-[10px] text-zinc-600 font-medium">
            Copyleft Glix Studio 2025
          </p>
        </div>
      </div>
      
      {/* About Modal */}
      {showAbout && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowAbout(false)}
        >
          <div 
            className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
                <h2 className="text-2xl font-bold text-zinc-100">About GLIC Web</h2>
                <button
                  onClick={() => setShowAbout(false)}
                  className="text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  <span className="text-2xl">×</span>
                </button>
              </div>
              
              <div className="space-y-4 text-zinc-300 text-sm leading-relaxed">
                <p>
                  <strong className="text-zinc-100">GLIC Web</strong> is a web-based vibe coded port of the GLIC (GLitch Image Codec) image compression and transformation tool. <strong className="text-zinc-100">GLIC</strong> has been a huge inspiration for GLIX's aesthetics and design approach. Thus we wanted to port it to web (originally it is a Processing program), and share it with the world. 
                </p>
                
                <div>
                  <h3 className="text-zinc-100 font-bold mb-2">Features:</h3>
                  <ul className="list-disc list-inside space-y-1 ml-2 text-zinc-400">
                    <li>Advanced wavelet-based image compression</li>
                    <li>Multiple color space transformations</li>
                    <li>Real-time image adjustments (HSL, brightness, contrast)</li>
                    <li>Tileset generation with animation support</li>
                    <li>Custom presets and configurations</li>
                    <li>Support for 68+ different wavelets (all might not operate well, we are working on it)</li>
                  </ul>
                </div>
                
                <div>
                    <p>GLIC Source code:</p>
                    <a href="https://github.com/GlitchCodec/GLIC" className="text-zinc-300 underline" target="_blank" rel="noopener noreferrer">https://github.com/GlitchCodec/GLIC</a>
                    <p>GLIC-web Source code:</p>
                    <a href="https://github.com/GlitchCodec/GLIC" className="text-zinc-300 underline" target="_blank" rel="noopener noreferrer">https://github.com/GlitchCodec/GLIC</a>
                    <p>Vibe coded by <a href="https://glix.studio" className="text-zinc-300 underline" target="_blank" rel="noopener noreferrer">Glix Studio</a></p>
                    <p><a href="https://glix.shop" className="text-zinc-300 underline" target="_blank" rel="noopener noreferrer">Glix Shop</a></p>
                </div>
                
                <div className="pt-4 border-t border-zinc-800">
                  <p className="text-zinc-400 text-xs">
                    <strong className="text-zinc-300">Copyleft Glix Studio 2025</strong>
                    <br />
                    This software is free and open source. Use, modify, and distribute freely.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
