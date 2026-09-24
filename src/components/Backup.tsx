import React, { useState } from 'react';
import { Download, Database, ShieldCheck, AlertCircle, Loader2, FileJson } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';

export function Backup() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'fetching' | 'success' | 'error'>('idle');

  const handleDownloadBackup = async () => {
    setLoading(true);
    setStatus('fetching');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      // Fetch all critical data in parallel
      const [bagsRes, customersRes, transactionsRes] = await Promise.all([
        supabase.from('bags').select('*').eq('user_id', user.id),
        supabase.from('customers').select('*').eq('user_id', user.id),
        supabase.from('financial_transactions').select('*').eq('user_id', user.id)
      ]);

      if (bagsRes.error) throw bagsRes.error;
      if (customersRes.error) throw customersRes.error;
      if (transactionsRes.error) throw transactionsRes.error;

      const backupData = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        user_email: user.email,
        data: {
          bags: bagsRes.data,
          customers: customersRes.data,
          financial_transactions: transactionsRes.data
        }
      };

      // Create blob and download
      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const dateStr = new Date().toISOString().split('T')[0];
      
      link.href = url;
      link.download = `backup_consigna_${dateStr}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setStatus('success');
      setTimeout(() => setStatus('idle'), 3000);
    } catch (error) {
      console.error('Backup error:', error);
      setStatus('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-100 dark:border-zinc-800 shadow-xl overflow-hidden">
        <div className="p-8 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-500/20 rounded-2xl flex items-center justify-center">
              <Database className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-800 dark:text-zinc-100">Backup de Segurança</h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Proteja seus dados exportando uma cópia local</p>
            </div>
          </div>
        </div>

        <div className="p-8 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800">
              <h3 className="font-bold text-zinc-800 dark:text-zinc-100 mb-2 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                O que está incluído?
              </h3>
              <ul className="text-sm text-zinc-500 dark:text-zinc-400 space-y-2">
                <li>• Todas as sacolas e itens vinculados</li>
                <li>• Cadastro completo de clientes</li>
                <li>• Histórico de transações financeiras</li>
                <li>• Carimbo de data e versão do backup</li>
              </ul>
            </div>

            <div className="p-6 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-900/30">
              <h3 className="font-bold text-amber-800 dark:text-amber-400 mb-2 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Aviso Importante
              </h3>
              <p className="text-xs text-amber-700/70 dark:text-amber-500/70 leading-relaxed">
                Este arquivo contém dados sensíveis. Mantenha-o em um local seguro e não o compartilhe com terceiros. O arquivo JSON pode ser usado para restauração futura ou auditoria manual.
              </p>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center py-8 border-2 border-dashed border-zinc-100 dark:border-zinc-800 rounded-3xl">
            {status === 'success' ? (
              <div className="text-center animate-in zoom-in duration-300">
                <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <ShieldCheck className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                </div>
                <h4 className="text-lg font-bold text-zinc-800 dark:text-zinc-100">Backup Concluído!</h4>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">Seu arquivo foi gerado e baixado com sucesso.</p>
              </div>
            ) : status === 'error' ? (
              <div className="text-center animate-in shake duration-300">
                <div className="w-16 h-16 bg-red-100 dark:bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
                </div>
                <h4 className="text-lg font-bold text-zinc-800 dark:text-zinc-100">Falha no Backup</h4>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">Ocorreu um erro ao buscar seus dados. Tente novamente.</p>
                <button 
                  onClick={() => setStatus('idle')}
                  className="mt-4 text-xs font-bold text-emerald-600 uppercase tracking-widest hover:text-emerald-700"
                >
                  Tentar de novo
                </button>
              </div>
            ) : (
              <div className="text-center">
                <FileJson className="w-16 h-16 text-zinc-200 dark:text-zinc-800 mx-auto mb-6" />
                <button
                  onClick={handleDownloadBackup}
                  disabled={loading}
                  className={cn(
                    "flex items-center gap-3 bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-4 rounded-2xl font-bold transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-50",
                    loading && "cursor-wait"
                  )}
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Download className="w-5 h-5" />
                  )}
                  {loading ? 'Preparando Dados...' : 'Gerar e Baixar Backup'}
                </button>
                <p className="mt-4 text-xs text-zinc-400">Tamanho estimado: Pequeno (Formato JSON)</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
