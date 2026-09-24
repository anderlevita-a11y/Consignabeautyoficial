import React, { useEffect, useState } from 'react';
import { 
  ShoppingBag, 
  Plus, 
  Trophy, 
  ChevronRight, 
  Loader2, 
  X, 
  Save, 
  Trash2,
  CheckCircle2,
  Link as LinkIcon,
  Eye,
  Check,
  Gift,
  Share2,
  Upload
} from 'lucide-react';
import { supabase, isConfigured } from '../lib/supabase';
import { MysteryBagCampaign, MysteryBag } from '../types';
import { cn, formatError } from '../lib/utils';
import { format } from 'date-fns';
import { useNotifications } from './NotificationCenter';
import { ConfirmationModal } from './ConfirmationModal';

export function MysteryBagsManager() {
  const { addNotification } = useNotifications();
  const [campaigns, setCampaigns] = useState<MysteryBagCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'create' | 'details'>('list');
  const [selectedCampaign, setSelectedCampaign] = useState<MysteryBagCampaign | null>(null);

  useEffect(() => {
    fetchCampaigns();
  }, []);

  async function fetchCampaigns() {
    setLoading(true);
    try {
      if (!isConfigured) {
        setCampaigns([]);
        return;
      }
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const user = session?.user;
      if (!user) {
        setCampaigns([]);
        return;
      }

      const { data, error } = await supabase
        .from('mystery_bag_campaigns')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setCampaigns(data || []);
    } catch (err) {
      console.warn('Error fetching mystery bag campaigns:', err);
    } finally {
      setLoading(false);
    }
  }

  const handleOpenCampaign = (campaign: MysteryBagCampaign) => {
    setSelectedCampaign(campaign);
    setView('details');
  };

  const shareLink = async (campaign: MysteryBagCampaign) => {
    const url = `${window.location.origin}/?sacola=${campaign.id}`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Sacola Premiada: ${campaign.title}`,
          text: `Participe da Sacola Premiada "${campaign.title}" e descubra seu prêmio surpresa!`,
          url: url,
        });
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Error sharing:', err);
          navigator.clipboard.writeText(url);
  addNotification({ type: 'success', title: 'Compartilhar', message: 'Link copiado para a área de transferência!' });
        }
      }
    } else {
      navigator.clipboard.writeText(url);
      addNotification({ type: 'success', title: 'Compartilhar', message: 'Link copiado para a área de transferência!' });
    }
  };

  if (view === 'create') {
    return <MysteryBagForm onClose={() => setView('list')} onSave={() => { setView('list'); fetchCampaigns(); }} />;
  }

  if (view === 'details' && selectedCampaign) {
    return <MysteryBagDetails campaign={selectedCampaign} onBack={() => setView('list')} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-zinc-800">Sacolas Premiadas Ativas</h3>
        <button 
          onClick={() => setView('create')}
          className="flex items-center gap-2 bg-[#00a86b] hover:bg-[#008f5b] text-white px-6 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg shadow-emerald-500/20"
        >
          <Plus className="w-5 h-5" />
          Nova Campanha
        </button>
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
              <ShoppingBag className="w-8 h-8 text-zinc-200" />
            </div>
            <p className="text-zinc-400 font-medium">
              Nenhuma campanha criada. Comece agora!
            </p>
          </div>
        ) : (
          campaigns.map(campaign => (
            <div key={campaign.id} className="bg-white border border-zinc-100 rounded-[32px] p-8 shadow-sm hover:shadow-md transition-all group relative">
              <div className="flex items-start justify-between mb-6">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <ShoppingBag className="w-6 h-6 text-emerald-500" />
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
                  Sacolas Surpresa
                </p>
              </div>

              <div className="space-y-3 mb-8">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400 uppercase font-bold tracking-widest">Valor da Sacola</span>
                  <span className="text-zinc-800 font-bold">R$ {campaign.bag_price.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400 uppercase font-bold tracking-widest">Criada em</span>
                  <span className="text-zinc-800 font-bold">{format(new Date(campaign.created_at), 'dd/MM/yyyy')}</span>
                </div>
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

function MysteryBagForm({ onClose, onSave }: { onClose: () => void; onSave: () => void }) {
  const { addNotification } = useNotifications();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    rules: '1. O conteúdo da sacola é surpresa e só será revelado após a finalização da campanha.\n2. O pagamento deve ser confirmado enviando o comprovante.\n3. Sacolas reservadas sem pagamento serão liberadas após 24h.',
    prizes: [''],
    payment_info: ''
  });
  const [bagPriceInput, setBagPriceInput] = useState('50');

  const handleAddPrize = () => {
    setFormData({ ...formData, prizes: [...formData.prizes, ''] });
  };

  const handlePrizeChange = (index: number, value: string) => {
    const newPrizes = [...formData.prizes];
    newPrizes[index] = value;
    setFormData({ ...formData, prizes: newPrizes });
  };

  const handleRemovePrize = (index: number) => {
    const newPrizes = formData.prizes.filter((_, i) => i !== index);
    setFormData({ ...formData, prizes: newPrizes });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;

      const bag_price = Number(bagPriceInput.replace(',', '.')) || 0;
      const validPrizes = formData.prizes.filter(p => p.trim() !== '');
      if (validPrizes.length === 0) {
        addNotification({ type: 'warning', title: 'Aviso', message: 'Adicione pelo menos um prêmio/sacola.' });
        setLoading(false);
        return;
      }

      // 1. Create Campaign
      const { data: campaign, error: campaignError } = await supabase
        .from('mystery_bag_campaigns')
        .insert([{
          user_id: user.id,
          title: formData.title,
          description: formData.description,
          rules: formData.rules,
          bag_price,
          payment_info: formData.payment_info,
          status: 'active'
        }])
        .select()
        .single();

      if (campaignError) throw campaignError;

      // 2. Shuffle display numbers
      const totalBags = validPrizes.length;
      const displayNumbers = Array.from({ length: totalBags }, (_, i) => i + 1);
      for (let i = displayNumbers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [displayNumbers[i], displayNumbers[j]] = [displayNumbers[j], displayNumbers[i]];
      }

      // 3. Create Bags
      const bagsToInsert = validPrizes.map((prize, index) => ({
        campaign_id: campaign.id,
        display_number: displayNumbers[index],
        prize_description: prize,
        status: 'available'
      }));

      const { error: bagsError } = await supabase
        .from('mystery_bags')
        .insert(bagsToInsert);

      if (bagsError) throw bagsError;

      onSave();
    } catch (err) {
      console.error('Error saving campaign:', err);
      addNotification({ type: 'error', title: 'Erro', message: 'Erro ao criar campanha' });
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
        <h3 className="text-xl font-bold text-zinc-800">Nova Sacola Premiada</h3>
      </div>

      <form onSubmit={handleSubmit} className="p-8 space-y-8">
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Título da Campanha</label>
          <input 
            required
            type="text" 
            placeholder="Ex: Sacola Premiada de Dia das Mães"
            value={formData.title}
            onChange={e => setFormData({...formData, title: e.target.value})}
            className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-4 text-sm focus:border-emerald-500 outline-none transition-all"
          />
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Valor de cada Sacola [R$]</label>
          <input 
            required
            type="text" 
            inputMode="decimal"
            placeholder="0,00"
            value={bagPriceInput}
            onChange={e => {
              const val = e.target.value;
              if (val === '' || /^\d*([.,]\d*)?$/.test(val)) {
                setBagPriceInput(val);
              }
            }}
            className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-4 text-sm focus:border-emerald-500 outline-none transition-all"
          />
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Descrição (Opcional)</label>
          <textarea 
            value={formData.description}
            onChange={e => setFormData({...formData, description: e.target.value})}
            className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-4 text-sm focus:border-emerald-500 outline-none transition-all min-h-[100px]"
          />
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Prêmios (Cada prêmio será uma sacola)</label>
            <button 
              type="button"
              onClick={handleAddPrize}
              className="text-xs font-bold text-emerald-600 hover:text-emerald-700 transition-colors"
            >
              + Adicionar Prêmio/Sacola
            </button>
          </div>
          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 mb-4">
            <p className="text-xs text-amber-800">
              <strong>Atenção:</strong> A quantidade de prêmios que você adicionar aqui será a quantidade total de sacolas disponíveis. As sacolas serão embaralhadas automaticamente.
            </p>
          </div>
          {formData.prizes.map((prize, index) => (
            <div key={index} className="flex gap-2">
              <input 
                required
                type="text" 
                placeholder={`Prêmio da Sacola ${index + 1}`}
                value={prize}
                onChange={e => handlePrizeChange(index, e.target.value)}
                className="flex-1 bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-4 text-sm focus:border-emerald-500 outline-none transition-all"
              />
              {formData.prizes.length > 1 && (
                <button 
                  type="button"
                  onClick={() => handleRemovePrize(index)}
                  className="p-4 bg-red-50 text-red-500 rounded-2xl hover:bg-red-100 transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Informações de Pagamento (Chave PIX, etc)</label>
          <textarea 
            required
            placeholder="Ex: Chave PIX Celular: (11) 99999-9999 - Nome: João Silva"
            value={formData.payment_info}
            onChange={e => setFormData({...formData, payment_info: e.target.value})}
            className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-4 text-sm focus:border-emerald-500 outline-none transition-all min-h-[100px]"
          />
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Regras da Campanha</label>
          <textarea 
            required
            value={formData.rules}
            onChange={e => setFormData({...formData, rules: e.target.value})}
            className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-4 text-sm focus:border-emerald-500 outline-none transition-all min-h-[160px]"
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

function MysteryBagDetails({ campaign, onBack }: { campaign: MysteryBagCampaign; onBack: () => void }) {
  const { addNotification } = useNotifications();
  const [bags, setBags] = useState<MysteryBag[]>([]);
  const [loading, setLoading] = useState(true);
  const [finishing, setFinishing] = useState(false);
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
    fetchBags();
  }, [campaign.id]);

  async function fetchBags() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('mystery_bags')
        .select('*')
        .eq('campaign_id', campaign.id)
        .order('display_number', { ascending: true });
      if (error) throw error;
      setBags(data || []);
    } catch (err) {
      console.error('Error fetching bags:', err);
    } finally {
      setLoading(false);
    }
  }

  const handleApprovePayment = async (bagId: string) => {
    try {
      const { error } = await supabase
        .from('mystery_bags')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', bagId);
      
      if (error) throw error;
      fetchBags();
    } catch (err) {
      console.error('Error approving payment:', err);
      addNotification({ type: 'error', title: 'Erro', message: 'Erro ao aprovar pagamento' });
    }
  };

  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const handleUploadReceipt = async (bagId: string, file: File) => {
    setUploadingId(bagId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) throw new Error('Usuário não autenticado');

      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/mystery_bag_${bagId}_${Date.now()}.${fileExt}`;
      const bucket = 'payment_proofs';

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        // Fallback to 'products' bucket
        const { error: fallbackError } = await supabase.storage
          .from('products')
          .upload(`receipts/${fileName}`, file, {
            cacheControl: '3600',
            upsert: false
          });
        
        if (fallbackError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('products')
          .getPublicUrl(`receipts/${fileName}`);
        
        const { error: updateError } = await supabase
          .from('mystery_bags')
          .update({ receipt_url: publicUrl })
          .eq('id', bagId);
        
        if (updateError) throw updateError;
      } else {
        const { data: { publicUrl } } = supabase.storage
          .from(bucket)
          .getPublicUrl(fileName);
        
        const { error: updateError } = await supabase
          .from('mystery_bags')
          .update({ receipt_url: publicUrl })
          .eq('id', bagId);
        
        if (updateError) throw updateError;
      }
      
      fetchBags();
    } catch (err) {
      console.error('Error uploading receipt:', err);
      addNotification({ type: 'error', title: 'Erro', message: 'Erro ao carregar comprovante' });
    } finally {
      setUploadingId(null);
    }
  };

  const handleRejectPayment = async (bagId: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Rejeitar Pagamento',
      message: 'Tem certeza que deseja rejeitar este pagamento e liberar a sacola?',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        try {
          const { error } = await supabase
            .from('mystery_bags')
            .update({
              status: 'available',
              buyer_name: null,
              buyer_cpf: null,
              buyer_phone: null,
              receipt_url: null,
              reserved_at: null
            })
            .eq('id', bagId);
          
          if (error) throw error;
          addNotification({ type: 'success', title: 'Sucesso', message: 'Pagamento rejeitado e sacola liberada!' });
          fetchBags();
        } catch (err) {
          console.error('Error rejecting payment:', err);
          addNotification({ type: 'error', title: 'Erro', message: 'Erro ao rejeitar pagamento' });
        }
      }
    });
  };

  const handleFinishCampaign = async () => {
    setConfirmModal({
      isOpen: true,
      title: 'Finalizar Campanha',
      message: 'Tem certeza que deseja finalizar a campanha? Isso revelará os prêmios para todos os compradores.',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        setFinishing(true);
        try {
          const { error } = await supabase
            .from('mystery_bag_campaigns')
            .update({ status: 'finished' })
            .eq('id', campaign.id);
          
          if (error) throw error;
          addNotification({ type: 'success', title: 'Sucesso', message: 'Campanha finalizada com sucesso!' });
          campaign.status = 'finished'; // Update local state
          fetchBags(); // Refresh to ensure we have latest data
        } catch (err) {
          console.error('Error finishing campaign:', err);
          addNotification({ type: 'error', title: 'Erro', message: 'Erro ao finalizar campanha' });
        } finally {
          setFinishing(false);
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
            <p className="text-sm text-zinc-500">Gestão de Sacolas e Pagamentos</p>
          </div>
        </div>
        {campaign.status === 'active' && (
          <button 
            onClick={handleFinishCampaign}
            disabled={finishing}
            className="flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50"
          >
            {finishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />}
            Finalizar e Revelar Prêmios
          </button>
        )}
      </div>

      {/* Legenda de Ações */}
      <div className="bg-white border border-zinc-100 rounded-2xl p-4 flex flex-wrap gap-6 items-center shadow-sm">
        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Legenda de Ações:</span>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <div className="p-1.5 bg-emerald-50 rounded-lg text-emerald-600">
            <Eye className="w-3.5 h-3.5" />
          </div>
          <span>Ver Comprovante</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <div className="p-1.5 bg-emerald-50 rounded-lg text-emerald-600">
            <Check className="w-3.5 h-3.5" />
          </div>
          <span>Aprovar Pagamento</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <div className="p-1.5 bg-red-50 rounded-lg text-red-600">
            <Trash2 className="w-3.5 h-3.5" />
          </div>
          <span>Rejeitar e Liberar</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <div className="p-1.5 bg-amber-500 rounded-lg text-white">
            <Trophy className="w-3.5 h-3.5" />
          </div>
          <span>Finalizar Campanha</span>
        </div>
      </div>

      <div className="bg-white border border-zinc-200 rounded-[32px] overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50/50">
                <th className="px-8 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Sacola</th>
                <th className="px-8 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Prêmio Oculto</th>
                <th className="px-8 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Comprador</th>
                <th className="px-8 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Contato</th>
                <th className="px-8 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Comprovante</th>
                <th className="px-8 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Status</th>
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
              ) : bags.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-8 py-20 text-center text-zinc-400 italic">
                    Nenhuma sacola encontrada.
                  </td>
                </tr>
              ) : (
                bags.map(bag => (
                  <tr key={bag.id} className="hover:bg-zinc-50/50 transition-colors">
                    <td className="px-8 py-4 text-zinc-800 font-bold text-lg">#{String(bag.display_number).padStart(2, '0')}</td>
                    <td className="px-8 py-4">
                      {campaign.status === 'finished' ? (
                        <span className="font-bold text-emerald-600">{bag.prize_description}</span>
                      ) : (
                        <span className="text-zinc-400 italic blur-[2px] select-none" title="O conteúdo só será revelado no final da campanha">
                          {bag.prize_description}
                        </span>
                      )}
                    </td>
                    <td className="px-8 py-4">
                      {bag.buyer_name ? (
                        <>
                          <span className="font-bold text-zinc-800 text-sm">{bag.buyer_name}</span>
                          <p className="text-xs text-zinc-400 font-normal">CPF: {bag.buyer_cpf}</p>
                        </>
                      ) : (
                        <span className="text-zinc-400 text-xs italic">Disponível</span>
                      )}
                    </td>
                    <td className="px-8 py-4 text-zinc-500 text-sm">{bag.buyer_phone || '-'}</td>
                    <td className="px-8 py-4">
                      {bag.receipt_url ? (
                        <a href={bag.receipt_url} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:text-emerald-700 text-xs font-bold flex items-center gap-1">
                          <Eye className="w-4 h-4" /> Ver
                        </a>
                      ) : (
                        bag.status === 'reserved' && (
                          <div className="flex items-center gap-2">
                            <span className="text-zinc-400 text-xs italic">-</span>
                            <label className="p-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 rounded-lg cursor-pointer transition-colors">
                              {uploadingId === bag.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Upload className="w-3 h-3" />
                              )}
                              <input 
                                type="file" 
                                accept="image/jpeg,image/png,image/webp,application/pdf,image/*"
                                className="hidden"
                                onChange={e => {
                                  const file = e.target.files?.[0];
                                  if (file) handleUploadReceipt(bag.id, file);
                                }}
                              />
                            </label>
                          </div>
                        )
                      )}
                    </td>
                    <td className="px-8 py-4">
                      <span className={cn(
                        "px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider",
                        bag.status === 'paid' ? "bg-emerald-50 text-emerald-600" : 
                        bag.status === 'reserved' ? "bg-amber-50 text-amber-600" :
                        "bg-zinc-100 text-zinc-500"
                      )}>
                        {bag.status === 'paid' ? 'Pago' : bag.status === 'reserved' ? 'Reservado' : 'Disponível'}
                      </span>
                    </td>
                    <td className="px-8 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {bag.buyer_phone && (
                          <button 
                            onClick={() => {
                              const message = `Olá ${bag.buyer_name}! Confirmamos sua reserva da sacola #${String(bag.display_number).padStart(2, '0')} na campanha "${campaign.title}".\n\nStatus: ${bag.status === 'paid' ? 'PAGO' : 'AGUARDANDO PAGAMENTO'}${bag.receipt_url ? `\nComprovante: ${bag.receipt_url}` : ''}\n\nO conteúdo será revelado em breve!`;
                              window.open(`https://wa.me/55${bag.buyer_phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`, '_blank');
                            }}
                            className="p-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg transition-colors"
                            title="Enviar WhatsApp"
                          >
                            <Share2 className="w-4 h-4" />
                          </button>
                        )}
                        {bag.status === 'reserved' && campaign.status === 'active' && (
                          <>
                            <button 
                              onClick={() => handleApprovePayment(bag.id)}
                              className="p-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg transition-colors"
                              title="Aprovar Pagamento"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => handleRejectPayment(bag.id)}
                              className="p-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors"
                              title="Rejeitar e Liberar Sacola"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
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
