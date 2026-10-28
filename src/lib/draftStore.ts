/**
 * Draft Store
 * ------------------------------------------------------------------
 * Persistência local (localStorage) de rascunhos de formulários.
 *
 * Objetivo: se a página recarregar (pull-to-refresh, atualização do PWA,
 * o sistema operacional matar o app, queda de bateria, etc.) o usuário
 * não perde o que já tinha digitado/adicionado.
 *
 * - As chaves são separadas por usuário logado, para que um rascunho de
 *   uma conta nunca apareça em outra conta no mesmo aparelho.
 * - Cada rascunho expira depois de DRAFT_TTL_MS.
 * - Todas as operações são "best effort": se o armazenamento estiver
 *   cheio ou bloqueado (modo privado), o app continua funcionando.
 */

const PREFIX = 'cb:draft:v1:';
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

export interface DraftMeta {
  /** Texto curto exibido no aviso de "rascunho pendente". Ex.: "Nova sacola — Campanha Maio" */
  label?: string;
  /** Dados livres para conseguir reabrir a tela certa (ids, objetos pequenos). */
  [key: string]: unknown;
}

export interface DraftRecord<T = unknown> {
  key: string;
  data: T;
  meta?: DraftMeta;
  updatedAt: number;
}

let currentUserId = 'anon';

/** Chamado pelo App sempre que a sessão muda. */
export function setDraftUser(userId: string | null | undefined) {
  currentUserId = userId || 'anon';
}

export function getDraftUser() {
  return currentUserId;
}

function storageKey(key: string, userId = currentUserId) {
  return `${PREFIX}${userId}:${key}`;
}

function safeStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function saveDraft<T>(key: string, data: T, meta?: DraftMeta): boolean {
  const ls = safeStorage();
  if (!ls) return false;
  const record: DraftRecord<T> = { key, data, meta, updatedAt: Date.now() };
  try {
    ls.setItem(storageKey(key), JSON.stringify(record));
    return true;
  } catch (err) {
    // Provável QuotaExceeded: limpa rascunhos vencidos e tenta de novo uma vez
    try {
      purgeExpiredDrafts();
      ls.setItem(storageKey(key), JSON.stringify(record));
      return true;
    } catch {
      console.warn('[DraftStore] Não foi possível salvar o rascunho:', err);
      return false;
    }
  }
}

export function loadDraft<T>(key: string): DraftRecord<T> | null {
  const ls = safeStorage();
  if (!ls) return null;
  try {
    const raw = ls.getItem(storageKey(key));
    if (!raw) return null;
    const record = JSON.parse(raw) as DraftRecord<T>;
    if (!record || typeof record.updatedAt !== 'number') return null;
    if (Date.now() - record.updatedAt > DRAFT_TTL_MS) {
      ls.removeItem(storageKey(key));
      return null;
    }
    return record;
  } catch {
    return null;
  }
}

export function clearDraft(key: string) {
  const ls = safeStorage();
  if (!ls) return;
  try {
    ls.removeItem(storageKey(key));
  } catch {
    /* ignore */
  }
}

/** Lista os rascunhos do usuário atual cuja chave começa com `prefix`. */
export function listDrafts<T = unknown>(prefix = ''): DraftRecord<T>[] {
  const ls = safeStorage();
  if (!ls) return [];
  const base = storageKey(prefix);
  const out: DraftRecord<T>[] = [];
  try {
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (!k || !k.startsWith(base)) continue;
      try {
        const record = JSON.parse(ls.getItem(k) || 'null') as DraftRecord<T>;
        if (record && Date.now() - record.updatedAt <= DRAFT_TTL_MS) out.push(record);
      } catch {
        /* ignore registro corrompido */
      }
    }
  } catch {
    /* ignore */
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Remove rascunhos vencidos (de qualquer usuário). */
export function purgeExpiredDrafts() {
  const ls = safeStorage();
  if (!ls) return;
  const toRemove: string[] = [];
  try {
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (!k || !k.startsWith(PREFIX)) continue;
      try {
        const record = JSON.parse(ls.getItem(k) || 'null');
        if (!record || Date.now() - record.updatedAt > DRAFT_TTL_MS) toRemove.push(k);
      } catch {
        toRemove.push(k);
      }
    }
    toRemove.forEach(k => ls.removeItem(k));
  } catch {
    /* ignore */
  }
}

/** Remove todos os rascunhos do usuário (usado no logout explícito). */
export function clearAllDraftsForUser(userId = currentUserId) {
  const ls = safeStorage();
  if (!ls) return;
  const base = `${PREFIX}${userId}:`;
  const toRemove: string[] = [];
  try {
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k && k.startsWith(base)) toRemove.push(k);
    }
    toRemove.forEach(k => ls.removeItem(k));
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------
 * Estado de navegação (sessionStorage)
 * Sobrevive a um "recarregar página", mas não a fechar a aba/app.
 * Serve para, após um refresh acidental, reabrir exatamente a mesma tela.
 * ------------------------------------------------------------------ */

const NAV_PREFIX = 'cb:nav:v1:';

export function loadNavState<T>(key: string, fallback: T): T {
  try {
    const raw = window.sessionStorage.getItem(`${NAV_PREFIX}${currentUserId}:${key}`);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveNavState<T>(key: string, value: T) {
  try {
    const k = `${NAV_PREFIX}${currentUserId}:${key}`;
    if (value === undefined || value === null) window.sessionStorage.removeItem(k);
    else window.sessionStorage.setItem(k, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}
