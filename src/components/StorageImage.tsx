import React, { useEffect, useState } from 'react';
import { thumbUrl } from '../lib/storage';

const STORAGE_MARKER = '/storage/v1/object/public/';

type Props = React.ImgHTMLAttributes<HTMLImageElement> & {
  /** Usa a miniatura (~400px) em vez da imagem completa. Ideal para listas e grades. */
  thumb?: boolean;
};

/**
 * <img> econômico para imagens do Supabase Storage:
 * - carrega só quando aparece na tela (lazy);
 * - com `thumb`, baixa a miniatura e, se ela não existir, volta para a original;
 * - arquivos do Supabase Storage são pedidos com crossOrigin="anonymous", para o
 *   service worker enxergar o status e não guardar no cache uma miniatura ausente.
 */
export function StorageImage({ src, thumb = false, loading = 'lazy', decoding = 'async', crossOrigin, onError, ...rest }: Props) {
  const preferred = thumb ? thumbUrl(src) : src || '';
  const fromStorage = (src || '').includes(STORAGE_MARKER);
  const [current, setCurrent] = useState(preferred);

  useEffect(() => {
    setCurrent(preferred);
  }, [preferred]);

  return (
    <img
      {...rest}
      src={current || undefined}
      loading={loading}
      decoding={decoding}
      crossOrigin={crossOrigin ?? (fromStorage ? 'anonymous' : undefined)}
      onError={(e) => {
        if (src && current !== src) {
          setCurrent(src); // miniatura ausente → original
          return;
        }
        onError?.(e);
      }}
    />
  );
}
