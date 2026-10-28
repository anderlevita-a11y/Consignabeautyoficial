import React, { useState } from 'react';
import { History, CheckCircle2, X } from 'lucide-react';
import { ConfirmationModal } from './ConfirmationModal';
import type { FormDraftController } from '../hooks/useFormDraft';

interface DraftControlsProps {
  draft: FormDraftController;
  /** Mostra o texto discreto "Rascunho salvo automaticamente". Padrão: true */
  showSavedHint?: boolean;
  className?: string;
}

function formatTime(ts: number) {
  const d = new Date(ts);
  const sameDay = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return sameDay ? `hoje às ${time}` : `${d.toLocaleDateString('pt-BR')} às ${time}`;
}

/**
 * Aviso de rascunho recuperado + indicador de salvamento automático +
 * modal de confirmação ao sair com alterações não salvas.
 */
export function DraftControls({ draft, showSavedHint = true, className }: DraftControlsProps) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  return (
    <>
      {draft.restoredAt ? (
        <div className={`flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 animate-in fade-in slide-in-from-top-2 duration-300 ${className || ''}`}>
          <History className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold">Rascunho recuperado</p>
            <p className="text-xs text-amber-800/80">
              Restauramos os dados que você não tinha salvo ({formatTime(draft.restoredAt)}). Confira e clique em salvar para concluir.
            </p>
            <button
              type="button"
              onClick={() => setConfirmDiscard(true)}
              className="mt-2 text-[11px] font-bold uppercase tracking-widest text-amber-700 hover:underline"
            >
              Descartar rascunho
            </button>
          </div>
          <button
            type="button"
            onClick={draft.dismissRestored}
            className="p-1 rounded-lg text-amber-500 hover:bg-amber-100 transition-colors"
            aria-label="Fechar aviso"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : showSavedHint && draft.isDirty && draft.savedAt ? (
        <p className={`flex items-center gap-1.5 text-[11px] font-medium text-zinc-400 ${className || ''}`}>
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          Rascunho salvo automaticamente neste aparelho
        </p>
      ) : null}

      <ConfirmationModal
        isOpen={confirmDiscard}
        title="Descartar rascunho"
        message="Os dados recuperados serão apagados e o formulário voltará ao estado original. Deseja continuar?"
        confirmText="Descartar"
        cancelText="Manter"
        variant="danger"
        onConfirm={() => {
          setConfirmDiscard(false);
          draft.discard();
        }}
        onCancel={() => setConfirmDiscard(false)}
      />

      <ConfirmationModal
        isOpen={!!draft.pendingClose}
        title="Sair sem salvar?"
        message="Você tem alterações que ainda não foram salvas. Se sair agora, elas serão descartadas."
        confirmText="Sair e descartar"
        cancelText="Continuar editando"
        variant="warning"
        onConfirm={draft.confirmClose}
        onCancel={draft.cancelClose}
      />
    </>
  );
}
