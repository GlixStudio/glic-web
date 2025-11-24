import React, { useState, useEffect } from 'react';
import { useApp } from '../core/AppContext';
import { Slider } from './controls/Slider';
import { Select } from './controls/Select';
import { COLORSPACES, getColorSpaceName } from '../core/ColorSpaces';
import { predict_name, MAX_PRED } from '../core/Predictions';
import { WAVELETNO } from '../core/Transformations';
import { CodecConfig } from '../core/Codec';
import { Play, Download, Settings, Layers, Image as ImageIcon } from 'lucide-react';
import presetsData from '../core/presets.json';

const TABS = ['Global', 'Ch 1', 'Ch 2', 'Ch 3'];

// Type for the preset data structure
type PresetData = {
  [key: string]: number | number[];
};

export const Sidebar: React.FC = () => {
  const { config, setConfig, originalImage, isProcessing, setIsProcessing, processedImage, setProcessedImage, encodedBlob, setEncodedBlob } = useApp();
  const [activeTab, setActiveTab] = useState(0);
  const [selectedPreset, setSelectedPreset] = useState<string>('default');
  const [customPresets, setCustomPresets] = useState<Record<string, CodecConfig>>({});

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
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [originalImage, processedImage, isProcessing, encodedBlob]);

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

        // Transform Type: [1,0,0]->FWT(0), [0,1,0]->WPT(1), [0,0,1]->Random(-1)?
        // Wait, original code: 
        // trans.addItem("NONE", 0); -> This is transform_method=0
        // But transform_type is separate?
        // In JSON: ch0transtype: [1.0, 0.0, 0.0]. 
        // Let's assume: index 0 -> FWT, index 1 -> WPT.
        const transTypeArr = p[`ch${i}transtype`];
        if (Array.isArray(transTypeArr)) {
             if (transTypeArr[1] > 0.5) newConfig.transform_type[i] = 1; // WPT
             else if (transTypeArr[2] > 0.5) newConfig.transform_type[i] = -1; // Random?
             else newConfig.transform_type[i] = 0; // FWT
        }

        newConfig.transform_method[i] = getVal(`ch${i}trans`, 0);
        newConfig.transform_compress[i] = getVal(`ch${i}compress`, 0);
        newConfig.transform_scale[i] = getVal(`ch${i}scale`, 20);
        newConfig.encoding_method[i] = getVal(`ch${i}encoding`, 1);
    }

    setConfig(newConfig);
  };

  const handleEncode = () => {
    if (!originalImage) return;
    setIsProcessing(true);
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
      config: config
    });
  };

  const handleReEncode = () => {
    if (!processedImage) return;
    setIsProcessing(true);
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
        config: config
      });
    };
    img.src = processedImage;
  };

  const handleSaveImage = () => {
    if (!processedImage) return;
    const a = document.createElement('a');
    a.href = processedImage;
    a.download = 'glitched-image.png';
    a.click();
  };

  const handleSaveGlic = () => {
    if (!encodedBlob) return;
    const url = URL.createObjectURL(encodedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'output.glic';
    a.click();
    URL.revokeObjectURL(url);
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

  const renderGlobalSettings = () => (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-left-4 duration-300">
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-zinc-400 uppercase text-xs font-bold tracking-wider">
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
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-300">
      
      {/* Segmentation Section */}
      <div className="space-y-3 p-3 bg-zinc-900/50 rounded-lg border border-zinc-800/50">
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
      <div className="space-y-3 p-3 bg-zinc-900/50 rounded-lg border border-zinc-800/50">
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
      <div className="space-y-3 p-3 bg-zinc-900/50 rounded-lg border border-zinc-800/50">
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
      <div className="space-y-3 p-3 bg-zinc-900/50 rounded-lg border border-zinc-800/50">
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
          options={Array.from({ length: WAVELETNO + 2 }).map((_, i) => {
            const val = i - 1; // -1 to WAVELETNO
            return { label: val === -1 ? 'Random' : (val === 0 ? 'None' : `Wavelet ${val}`), value: val };
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
      <div className="space-y-3 p-3 bg-zinc-900/50 rounded-lg border border-zinc-800/50">
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

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-zinc-950">
        {activeTab === 0 ? renderGlobalSettings() : renderChannelSettings(activeTab - 1)}
      </div>

      <div className="p-4 border-t border-zinc-900 bg-zinc-950 z-10 flex flex-col gap-3">
        <div className="flex gap-2">
            <button
            className={`flex-1 py-3 rounded-xl font-bold flex flex-col items-center justify-center gap-0.5 transition-all transform active:scale-95 ${
                !originalImage || isProcessing
                ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-900/20'
            }`}
            onClick={handleEncode}
            disabled={!originalImage || isProcessing}
            >
            {isProcessing ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
                <>
                <div className="flex items-center gap-2">
                  <Play className="w-4 h-4 fill-current" /> 
                  ENCODE
                </div>
                <span className="text-[10px] opacity-60 font-normal">E</span>
                </>
            )}
            </button>
            
            <button
            className={`flex-1 py-3 rounded-xl font-bold flex flex-col items-center justify-center gap-0.5 transition-all transform active:scale-95 ${
                !processedImage
                ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white border border-zinc-700'
            }`}
            onClick={handleSaveImage}
            disabled={!processedImage}
            >
            <div className="flex items-center gap-2">
              <Download className="w-4 h-4" /> SAVE
            </div>
            <span className="text-[10px] opacity-60 font-normal">S</span>
            </button>
        </div>
        
        {processedImage && (
          <button
            className={`w-full py-3 rounded-xl font-bold flex flex-col items-center justify-center gap-0.5 transition-all transform active:scale-95 ${
                isProcessing
                ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                : 'bg-purple-600 text-white hover:bg-purple-500 shadow-lg shadow-purple-900/20'
            }`}
            onClick={handleReEncode}
            disabled={isProcessing}
          >
            {isProcessing ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
                <>
                <div className="flex items-center gap-2">
                  <Play className="w-4 h-4 fill-current" /> 
                  RE-ENCODE (Iterative)
                </div>
                <span className="text-[10px] opacity-60 font-normal">R</span>
                </>
            )}
          </button>
        )}
        
        <div className="flex gap-2">
          <button
              className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all flex flex-col items-center justify-center gap-1 ${
                  !encodedBlob
                  ? 'text-zinc-600 bg-zinc-900 cursor-not-allowed'
                  : 'text-zinc-300 hover:text-zinc-100 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700'
              }`}
              onClick={handleSaveGlic}
              disabled={!encodedBlob}
          >
              <div className="flex items-center gap-2">
                <Download className="w-3 h-3" /> Save .glic
              </div>
              <span className="text-[9px] opacity-60 font-normal">G</span>
          </button>
          
          <button
              className="flex-1 py-2 rounded-lg text-xs font-medium text-zinc-300 hover:text-zinc-100 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 transition-all flex flex-col items-center justify-center gap-1"
              onClick={handleImportGlic}
          >
              <div className="flex items-center gap-2">
                <Settings className="w-3 h-3" /> Import .glic
              </div>
              <span className="text-[9px] opacity-60 font-normal">I</span>
          </button>
        </div>
      </div>
    </div>
  );
};
