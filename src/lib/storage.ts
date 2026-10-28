/**
 * Storage helpers — reduzem o EGRESS do Supabase Storage.
 * ------------------------------------------------------------------
 * O plano free do Supabase tem 5 GB/mês de egress. Cada vez que uma
 * imagem é baixada, ela conta. Três regras atacam isso:
 *
 * 1. Arquivos menores: toda imagem é redimensionada e convertida para WebP
 *    antes do upload, com um tamanho máximo por tipo de uso (preset).
 * 2. Cache longo: os arquivos são enviados com `cacheControl` de 1 ano.
 *    Como cada upload gera um nome único, nunca há conteúdo "velho" em cache;
 *    o navegador baixa a imagem UMA vez e reaproveita nas próximas visitas
 *    (o padrão do Supabase era 1 hora → novo download a cada hora).
 * 3. Miniaturas: fotos de produto ganham uma versão `_thumb.webp` (~400px)
 *    usada em listas, grades e carrinho. A foto grande só é baixada quando
 *    o produto é aberto.
 */
import imageCompression from 'browser-image-compression';
import { supabase } from './supabase';

/** 1 ano, em segundos (string, formato exigido pelo supabase-js). */
export const LONG_CACHE = '31536000';

export const STORAGE_UPLOAD_OPTIONS = {
  cacheControl: LONG_CACHE,
  upsert: false,
} as const;

export type ImagePreset =
  | 'product'
  | 'thumb'
  | 'document'
  | 'receipt'
  | 'avatar'
  | 'logo'
  | 'banner'
  | 'social';

const PRESETS: Record<ImagePreset, { maxWidthOrHeight: number; maxSizeMB: number; initialQuality: number }> = {
  product: { maxWidthOrHeight: 1200, maxSizeMB: 0.25, initialQuality: 0.8 },
  thumb: { maxWidthOrHeight: 400, maxSizeMB: 0.04, initialQuality: 0.72 },
  // Documentos e comprovantes precisam continuar legíveis
  document: { maxWidthOrHeight: 1600, maxSizeMB: 0.45, initialQuality: 0.82 },
  receipt: { maxWidthOrHeight: 1600, maxSizeMB: 0.45, initialQuality: 0.82 },
  avatar: { maxWidthOrHeight: 320, maxSizeMB: 0.04, initialQuality: 0.75 },
  logo: { maxWidthOrHeight: 600, maxSizeMB: 0.12, initialQuality: 0.85 },
  banner: { maxWidthOrHeight: 1600, maxSizeMB: 0.35, initialQuality: 0.8 },
  social: { maxWidthOrHeight: 800, maxSizeMB: 0.12, initialQuality: 0.78 },
};

function isCompressibleImage(file: File) {
  return (
    file.type.startsWith('image/') &&
    file.type !== 'image/gif' && // preserva animação
    file.type !== 'image/svg+xml' // vetor já é pequeno
  );
}

function baseName(name: string) {
  return name.replace(/\.[^/.]+$/, '') || 'imagem';
}

/**
 * Redimensiona e converte para WebP conforme o preset.
 * Arquivos que não são imagem (ex.: PDF) são devolvidos sem alteração.
 */
export async function prepareImageForUpload(file: File, preset: ImagePreset = 'product'): Promise<File> {
  if (!isCompressibleImage(file)) return file;
  const opts = PRESETS[preset];
  try {
    const blob = await imageCompression(file, {
      ...opts,
      useWebWorker: true,
      fileType: 'image/webp',
    });
    // Se por algum motivo o resultado ficou maior, mantém o original
    if (blob.size >= file.size && file.type === 'image/webp') return file;
    return new File([blob], `${baseName(file.name)}.webp`, {
      type: 'image/webp',
      lastModified: Date.now(),
    });
  } catch (err) {
    console.warn('[storage] Falha ao comprimir imagem, enviando original:', err);
    return file;
  }
}

/** Caminho da miniatura de um arquivo: `pasta/foto.webp` → `pasta/foto_thumb.webp` */
export function thumbPathFor(filePath: string) {
  return filePath.replace(/\.[^/.]+$/, '') + '_thumb.webp';
}

const PUBLIC_MARKER = '/storage/v1/object/public/';

/**
 * URL da miniatura de uma imagem do Supabase Storage.
 * Para URLs externas (ou sem extensão) devolve a própria URL.
 * Se a miniatura não existir, o componente <StorageImage> volta para a original.
 */
export function thumbUrl(url?: string | null): string {
  if (!url) return '';
  if (!url.includes(PUBLIC_MARKER)) return url;
  const [clean, query] = url.split('?');
  if (/_thumb\.webp$/i.test(clean)) return url;
  if (!/\.(webp|jpe?g|png)$/i.test(clean)) return url;
  return thumbPathFor(clean) + (query ? `?${query}` : '');
}

/**
 * Faz upload de uma imagem já otimizada + (opcional) sua miniatura.
 * Retorna a URL pública da imagem principal.
 */
export async function uploadImage(
  bucket: string,
  filePathWithoutExt: string,
  file: File,
  preset: ImagePreset,
  { withThumbnail = false }: { withThumbnail?: boolean } = {}
): Promise<{ publicUrl: string; path: string }> {
  const processed = await prepareImageForUpload(file, preset);
  const ext = processed.name.split('.').pop() || 'webp';
  const path = `${filePathWithoutExt}.${ext}`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, processed, { ...STORAGE_UPLOAD_OPTIONS, contentType: processed.type || undefined });
  if (error) throw error;

  if (withThumbnail && isCompressibleImage(file)) {
    try {
      const thumb = await prepareImageForUpload(processed, 'thumb');
      await supabase.storage
        .from(bucket)
        .upload(thumbPathFor(path), thumb, { ...STORAGE_UPLOAD_OPTIONS, contentType: 'image/webp' });
    } catch (err) {
      // Miniatura é opcional: a interface cai para a imagem original
      console.warn('[storage] Falha ao gerar miniatura:', err);
    }
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return { publicUrl: data.publicUrl, path };
}
