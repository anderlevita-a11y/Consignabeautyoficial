/**
 * Unsaved Changes Guard
 * ------------------------------------------------------------------
 * Mantém um registro global dos formulários com alterações ainda não
 * salvas no servidor. Enquanto houver ao menos um, qualquer tentativa de
 * recarregar/fechar a página (pull-to-refresh, F5, fechar aba) dispara a
 * caixa de confirmação NATIVA do navegador ("Recarregar site? As
 * alterações podem não ser salvas").
 *
 * Observação: por segurança, os navegadores não permitem personalizar o
 * texto nem o visual dessa caixa — só é possível pedir que ela apareça.
 * Por isso ela trabalha junto com o salvamento automático (draftStore):
 * mesmo que o usuário confirme a recarga, os dados voltam sozinhos.
 */

const dirtySources = new Set<string>();
let listenerAttached = false;

function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (dirtySources.size === 0) return;
  event.preventDefault();
  // Necessário para Chrome/Edge antigos e Safari
  event.returnValue = '';
  return '';
}

function syncListener() {
  if (typeof window === 'undefined') return;
  if (dirtySources.size > 0 && !listenerAttached) {
    window.addEventListener('beforeunload', handleBeforeUnload);
    listenerAttached = true;
  } else if (dirtySources.size === 0 && listenerAttached) {
    // Remover o listener quando não há nada pendente evita que o navegador
    // desative o bfcache (voltar/avançar instantâneo) sem necessidade.
    window.removeEventListener('beforeunload', handleBeforeUnload);
    listenerAttached = false;
  }
}

export function markDirty(sourceId: string) {
  dirtySources.add(sourceId);
  syncListener();
}

export function markClean(sourceId: string) {
  dirtySources.delete(sourceId);
  syncListener();
}

export function hasUnsavedChanges() {
  return dirtySources.size > 0;
}
