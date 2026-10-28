import React, { useEffect, useState } from 'react';
import { History, Trash2, ArrowRight } from 'lucide-react';
import { clearDraft, listDrafts, DraftRecord } from '../lib/draftStore';
import { ConfirmationModal } from './ConfirmationModal';

interface PendingDraftsBannerProps {
  /** Prefixos das chaves de rascunho a listar (ex.: ['bag:', 'settlement:']). */
  prefixes: string[];
  /** Reabre a tela correspondente ao rascunho. */
  onResume: (draft: DraftRecord) => void;
  className?: string;
}

function formatWhen(ts: number) {
  const d = new Date(ts);
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString()
    ? `hoje às ${time}`
    : `${d.toLocaleDateString('pt-BR')} às ${time}`;
}

/**
 * Lista rascunhos que ficaram pendentes (o app foi fechado/recarregado no
 * meio de um cadastro) e permite continuar de onde parou.
 */
export function PendingDraftsBanner({ prefixes, onResume, className }: PendingDraftsBannerProps) {
  const [drafts, setDrafts] = useState<DraftRecord[]>([]);
  const [toDiscard, setToDiscard] = useState<DraftRecord | null>(null);
  const prefixKey = prefixes.join('|');

  useEffect(() => {
    const all = prefixes.flatMap(p => listDrafts(p));
    setDrafts(all.sort((a, b) => b.updatedAt - a.updatedAt));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefixKey]);

  if (drafts.length === 0) return null;

  return (
    <div className={`rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-3 ${className || ''}`}>
      <div className="flex items-center gap-2 text-amber-900">
        <History className="w-5 h-5 text-amber-600" />
        <p className="text-sm font-bold">
          {drafts.length === 1 ? 'Você tem um cadastro não finalizado' : `Você tem ${drafts.length} cadastros não finalizados`}
        </p>
      </div>
      <ul className="space-y-2">
        {drafts.map(d => (
          <li
            key={d.key}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white/70 border border-amber-100 rounded-xl px-3 py-2"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-zinc-800 truncate">
                {(d.meta?.label as string) || 'Rascunho'}
              </p>
              <p className="text-[11px] text-zinc-500">Salvo automaticamente {formatWhen(d.updatedAt)}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setToDiscard(d)}
                className="p-2 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                aria-label="Descartar rascunho"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onResume(d)}
                className="flex items-center gap-1.5 bg-[#00a86b] hover:bg-[#008f5b] text-white px-4 py-2 rounded-xl text-xs font-bold transition-all active:scale-95"
              >
                Continuar
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <ConfirmationModal
        isOpen={!!toDiscard}
        title="Descartar rascunho"
        message="Os dados deste cadastro não finalizado serão apagados. Deseja continuar?"
        confirmText="Descartar"
        variant="danger"
        onConfirm={() => {
          if (toDiscard) {
            clearDraft(toDiscard.key);
            setDrafts(prev => prev.filter(x => x.key !== toDiscard.key));
          }
          setToDiscard(null);
        }}
        onCancel={() => setToDiscard(null)}
      />
    </div>
  );
}
