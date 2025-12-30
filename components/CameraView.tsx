import React, { useRef, useState, useEffect, useCallback } from 'react';
import { X, Video, Camera as CameraIcon, Flag, Zap, AlertTriangle, RefreshCw, Smartphone, Monitor, Square, FlipHorizontal } from 'lucide-react';
import { addMediaItem } from '../services/db';
import { MediaItem } from '../types';
import { Preferences } from '../services/preferences';

interface CameraViewProps {
  sessionId: string;
  initialMode: 'video' | 'photo';
  onClose: () => void;
  onNavigateToTrim: (mediaId: string) => void;
}

type AspectRatio = '9:16' | '3:4' | '1:1';

const CameraView: React.FC<CameraViewProps> = ({ sessionId, initialMode, onClose, onNavigateToTrim }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  
  const [mode, setMode] = useState<'photo' | 'video'>(initialMode);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [isMirrored, setIsMirrored] = useState(false); // Independent mirror state
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  
  // Camera Capabilities
  const [hasTorch, setHasTorch] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [canZoom, setCanZoom] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [maxZoom, setMaxZoom] = useState(1);
  const [minZoom, setMinZoom] = useState(1);
  
  // Gesture State
  const [pinchStartDist, setPinchStartDist] = useState<number | null>(null);
  const [pinchStartZoom, setPinchStartZoom] = useState(1);
  
  // Ratio State
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16');

  // Workflow State
  const [showFlagModal, setShowFlagModal] = useState(false);
  const [pendingFlaggedBlob, setPendingFlaggedBlob] = useState<Blob | null>(null);
  const [dontRemindFlag, setDontRemindFlag] = useState(false);

  const timerRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingStartTimeRef = useRef<number>(0);

  // Initialize Camera
  const startCamera = useCallback(async () => {
    setPermissionDenied(false);
    setErrorMsg('');
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    
    try {
        let stream: MediaStream;

        // Attempt 1: Standard Video + Audio
        try {
             stream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: facingMode },
                audio: true 
            });
        } catch (err: any) {
            console.warn("Standard init failed, trying fallback (no audio)", err);
            // Attempt 2: Video Only 
            stream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: facingMode },
                audio: false
            });
        }
        
        streamRef.current = stream;
        const videoTrack = stream.getVideoTracks()[0];
        trackRef.current = videoTrack;

        // Determine effective facing mode from track settings if available, otherwise fallback to requested state
        const settings = videoTrack.getSettings ? videoTrack.getSettings() : {};
        const actualFacingMode = settings.facingMode || facingMode;

        // Auto-set mirror: Always mirror if facing 'user', unmirror otherwise.
        setIsMirrored(actualFacingMode === 'user');

        if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(e => console.log("Play interrupted (non-fatal)", e));
        }

        const capabilities = videoTrack.getCapabilities ? videoTrack.getCapabilities() : {};
        
        // @ts-ignore
        setHasTorch(!!capabilities.torch);
        setIsTorchOn(false);

        // @ts-ignore
        if (capabilities.zoom) {
            setCanZoom(true);
            // @ts-ignore
            setMinZoom(capabilities.zoom.min);
            // @ts-ignore
            setMaxZoom(capabilities.zoom.max);
            // @ts-ignore
            setZoomLevel(Math.max(capabilities.zoom.min, 1));
        }

        applyRatioConstraints(aspectRatio, videoTrack);

        // Try Upgrade to HD
        try {
            await videoTrack.applyConstraints({
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                // @ts-ignore
                advanced: hasTorch ? [{ torch: false }] : undefined 
            });
        } catch (e) {
            console.log("HD Upgrade failed, sticking to default resolution", e);
        }

    } catch (err: any) {
        console.error("Camera Fatal Error:", err);
        setPermissionDenied(true);
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            setErrorMsg("Permission denied. You must allow camera access in browser settings.");
        } else if (err.name === 'NotFoundError') {
            setErrorMsg("No camera device found on this device.");
        } else if (err.name === 'NotReadableError') {
            setErrorMsg("Camera is in use by another application.");
        } else {
            setErrorMsg("Unable to start camera.");
        }
    }
  }, [facingMode]);

  useEffect(() => {
    startCamera();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [startCamera]);

  const applyRatioConstraints = async (ratio: AspectRatio, track?: MediaStreamTrack) => {
      const t = track || trackRef.current;
      if (!t) return;

      let numericRatio;
      switch(ratio) {
          case '1:1': numericRatio = 1; break;
          case '3:4': numericRatio = 0.75; break;
          case '9:16': default: return; 
      }

      try {
          await t.applyConstraints({
              aspectRatio: numericRatio
          });
      } catch (e) {
          console.warn("Could not apply native aspect ratio", e);
      }
  };

  const cycleRatio = () => {
      let next: AspectRatio = '9:16';
      if (aspectRatio === '9:16') next = '3:4';
      else if (aspectRatio === '3:4') next = '1:1';
      else next = '9:16';
      
      setAspectRatio(next);
      applyRatioConstraints(next);
  };

  const applyTorch = async (on: boolean) => {
      if (trackRef.current && hasTorch) {
          try {
             // @ts-ignore
             await trackRef.current.applyConstraints({ advanced: [{ torch: on }] });
             setIsTorchOn(on);
          } catch(e) { console.warn("Torch failed", e); }
      }
  };

  // Unified Zoom Handler
  const setZoom = useCallback(async (val: number) => {
      // Clamp to supported range and cap at 5x for usability
      const cap = Math.min(maxZoom, 5);
      const clamped = Math.max(minZoom, Math.min(cap, val));
      
      setZoomLevel(clamped);
      
      if (trackRef.current && canZoom) {
          try {
            // @ts-ignore
            await trackRef.current.applyConstraints({ advanced: [{ zoom: clamped }] });
          } catch(e) { console.warn("Zoom failed", e); }
      }
  }, [minZoom, maxZoom, canZoom]);

  const handleZoomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseFloat(e.target.value);
      setZoom(val);
  };

  // Gesture Handlers
  const handleTouchStart = (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
          // Pinch started
          const dist = Math.hypot(
              e.touches[0].clientX - e.touches[1].clientX,
              e.touches[0].clientY - e.touches[1].clientY
          );
          setPinchStartDist(dist);
          setPinchStartZoom(zoomLevel);
      }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
      if (e.touches.length === 2 && pinchStartDist !== null) {
          const dist = Math.hypot(
              e.touches[0].clientX - e.touches[1].clientX,
              e.touches[0].clientY - e.touches[1].clientY
          );
          
          const ratio = dist / pinchStartDist;
          setZoom(pinchStartZoom * ratio);
      }
  };

  const handleTouchEnd = () => {
      setPinchStartDist(null);
  };

  const toggleCamera = () => {
    if (navigator.vibrate) navigator.vibrate(10);
    // Optimistically update mirror state for smoother UI transition
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);
    setIsMirrored(nextMode === 'user');
  };

  const toggleMirror = () => {
      setIsMirrored(prev => !prev);
  };

  const getBestMimeType = () => {
      const types = [
          'video/mp4; codecs="avc1.42E01E, mp4a.40.2"', 
          'video/mp4',
          'video/webm; codecs=h264', 
          'video/webm; codecs=vp9',
          'video/webm'
      ];
      return types.find(t => MediaRecorder.isTypeSupported(t)) || '';
  };

  const startRecording = () => {
    if (!streamRef.current) return;
    if (navigator.vibrate) navigator.vibrate(20);

    const mimeType = getBestMimeType();
    
    try {
        const recorder = new MediaRecorder(streamRef.current, { 
            mimeType: mimeType || undefined 
        });
        
        chunksRef.current = [];
        
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        
        recorder.start(250); 
        mediaRecorderRef.current = recorder;
        setIsRecording(true);
        setRecordingTime(0);
        recordingStartTimeRef.current = Date.now();
        
        timerRef.current = window.setInterval(() => {
          setRecordingTime(t => t + 1);
        }, 1000);
    } catch (e) {
        console.error("Recording Start Error", e);
        alert("Could not start recording. Please restart the app.");
    }
  };

  const stopRecording = () => finishRecording(false);
  const stopRecordingFlagged = () => finishRecording(true);

  const finishRecording = (isFlagged: boolean) => {
    if (mediaRecorderRef.current && isRecording) {
      if (navigator.vibrate) navigator.vibrate([10, 50, 10]);

      const duration = Date.now() - recordingStartTimeRef.current;
      if (duration < 500) {
          mediaRecorderRef.current.stop();
          setIsRecording(false);
          if (timerRef.current) clearInterval(timerRef.current);
          return; 
      }

      mediaRecorderRef.current.onstop = async () => {
        const type = mediaRecorderRef.current?.mimeType || 'video/webm';
        const blob = new Blob(chunksRef.current, { type: type.split(';')[0] });
        chunksRef.current = [];
        
        if (isFlagged) {
            handleFlaggedWorkflow(blob);
        } else {
            await saveMedia(blob, 'video', false);
        }
      };

      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const handleFlaggedWorkflow = async (blob: Blob) => {
      const shouldSkip = Preferences.getShouldSkipFlagPrompt();
      if (shouldSkip) {
          await saveMedia(blob, 'video', true);
      } else {
          setPendingFlaggedBlob(blob);
          setShowFlagModal(true);
      }
  };

  const handleModalFixNow = async () => {
      if (!pendingFlaggedBlob) return;
      const mediaId = await saveMedia(pendingFlaggedBlob, 'video', true);
      setShowFlagModal(false);
      if (mediaId) {
        onNavigateToTrim(mediaId);
      }
  };

  const handleModalJustFlag = async () => {
      if (!pendingFlaggedBlob) return;
      if (dontRemindFlag) {
          Preferences.setShouldSkipFlagPrompt(true);
      }
      await saveMedia(pendingFlaggedBlob, 'video', true);
      setShowFlagModal(false);
      setPendingFlaggedBlob(null);
  };

  const takePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    if (navigator.vibrate) navigator.vibrate(15);
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Smart Crop Calculation
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    
    let targetW = vw;
    let targetH = vh;
    
    if (aspectRatio === '1:1') {
        const minDim = Math.min(vw, vh);
        targetW = minDim;
        targetH = minDim;
    } else if (aspectRatio === '3:4') {
        if (vw < vh) { // Portrait Source
            targetW = vw;
            targetH = vw / 0.75;
            if (targetH > vh) { 
                targetH = vh;
                targetW = vh * 0.75;
            }
        } else { 
            targetH = vh;
            targetW = vh * 0.75; 
        }
    }

    const startX = (vw - targetW) / 2;
    const startY = (vh - targetH) / 2;

    canvas.width = targetW;
    canvas.height = targetH;
    
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    
    // Apply mirror if enabled in view
    if (isMirrored) {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
    }
    
    ctx.drawImage(video, startX, startY, targetW, targetH, 0, 0, targetW, targetH);
    
    const feedback = document.getElementById('flash-feedback');
    if (feedback) {
      feedback.style.opacity = '1';
      setTimeout(() => feedback.style.opacity = '0', 100);
    }

    canvas.toBlob(async (blob) => {
      if (blob) await saveMedia(blob, 'photo', false);
    }, 'image/jpeg', 0.90);
  };

  const saveMedia = async (blob: Blob, type: 'photo' | 'video', flagged: boolean): Promise<string | null> => {
    const id = crypto.randomUUID();
    const item: MediaItem = {
      id,
      sessionId,
      type,
      blob,
      createdAt: Date.now(),
      duration: type === 'video' ? recordingTime : 0,
      trimNeeded: flagged,
      order: 0
    };
    
    try {
      await addMediaItem(item);
      return id;
    } catch (e) {
      console.error("Save failed", e);
      return null;
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const renderMasks = () => {
      if (aspectRatio === '9:16') return null; 

      let maskHeight = '0%';
      if (aspectRatio === '1:1') {
          maskHeight = '20%'; 
      } else if (aspectRatio === '3:4') {
          maskHeight = '10%';
      }

      return (
          <>
            <div className="absolute top-0 left-0 right-0 bg-black/60 backdrop-blur-sm transition-all duration-300 pointer-events-none z-10" style={{ height: maskHeight }} />
            <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-sm transition-all duration-300 pointer-events-none z-10" style={{ height: maskHeight }} />
          </>
      );
  };

  const getRatioLabel = (r: AspectRatio) => {
      switch(r) {
          case '1:1': return '1:1';
          case '3:4': return '4:3';
          case '9:16': return 'FULL';
      }
  }

  if (permissionDenied) {
      return (
        <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center p-6 text-center">
             <AlertTriangle size={48} className="text-yellow-500 mb-4" />
             <h2 className="text-white text-xl font-bold mb-2">Camera Issue</h2>
             <p className="text-gray-400 mb-6 px-4">
                {errorMsg}
             </p>
             <div className="flex gap-4">
                 <button 
                    onClick={onClose} 
                    className="px-6 py-2 rounded-lg bg-gray-800 text-white font-semibold"
                 >
                     Cancel
                 </button>
                 <button 
                    onClick={() => startCamera()} 
                    className="px-6 py-2 rounded-lg bg-blue-600 text-white font-semibold flex items-center gap-2"
                 >
                     <RefreshCw size={18} /> Retry
                 </button>
             </div>
        </div>
      );
  }

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <div id="flash-feedback" className="absolute inset-0 bg-white opacity-0 pointer-events-none transition-opacity duration-150 z-50" />

      {/* Header */}
      <div className="relative h-16 flex items-center justify-between px-4 bg-black/40 backdrop-blur-sm z-20">
        <button onClick={onClose} className="p-2 text-white">
            <X size={28} />
        </button>
        
        <div className="flex flex-col items-center">
            {isRecording && (
                <div className="flex items-center gap-2 px-3 py-1 bg-red-600/80 rounded-full animate-pulse">
                    <div className="w-2 h-2 rounded-full bg-white" />
                    <span className="text-white font-mono font-medium">{formatTime(recordingTime)}</span>
                </div>
            )}
            
            {/* Aspect Ratio Toggle */}
            {!isRecording && (
                <button 
                    onClick={cycleRatio}
                    className="mt-1 px-2 py-0.5 rounded border border-white/30 text-[10px] font-bold text-white uppercase tracking-wider bg-black/30 backdrop-blur-md active:bg-white/20"
                >
                    {getRatioLabel(aspectRatio)}
                </button>
            )}
        </div>
        
        <div className="flex gap-2 items-center">
            {/* Mirror Toggle */}
             <button 
                onClick={toggleMirror} 
                className={`p-2 text-white ${isMirrored ? 'text-blue-400' : 'text-white/70'}`}
                title="Mirror Preview"
             >
                <FlipHorizontal size={20} />
            </button>
            
            {hasTorch && (
                <button 
                  onClick={() => applyTorch(!isTorchOn)}
                  className={`p-2 ${isTorchOn ? 'text-yellow-400' : 'text-white'}`}
                >
                    <Zap size={20} fill={isTorchOn ? "currentColor" : "none"} />
                </button>
            )}
            <button onClick={toggleCamera} className="p-2 text-white">
                <RefreshCw size={20} className="rotate-90" />
            </button>
        </div>
      </div>

      {/* Viewport with Pinch-to-Zoom */}
      <div 
        className="flex-1 relative overflow-hidden bg-black flex items-center justify-center group touch-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <video 
            ref={videoRef}
            autoPlay 
            playsInline 
            muted 
            className={`absolute w-full h-full object-cover transition-transform duration-300 ${isMirrored ? 'scale-x-[-1]' : ''}`}
        />
        <canvas ref={canvasRef} className="hidden" />

        {/* Dynamic Aspect Ratio Masks */}
        {renderMasks()}

        {canZoom && (
            <div className="absolute right-4 inset-y-0 flex items-center justify-center z-20 pointer-events-none">
                 <div className="pointer-events-auto h-64 bg-black/30 backdrop-blur-md rounded-full w-10 flex flex-col items-center py-4 border border-white/10">
                    <span className="text-white text-[10px] mb-2 font-mono font-bold">5x</span>
                    <div className="flex-1 w-full flex items-center justify-center relative">
                        {/* Rotated Range Input for better browser support */}
                        <input 
                            type="range" 
                            min={minZoom} 
                            max={Math.min(maxZoom, 5)} 
                            step="0.1"
                            value={zoomLevel}
                            onChange={handleZoomChange}
                            className="absolute w-48 h-10 bg-transparent -rotate-90 origin-center appearance-none cursor-pointer
                                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-md
                                [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:bg-white/30 [&::-webkit-slider-runnable-track]:rounded-full"
                        />
                    </div>
                    <span className="text-white text-[10px] mt-2 font-mono font-bold">1x</span>
                 </div>
            </div>
        )}
      </div>

      {/* Controls */}
      <div className="h-48 bg-black/80 backdrop-blur-md pb-safe-bottom flex flex-col justify-between relative z-20">
        
        <div className="flex justify-center pt-4 gap-8 text-sm font-semibold tracking-widest">
            <button 
                onClick={() => !isRecording && setMode('video')}
                className={`${mode === 'video' ? 'text-yellow-400' : 'text-gray-500'} transition-colors`}
            >
                VIDEO
            </button>
            <button 
                onClick={() => !isRecording && setMode('photo')}
                className={`${mode === 'photo' ? 'text-yellow-400' : 'text-gray-500'} transition-colors`}
            >
                PHOTO
            </button>
        </div>

        <div className="flex-1 flex items-center justify-center relative px-8">
             <div className="flex-1 flex justify-start">
                 {mode === 'video' && isRecording && (
                     <button 
                        onClick={stopRecordingFlagged}
                        className="w-14 h-14 bg-gray-800 rounded-full flex items-center justify-center text-orange-500 border-2 border-orange-500/50 active:scale-95 transition-transform"
                     >
                         <Flag size={24} fill="currentColor" />
                     </button>
                 )}
             </div>

             <div className="flex-0 relative mx-4">
                <div className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center">
                    {mode === 'video' ? (
                        <button 
                            onClick={isRecording ? stopRecording : startRecording}
                            className={`w-16 h-16 rounded-full transition-all duration-200 ${isRecording ? 'bg-red-500 scale-50 rounded-sm' : 'bg-red-500 scale-90'}`}
                        />
                    ) : (
                        <button 
                            onClick={takePhoto}
                            className="w-16 h-16 rounded-full bg-white scale-90 active:scale-75 transition-transform duration-100"
                        />
                    )}
                </div>
             </div>
             
             <div className="flex-1"></div> 
        </div>
      </div>

      {showFlagModal && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-6">
              <div className="bg-[#F2F2F7] w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl animate-scale-in">
                  <div className="pt-6 pb-4 text-center px-4">
                      <h3 className="text-lg font-bold text-black mb-1">Issue Detected?</h3>
                      <p className="text-sm text-gray-500">Mark this clip for fixing?</p>
                  </div>
                  
                  <div className="flex flex-col border-t border-gray-300 divide-y divide-gray-300">
                      <button 
                        onClick={handleModalFixNow}
                        className="py-3 text-blue-600 font-semibold text-lg hover:bg-gray-100 active:bg-gray-200 transition-colors"
                      >
                          Fix Now
                      </button>
                      <button 
                        onClick={handleModalJustFlag}
                        className="py-3 text-blue-600 font-normal text-lg hover:bg-gray-100 active:bg-gray-200 transition-colors"
                      >
                          Just Flag (Fix Later)
                      </button>
                  </div>
                  
                  <div className="p-4 bg-gray-100 border-t border-gray-200 flex items-center gap-3 justify-center">
                        <input 
                            type="checkbox" 
                            id="dontRemind"
                            checked={dontRemindFlag}
                            onChange={(e) => setDontRemindFlag(e.target.checked)}
                            className="w-5 h-5 rounded border-gray-400 text-blue-600 focus:ring-blue-500"
                        />
                        <label htmlFor="dontRemind" className="text-gray-500 text-sm">Do not remind me</label>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default CameraView;