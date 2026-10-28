import { useEffect, useState, Dispatch, SetStateAction } from 'react';
import { loadNavState, saveNavState } from '../lib/draftStore';

/**
 * Igual ao useState, mas guarda o valor no sessionStorage para que, depois
 * de uma recarga acidental da página, o app reabra a mesma tela/subtela.
 * (Não sobrevive ao fechamento da aba/app — para isso existem os rascunhos.)
 */
export function useNavState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => loadNavState<T>(key, initial));

  useEffect(() => {
    saveNavState(key, value);
  }, [key, value]);

  return [value, setValue];
}
