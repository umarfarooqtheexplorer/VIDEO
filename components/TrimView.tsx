import React, { useEffect, useState, useRef, useCallback } from 'react';
import { ChevronLeft, Save, Play, Pause, Crop as CropIcon, Scissors, RotateCcw } from 'lucide-react';
import { MediaItem } from '../types';
import { getMediaItem, updateMediaItem } from '../services/db';
import Layout from './Layout';
import GlossyButton from './GlossyButton';

interface TrimViewProps {
  mediaId: string;
  onBack: () => void;
  onSave: () => void;
}

interface CropRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

const TrimView: React.FC<TrimViewProps> = ({ mediaId, onBack, onSave }) => {
  const [item, setItem] = useState<MediaItem | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [endTime, setEndTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  
  // Edit Mode
  const [mode, setMode] = useState<'trim' | 'crop'>('trim');
  
  // Crop State (0..1 normalized coordinates)
  const [crop, setCrop] = useState<CropRect>({ x: 0, y: 0, width: 1, height: 1 });
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);
  const dragStartRef = useRef<{x: number, y: number, crop: CropRect, action: string} | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const load = async () => {
        const i = await getMediaItem(mediaId);
        if (i && i.type === 'video') {
            setItem(i);
            setVideoUrl(URL.createObjectURL(i.blob));
            if (i.crop) {
                setCrop(i.crop);
            }
        }
    };
    load();
  }, [mediaId]);

  const updateThumbnail = useCallback(() => {
      if (videoRef.current) {
          const video = videoRef.current;
          const canvas = document.createElement('canvas');
          // Output size (thumbnail)
          const thumbW = 160;
          const thumbH = 160 * (crop.height * video.videoHeight) / (crop.width * video.videoWidth); // Maintain aspect of crop
          
          canvas.width = thumbW;
          canvas.height = thumbH;
          
          const ctx = canvas.getContext('2d');
          if (ctx) {
              // Draw cropped region
              ctx.drawImage(
                  video, 
                  crop.x * video.videoWidth, 
                  crop.y * video.videoHeight, 
                  crop.width * video.videoWidth, 
                  crop.height * video.videoHeight,
                  0, 0, thumbW, thumbH
              );
              setThumbnailUrl(canvas.toDataURL());
          }
      }
  }, [crop]);

  // Update thumbnail when crop changes (debounced slightly or on end?)
  // We'll update on drag end mostly, or effect
  useEffect(() => {
      // Small debounce could be good, but direct update is responsive
      const timer = setTimeout(updateThumbnail, 100);
      return () => clearTimeout(timer);
  }, [crop, updateThumbnail]);


  const handleLoadedMetadata = () => {
      if (videoRef.current) {
          const d = videoRef.current.duration;
          setDuration(d);
          // Default to current trim or full length
          setEndTime(item?.trimEndTime || d);
      }
  };

  const handleLoadedData = () => {
      updateThumbnail();
  };

  const handleTimeUpdate = () => {
      if (videoRef.current) {
          const t = videoRef.current.currentTime;
          setCurrentTime(t);
          // Auto-pause if we pass the trim point
          if (t >= endTime && isPlaying) {
              videoRef.current.pause();
              setIsPlaying(false);
              videoRef.current.currentTime = endTime;
          }
      }
  };

  const togglePlay = () => {
      if (videoRef.current) {
          if (isPlaying) {
              videoRef.current.pause();
              setIsPlaying(false);
          } else {
              // Reset if at end
              if (videoRef.current.currentTime >= endTime) {
                  videoRef.current.currentTime = 0;
              }
              videoRef.current.play();
              setIsPlaying(true);
          }
      }
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseFloat(e.target.value);
      setEndTime(val);
      if (videoRef.current) {
          videoRef.current.currentTime = val; // Preview the end frame
          setIsPlaying(false);
      }
  };

  const handleSaveClick = () => {
      setShowConfirm(true);
  };

  const performSave = async () => {
      if (item) {
          // Update the item
          const updated: MediaItem = {
              ...item,
              trimNeeded: false, // Mark fixed
              trimEndTime: endTime,
              duration: endTime, // Update display duration
              crop: crop
          };
          await updateMediaItem(updated);
          setShowConfirm(false);
          onSave();
      }
  };

  // --- Crop Interaction Handlers ---

  const getTouchPos = (e: React.TouchEvent | React.MouseEvent, rect: DOMRect) => {
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
      return {
          x: (clientX - rect.left) / rect.width,
          y: (clientY - rect.top) / rect.height
      };
  };

  const handleCropStart = (e: React.TouchEvent | React.MouseEvent, action: string) => {
      if (videoRef.current) {
          e.stopPropagation(); // Prevent play toggle
          e.preventDefault();
          const rect = videoRef.current.getBoundingClientRect();
          const pos = getTouchPos(e, rect);
          dragStartRef.current = { x: pos.x, y: pos.y, crop: { ...crop }, action };
          setIsDraggingCrop(true);
      }
  };

  const handleCropMove = (e: React.TouchEvent | React.MouseEvent) => {
      if (!isDraggingCrop || !dragStartRef.current) return;
      if (videoRef.current) {
          const rect = videoRef.current.getBoundingClientRect();
          const pos = getTouchPos(e, rect);
          const start = dragStartRef.current;
          const deltaX = pos.x - start.x;
          const deltaY = pos.y - start.y;
          
          let newCrop = { ...start.crop };

          // Basic resizing logic with clamping
          if (start.action === 'move') {
              newCrop.x = Math.max(0, Math.min(1 - newCrop.width, start.crop.x + deltaX));
              newCrop.y = Math.max(0, Math.min(1 - newCrop.height, start.crop.y + deltaY));
          } else {
              // Scaling
              if (start.action.includes('e')) {
                  newCrop.width = Math.max(0.1, Math.min(1 - newCrop.x, start.crop.width + deltaX));
              }
              if (start.action.includes('s')) {
                  newCrop.height = Math.max(0.1, Math.min(1 - newCrop.y, start.crop.height + deltaY));
              }
              if (start.action.includes('w')) {
                  const maxDelta = start.crop.width - 0.1;
                  const validDelta = Math.min(Math.max(deltaX, -start.crop.x), maxDelta);
                  newCrop.x = start.crop.x + validDelta;
                  newCrop.width = start.crop.width - validDelta;
              }
              if (start.action.includes('n')) {
                  const maxDelta = start.crop.height - 0.1;
                  const validDelta = Math.min(Math.max(deltaY, -start.crop.y), maxDelta);
                  newCrop.y = start.crop.y + validDelta;
                  newCrop.height = start.crop.height - validDelta;
              }
          }

          setCrop(newCrop);
      }
  };

  const handleCropEnd = () => {
      setIsDraggingCrop(false);
      dragStartRef.current = null;
  };
  
  const resetCrop = (e: React.MouseEvent) => {
      e.stopPropagation();
      setCrop({ x: 0, y: 0, width: 1, height: 1 });
  };

  // Render Crop Overlay
  const renderCropOverlay = () => {
      if (mode !== 'crop') return null;
      
      const left = `${crop.x * 100}%`;
      const top = `${crop.y * 100}%`;
      const width = `${crop.width * 100}%`;
      const height = `${crop.height * 100}%`;

      return (
          <div 
            className="absolute inset-0 z-20 touch-none"
            onTouchMove={handleCropMove}
            onTouchEnd={handleCropEnd}
            onMouseMove={handleCropMove}
            onMouseUp={handleCropEnd}
            onMouseLeave={handleCropEnd}
          >
              {/* Dimmed Background constructed of 4 rects to avoid complex clipping issues if z-index is tricky */}
              <div className="absolute bg-black/50" style={{ left: 0, top: 0, width: '100%', height: top }} />
              <div className="absolute bg-black/50" style={{ left: 0, top: parseFloat(top) + parseFloat(height) + '%', width: '100%', bottom: 0 }} />
              <div className="absolute bg-black/50" style={{ left: 0, top: top, width: left, height: height }} />
              <div className="absolute bg-black/50" style={{ right: 0, top: top, width: 100 - (crop.x + crop.width) * 100 + '%', height: height }} />
              
              {/* Active Crop Box */}
              <div 
                className="absolute border-2 border-white box-border cursor-move"
                style={{ left, top, width, height }}
                onTouchStart={(e) => handleCropStart(e, 'move')}
                onMouseDown={(e) => handleCropStart(e, 'move')}
              >
                  {/* Grid Lines (Thirds) */}
                  <div className="absolute top-1/3 left-0 right-0 h-px bg-white/30 pointer-events-none" />
                  <div className="absolute top-2/3 left-0 right-0 h-px bg-white/30 pointer-events-none" />
                  <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/30 pointer-events-none" />
                  <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/30 pointer-events-none" />

                  {/* Corner Handles */}
                  <div 
                    className="absolute -top-3 -left-3 w-8 h-8 flex items-center justify-center z-30"
                    onTouchStart={(e) => handleCropStart(e, 'nw')}
                    onMouseDown={(e) => handleCropStart(e, 'nw')}
                  >
                      <div className="w-4 h-4 border-t-4 border-l-4 border-white rounded-tl-sm" />
                  </div>
                  <div 
                    className="absolute -top-3 -right-3 w-8 h-8 flex items-center justify-center z-30"
                    onTouchStart={(e) => handleCropStart(e, 'ne')}
                    onMouseDown={(e) => handleCropStart(e, 'ne')}
                  >
                      <div className="w-4 h-4 border-t-4 border-r-4 border-white rounded-tr-sm" />
                  </div>
                  <div 
                    className="absolute -bottom-3 -left-3 w-8 h-8 flex items-center justify-center z-30"
                    onTouchStart={(e) => handleCropStart(e, 'sw')}
                    onMouseDown={(e) => handleCropStart(e, 'sw')}
                  >
                      <div className="w-4 h-4 border-b-4 border-l-4 border-white rounded-bl-sm" />
                  </div>
                  <div 
                    className="absolute -bottom-3 -right-3 w-8 h-8 flex items-center justify-center z-30"
                    onTouchStart={(e) => handleCropStart(e, 'se')}
                    onMouseDown={(e) => handleCropStart(e, 'se')}
                  >
                      <div className="w-4 h-4 border-b-4 border-r-4 border-white rounded-br-sm" />
                  </div>
              </div>
          </div>
      );
  };

  if (!item) return <div className="text-center pt-20">Loading Clip...</div>;

  return (
    <Layout
      title={mode === 'crop' ? "Crop Video" : "Trim Video"}
      leftAction={
        <button onClick={onBack} className="text-blue-500">Cancel</button>
      }
      rightAction={
        <button onClick={handleSaveClick} className="font-bold text-blue-500">Save</button>
      }
    >
      <div className="flex flex-col h-full bg-black">
          {/* Main Viewer */}
          <div className="flex-1 flex items-center justify-center relative bg-gray-900 overflow-hidden">
              <div className="relative w-full h-full flex items-center justify-center">
                  <video 
                    ref={videoRef}
                    src={videoUrl}
                    className="max-w-full max-h-[60vh] object-contain"
                    onLoadedMetadata={handleLoadedMetadata}
                    onLoadedData={handleLoadedData}
                    onTimeUpdate={handleTimeUpdate}
                    onClick={mode === 'trim' ? togglePlay : undefined}
                    playsInline
                  />
                  
                  {renderCropOverlay()}
                  
                  {/* Play Button Overlay (Trim Mode Only) */}
                  {mode === 'trim' && !isPlaying && (
                      <button onClick={togglePlay} className="absolute inset-0 flex items-center justify-center z-10">
                          <div className="bg-black/40 p-4 rounded-full backdrop-blur-sm">
                            <Play size={32} fill="white" className="text-white ml-1" />
                          </div>
                      </button>
                  )}
              </div>
          </div>

          {/* Controls Area */}
          <div className="h-64 bg-gray-900 flex flex-col border-t border-gray-800">
              
              {/* Mode Switcher / Toolbar */}
              <div className="flex items-center justify-center gap-6 py-4 border-b border-gray-800">
                  <button 
                    onClick={() => setMode('trim')}
                    className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-colors ${mode === 'trim' ? 'text-yellow-400 bg-white/10' : 'text-gray-400'}`}
                  >
                      <Scissors size={20} />
                      <span className="text-[10px] font-bold tracking-wider">TRIM</span>
                  </button>
                  <button 
                    onClick={() => setMode('crop')}
                    className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-colors ${mode === 'crop' ? 'text-yellow-400 bg-white/10' : 'text-gray-400'}`}
                  >
                      <CropIcon size={20} />
                      <span className="text-[10px] font-bold tracking-wider">CROP</span>
                  </button>
                  {mode === 'crop' && (
                       <button 
                        onClick={resetCrop}
                        className="flex flex-col items-center gap-1 p-2 text-gray-400 active:text-white"
                        title="Reset Crop"
                       >
                           <RotateCcw size={20} />
                           <span className="text-[10px] font-bold tracking-wider">RESET</span>
                       </button>
                  )}
              </div>

              {/* Dynamic Controls based on Mode */}
              <div className="flex-1 p-6 relative">
                  {mode === 'trim' ? (
                    <>
                        <div className="flex justify-between text-gray-400 text-xs font-mono mb-4">
                            <span>0:00</span>
                            <span className="text-white font-bold text-lg">{endTime.toFixed(1)}s</span>
                            <span>{duration.toFixed(1)}s</span>
                        </div>
                        
                        {/* Thumbnail Display (Updated with crop) */}
                        {thumbnailUrl && (
                            <div className="mb-2 flex items-center">
                                <img 
                                    src={thumbnailUrl} 
                                    alt="Clip Thumbnail" 
                                    className="h-12 w-auto rounded border border-gray-600 shadow-sm bg-black object-contain"
                                />
                                <span className="ml-3 text-xs text-gray-500 font-medium">Start Frame (Preview)</span>
                            </div>
                        )}

                        <div className="relative h-12 bg-gray-800 rounded-lg overflow-hidden flex items-center px-2 border border-gray-700">
                            <div className="absolute left-0 top-0 bottom-0 bg-blue-500/30 border-r-2 border-blue-500" style={{ width: `${(endTime / duration) * 100}%` }}></div>
                            <input 
                                type="range"
                                min="0"
                                max={duration}
                                step="0.01"
                                value={endTime}
                                onChange={handleSliderChange}
                                className="relative w-full z-10 accent-yellow-400 h-8 cursor-pointer opacity-80 hover:opacity-100"
                            />
                        </div>
                        <p className="text-center text-gray-500 text-xs mt-4">Drag slider to set end time</p>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center px-4">
                        <p className="text-white font-medium mb-1">Crop Video</p>
                        <p className="text-gray-500 text-sm">Drag corners to resize. Drag center to move.</p>
                        {/* Could add aspect ratio presets here if requested, but freeform is default */}
                    </div>
                  )}
              </div>
          </div>
      </div>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-6">
            <div className="bg-[#F2F2F7] w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl animate-scale-in">
                 <div className="pt-6 pb-4 text-center px-4">
                     <h3 className="text-lg font-bold text-black mb-1">Save Changes?</h3>
                     <p className="text-sm text-gray-500">Changes to crop and trim will be applied. Original file is preserved.</p>
                 </div>
                 <div className="flex border-t border-gray-300 divide-x divide-gray-300">
                     <button 
                        onClick={() => setShowConfirm(false)} 
                        className="flex-1 py-3 text-blue-600 font-normal text-lg hover:bg-gray-100 active:bg-gray-200 transition-colors"
                     >
                        Cancel
                     </button>
                     <button 
                        onClick={performSave} 
                        className="flex-1 py-3 text-blue-600 font-semibold text-lg hover:bg-gray-100 active:bg-gray-200 transition-colors"
                     >
                        Save
                     </button>
                 </div>
            </div>
        </div>
      )}
    </Layout>
  );
};

export default TrimView;