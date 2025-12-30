import React, { useEffect, useState } from 'react';
import { ChevronRight, FolderOpen, Trash2, Settings } from 'lucide-react';
import { Session } from '../types';
import { getSessions, createSession, deleteSession } from '../services/db';
import GlossyButton from './GlossyButton';
import Layout from './Layout';

interface SessionListProps {
  onSelectSession: (id: string) => void;
  onOpenSettings: () => void;
}

const SessionList: React.FC<SessionListProps> = ({ onSelectSession, onOpenSettings }) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      const loaded = await getSessions();
      setSessions(loaded);
    } catch (e) {
      console.error("Failed to load sessions", e);
    }
  };

  const handleCreate = async () => {
    setIsCreating(true);
    const dateStr = new Date().toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });
    try {
      const newSession = await createSession(`Session ${dateStr}`);
      await loadSessions();
      // Optional: Auto-enter session
      // onSelectSession(newSession.id); 
    } catch (e) {
      alert("Could not create session");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this session and all its media?")) {
      await deleteSession(id);
      loadSessions();
    }
  };

  return (
    <Layout 
      title="Sessions"
      leftAction={
          <button onClick={onOpenSettings} className="text-blue-500">
              <Settings size={24} />
          </button>
      }
      rightAction={
        <button onClick={handleCreate} disabled={isCreating} className="font-semibold text-red-600">
           {isCreating ? '...' : 'New'}
        </button>
      }
    >
      <div className="pt-6 pb-20">
        <h1 className="px-5 text-3xl font-bold mb-4 text-slate-900">Library</h1>

        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center mt-20 px-10 text-center opacity-50">
            <FolderOpen size={64} className="mb-4 text-gray-400" />
            <p className="text-xl font-medium text-gray-500">No Sessions Yet</p>
            <p className="text-sm text-gray-400 mt-2">Create a new session to start recording clips and photos.</p>
            <div className="mt-8">
                <GlossyButton label="Start New Session" onClick={handleCreate} />
            </div>
          </div>
        ) : (
          <div className="mx-4 bg-white rounded-xl overflow-hidden shadow-sm">
            {sessions.map((session) => (
              <div 
                key={session.id}
                onClick={() => onSelectSession(session.id)}
                className="flex items-center pl-4 pr-3 py-3 border-b border-gray-100 last:border-0 active:bg-gray-50 cursor-pointer transition-colors group"
              >
                <div className="flex-1">
                  <h3 className="text-lg font-medium text-slate-900">{session.name}</h3>
                  <p className="text-sm text-gray-500">
                    {new Date(session.createdAt).toLocaleDateString()} • {session.itemCount} items
                  </p>
                </div>
                
                <div className="flex items-center gap-2">
                    <button 
                        onClick={(e) => handleDelete(e, session.id)}
                        className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                    >
                        <Trash2 size={18} />
                    </button>
                    <ChevronRight className="text-gray-300" size={20} />
                </div>
              </div>
            ))}
          </div>
        )}
        
        <div className="px-6 mt-6 text-xs text-gray-400 text-center">
            All media is stored locally on your device.
        </div>
      </div>
    </Layout>
  );
};

export default SessionList;