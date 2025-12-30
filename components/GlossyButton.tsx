import React from 'react';

interface GlossyButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  icon?: React.ReactNode;
  label?: string;
  fullWidth?: boolean;
}

const GlossyButton: React.FC<GlossyButtonProps> = ({ 
  variant = 'primary', 
  icon, 
  label, 
  fullWidth = false, 
  className = '',
  ...props 
}) => {
  
  const baseClasses = "relative overflow-hidden rounded-xl transition-transform active:scale-95 flex items-center justify-center gap-2 font-semibold text-white shadow-md disabled:opacity-50 disabled:pointer-events-none";
  
  const variants = {
    // Exact specs: Red-Orange (#ff5e57) to Apple Red (#ff3b30)
    primary: "bg-gradient-to-b from-[#ff5e57] to-[#ff3b30] shadow-red-500/30",
    danger: "bg-gradient-to-b from-red-700 to-red-800 shadow-red-900/30",
    secondary: "bg-gradient-to-b from-gray-400 to-gray-500 shadow-gray-500/30"
  };

  const sizeClasses = label ? "px-6 py-3 text-lg" : "p-4";
  const widthClass = fullWidth ? "w-full" : "";

  return (
    <button 
      className={`${baseClasses} ${variants[variant]} ${sizeClasses} ${widthClass} ${className}`}
      {...props}
    >
      {/* Gloss Effect Overlay */}
      <div className="absolute inset-x-0 top-0 h-[40%] bg-gradient-to-b from-white/30 to-transparent pointer-events-none" />
      
      {/* Content */}
      <span className="relative z-10 flex items-center gap-2">
        {icon}
        {label}
      </span>
    </button>
  );
};

export default GlossyButton;