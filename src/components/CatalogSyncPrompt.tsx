import React, { useEffect, useState } from 'react';
import { RefreshCw, X, CheckCircle2, AlertTriangle, ArrowRight, Package } from 'lucide-react';
import { syncCatalog } from '../lib/syncCatalog';
import { useNotifications } from './NotificationCenter';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export function CatalogSyncPrompt() {
  const { addNotification } = useNotifications();
  const [showPrompt, setShowPrompt] = useState(false);
  const [syncData, setSyncData] = useState<{
    inserted: any[];
    updated: any[];
    duplicates: any[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    checkForUpdates();
  }, []);

  async function checkForUpdates() {
    // Only check if we haven't checked in this session
    const lastCheck = sessionStorage.getItem('last_catalog_check');
    if (lastCheck) return;

    try {
      setLoading(true);
      const results = await syncCatalog(true); // Preview only
      
      if (results.inserted.length > 0 || results.updated.length > 0) {
        setSyncData(results);
        setShowPrompt(true);
      }
      
      sessionStorage.setItem('last_catalog_check', new Date().toISOString());
    } catch (err) {
      console.error('Error checking for catalog updates:', err);
    } finally {
      setLoading(false);
    }
  }

  const handleSync = async () => {
    setSyncing(true);
    try {
      const results = await syncCatalog(false); // Perform actual sync
      
      addNotification({
        type: 'success',
        title: 'Sincronização Concluída',
        message: `${results.inserted.length} novos produtos e ${results.updated.length} atualizações aplicadas.`
      });
      
      // Dispatch event to refresh products list in other components
      window.dispatchEvent(new CustomEvent('catalog_synced'));
      setShowPrompt(false);
    } catch (err: any) {
      console.error('Error syncing catalog:', err);
      addNotification({
        type: 'error',
        title: 'Erro na Sincronização',
        message: err.message || 'Ocorreu um erro ao sincronizar o catálogo.'
      });
    } finally {
      setSyncing(false);
    }
  };

  if (!showPrompt || !syncData) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-sm">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-zinc-100"
        >
          {/* Header */}
          <div className="bg-[#4a1d33] p-6 text-white relative">
            <button 
              onClick={() => setShowPrompt(false)}
              className="absolute top-4 right-4 p-2 hover:bg-white/10 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center backdrop-blur-md">
                <RefreshCw className={cn("w-6 h-6", syncing && "animate-spin")} />
              </div>
              <div>
                <h3 className="text-xl font-bold">Novidades no Catálogo</h3>
                <p className="text-white/60 text-sm">Existem novos produtos e atualizações disponíveis.</p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Novos</span>
                </div>
                <p className="text-2xl font-black text-emerald-900">{syncData.inserted.length}</p>
                <p className="text-[10px] text-emerald-600 font-medium">Produtos para importar</p>
              </div>
              
              <div className="p-4 rounded-2xl bg-blue-50 border border-blue-100">
                <div className="flex items-center gap-2 mb-1">
                  <RefreshCw className="w-4 h-4 text-blue-600" />
                  <span className="text-xs font-bold text-blue-700 uppercase tracking-wider">Atualizações</span>
                </div>
                <p className="text-2xl font-black text-blue-900">{syncData.updated.length}</p>
                <p className="text-[10px] text-blue-600 font-medium">Preços e descrições</p>
              </div>
            </div>

            {syncData.inserted.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Destaques dos Novos Produtos</h4>
                <div className="space-y-1">
                  {syncData.inserted.slice(0, 3).map((p, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 rounded-xl bg-zinc-50 border border-zinc-100">
                      <div className="w-8 h-8 rounded-lg bg-white border border-zinc-200 flex items-center justify-center overflow-hidden">
                        {p.photo_url ? (
                          <img src={p.photo_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Package className="w-4 h-4 text-zinc-400" />
                        )}
                      </div>
                      <span className="text-xs font-bold text-zinc-700 truncate flex-1">{p.name}</span>
                      <span className="text-[10px] font-black text-emerald-600">R$ {p.sale_price.toFixed(2)}</span>
                    </div>
                  ))}
                  {syncData.inserted.length > 3 && (
                    <p className="text-[10px] text-zinc-400 italic px-2">... e mais {syncData.inserted.length - 3} itens.</p>
                  )}
                </div>
              </div>
            )}

            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-100 flex gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
              <p className="text-xs text-amber-800 leading-relaxed">
                A sincronização garantirá que seu catálogo esteja alinhado com a Central de Etiquetas, 
                mantendo preços e códigos atualizados automaticamente.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 bg-zinc-50 border-t border-zinc-100 flex items-center gap-3">
            <button
              onClick={() => setShowPrompt(false)}
              disabled={syncing}
              className="flex-1 px-6 py-3.5 rounded-2xl text-sm font-bold text-zinc-500 hover:bg-zinc-100 transition-colors uppercase tracking-widest disabled:opacity-50"
            >
              Agora Não
            </button>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex-[2] px-6 py-3.5 rounded-2xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 transition-all uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {syncing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Sincronizando...
                </>
              ) : (
                <>
                  Sincronizar Agora
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
