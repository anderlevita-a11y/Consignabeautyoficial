import React from 'react';
import { AlertCircle, X } from 'lucide-react';
import { cn } from '../lib/utils';

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
  requiredText?: string;
}

export function ConfirmationModal({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  variant = 'info',
  requiredText
}: ConfirmationModalProps) {
  const [inputValue, setInputValue] = React.useState('');

  if (!isOpen) return null;

  const isConfirmDisabled = requiredText && inputValue !== requiredText;

  const variantStyles = {
    danger: 'bg-red-600 hover:bg-red-700 shadow-red-500/20',
    warning: 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/20',
    info: 'bg-[#00a86b] hover:bg-[#008f5b] shadow-emerald-500/20'
  };

  const iconStyles = {
    danger: 'text-red-500 bg-red-50',
    warning: 'text-amber-500 bg-amber-50',
    info: 'text-emerald-500 bg-emerald-50'
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${iconStyles[variant]}`}>
              <AlertCircle className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-zinc-800 tracking-tight">{title}</h3>
          </div>
          <button 
            onClick={onCancel}
            className="p-2 hover:bg-zinc-100 rounded-xl transition-colors text-zinc-400 hover:text-zinc-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-8 space-y-4">
          <p className="text-zinc-600 leading-relaxed">{message}</p>
          
          {requiredText && (
            <div className="space-y-2 mt-4 animate-in slide-in-from-top-2 duration-300">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">
                Digite <span className="text-red-600">"{requiredText}"</span> para confirmar
              </label>
              <input 
                type="text"
                autoFocus
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:border-red-500 outline-none transition-colors font-mono"
                placeholder={requiredText}
              />
            </div>
          )}
        </div>

        <div className="p-6 bg-zinc-50 flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => {
              setInputValue('');
              onCancel();
            }}
            className="flex-1 px-6 py-3 rounded-2xl font-bold text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 transition-all text-sm"
          >
            {cancelText}
          </button>
          <button
            onClick={() => {
              if (!isConfirmDisabled) {
                setInputValue('');
                onConfirm();
              }
            }}
            disabled={isConfirmDisabled}
            className={cn(
              "flex-1 px-6 py-3 rounded-2xl font-bold text-white transition-all shadow-lg text-sm",
              isConfirmDisabled ? "bg-zinc-300 shadow-none cursor-not-allowed opacity-50" : variantStyles[variant]
            )}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
