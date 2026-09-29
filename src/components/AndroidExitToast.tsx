import React, { useEffect, useState } from 'react';
import { BackHandler } from '../lib/backHandler';
import { Smartphone, LogOut, X } from 'lucide-react';
import { cn } from '../lib/utils';

export function AndroidExitToast() {
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    let animInterval: ReturnType<typeof setInterval> | null = null;

    const unsubscribe = BackHandler.subscribeExitPrompt((isPrompting) => {
      setVisible(isPrompting);
      if (isPrompting) {
        setProgress(100);
        const startTime = Date.now();
        const duration = 2500; // 2.5 seconds window

        if (animInterval) clearInterval(animInterval);

        animInterval = setInterval(() => {
          const elapsed = Date.now() - startTime;
          const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
          setProgress(remaining);
          if (remaining <= 0 && animInterval) {
            clearInterval(animInterval);
          }
        }, 30);
      } else {
        if (animInterval) clearInterval(animInterval);
      }
    });

    return () => {
      unsubscribe();
      if (animInterval) clearInterval(animInterval);
    };
  }, []);

  if (!visible) return null;

  return (
    <div 
      role="status" 
      aria-live="polite"
      className="fixed bottom-6 inset-x-4 max-w-sm mx-auto z-[9999] animate-in fade-in slide-in-from-bottom-5 duration-200 pointer-events-auto"
    >
      <div className="bg-zinc-900/95 dark:bg-zinc-800/95 text-white backdrop-blur-md rounded-2xl p-4 shadow-2xl border border-white/10 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-100">
                Pressione 'Voltar' novamente
              </p>
              <p className="text-xs text-zinc-400">
                para fechar o aplicativo
              </p>
            </div>
          </div>

          <button
            onClick={() => BackHandler.resetExitPrompt()}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Continuar no aplicativo"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            onClick={() => BackHandler.resetExitPrompt()}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-300 hover:text-white hover:bg-white/10 transition-colors"
          >
            Continuar no App
          </button>
          <button
            onClick={() => BackHandler.exitApp()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600/90 hover:bg-red-600 text-xs font-bold text-white transition-colors shadow-sm"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sair
          </button>
        </div>

        {/* Progress bar representing remaining time to double-back */}
        <div className="w-full bg-white/10 h-1 rounded-full overflow-hidden">
          <div 
            className="h-full bg-emerald-500 transition-all duration-75 ease-linear rounded-full"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
