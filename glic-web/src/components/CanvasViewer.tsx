import React, { useRef, useEffect, useState } from 'react';
import { useApp } from '../core/AppContext';
import { Upload, RefreshCw } from 'lucide-react';

export const CanvasViewer: React.FC = () => {
  const { originalImage, setOriginalImage, processedImage } = useApp();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    // Disable image smoothing for pixel-perfect rendering
    ctx.imageSmoothingEnabled = false;

    if (processedImage) {
      const img = new Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
      };
      img.src = processedImage;
    } else if (originalImage) {
      canvas.width = originalImage.width;
      canvas.height = originalImage.height;
      ctx.putImageData(originalImage, 0, 0);
    } else {
      // Clear
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, [originalImage, processedImage]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      loadImage(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadImage(file);
  };

  const loadImage = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (ctx) {
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, img.width, img.height);
          setOriginalImage(imageData);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div 
      className={`w-full h-full flex items-center justify-center relative bg-zinc-900/50 ${isDragging ? 'bg-blue-500/10' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      {!originalImage && !processedImage && (
        <div className={`text-center p-12 border-2 border-dashed rounded-2xl flex flex-col items-center gap-6 transition-all ${
            isDragging ? 'border-blue-500 bg-blue-500/5' : 'border-zinc-700 hover:border-zinc-600 hover:bg-zinc-800/50'
        }`}>
          <div className="p-4 bg-zinc-800 rounded-full">
            <Upload className={`w-8 h-8 ${isDragging ? 'text-blue-500' : 'text-zinc-400'}`} />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-zinc-200">Upload an Image</h3>
            <p className="text-zinc-500 text-sm">Drag & drop or click to browse</p>
          </div>
          <input 
            type="file" 
            accept="image/*" 
            className="hidden" 
            id="file-upload"
            onChange={handleFileSelect}
          />
          <label 
            htmlFor="file-upload" 
            className="px-6 py-2.5 bg-zinc-100 text-zinc-900 font-bold rounded-lg hover:bg-white cursor-pointer transition-colors shadow-lg shadow-zinc-900/20"
          >
            Select File
          </label>
        </div>
      )}
      <div className="relative max-w-[95%] max-h-[95%] overflow-hidden rounded-lg shadow-2xl shadow-black/50 border border-zinc-800">
        <canvas 
          ref={canvasRef} 
          className="max-w-full max-h-full object-contain"
          style={{ 
            display: (originalImage || processedImage) ? 'block' : 'none',
            imageRendering: 'pixelated'
          }}
        />
        
        {/* Change Image Button - appears when an image is loaded */}
        {(originalImage || processedImage) && (
          <div className="absolute top-4 right-4">
            <input 
              type="file" 
              accept="image/*" 
              className="hidden" 
              id="change-image-upload"
              onChange={handleFileSelect}
            />
            <label 
              htmlFor="change-image-upload" 
              className="px-4 py-2 bg-zinc-900/90 hover:bg-zinc-800 text-zinc-200 font-bold rounded-lg cursor-pointer transition-all flex items-center gap-2 shadow-lg border border-zinc-700 hover:border-zinc-600 backdrop-blur-sm"
            >
              <RefreshCw className="w-4 h-4" />
              Change Image
            </label>
          </div>
        )}
      </div>
      
      {/* Overlay info or controls could go here */}
    </div>
  );
};
