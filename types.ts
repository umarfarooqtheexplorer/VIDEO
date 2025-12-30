export interface Session {
  id: string;
  name: string;
  createdAt: number;
  lastModified: number; // Added to track updates
  thumbnailUrl?: string; 
  itemCount: number;
}

export type MediaType = 'photo' | 'video';

export interface MediaItem {
  id: string;
  sessionId: string;
  type: MediaType;
  blob: Blob;
  createdAt: number;
  duration?: number; // Duration in seconds
  trimNeeded?: boolean; // Flagged for review
  trimEndTime?: number; // If trimmed, the new end time
  order: number; // For sorting
  crop?: { x: number; y: number; width: number; height: number };
}

export type ViewState = 
  | { name: 'home' }
  | { name: 'session', sessionId: string }
  | { name: 'camera', sessionId: string, initialMode: 'video' | 'photo' }
  | { name: 'trim', sessionId: string, mediaId: string }
  | { name: 'settings' };