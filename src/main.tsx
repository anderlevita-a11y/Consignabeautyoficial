import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// O cache de imagens anterior ('supabase-storage-images') podia guardar
// respostas de erro de miniaturas que ainda não existiam. Ele foi substituído
// por 'supabase-storage-thumbs' e 'supabase-storage-images-v2'; apaga o antigo.
if (typeof window !== 'undefined' && 'caches' in window) {
  caches.delete('supabase-storage-images').catch(() => {});
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
