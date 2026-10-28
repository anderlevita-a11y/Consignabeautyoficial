import React, { useEffect, useState } from 'react';
import { thumbUrl } from '../lib/storage';

type Props = React.ImgHTMLAttributes<HTMLImageElement> & {
  /** Usa a miniatura (~400px) em vez da imagem completa. Ideal para listas e grades. */
  thumb?: boolean;
};

/**
 * <img> econômico para imagens do Supabase Storage:
 * - carrega só quando aparece na tela (lazy);
 * - com `thumb`, baixa a miniatura e, se ela não existir, volta para a original.
 */
export function StorageImage({ src, thumb = false, loading = 'lazy', decoding = 'async', onError, ...rest }: Props) {
  const preferred = thumb ? thumbUrl(src) : src || '';
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
