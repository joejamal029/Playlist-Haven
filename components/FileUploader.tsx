import React, { useRef, useState } from 'react';
import { Upload, X, FileAudio, Plus } from 'lucide-react';

interface FileUploaderProps {
  label: string;
  subLabel?: string;
  files: File[] | File | null;
  onFilesSelected: (files: File[]) => void;
  onClear: () => void;
  multiple?: boolean;
  accept?: string;
  colorClass?: string;
}

const FileUploader: React.FC<FileUploaderProps> = ({
  label,
  subLabel,
  files,
  onFilesSelected,
  onClear,
  multiple = false,
  accept = ".m3u,.m3u8",
  colorClass = "blue"
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selected = Array.from(e.target.files);
      onFilesSelected(multiple ? selected : [selected[0]]);
      
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files);
      onFilesSelected(multiple ? droppedFiles : [droppedFiles[0]]);
    }
  };

  const fileList = Array.isArray(files) ? files : (files ? [files] : []);
  const hasFiles = fileList.length > 0;

  const getColors = () => {
    if (dragActive) {
      return 'border-white bg-slate-700 text-white scale-[1.01] shadow-xl';
    }
    switch (colorClass) {
      case 'emerald': return 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300';
      case 'rose': return 'border-rose-500/50 bg-rose-500/10 text-rose-300';
      case 'amber': return 'border-amber-500/50 bg-amber-500/10 text-amber-300';
      default: return 'border-blue-500/50 bg-blue-500/10 text-blue-300';
    }
  };

  return (
    <div className="mb-4">
      <div 
        onClick={() => fileInputRef.current?.click()}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={`relative group cursor-pointer border-2 border-dashed rounded-xl p-4 transition-all duration-200 
          ${hasFiles && !dragActive ? 'border-slate-700 bg-slate-800/40' : getColors()} 
          hover:bg-slate-800 active:scale-[0.99]`}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          multiple={multiple}
          accept={accept}
          className="hidden"
        />

        {!hasFiles || dragActive ? (
          <div className="flex flex-col items-center justify-center py-2 pointer-events-none">
            <Upload className={`w-8 h-8 mb-2 transition-transform ${dragActive ? 'scale-125 text-white' : 'opacity-80'}`} />
            <h3 className="font-semibold text-lg">{dragActive ? "Drop to upload" : label}</h3>
            {subLabel && !dragActive && <p className="text-xs opacity-70 text-center mt-1">{subLabel}</p>}
          </div>
        ) : (
          <div>
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-black uppercase tracking-widest opacity-40">{label}</span>
                {multiple && (
                  <span className="flex items-center space-x-1 text-[9px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded uppercase font-bold">
                    <Plus size={8} />
                    <span>Add more</span>
                  </span>
                )}
              </div>
              <button 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  onClear(); 
                }}
                className="p-1.5 rounded-full bg-slate-700/50 hover:bg-rose-500 hover:text-white text-slate-400 transition-all active:scale-90"
                aria-label="Clear all"
              >
                <X size={14} />
              </button>
            </div>
            <div className="space-y-1 max-h-32 overflow-y-auto scrollbar-hide">
              {fileList.map((f, idx) => (
                <div key={idx} className="flex items-center text-[11px] text-slate-300 bg-slate-900/40 p-2 rounded-lg border border-slate-700/30">
                  <FileAudio size={12} className="mr-2 opacity-40 shrink-0" />
                  <span className="truncate flex-1">{f.name}</span>
                  <span className="ml-2 text-[9px] opacity-30 whitespace-nowrap">
                    {(f.size / 1024).toFixed(1)} KB
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FileUploader;