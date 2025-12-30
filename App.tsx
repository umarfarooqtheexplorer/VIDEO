import React, { useState } from 'react';
import { ViewState } from './types';
import SessionList from './components/SessionList';
import SessionDetail from './components/SessionDetail';
import CameraView from './components/CameraView';
import TrimView from './components/TrimView';
import SettingsView from './components/SettingsView';

const App: React.FC = () => {
  const [view, setView] = useState<ViewState>({ name: 'home' });

  // Navigation Handlers
  const goHome = () => setView({ name: 'home' });
  
  const selectSession = (sessionId: string) => {
    setView({ name: 'session', sessionId });
  };
  
  const openCamera = (sessionId: string, initialMode: 'video' | 'photo') => {
    setView({ name: 'camera', sessionId, initialMode });
  };

  const openTrim = (mediaId: string, sessionId: string) => {
      setView({ name: 'trim', sessionId, mediaId });
  };

  const openSettings = () => {
      setView({ name: 'settings' });
  };
  
  const closeCamera = () => {
    if (view.name === 'camera') {
      setView({ name: 'session', sessionId: view.sessionId });
    }
  };

  const closeTrim = () => {
      if (view.name === 'trim') {
          setView({ name: 'session', sessionId: view.sessionId });
      }
  };

  // Render View
  return (
    <div className="max-w-md mx-auto h-screen bg-black overflow-hidden relative shadow-2xl">
        {/* In a desktop browser, this max-w-md frame simulates a phone. On phone, it's full width. */}
        <div className="h-full w-full bg-[#F2F2F7] overflow-hidden relative">
            
            {/* View Switching Logic */}
            {view.name === 'home' && (
                <SessionList 
                    onSelectSession={selectSession} 
                    onOpenSettings={openSettings}
                />
            )}

            {view.name === 'settings' && (
                <SettingsView onBack={goHome} />
            )}

            {view.name === 'session' && (
                <SessionDetail 
                    sessionId={view.sessionId} 
                    onBack={goHome} 
                    onOpenCamera={(mode) => openCamera(view.sessionId, mode)} 
                    onOpenTrim={(mediaId) => openTrim(mediaId, view.sessionId)}
                />
            )}

            {view.name === 'camera' && (
                <CameraView 
                    sessionId={view.sessionId} 
                    initialMode={view.initialMode}
                    onClose={closeCamera} 
                    onNavigateToTrim={(mediaId) => openTrim(mediaId, view.sessionId)}
                />
            )}

            {view.name === 'trim' && (
                <TrimView 
                    mediaId={view.mediaId}
                    onBack={closeTrim}
                    onSave={closeTrim}
                />
            )}
        </div>
    </div>
  );
};

export default App;