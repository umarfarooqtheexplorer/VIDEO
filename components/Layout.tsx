import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
  title?: string;
  leftAction?: React.ReactNode;
  rightAction?: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children, title, leftAction, rightAction }) => {
  return (
    <div className="min-h-screen bg-[#F2F2F7] text-slate-900 flex flex-col">
      {/* iOS-style Navbar */}
      <div className="sticky top-0 z-30 bg-[#F2F2F7]/90 backdrop-blur-md border-b border-gray-300/50 pt-safe-top">
        <div className="flex items-center justify-between px-4 h-14">
            <div className="flex-1 flex justify-start text-blue-500 text-lg">
                {leftAction}
            </div>
            <div className="flex-1 flex justify-center font-semibold text-lg text-slate-900 truncate">
                {title}
            </div>
            <div className="flex-1 flex justify-end text-blue-500 text-lg">
                {rightAction}
            </div>
        </div>
      </div>
      
      {/* Content Area */}
      <div className="flex-1 overflow-y-auto pb-safe-bottom">
        {children}
      </div>
    </div>
  );
};

export default Layout;