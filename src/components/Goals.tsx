import React, { useEffect, useState } from 'react';
import { 
  Plus, 
  Trophy, 
  Users, 
  ChevronRight, 
  Loader2, 
  X, 
  Save, 
  Trash2,
  Archive,
  RefreshCcw,
  Link as LinkIcon,
  Eye,
  MessageSquare,
  Target,
  Gift,
  Share2,
  Calendar,
  Clock
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { GoalCampaign, GoalParticipant } from '../types';
import { cn, formatError, formatMoneyInput, parseMoney } from '../lib/utils';
import { format, differenceInDays } from 'date-fns';
import { ConfirmationModal } from './ConfirmationModal';
import { useNotifications } from './NotificationCenter';

export function GoalsManager() {
  const { addNotification } = useNotifications();
  const [campaigns, setCampaigns] = useState<GoalCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'create' | 'details'>('list');
  const [selectedCampaign, setSelectedCampaign] = useState<GoalCampaign | null>(null);

  useEffect(() => {
    fetchCampaigns();
  }, []);

  async function fetchCampaigns() {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;

      const { data, error } = await supabase
        .from('goal_campaigns')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setCampaigns(data || []);
    } catch (err) {
      console.error('Error fetching goal campaigns:', err);
    } finally {
      setLoading(false);
    }
  }

  const handleOpenCampaign = (campaign: GoalCampaign) => {
    setSelectedCampaign(campaign);
    setView('details');
  };

  const shareLink = async (campaign?: GoalCampaign) => {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;

    const url = campaign 
      ? `${window.location.origin}/?metas=${campaign.id}`
      : `${window.location.origin}/?metas-e-brindes=true${userId ? `&u=${userId}` : ''}`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: campaign ? `Meta: ${campaign.title}` : 'Metas e Brindes',
          text: campaign ? `Participe da campanha "${campaign.title}"!` : 'Confira nossas metas e brindes!',
          url: url,
        });
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          navigator.clipboard.writeText(url);
          addNotification({
            type: 'success',
            title: 'Link copiado',
            message: 'Link copiado para a área de transferência!'
          });
        }
      }
    } else {
      navigator.clipboard.writeText(url);
      addNotification({
        type: 'success',
        title: 'Link copiado',
        message: 'Link copiado para a área de transferência!'
      });
    }
  };

  if (view === 'create') {
    return <GoalForm onClose={() => setView('list')} onSave={() => { setView('list'); fetchCampaigns(); }} />;
  }

  if (view === 'details' && selectedCampaign) {
    return <GoalDetails campaign={selectedCampaign} onBack={() => setView('list')} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-zinc-800">Campanhas de Metas</h3>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => shareLink()}
            className="flex items-center gap-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 px-4 py-2.5 rounded-xl font-bold text-sm transition-all"
          >
            <Share2 className="w-5 h-5" />
            Compartilhar Geral
          </button>
          <button 
            onClick={() => setView('create')}
            className="flex items-center gap-2 bg-[#00a86b] hover:bg-[#008f5b] text-white px-6 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg shadow-emerald-500/20"
          >
            <Plus className="w-5 h-5" />
            Nova Campanha
          </button>
        </div>
      </div>

      {/* Legenda de Ações */}
      <div className="bg-white border border-zinc-100 rounded-2xl p-4 flex flex-wrap gap-6 items-center shadow-sm">
        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Legenda de Ações:</span>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <div className="p-1.5 bg-zinc-50 rounded-lg text-zinc-600">
            <Eye className="w-3.5 h-3.5" />
          </div>
          <span>Gerenciar Campanha</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <div className="p-1.5 bg-emerald-50 rounded-lg text-emerald-600">
            <LinkIcon className="w-3.5 h-3.5" />
          </div>
          <span>Compartilhar Link</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <div className="p-1.5 bg-zinc-100 rounded-lg text-zinc-600">
            <Share2 className="w-3.5 h-3.5" />
          </div>
          <span>Compartilhar Geral</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <div className="p-1.5 bg-[#00a86b] rounded-lg text-white">
            <Plus className="w-3.5 h-3.5" />
          </div>
          <span>Criar Nova Campanha</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full py-12 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mx-auto" />
          </div>
        ) : campaigns.length === 0 ? (
          <div className="col-span-full py-20 text-center bg-white border border-dashed border-zinc-200 rounded-[32px] space-y-4">
            <div className="w-16 h-16 bg-zinc-50 rounded-full flex items-center justify-center mx-auto">
              <Target className="w-8 h-8 text-zinc-200" />
            </div>
            <p className="text-zinc-400 font-medium">
              Nenhuma campanha de metas criada. Comece agora!
            </p>
          </div>
        ) : (
          campaigns.map(campaign => (
            <div key={campaign.id} className="bg-white border border-zinc-100 rounded-[32px] p-8 shadow-sm hover:shadow-md transition-all group relative">
              <div className="flex items-start justify-between mb-6">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Target className="w-6 h-6 text-emerald-500" />
                </div>
                <span className={cn(
                  "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                  campaign.status === 'active' ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-500"
                )}>
                  {campaign.status === 'active' ? 'Ativa' : 'Finalizada'}
                </span>
              </div>
              <div className="space-y-1 mb-6">
                <h4 className="text-xl font-bold text-zinc-800">{campaign.title}</h4>
                <p className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold flex items-center gap-1.5">
                  <Gift className="w-3 h-3" />
                  Brinde: {campaign.reward_description}
                </p>
              </div>

              <div className="space-y-4 mb-8">
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-bold uppercase tracking-widest">
                    <span className="text-zinc-400">Progresso</span>
                    <span className="text-emerald-600">
                      {Math.min(100, (campaign.current_value / campaign.goal_value) * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-emerald-500 transition-all duration-500"
                      style={{ width: `${Math.min(100, (campaign.current_value / campaign.goal_value) * 100)}%` }}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400 uppercase font-bold tracking-widest">Meta</span>
                  <span className="text-zinc-800 font-bold">
                    {campaign.type === 'value' 
                      ? campaign.goal_value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                      : campaign.goal_value}
                  </span>
                </div>

                {campaign.end_date && (
                  <div className="flex items-center justify-between text-xs pt-2 border-t border-zinc-50">
                    <span className="text-zinc-400 uppercase font-bold tracking-widest flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Prazo
                    </span>
                    <span className={cn(
                      "font-bold",
                      differenceInDays(new Date(campaign.end_date), new Date()) < 3 ? "text-red-500" : "text-zinc-600"
                    )}>
                      {differenceInDays(new Date(campaign.end_date), new Date()) > 0 
                        ? `${differenceInDays(new Date(campaign.end_date), new Date())} dias restantes`
                        : "Encerrada"}
                    </span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => handleOpenCampaign(campaign)}
                  className="flex items-center justify-center gap-2 bg-zinc-50 hover:bg-zinc-100 text-zinc-600 px-4 py-2.5 rounded-xl text-xs font-bold transition-all"
                >
                  <Eye className="w-4 h-4" />
                  Gerenciar
                </button>
                <button 
                  onClick={() => shareLink(campaign)}
                  className="flex items-center justify-center gap-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 px-4 py-2.5 rounded-xl text-xs font-bold transition-all"
                >
                  <LinkIcon className="w-4 h-4" />
                  Compartilhar
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function GoalForm({ onClose, onSave }: { onClose: () => void; onSave: () => void }) {
  const { addNotification } = useNotifications();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    goal_value: '0,00' as string | number,
    reward_description: '',
    type: 'participants' as 'participants' | 'value',
    end_date: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;

      const { error } = await supabase
        .from('goal_campaigns')
        .insert([{
          user_id: user.id,
          title: formData.title,
          description: formData.description,
          goal_value: typeof formData.goal_value === 'string' ? parseMoney(formData.goal_value) : formData.goal_value,
          current_value: 0,
          reward_description: formData.reward_description,
          status: 'active',
          type: formData.type,
          end_date: formData.end_date || null
        }]);

      if (error) throw error;
      onSave();
    } catch (err) {
      console.error('Error saving goal campaign:', err);
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
    <div className="max-w-4xl mx-auto bg-white border border-zinc-200 rounded-[32px] shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-8 duration-500">
      <div className="p-8 border-b border-zinc-100 flex items-center gap-4">
        <button onClick={onClose} className="p-2 hover:bg-zinc-50 rounded-lg text-zinc-400 transition-colors">
          <X className="w-5 h-5" />
        </button>
        <h3 className="text-xl font-bold text-zinc-800">Nova Campanha de Metas</h3>
      </div>

      <form onSubmit={handleSubmit} className="p-8 space-y-8">
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Título da Campanha</label>
          <input 
            required
            type="text" 
            placeholder="Ex: Meta de Vendas Dezembro"
            value={formData.title}
            onChange={e => setFormData({...formData, title: e.target.value})}
            className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-4 text-sm focus:border-emerald-500 outline-none transition-all"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Tipo de Meta</label>
            <select 
              className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-4 text-sm focus:border-emerald-500 outline-none transition-all"
              value={formData.type}
              onChange={e => setFormData({...formData, type: e.target.value as 'participants' | 'value'})}
            >
              <option value="participants">Quantidade de Participantes</option>
              <option value="value">Valor Financeiro / Pontos</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
              {formData.type === 'participants' ? 'Meta (Qtd. Participantes)' : 'Meta (Valor Total)'}
            </label>
            <input 
              required
              type={formData.type === 'value' ? "text" : "number"}
              inputMode={formData.type === 'value' ? "numeric" : undefined}
              value={formData.goal_value}
              onChange={e => {
                const value = e.target.value;
                if (formData.type === 'value') {
                  setFormData({...formData, goal_value: formatMoneyInput(value)});
                } else {
                  setFormData({...formData, goal_value: Number(value)});
                }
              }}
              className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-4 text-sm focus:border-emerald-500 outline-none transition-all"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Brinde de Recompensa</label>
            <input 
              required
              type="text" 
              placeholder="Ex: Voucher de R$ 50,00"
              value={formData.reward_description}
              onChange={e => setFormData({...formData, reward_description: e.target.value})}
              className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-4 text-sm focus:border-emerald-500 outline-none transition-all"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Data Limite (Opcional)</label>
            <input 
              type="date" 
              value={formData.end_date}
              onChange={e => setFormData({...formData, end_date: e.target.value})}
              className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-4 text-sm focus:border-emerald-500 outline-none transition-all"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Descrição (Opcional)</label>
          <textarea 
            value={formData.description}
            onChange={e => setFormData({...formData, description: e.target.value})}
            className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-4 text-sm focus:border-emerald-500 outline-none transition-all min-h-[100px]"
          />
        </div>

        <div className="flex items-center justify-end gap-4 pt-4">
          <button 
            type="button"
            onClick={onClose}
            className="px-8 py-4 text-sm font-bold text-zinc-500 hover:text-zinc-800 transition-colors"
          >
            Cancelar
          </button>
          <button 
            type="submit"
            disabled={loading}
            className="bg-[#00a86b] hover:bg-[#008f5b] text-white px-12 py-4 rounded-2xl font-bold transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            Criar Campanha
          </button>
        </div>
      </form>
    </div>
  );
}

function GoalDetails({ campaign, onBack }: { campaign: GoalCampaign; onBack: () => void }) {
  const { addNotification } = useNotifications();
  const [participants, setParticipants] = useState<GoalParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  useEffect(() => {
    fetchParticipants();
  }, [campaign.id]);

  async function fetchParticipants() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('goal_participants')
        .select('*')
        .eq('campaign_id', campaign.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setParticipants(data || []);
    } catch (err) {
      console.error('Error fetching participants:', err);
    } finally {
      setLoading(false);
    }
  }

  const handleDeleteParticipant = async (participantId: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Excluir Participante',
      message: 'Tem certeza que deseja excluir este participante?',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        try {
          const { error } = await supabase
            .from('goal_participants')
            .delete()
            .eq('id', participantId);
          
          if (error) throw error;

          // Recalculate current_value in campaign
          const { data: remaining } = await supabase
            .from('goal_participants')
            .select('contribution_value')
            .eq('campaign_id', campaign.id);
          
          let newValue = 0;
          if (campaign.type === 'value') {
            newValue = remaining?.reduce((acc, p) => acc + (p.contribution_value || 0), 0) || 0;
          } else {
            newValue = remaining?.length || 0;
          }

          await supabase
            .from('goal_campaigns')
            .update({ current_value: newValue })
            .eq('id', campaign.id);

          addNotification({
            type: 'success',
            title: 'Sucesso',
            message: 'Participante excluído com sucesso!'
          });
          fetchParticipants();
        } catch (err) {
          console.error('Error deleting participant:', err);
          addNotification({
            type: 'error',
            title: 'Erro ao excluir',
            message: formatError(err)
          });
        }
      }
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-zinc-100 rounded-lg text-zinc-400 transition-colors">
            <ChevronRight className="w-5 h-5 rotate-180" />
          </button>
          <div>
            <h2 className="text-2xl font-bold text-zinc-800 tracking-tight">{campaign.title}</h2>
            <p className="text-sm text-zinc-500">Gestão de Participantes e Recados</p>
          </div>
        </div>
      </div>

      {/* Legenda de Ações */}
      <div className="bg-white border border-zinc-100 rounded-2xl p-4 flex flex-wrap gap-6 items-center shadow-sm">
        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Legenda de Ações:</span>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <div className="p-1.5 bg-red-50 rounded-lg text-red-400">
            <Trash2 className="w-3.5 h-3.5" />
          </div>
          <span>Excluir Participante</span>
        </div>
      </div>

      <div className="bg-white border border-zinc-200 rounded-[32px] overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50/50">
                <th className="px-8 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Data</th>
                <th className="px-8 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Participante</th>
                <th className="px-8 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">CPF / Telefone</th>
                <th className="px-8 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Cidade</th>
                <th className="px-8 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Valor</th>
                <th className="px-8 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Recado</th>
                <th className="px-8 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-8 py-20 text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mx-auto" />
                  </td>
                </tr>
              ) : participants.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-8 py-20 text-center text-zinc-400 italic">
                    Nenhum participante ainda.
                  </td>
                </tr>
              ) : (
                participants.map(p => (
                  <tr key={p.id} className="hover:bg-zinc-50/50 transition-colors">
                    <td className="px-8 py-4 text-zinc-500 text-sm">{format(new Date(p.created_at), "dd/MM/yy HH:mm")}</td>
                    <td className="px-8 py-4 font-bold text-zinc-800 text-sm">{p.name}</td>
                    <td className="px-8 py-4 text-zinc-500 text-sm">
                      <div className="flex flex-col">
                        <span>{p.cpf || '-'}</span>
                        <span className="text-[10px]">{p.phone || '-'}</span>
                      </div>
                    </td>
                    <td className="px-8 py-4 text-zinc-500 text-sm">{p.city}</td>
                    <td className="px-8 py-4 text-zinc-800 font-bold text-sm">
                      {p.contribution_value?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) || '-'}
                    </td>
                    <td className="px-8 py-4 text-zinc-600 text-sm italic">
                      {p.message ? `"${p.message}"` : '-'}
                    </td>
                    <td className="px-8 py-4 text-right">
                      <button 
                        onClick={() => handleDeleteParticipant(p.id)}
                        className="p-2 hover:bg-red-50 text-red-400 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        variant="danger"
      />
    </div>
  );
}
