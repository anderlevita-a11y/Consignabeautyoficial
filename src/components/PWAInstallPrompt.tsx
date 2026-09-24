import React, { useState, useEffect } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, X, Smartphone, Monitor, Share } from 'lucide-react';
import { cn } from '../lib/utils';

interface PWAInstallPromptProps {
  onClose?: () => void;
  onVisibilityChange?: (visible: boolean) => void;
  theme?: 'light' | 'dark';
}

export const PWAInstallPrompt: React.FC<PWAInstallPromptProps> = ({ onClose, onVisibilityChange, theme }) => {
  const { isInstallable, isInstalled, isIOS, wasDismissed, install, dismiss } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Show after a small delay if installable and not installed and never dismissed
    if ((isInstallable || isIOS) && !isInstalled && !wasDismissed) {
      const timer = setTimeout(() => {
        setIsVisible(true);
        if (onVisibilityChange) onVisibilityChange(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isInstallable, isInstalled, isIOS, wasDismissed, onVisibilityChange]);

  if (isInstalled || wasDismissed || !isVisible) {
    return null;
  }

  const handleClose = () => {
    dismiss();
    setIsVisible(false);
    if (onVisibilityChange) onVisibilityChange(false);
    if (onClose) onClose();
  };

  const handleInstall = async () => {
    if (isIOS) {
      setShowIOSGuide(true);
    } else {
      const success = await install();
      if (success) {
        handleClose();
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className={cn(
        "w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300",
        theme === 'dark' ? "bg-zinc-900 border border-zinc-800" : "bg-white"
      )}>
        <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl overflow-hidden shadow-sm border border-zinc-100 dark:border-zinc-800">
              <img src="/pwa-192x192.png" alt="Logo" className="w-full h-full object-cover" />
            </div>
            <div>
              <h3 className={cn("text-xl font-bold tracking-tight", theme === 'dark' ? "text-zinc-100" : "text-zinc-800")}>
                Instalar Aplicativo
              </h3>
              <p className="text-sm text-zinc-500">Consigna Beauty</p>
            </div>
          </div>
          <button 
            onClick={handleClose}
            className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors text-zinc-400"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-8 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className={cn(
              "p-4 rounded-2xl border flex flex-col items-center gap-3 text-center",
              theme === 'dark' ? "bg-zinc-800/50 border-zinc-700" : "bg-zinc-50 border-zinc-100"
            )}>
              <Smartphone className="w-8 h-8 text-emerald-500" />
              <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Mobile</span>
            </div>
            <div className={cn(
              "p-4 rounded-2xl border flex flex-col items-center gap-3 text-center",
              theme === 'dark' ? "bg-zinc-800/50 border-zinc-700" : "bg-zinc-50 border-zinc-100"
            )}>
              <Monitor className="w-8 h-8 text-emerald-500" />
              <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Desktop</span>
            </div>
          </div>

          <div className="space-y-3 text-sm text-zinc-500">
            <p>âœ… Acesso mais rÃ¡pido pela tela inicial</p>
            <p>âœ… Maior área de tela (sem barra do navegador)</p>
            <p>âœ… Funciona melhor em conexÃµes instÃ¡veis</p>
          </div>

          <button
            onClick={handleInstall}
            className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2"
          >
            <Download className="w-5 h-5" />
            Instalar Agora
          </button>

          <button
            onClick={handleClose}
            className="w-full py-2 text-sm font-bold text-zinc-400 hover:text-zinc-500 transition-colors"
          >
            Talvez mais tarde
          </button>
        </div>
      </div>

      {showIOSGuide && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className={cn(
            "w-full max-w-sm rounded-[32px] p-8 space-y-6 text-center",
            theme === 'dark' ? "bg-zinc-900" : "bg-white"
          )}>
            <div className="mx-auto w-20 h-20 rounded-[28%] overflow-hidden shadow-xl border-4 border-white dark:border-zinc-800 mb-4 animate-bounce">
              <img src="/pwa-192x192.png" alt="Logo" className="w-full h-full object-cover" />
            </div>
            <h3 className={cn("text-xl font-bold", theme === 'dark' ? "text-zinc-100" : "text-zinc-800")}>
              Instalar no iOS
            </h3>
            <div className="space-y-4 text-sm text-zinc-500 leading-relaxed text-left">
              <p>1. Toque no botÃ£o <strong>Compartilhar</strong> (Ã­cone com uma seta para cima).</p>
              <p>2. Role a lista e toque em <strong>Adicionar Ã  Tela de InÃ­cio</strong>.</p>
              <p>3. Toque em <strong>Adicionar</strong> no canto superior direito.</p>
            </div>
            <button
              onClick={() => setShowIOSGuide(false)}
              className="w-full py-4 bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 rounded-2xl font-bold transition-all"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
