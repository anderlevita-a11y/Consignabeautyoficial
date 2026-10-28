import { prepareImageForUpload } from './storage';

/**
 * @deprecated Use `prepareImageForUpload(file, preset)` ou `uploadImage(...)` de './storage'.
 * Mantido por compatibilidade: aplica o preset de foto de produto.
 */
export async function compressImage(file: File): Promise<File> {
  return prepareImageForUpload(file, 'product');
}
