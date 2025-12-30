import React, { useEffect, useState, useRef } from 'react';
import { ChevronLeft, Camera, Image as ImageIcon, Video, AlertCircle, X, GripVertical, Play } from 'lucide-react';
import { Session, MediaItem } from '../types';
import { getSessions, getMediaForSession, updateMediaItems } from '../services/db';
import GlossyButton from './GlossyButton';
import Layout from './Layout';

interface SessionDetailProps {
  sessionId: string;
  onBack: () => void;
  onOpenCamera: (mode: 'video' | 'photo') => void;
  onOpenTrim: (mediaId: string) => void;
}

const SessionDetail: React.FC<SessionDetailProps> = ({ sessionId, onBack, onOpenCamera, onOpenTrim }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [media, setMedia] = useState<MediaItem[]>([]);
  
  // Preview State
  const [previewItem, setPreviewItem] = useState<MediaItem | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // Drag and Drop State
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  
  // Merge/Sequence State
  const [isMerging, setIsMerging] = useState(false);
  const [mergeQueue, setMergeQueue] = useState<MediaItem[]>([]);
  const [currentMergeIndex, setCurrentMergeIndex] = useState(0);
  const mergeVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    loadData();
  }, [sessionId]);

  const loadData = async () => {
    const sessions = await getSessions();
    const s = sessions.find(s => s.id === sessionId);
    setSession(s || null);
    
    const m = await getMediaForSession(sessionId);
    setMedia(m);
  };

  const handleMediaClick = (item: MediaItem) => {
    if (item.trimNeeded && item.type === 'video') {
        onOpenTrim(item.id);
    } else {
        setPreviewItem(item);
    }
  };

  const getUrl = (blob: Blob) => URL.createObjectURL(blob);

  // Time formatter
  const formatDuration = (sec?: number) => {
      if (!sec) return "";
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // --- Drag and Drop Logic ---
  const handleDragStart = (e: React.DragEvent, index: number) => {
      setDraggedIndex(index);
      // Create ghost image or use default
      e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
      e.preventDefault();
      if (draggedIndex === null || draggedIndex === index) return;
      
      const newMedia = [...media];
      const draggedItem = newMedia[draggedIndex];
      newMedia.splice(draggedIndex, 1);
      newMedia.splice(index, 0, draggedItem);
      
      setDraggedIndex(index);
      setMedia(newMedia);
  };

  const handleDragEnd = async () => {
      setDraggedIndex(null);
      // Persist new order
      const updates = media.map((item, index) => ({ ...item, order: index }));
      await updateMediaItems(updates);
  };

  // --- Merge / Sequence Logic ---
  const handleMerge = () => {
      const videos = media.filter(m => m.type === 'video');
      if (videos.length === 0) {
          alert("No videos to merge.");
          return;
      }
      setMergeQueue(videos);
      setCurrentMergeIndex(0);
      setIsMerging(true);
  };

  const handleMergeTimeUpdate = () => {
      const video = mergeVideoRef.current;
      const currentItem = mergeQueue[currentMergeIndex];
      
      if (video && currentItem && currentItem.trimEndTime) {
          if (video.currentTime >= currentItem.trimEndTime) {
              playNextInQueue();
          }
      }
  };

  const playNextInQueue = () => {
      if (currentMergeIndex < mergeQueue.length - 1) {
          setCurrentMergeIndex(prev => prev + 1);
      } else {
          setIsMerging(false); // Done
      }
  };

  // --- Single Preview Logic ---
  const handlePreviewTimeUpdate = () => {
      const video = videoRef.current;
      if (video && previewItem && previewItem.trimEndTime) {
          if (video.currentTime >= previewItem.trimEndTime) {
              video.pause();
              video.currentTime = previewItem.trimEndTime;
          }
      }
  };


  if (!session) return <div>Loading...</div>;

  return (
    <Layout
      title={session.name}
      leftAction={
        <button onClick={onBack} className="flex items-center text-blue-500">
          <ChevronLeft size={24} className="-ml-1" />
          Back
        </button>
      }
    >
      <div className="pb-36 bg-[#F2F2F7] min-h-full"> 
        
        {/* Inset Grouped List Header */}
        <div className="px-4 mt-6 mb-2 flex justify-between items-end">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide ml-3">Clips ({media.length})</span>
            <button 
                onClick={handleMerge}
                className="text-xs text-blue-500 font-medium mr-3 hover:text-blue-600 active:opacity-50"
            >
                Merge & Play
            </button>
        </div>

        {media.length === 0 ? (
            <div className="mx-4 bg-white rounded-xl p-8 flex flex-col items-center justify-center text-center shadow-sm">
                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3 text-gray-400">
                    <Camera size={24} />
                </div>
                <p className="text-gray-500 font-medium">No clips yet</p>
                <p className="text-xs text-gray-400 mt-1">Use the buttons below to record.</p>
            </div>
        ) : (
            <div className="mx-4 bg-white rounded-xl overflow-hidden shadow-sm">
                {media.map((item, index) => (
                    <div 
                        key={item.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDragEnd={handleDragEnd}
                        onClick={() => handleMediaClick(item)}
                        className={`flex items-center p-3 border-b border-gray-100 last:border-0 active:bg-gray-50 cursor-pointer transition-colors ${draggedIndex === index ? 'bg-blue-50 opacity-50' : ''}`}
                    >
                        {/* Thumbnail */}
                        <div className="relative w-16 h-16 bg-gray-200 rounded-lg overflow-hidden flex-shrink-0">
                            {item.type === 'photo' ? (
                                <img src={getUrl(item.blob)} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center bg-gray-800">
                                    <Video size={20} className="text-gray-500" />
                                </div>
                            )}
                            
                            {/* Photo Badge Overlay - Bottom Left per spec */}
                            {item.type === 'photo' && (
                                <div className="absolute bottom-1 left-1 bg-black/50 p-1 rounded backdrop-blur-sm">
                                    <Camera size={10} className="text-white" />
                                </div>
                            )}
                        </div>

                        {/* Info */}
                        <div className="ml-3 flex-1">
                            <div className="flex justify-between items-start">
                                <h4 className="font-semibold text-slate-900 text-sm">Clip {index + 1}</h4>
                                <span className="text-gray-400 text-xs">{new Date(item.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                            </div>
                            
                            <div className="flex items-center mt-1 gap-2">
                                <span className="text-xs text-gray-500">
                                    {item.type === 'video' ? formatDuration(item.trimEndTime || item.duration) : 'Photo'}
                                </span>
                                
                                {/* Flag Badge */}
                                {item.trimNeeded && (
                                    <span className="bg-red-100 text-red-600 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                                        <AlertCircle size={10} /> FIX REQUIRED
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Reorder Handle */}
                        <div className="text-gray-300 px-2 cursor-grab active:cursor-grabbing">
                            <GripVertical size={20} />
                        </div>
                    </div>
                ))}
            </div>
        )}

        {/* Dual Footer Actions */}
        <div className="fixed bottom-0 inset-x-0 p-4 bg-[#F2F2F7]/90 backdrop-blur-md border-t border-gray-300/50 z-20">
             <div className="flex gap-4 max-w-md mx-auto">
                <GlossyButton 
                    variant="primary" 
                    onClick={() => onOpenCamera('video')} 
                    icon={<Video size={24} fill="currentColor" className="opacity-80" />} 
                    label="VIDEO"
                    fullWidth
                    className="rounded-2xl shadow-lg" // Gradient handled in component
                />
                <GlossyButton 
                    variant="primary" 
                    onClick={() => onOpenCamera('photo')} 
                    icon={<Camera size={24} fill="currentColor" className="opacity-80" />} 
                    label="PHOTO"
                    fullWidth
                    className="rounded-2xl shadow-lg" // Gradient handled in component
                />
             </div>
        </div>
        
        {/* Preview Modal */}
        {previewItem && (
             <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center animate-fade-in">
                 <button 
                    onClick={() => setPreviewItem(null)}
                    className="absolute top-4 right-4 z-50 text-white/80 p-2 bg-gray-800/50 rounded-full backdrop-blur-md"
                 >
                    <X size={24} />
                 </button>
                 
                 <div className="w-full h-full flex items-center justify-center p-4">
                     {previewItem.type === 'photo' ? (
                         <img 
                            src={getUrl(previewItem.blob)} 
                            className="max-w-full max-h-full object-contain rounded-lg" 
                         />
                     ) : (
                         <div className="relative w-full h-full flex items-center justify-center">
                             <video 
                                ref={videoRef}
                                src={getUrl(previewItem.blob)} 
                                controls 
                                autoPlay 
                                className="max-w-full max-h-full rounded-lg"
                                onTimeUpdate={handlePreviewTimeUpdate}
                             />
                             {previewItem.trimEndTime && (
                                 <div className="absolute bottom-16 left-0 right-0 text-center text-white/50 text-xs">
                                     Preview ending at {previewItem.trimEndTime.toFixed(1)}s (Trimmed)
                                 </div>
                             )}
                         </div>
                     )}
                 </div>
             </div>
        )}

        {/* Merge / Sequence Player Modal */}
        {isMerging && mergeQueue.length > 0 && (
             <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center animate-fade-in">
                 <button 
                    onClick={() => setIsMerging(false)}
                    className="absolute top-4 right-4 z-50 text-white/80 p-2 bg-gray-800/50 rounded-full backdrop-blur-md"
                 >
                    <X size={24} />
                 </button>
                 
                 <div className="absolute top-4 left-4 z-50 flex items-center gap-2">
                     <span className="px-3 py-1 bg-red-600 rounded-full text-white text-xs font-bold animate-pulse">
                         MERGE PREVIEW
                     </span>
                     <span className="text-white/80 text-sm">
                         Clip {currentMergeIndex + 1} of {mergeQueue.length}
                     </span>
                 </div>

                 <div className="w-full h-full flex items-center justify-center p-0 bg-black">
                     <video 
                        key={mergeQueue[currentMergeIndex].id} // Force re-render on change
                        ref={mergeVideoRef}
                        src={getUrl(mergeQueue[currentMergeIndex].blob)} 
                        autoPlay 
                        className="max-w-full max-h-full"
                        onTimeUpdate={handleMergeTimeUpdate}
                        onEnded={playNextInQueue}
                     />
                 </div>
             </div>
        )}
      </div>
    </Layout>
  );
};

export default SessionDetail;