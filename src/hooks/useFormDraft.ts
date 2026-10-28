import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clearDraft, loadDraft, saveDraft, DraftMeta } from '../lib/draftStore';
import { markClean, markDirty } from '../lib/unsavedChanges';

interface UseFormDraftOptions<T> {
  /**
   * Chave única do rascunho (ex.: `bag:new:<campaignId>`, `customer:<id>`).
   * Passe `null` para desativar o salvamento automático.
   */
  key: string | null;
  /** Estado atual do formulário (somente o que precisa ser recuperado). */
  value: T;
  /**
   * `true` quando os dados iniciais já foram carregados (ex.: depois do fetch
   * da sacola em edição). O rascunho só é aplicado a partir desse momento,
   * para não ser sobrescrito pelo carregamento do servidor.
   */
  ready?: boolean;
  /** Aplica um rascunho recuperado (ou o estado original, ao descartar). */
  onRestore: (data: T) => void;
  /** Informações para reabrir a tela a partir do aviso de rascunho pendente. */
  meta?: DraftMeta;
  /** Atraso do salvamento após a última alteração (ms). */
  debounceMs?: number;
}

export interface FormDraftController {
  /** Momento em que um rascunho foi recuperado ao abrir a tela (ou null). */
  restoredAt: number | null;
  /** Último salvamento automático (ou null). */
  savedAt: number | null;
  /** Há alterações diferentes do estado original? */
  isDirty: boolean;
  /** Chamar logo após salvar com sucesso no servidor. */
  clear: () => void;
  /** Volta o formulário ao estado original e apaga o rascunho. */
  discard: () => void;
  /** Esconde o aviso de "rascunho recuperado". */
  dismissRestored: () => void;
  /**
   * Fecha o formulário pedindo confirmação se houver alterações não salvas.
   * Use no lugar de chamar `onClose` diretamente nos botões X/Cancelar.
   */
  requestClose: (onClose: () => void) => void;
  /** Estado interno do modal de confirmação de saída (usado por <DraftControls/>). */
  pendingClose: (() => void) | null;
  cancelClose: () => void;
  confirmClose: () => void;
}

let instanceCounter = 0;

/**
 * Salvamento automático de formulários no aparelho.
 *
 * - Salva o estado (com debounce) a cada alteração e imediatamente quando a
 *   página vai para segundo plano/é fechada (`pagehide`/`visibilitychange`).
 * - Ao abrir a tela de novo, recupera o rascunho automaticamente.
 * - Enquanto houver alterações não salvas, ativa a confirmação nativa do
 *   navegador antes de recarregar/fechar a página.
 */
export function useFormDraft<T>({
  key,
  value,
  ready = true,
  onRestore,
  meta,
  debounceMs = 400,
}: UseFormDraftOptions<T>): FormDraftController {
  const instanceId = useMemo(() => `draft-${++instanceCounter}`, []);
  const serialized = useMemo(() => safeStringify(value), [value]);

  const valueRef = useRef(value);
  const serializedRef = useRef(serialized);
  const metaRef = useRef(meta);
  const onRestoreRef = useRef(onRestore);
  const keyRef = useRef(key);
  valueRef.current = value;
  serializedRef.current = serialized;
  metaRef.current = meta;
  onRestoreRef.current = onRestore;
  keyRef.current = key;

  const baselineRef = useRef<string | null>(null);
  const baselineValueRef = useRef<T | null>(null);
  const hydratedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [restoredAt, setRestoredAt] = useState<number | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [pendingClose, setPendingClose] = useState<(() => void) | null>(null);

  const isDirty = hydratedRef.current && baselineRef.current !== null && serialized !== baselineRef.current;

  /** Grava (ou limpa) o rascunho imediatamente, lendo sempre o estado mais recente. */
  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const k = keyRef.current;
    if (!k || !hydratedRef.current || baselineRef.current === null) return;

    if (serializedRef.current === baselineRef.current) {
      clearDraft(k);
      markClean(instanceId);
    } else {
      if (saveDraft(k, valueRef.current, metaRef.current)) {
        setSavedAt(Date.now());
      }
      markDirty(instanceId);
    }
  }, [instanceId]);

  // 1) Hidratação: quando a tela fica pronta, guarda o estado original e
  //    aplica o rascunho salvo (se existir e for diferente).
  useEffect(() => {
    if (!key || !ready) {
      hydratedRef.current = false;
      return;
    }

    baselineRef.current = serializedRef.current;
    baselineValueRef.current = valueRef.current;

    const draft = loadDraft<T>(key);
    if (draft && safeStringify(draft.data) !== baselineRef.current) {
      try {
        onRestoreRef.current(draft.data);
        setRestoredAt(draft.updatedAt);
      } catch (err) {
        console.warn('[useFormDraft] Falha ao restaurar rascunho, descartando:', err);
        clearDraft(key);
      }
    }
    hydratedRef.current = true;

    return () => {
      // Troca de chave/desmontagem: grava o que estiver pendente.
      flush();
      hydratedRef.current = false;
      markClean(instanceId);
    };
  }, [key, ready, flush, instanceId]);

  // 2) A cada alteração: marca como "sujo" na hora e agenda o salvamento.
  useEffect(() => {
    if (!key || !hydratedRef.current || baselineRef.current === null) return;
    if (serialized !== baselineRef.current) markDirty(instanceId);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, debounceMs);
  }, [serialized, key, debounceMs, flush, instanceId]);

  // 3) Grava imediatamente quando o app vai para segundo plano ou a página
  //    está sendo descarregada (refresh, fechar aba, SO matando o PWA).
  useEffect(() => {
    const onHide = () => flush();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', onHide);
    window.addEventListener('beforeunload', onHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('beforeunload', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [flush]);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    // O estado atual passa a ser o "original": novas edições voltam a ser salvas.
    baselineRef.current = serializedRef.current;
    baselineValueRef.current = valueRef.current;
    if (keyRef.current) clearDraft(keyRef.current);
    markClean(instanceId);
    setRestoredAt(null);
    setSavedAt(null);
  }, [instanceId]);

  const discard = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (keyRef.current) clearDraft(keyRef.current);
    markClean(instanceId);
    setRestoredAt(null);
    setSavedAt(null);
    if (baselineValueRef.current !== null) {
      onRestoreRef.current(baselineValueRef.current);
    }
  }, [instanceId]);

  const dismissRestored = useCallback(() => setRestoredAt(null), []);

  const requestClose = useCallback(
    (onClose: () => void) => {
      const dirty =
        hydratedRef.current &&
        baselineRef.current !== null &&
        serializedRef.current !== baselineRef.current;
      if (dirty) {
        setPendingClose(() => onClose);
      } else {
        onClose();
      }
    },
    []
  );

  const cancelClose = useCallback(() => setPendingClose(null), []);

  const confirmClose = useCallback(() => {
    const fn = pendingClose;
    setPendingClose(null);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    // Descarta: o estado atual vira o "original" para o flush da desmontagem não regravar.
    baselineRef.current = serializedRef.current;
    if (keyRef.current) clearDraft(keyRef.current);
    markClean(instanceId);
    fn?.();
  }, [pendingClose, instanceId]);

  return {
    restoredAt,
    savedAt,
    isDirty,
    clear,
    discard,
    dismissRestored,
    requestClose,
    pendingClose,
    cancelClose,
    confirmClose,
  };
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '';
  }
}
