import React, { useState } from 'react';
import { Save, X, Calendar, Percent, FileText } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Campaign } from '../types';
import { useNotifications } from './NotificationCenter';
import { cn, formatError } from '../lib/utils';
import { sanitizeString } from '../lib/sanitizer';

interface CampaignFormProps {
  onClose: () => void;
  onSave: () => void;
  initialData?: Campaign;
}

export function CampaignForm({ onClose, onSave, initialData }: CampaignFormProps) {
  const { addNotification } = useNotifications();
  const [loading, setLoading] = useState(false);
  const [discountPctInput, setDiscountPctInput] = useState(initialData?.discount_pct?.toString() || '30');
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    return_date: initialData?.return_date ? new Date(initialData.return_date).toISOString().split('T')[0] : '2026-04-15',
  });

  const today = new Date().toISOString().split('T')[0];
  const isNewCampaign = !initialData;
  const isReturnDayOrLater = initialData?.return_date ? new Date(initialData.return_date).toISOString().split('T')[0] <= today : false;
  const canEditReturnDate = isNewCampaign || isReturnDayOrLater;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
      if (!user) return;

      const discount_pct = Number(discountPctInput.replace(',', '.')) || 0;
      const payload: any = {
        ...formData,
        name: sanitizeString(formData.name),
        discount_pct,
        user_id: user.id,
        status: 'active',
      };

      // Ensure empty strings are sent as null to avoid Supabase errors
      Object.keys(payload).forEach(key => {
        if (payload[key] === '') {
          payload[key] = null;
        }
      });

      if (initialData?.id) {
        // Se estiver reciclando (atualizando data de retorno de uma campanha vencida)
        const oldReturnDateStr = initialData.return_date ? new Date(initialData.return_date).toISOString().split('T')[0] : null;
        const newReturnDateStr = formData.return_date;
        const todayStr = new Date().toISOString().split('T')[0];

        if (oldReturnDateStr && oldReturnDateStr < todayStr && newReturnDateStr && newReturnDateStr >= todayStr) {
          // Marcar todas as sacolas abertas como 'overdue' antes de atualizar a campanha
          await supabase
            .from('bags')
            .update({ status: 'overdue' })
            .eq('campaign_id', initialData.id)
            .eq('status', 'open');
        }

        const { error } = await supabase
          .from('campaigns')
          .update(payload)
          .eq('id', initialData.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('campaigns')
          .insert([payload]);
        if (error) throw error;
      }

      onSave();
    } catch (err) {
      console.error('Error saving campaign:', err);
      addNotification({
        type: 'error',
        title: 'Erro ao salvar',
        message: formatError(err)
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-zinc-800 tracking-tight">Campanhas</h2>
        <div className="flex items-center gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-zinc-500 hover:text-zinc-800 transition-colors"
          >
            Cancelar
          </button>
          <button 
            onClick={handleSubmit}
            disabled={loading}
            className="flex items-center gap-2 bg-[#00a86b] hover:bg-[#008f5b] text-white px-6 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            Salvar Campanha
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto">
        <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-8 border-b border-zinc-100 bg-zinc-50/30">
            <h3 className="font-serif italic text-xl text-zinc-700">
              {initialData ? 'Editar Campanha' : 'Nova Campanha'}
            </h3>
          </div>
          
          <form onSubmit={handleSubmit} className="p-8 space-y-8">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                Nome da Campanha *
              </label>
              <input 
                type="text" 
                required
                placeholder="Ex: Campanha de Outono"
                value={formData.name}
                maxLength={100}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-4 text-zinc-800 focus:border-emerald-500 outline-none transition-all placeholder:text-zinc-300"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                  Desconto Padrão (%)
                </label>
                <div className="relative">
                  <input 
                    type="text" 
                    inputMode="decimal"
                    value={discountPctInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '' || /^\d*([.,]\d*)?$/.test(val)) {
                        setDiscountPctInput(val);
                      }
                    }}
                    className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-4 text-zinc-800 focus:border-emerald-500 outline-none transition-all"
                  />
                  <Percent className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-300" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center justify-between">
                  <span>Data para Retorno</span>
                  {!canEditReturnDate && (
                    <span className="text-amber-500 normal-case font-medium">Editar somente a partir do dia agendado</span>
                  )}
                </label>
                <div className="relative">
                  <input 
                    type="date" 
                    value={formData.return_date}
                    onChange={(e) => setFormData({ ...formData, return_date: e.target.value })}
                    disabled={!canEditReturnDate}
                    className={cn(
                      "w-full bg-white border border-zinc-200 rounded-xl px-4 py-4 text-zinc-800 focus:border-emerald-500 outline-none transition-all",
                      !canEditReturnDate && "opacity-60 cursor-not-allowed bg-zinc-50"
                    )}
                  />
                  <Calendar className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-300 pointer-events-none" />
                </div>
              </div>
            </div>

            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-[#007a53] hover:bg-[#006344] text-white py-5 rounded-2xl font-bold text-lg transition-all shadow-lg shadow-emerald-900/10 disabled:opacity-50"
            >
              {loading ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
