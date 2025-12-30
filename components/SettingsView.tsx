import React, { useState, useEffect } from 'react';
import { ChevronLeft } from 'lucide-react';
import Layout from './Layout';
import { Preferences } from '../services/preferences';

interface SettingsViewProps {
  onBack: () => void;
}

const SettingsView: React.FC<SettingsViewProps> = ({ onBack }) => {
  const [skipPrompt, setSkipPrompt] = useState(false);

  useEffect(() => {
    setSkipPrompt(Preferences.getShouldSkipFlagPrompt());
  }, []);

  const handleToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.checked;
    setSkipPrompt(newVal);
    Preferences.setShouldSkipFlagPrompt(newVal);
  };

  return (
    <Layout
      title="Settings"
      leftAction={
        <button onClick={onBack} className="flex items-center text-blue-500">
          <ChevronLeft size={24} className="-ml-1" />
          Back
        </button>
      }
    >
      <div className="pt-6">
        <div className="px-4 mb-2">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide ml-3">Recording Workflow</h2>
        </div>
        
        <div className="mx-4 bg-white rounded-xl overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-4 py-3 bg-white">
                <div className="flex flex-col">
                    <span className="text-base font-medium text-slate-900">Suppress Flag Prompt</span>
                    <span className="text-xs text-gray-400 mt-0.5">Always flag "Fix Later" without asking</span>
                </div>
                
                {/* iOS Toggle Switch */}
                <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={skipPrompt}
                        onChange={handleToggle}
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
                </label>
            </div>
        </div>
        
        <div className="px-8 mt-4 text-xs text-gray-400">
            If enabled, tapping "Flagged Stop" will automatically mark the video for fixing later without showing the popup menu.
        </div>
      </div>
    </Layout>
  );
};

export default SettingsView;