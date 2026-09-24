import React, { useState, useEffect } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export function CookieBanner() {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('cookie-consent');
    if (!consent) {
      setShowBanner(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem('cookie-consent', 'accepted');
    setShowBanner(false);
    window.dispatchEvent(new CustomEvent('cookie-consent-updated', { detail: 'accepted' }));
  };

  const handleReject = () => {
    localStorage.setItem('cookie-consent', 'rejected');
    setShowBanner(false);
    window.dispatchEvent(new CustomEvent('cookie-consent-updated', { detail: 'rejected' }));
  };

  if (!showBanner) return null;

  return (
    <AnimatePresence>
      {showBanner && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="fixed bottom-0 left-0 right-0 z-[100] p-4 sm:p-6"
        >
          <div className="max-w-4xl mx-auto bg-white border border-zinc-200 rounded-[32px] shadow-2xl p-6 sm:p-8 flex flex-col md:flex-row items-center gap-6">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
              <ShieldCheck className="w-8 h-8" />
            </div>

            <div className="flex-1 text-center md:text-left">
              <h3 className="text-lg font-bold text-zinc-900 mb-2">Respeitamos sua Privacidade</h3>
              <p className="text-sm text-zinc-500 leading-relaxed">
                Utilizamos cookies e tecnologias semelhantes para melhorar sua experiência, analisar o desempenho do sistema e personalizar conteúdos. 
                De acordo com a LGPD, você decide quais dados podemos coletar.
              </p>
              <div className="mt-4 flex flex-wrap justify-center md:justify-start gap-4 text-[10px] text-zinc-400 font-bold uppercase tracking-widest">
                <a href="/privacidade" className="hover:text-emerald-600 transition-colors">Política de Privacidade</a>
                <a href="/termos" className="hover:text-emerald-600 transition-colors">Termos de Uso</a>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
              <button
                onClick={handleReject}
                className="px-6 py-3 rounded-2xl text-sm font-bold text-zinc-500 hover:bg-zinc-50 transition-all border border-zinc-100"
              >
                Recusar Todos
              </button>
              <button
                onClick={handleAccept}
                className="px-8 py-3 rounded-2xl text-sm font-bold bg-zinc-900 text-white hover:bg-zinc-800 transition-all shadow-lg shadow-zinc-900/10"
              >
                Aceitar e Continuar
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
