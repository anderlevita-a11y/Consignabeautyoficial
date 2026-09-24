import React, { useState } from 'react';
import { AlertCircle, X } from 'lucide-react';

interface PromptModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  placeholder?: string;
  defaultValue?: string;
  type?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
}

export function PromptModal({
  isOpen,
  title,
  message,
  placeholder = 'Digite aqui...',
  defaultValue = '',
  type = 'text',
  onConfirm,
  onCancel,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar'
}: PromptModalProps) {
  const [value, setValue] = useState(defaultValue);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(value);
    setValue('');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl text-emerald-500 bg-emerald-50">
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
        
        <form onSubmit={handleSubmit}>
          <div className="p-8 space-y-4">
            <p className="text-zinc-600 leading-relaxed">{message}</p>
            <input
              autoFocus
              type={type}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={placeholder}
              className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-4 text-sm focus:border-emerald-500 outline-none transition-all"
            />
          </div>

          <div className="p-6 bg-zinc-50 flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-6 py-3 rounded-2xl font-bold text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 transition-all text-sm"
            >
              {cancelText}
            </button>
            <button
              type="submit"
              disabled={!value.trim()}
              className="flex-1 px-6 py-3 rounded-2xl font-bold text-white transition-all shadow-lg text-sm bg-[#00a86b] hover:bg-[#008f5b] shadow-emerald-500/20 disabled:opacity-50"
            >
              {confirmText}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
