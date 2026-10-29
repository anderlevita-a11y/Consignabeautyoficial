import React from 'react';
import { Loader2 } from 'lucide-react';
import { useFileUrl } from '../lib/privateFiles';

type Props = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  /** URL salva no banco (pode ser de um bucket privado). */
  url?: string | null;
};

/** Imagem de documento/comprovante: busca um link temporário antes de mostrar. */
export function PrivateImage({ url, alt = '', ...rest }: Props) {
  const src = useFileUrl(url);
  if (src === undefined) {
    return <Loader2 className="w-8 h-8 animate-spin text-white/70" aria-label="Carregando" />;
  }
  if (!src) {
    return <p className="text-sm text-white/80">Não foi possível carregar o arquivo.</p>;
  }
  return <img {...rest} src={src} alt={alt} referrerPolicy="no-referrer" />;
}
