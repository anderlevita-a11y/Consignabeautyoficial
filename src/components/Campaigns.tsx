import React, { useEffect, useState } from 'react';
import { 
  Plus, 
  Archive, 
  Trash2, 
  Calendar,
  Clock,
  Loader2,
  Megaphone,
  RefreshCcw,
  Search,
  X
} from 'lucide-react';
import { supabase, isConfigured } from '../lib/supabase';
import { Campaign } from '../types';
import { cn, formatError } from '../lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ConfirmationModal } from './ConfirmationModal';
import { useNotifications } from './NotificationCenter';
import { AlertCircle } from 'lucide-react';

import { CampaignForm } from './CampaignForm';
import { BagForm } from './BagForm';
import { CampaignDetails } from './CampaignDetails';
import { PromptModal } from './PromptModal';

export function Campaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const { addNotification } = useNotifications();
  const [view, setView] = useState<'list' | 'campaign-form' | 'bag-form' | 'campaign-details'>('list');
  const [showArchived, setShowArchived] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | undefined>();
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | undefined>();
  const [editingBagId, setEditingBagId] = useState<string | undefined>();
  const [searchQuery, setSearchQuery] = useState('');

  // Date Prompt Modal State
  const [datePromptModal, setDatePromptModal] = useState<{
    isOpen: boolean;
    campaign?: Campaign;
  }>({
    isOpen: false
  });

  // Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    variant: 'danger' | 'warning' | 'info';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    variant: 'info'
  });

  useEffect(() => {
    if (view === 'list') {
      fetchCampaigns();
    }
  }, [view, showArchived]);

  useEffect(() => {
    if (view === 'list' && campaigns.length > 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const overdueCampaigns = campaigns.filter(c => 
        c.status === 'active' && 
        c.return_date && 
        new Date(c.return_date) < today
      );

      if (overdueCampaigns.length > 0) {
        addNotification({
          type: 'warning',
          title: 'Campanhas Vencidas',
          message: `Você possui ${overdueCampaigns.length} campanhas com prazo de acerto vencido. Verifique as sacolas em aberto.`
        });
      }
    }
  }, [campaigns, view]);

  async function fetchCampaigns() {
    setLoading(true);
    setFetchError(null);
    try {
      if (!isConfigured) {
        setCampaigns([]);
        setFetchError('Supabase não configurado ou desconectado.');
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
        .from('campaigns')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', showArchived ? 'archived' : 'active')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setCampaigns(data || []);
      setFetchError(null);
    } catch (err) {
      console.warn('Erro ao carregar campanhas:', err);
      const friendlyMessage = formatError(err);
      setFetchError(friendlyMessage);
    } finally {
      setLoading(false);
    }
  }

  const handleEdit = (campaign: Campaign) => {
    setEditingCampaign(campaign);
    setView('campaign-form');
  };

  const handleNewCampaign = () => {
    setEditingCampaign(undefined);
    setView('campaign-form');
  };

  const handleArchive = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Arquivar Campanha',
      message: 'Deseja arquivar esta campanha?',
      variant: 'warning',
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from('campaigns')
            .update({ status: 'archived' })
            .eq('id', id);
          if (error) throw error;
          fetchCampaigns();
        } catch (err) {
          console.error('Error archiving campaign:', err);
          addNotification({
            type: 'error',
            title: 'Erro ao arquivar',
            message: formatError(err)
          });
        } finally {
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const handleUnarchive = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Desarquivar Campanha',
      message: 'Deseja desarquivar esta campanha?',
      variant: 'info',
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from('campaigns')
            .update({ status: 'active' })
            .eq('id', id);
          if (error) throw error;
          fetchCampaigns();
        } catch (err) {
          console.error('Error unarchiving campaign:', err);
          addNotification({
            type: 'error',
            title: 'Erro ao desarquivar',
            message: formatError(err)
          });
        } finally {
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const handleOpenCampaign = (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    setView('campaign-details');
  };

  const handleUpdateReturnDate = async (campaign: Campaign, newDate: string) => {
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const oldReturnDateStr = campaign.return_date ? new Date(campaign.return_date).toISOString().split('T')[0] : null;

      // Logic from CampaignForm.tsx for recycling
      if (oldReturnDateStr && oldReturnDateStr < todayStr && newDate >= todayStr) {
        // Mark all open bags as 'overdue' before updating the campaign
        await supabase
          .from('bags')
          .update({ status: 'overdue' })
          .eq('campaign_id', campaign.id)
          .eq('status', 'open');
      }

      const { error } = await supabase
        .from('campaigns')
        .update({ return_date: newDate })
        .eq('id', campaign.id);

      if (error) throw error;

      addNotification({
        type: 'success',
        title: 'Data Atualizada',
        message: 'A data de retorno foi atualizada com sucesso.'
      });

      fetchCampaigns();
    } catch (err) {
      console.error('Error updating return date:', err);
      addNotification({
        type: 'error',
        title: 'Erro ao atualizar data',
        message: formatError(err)
      });
    } finally {
      setDatePromptModal({ isOpen: false });
    }
  };

  const handleAddBagToCampaign = (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    setView('bag-form');
  };

  if (view === 'campaign-form') {
    return (
      <CampaignForm 
        onClose={() => setView('list')} 
        onSave={() => setView('list')}
        initialData={editingCampaign}
      />
    );
  }

  if (view === 'bag-form') {
    return (
      <BagForm 
        onClose={() => {
          setEditingBagId(undefined);
          setView(selectedCampaign ? 'campaign-details' : 'list');
        }} 
        onSave={() => {
          setEditingBagId(undefined);
          setView(selectedCampaign ? 'campaign-details' : 'list');
        }}
        campaignId={selectedCampaign?.id}
        bagId={editingBagId}
      />
    );
  }

  if (view === 'campaign-details' && selectedCampaign) {
    return (
      <CampaignDetails 
        campaign={selectedCampaign}
        onBack={() => setView('list')}
        onAddBag={() => {
          setEditingBagId(undefined);
          setView('bag-form');
        }}
        onEditBag={(bagId) => {
          setEditingBagId(bagId);
          setView('bag-form');
        }}
      />
    );
  }

  const filteredCampaigns = campaigns.filter(c => {
    if (!searchQuery.trim()) return true;
    const term = searchQuery.toLowerCase().trim();
    const nameMatch = c.name.toLowerCase().includes(term);
    const dateFormatted = c.return_date ? format(new Date(c.return_date), 'dd/MM/yyyy') : '';
    const dateMatch = dateFormatted.includes(term);
    const discountMatch = `${c.discount_pct}%`.includes(term) || `${c.discount_pct}` === term;
    return nameMatch || dateMatch || discountMatch;
  });

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-xl sm:text-2xl font-bold text-zinc-800">
          {showArchived ? 'Campanhas Arquivadas' : 'Campanhas'}
        </h2>
        <div className="flex items-center gap-2 sm:gap-3">
          <button 
            onClick={() => setShowArchived(!showArchived)}
            className={cn(
              "flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-sm sm:font-medium transition-colors",
              showArchived 
                ? "bg-emerald-50 text-emerald-600 border border-emerald-100" 
                : "bg-zinc-100 hover:bg-zinc-200 text-zinc-600"
            )}
          >
            <Archive className="w-4 h-4" />
            {showArchived ? 'Ver Ativas' : 'Arquivadas'}
          </button>
          <button 
            onClick={handleNewCampaign}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-[#00a86b] hover:bg-[#008f5b] text-white px-3 sm:px-4 py-2 rounded-lg text-sm sm:font-medium transition-colors shadow-sm"
          >
            <Plus className="w-5 h-5" />
            Nova Campanha
          </button>
        </div>
      </div>

      {fetchError && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <p className="font-semibold text-amber-900">Não foi possível carregar as campanhas</p>
              <p className="text-xs text-amber-700 mt-0.5">{fetchError}</p>
            </div>
          </div>
          <button
            onClick={() => fetchCampaigns()}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors self-end sm:self-center shrink-0"
          >
            <RefreshCcw className="w-3.5 h-3.5" />
            Tentar novamente
          </button>
        </div>
      )}

      {/* Barra de Pesquisa de Campanhas e Legenda de Ações */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Pesquisar campanha por nome, data ou desconto..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-zinc-200 rounded-xl pl-10 pr-10 py-2.5 text-sm text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 shadow-sm transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-600 rounded-lg hover:bg-zinc-100 transition-colors"
              title="Limpar pesquisa"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Legenda de Ações */}
        <div className="bg-white border border-zinc-100 rounded-2xl px-4 py-2.5 flex flex-wrap gap-5 items-center shadow-sm text-xs text-zinc-500">
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Ações:</span>
          <div className="flex items-center gap-1.5">
            <div className="p-1 bg-zinc-50 rounded-md text-zinc-600">
              <Plus className="w-3 h-3" />
            </div>
            <span>Nova Sacola</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="p-1 bg-zinc-50 rounded-md text-zinc-600">
              {showArchived ? <RefreshCcw className="w-3 h-3" /> : <Trash2 className="w-3 h-3" />}
            </div>
            <span>{showArchived ? 'Desarquivar' : 'Arquivar'}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full py-12 text-center text-zinc-400 flex flex-col items-center gap-2">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
            Carregando campanhas...
          </div>
        ) : campaigns.length === 0 ? (
          <div className="col-span-full py-12 text-center text-zinc-400 bg-white border border-dashed border-zinc-200 rounded-2xl">
            {showArchived 
              ? 'Nenhuma campanha arquivada encontrada.' 
              : 'Nenhuma campanha ativa. Clique em "Nova Campanha" para começar.'}
          </div>
        ) : filteredCampaigns.length === 0 ? (
          <div className="col-span-full py-12 text-center text-zinc-500 bg-white border border-dashed border-zinc-200 rounded-2xl p-6 space-y-3">
            <Search className="w-8 h-8 text-zinc-300 mx-auto" />
            <p className="font-semibold text-zinc-700">Nenhuma campanha encontrada</p>
            <p className="text-xs text-zinc-400">Nenhum resultado para "{searchQuery}".</p>
            <button
              onClick={() => setSearchQuery('')}
              className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-lg text-xs font-semibold transition-colors"
            >
              Limpar pesquisa
            </button>
          </div>
        ) : (
          filteredCampaigns.map((campaign) => (
            <div key={campaign.id}>
              <CampaignCard 
                campaign={campaign} 
                isArchived={showArchived}
                onAddBag={() => handleAddBagToCampaign(campaign)}
                onEdit={() => handleEdit(campaign)}
                onArchive={() => handleArchive(campaign.id)}
                onUnarchive={() => handleUnarchive(campaign.id)}
                onOpen={() => handleOpenCampaign(campaign)}
                onUpdateDate={() => setDatePromptModal({ isOpen: true, campaign })}
              />
            </div>
          ))
        )}
      </div>

      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        variant={confirmModal.variant}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />

      <PromptModal
        isOpen={datePromptModal.isOpen}
        title="Alterar Data de Retorno"
        message={`Selecione a nova data de retorno para a campanha "${datePromptModal.campaign?.name}":`}
        type="date"
        defaultValue={datePromptModal.campaign?.return_date ? new Date(datePromptModal.campaign.return_date).toISOString().split('T')[0] : ''}
        onConfirm={(value) => datePromptModal.campaign && handleUpdateReturnDate(datePromptModal.campaign, value)}
        onCancel={() => setDatePromptModal({ isOpen: false })}
      />
    </div>
  );
}

interface CampaignCardProps {
  campaign: Campaign;
  isArchived?: boolean;
  onAddBag: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onOpen: () => void;
  onUpdateDate: () => void;
}

function CampaignCard({ campaign, isArchived, onAddBag, onEdit, onArchive, onUnarchive, onOpen, onUpdateDate }: CampaignCardProps) {
  return (
    <div className={cn(
      "bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow group",
      isArchived && "opacity-75 grayscale-[0.5]"
    )}>
      <div className="flex items-start justify-between mb-8">
        <div className="flex items-center gap-4">
          <h4 className="text-xl font-bold text-zinc-800 cursor-pointer hover:text-emerald-600 transition-colors" onClick={onOpen}>
            {campaign.name}
          </h4>
          <div className="flex items-center gap-2">
            {!isArchived && (
              <button 
                onClick={onAddBag}
                className="p-1.5 text-zinc-400 hover:text-emerald-500 hover:bg-emerald-50/50 rounded-md transition-all"
                title="Nova Sacola"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}
            <button 
              onClick={isArchived ? onUnarchive : onArchive}
              className={cn(
                "p-1.5 rounded-md transition-all",
                isArchived 
                  ? "text-zinc-400 hover:text-emerald-500 hover:bg-emerald-50/50" 
                  : "text-zinc-400 hover:text-red-500 hover:bg-red-50/50"
              )}
              title={isArchived ? "Desarquivar" : "Arquivar"}
            >
              {isArchived ? <RefreshCcw className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <span className={cn(
          "px-3 py-1 rounded-lg text-sm font-bold",
          isArchived ? "bg-zinc-100 text-zinc-500" : "bg-emerald-50 text-emerald-600"
        )}>
          {campaign.discount_pct}% Desc.
        </span>
      </div>

      <div className="flex items-center justify-between text-xs font-medium">
        <div 
          onClick={(e) => {
            e.stopPropagation();
            onUpdateDate();
          }}
          className={cn(
            "flex items-center gap-1.5 cursor-pointer hover:bg-zinc-50 p-1 rounded-lg transition-colors",
            campaign.return_date && new Date(campaign.return_date) < new Date(new Date().setHours(0, 0, 0, 0))
              ? "text-red-600 font-bold"
              : "text-zinc-400"
          )}
        >
          <span>Retorno: {format(new Date(campaign.return_date || ''), "dd/MM/yyyy")}</span>
        </div>
        <div className="flex items-center gap-1.5 text-zinc-400">
          <span>Criada em: {format(new Date(campaign.created_at), "dd/MM/yyyy")}</span>
        </div>
      </div>
    </div>
  );
}
