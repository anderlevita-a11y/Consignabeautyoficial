import React, { useState } from 'react';
import { ShieldCheck, FileText, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import ReactMarkdown from 'react-markdown';
import { useNotifications } from './NotificationCenter';

interface LegalConfirmationModalProps {
  isOpen: boolean;
  privacyPolicy: string;
  termsOfUse: string;
  onConfirm: () => Promise<void>;
}

export function LegalConfirmationModal({ isOpen, privacyPolicy, termsOfUse, onConfirm }: LegalConfirmationModalProps) {
  const { addNotification } = useNotifications();
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'privacy' | 'terms'>('privacy');

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (!accepted) return;
    setLoading(true);
    try {
      await onConfirm();
    } catch (err) {
      console.error(err);
      addNotification({ type: 'error', title: 'Erro', message: 'Erro ao confirmar termos. Tente novamente.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-2xl max-h-[90vh] rounded-3xl overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95 duration-300">
        {/* Header */}
        <div className="p-6 border-b border-zinc-100 bg-zinc-50/50 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-zinc-800">Termos e Privacidade</h3>
            <p className="text-xs text-zinc-500">Por favor, leia e aceite os termos para continuar.</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-100">
          <button
            onClick={() => setActiveTab('privacy')}
            className={cn(
              "flex-1 py-4 text-xs font-bold uppercase tracking-widest transition-all",
              activeTab === 'privacy' ? "text-emerald-600 border-b-2 border-emerald-600 bg-emerald-50/30" : "text-zinc-400 hover:text-zinc-600"
            )}
          >
            Política de Privacidade
          </button>
          <button
            onClick={() => setActiveTab('terms')}
            className={cn(
              "flex-1 py-4 text-xs font-bold uppercase tracking-widest transition-all",
              activeTab === 'terms' ? "text-emerald-600 border-b-2 border-emerald-600 bg-emerald-50/30" : "text-zinc-400 hover:text-zinc-600"
            )}
          >
            Termos de Uso
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-zinc-50/30">
          <div className="prose prose-sm max-w-none text-zinc-600">
            <ReactMarkdown>
              {activeTab === 'privacy' ? privacyPolicy : termsOfUse}
            </ReactMarkdown>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-zinc-100 bg-white space-y-4">
          <label className="flex items-start gap-3 cursor-pointer group">
            <div className="relative flex items-center mt-0.5">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-zinc-300 transition-all checked:border-emerald-500 checked:bg-emerald-500 hover:border-emerald-400"
              />
              <CheckCircle2 className="absolute left-0.5 top-0.5 h-4 w-4 text-white opacity-0 transition-opacity peer-checked:opacity-100" />
            </div>
            <span className="text-xs text-zinc-600 leading-relaxed group-hover:text-zinc-800 transition-colors">
              Eu li e concordo integralmente com a <strong>Política de Privacidade</strong> e os <strong>Termos de Uso</strong> do Consigna Beauty (Versão Beta).
            </span>
          </label>

          <button
            onClick={handleConfirm}
            disabled={!accepted || loading}
            className={cn(
              "w-full py-4 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20",
              accepted && !loading 
                ? "bg-emerald-600 hover:bg-emerald-700 text-white" 
                : "bg-zinc-100 text-zinc-400 cursor-not-allowed shadow-none"
            )}
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
            Confirmar e Continuar
          </button>
        </div>
      </div>
    </div>
  );
}
