/**
 * Arquivos privados do Supabase Storage (documentos e comprovantes).
 * ------------------------------------------------------------------
 * Documentos de identidade, comprovantes de residência e comprovantes de
 * pagamento ficam em buckets PRIVADOS: não existe link público para eles.
 * Quem pode ver (o dono do arquivo, a revendedora dona da rifa/sacola, o
 * administrador) é decidido pelas políticas de storage no Supabase.
 *
 * O banco continua guardando a URL no formato de sempre
 * (`.../storage/v1/object/public/<bucket>/<caminho>`): ela serve só como
 * identificador. Na hora de mostrar, `getFileUrl` troca por um link
 * temporário (assinado), que expira.
 */
import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export const PRIVATE_BUCKETS = ['documents', 'residence_proofs', 'receipts', 'payment_proofs', 'proofs'] as const;

/** Validade do link para ver o arquivo dentro do app. */
const VIEW_SECONDS = 60 * 60; // 1 hora
/** Validade do link enviado ao cliente (ex.: WhatsApp). */
export const SHARE_SECONDS = 60 * 60 * 24 * 7; // 7 dias

const STORAGE_URL_RE = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/?#]+)\/([^?#]+)/;

/** Extrai bucket e caminho de uma URL do Storage, se for de um bucket privado. */
export function parsePrivateFileUrl(url?: string | null): { bucket: string; path: string } | null {
  if (!url) return null;
  const m = url.match(STORAGE_URL_RE);
  if (!m) return null;
  const bucket = m[1];
  if (!(PRIVATE_BUCKETS as readonly string[]).includes(bucket)) return null;
  let path = m[2];
  try {
    path = decodeURIComponent(path);
  } catch {
    /* caminho já decodificado */
  }
  return { bucket, path };
}

const cache = new Map<string, { url: string; expiresAt: number }>();

/**
 * Devolve uma URL que abre o arquivo.
 * - Arquivo de bucket privado → link temporário (assinado).
 * - Qualquer outra URL → a própria URL.
 * Retorna null se o usuário não tiver permissão ou o arquivo não existir.
 */
export async function getFileUrl(url?: string | null, expiresIn = VIEW_SECONDS): Promise<string | null> {
  if (!url) return null;
  const parsed = parsePrivateFileUrl(url);
  if (!parsed) return url;

  const key = `${parsed.bucket}/${parsed.path}/${expiresIn}`;
  const hit = cache.get(key);
  // Reaproveita enquanto faltar mais de 1/5 da validade
  if (hit && hit.expiresAt - Date.now() > (expiresIn * 1000) / 5) return hit.url;

  const { data, error } = await supabase.storage.from(parsed.bucket).createSignedUrl(parsed.path, expiresIn);
  if (error || !data?.signedUrl) {
    console.warn('[privateFiles] não foi possível gerar o link:', error?.message);
    return null;
  }
  cache.set(key, { url: data.signedUrl, expiresAt: Date.now() + expiresIn * 1000 });
  return data.signedUrl;
}

/** Hook: URL pronta para usar em <img src>. `undefined` enquanto carrega, `null` se não deu. */
export function useFileUrl(url?: string | null): string | null | undefined {
  const [resolved, setResolved] = useState<string | null | undefined>(() =>
    url && !parsePrivateFileUrl(url) ? url : undefined
  );
  useEffect(() => {
    let alive = true;
    if (!url) {
      setResolved(null);
      return;
    }
    if (!parsePrivateFileUrl(url)) {
      setResolved(url);
      return;
    }
    setResolved(undefined);
    getFileUrl(url).then(u => {
      if (alive) setResolved(u);
    });
    return () => {
      alive = false;
    };
  }, [url]);
  return resolved;
}

/**
 * Abre uma URL que precisa ser preparada antes (link temporário, mensagem de WhatsApp).
 * A aba é aberta na hora do clique e só depois recebe o endereço, para o navegador
 * não bloquear como pop-up.
 */
export async function openInNewTab(getUrl: () => Promise<string | null>) {
  const tab = window.open('about:blank', '_blank');
  try {
    const target = await getUrl();
    if (!target) {
      tab?.close();
      window.alert('Não foi possível abrir o arquivo. Ele pode ter sido removido ou você não tem acesso a ele.');
      return;
    }
    if (tab) {
      tab.opener = null;
      tab.location.href = target;
    } else {
      window.location.href = target;
    }
  } catch (err) {
    tab?.close();
    console.error('[privateFiles] erro ao abrir:', err);
  }
}

/** Abre um arquivo (documento/comprovante) em nova aba com link temporário. */
export function openFile(url?: string | null) {
  return openInNewTab(() => getFileUrl(url));
}
