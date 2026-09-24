import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { GoalCampaign, GoalParticipant, StoreSettings } from '../types';
import { Loader2, Target, Gift, MessageSquare, MapPin, User, Send, CheckCircle2, ChevronRight, Share2, ChevronLeft, BarChart3, Clock } from 'lucide-react';
import { cn, formatError, formatMoneyInput, parseMoney } from '../lib/utils';
import { format, differenceInDays } from 'date-fns';
import { useNotifications } from './NotificationCenter';

export function PublicGoals() {
  const [id, setId] = useState<string | null>(null);
  const { addNotification } = useNotifications();
  const [campaigns, setCampaigns] = useState<GoalCampaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<GoalCampaign | null>(null);
  const [participants, setParticipants] = useState<GoalParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<'list' | 'details' | 'form' | 'success'>('list');
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    city: '',
    cpf: '',
    phone: '',
    contribution_value: '0,00' as string | number,
    message: ''
  });
  const [isUpdating, setIsUpdating] = useState(false);
  const [identifiedParticipant, setIdentifiedParticipant] = useState<GoalParticipant | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showRanking, setShowRanking] = useState(false);
  const [cpfToIdentify, setCpfToIdentify] = useState('');
  const [identifying, setIdentifying] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const metasParam = params.get('metas');
    const metasEBrindesParam = params.get('metas-e-brindes');
    const path = window.location.pathname;
    
    if (metasParam) {
      setId(metasParam);
      setStep('details');
    } else if (path.startsWith('/metas/')) {
      const campaignId = path.split('/metas/')[1];
      if (campaignId) {
        setId(campaignId);
        setStep('details');
      }
    } else if (metasEBrindesParam === 'true' || path === '/metas-e-brindes') {
      setStep('list');
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [id]);

  async function fetchData() {
    setLoading(true);
    try {
      const params = new URLSearchParams(window.location.search);
      let userId = params.get('u') || params.get('user');
      const storeSlug = params.get('s') || params.get('store');

      if (storeSlug && !userId) {
        const { data: store } = await supabase
          .from('store_settings')
          .select('user_id')
          .eq('store_slug', storeSlug)
          .single();
        if (store) userId = store.user_id;
      }

      if (id) {
        // Fetch specific campaign
        const { data: campaignData, error: campaignError } = await supabase
          .from('goal_campaigns')
          .select('*')
          .eq('id', id)
          .single();
        
        if (campaignError) throw campaignError;
        setSelectedCampaign(campaignData);

        // Fetch Store Settings
        const { data: storeData } = await supabase
          .from('store_settings')
          .select('*')
          .eq('user_id', campaignData.user_id)
          .single();
        
        if (storeData) {
          setStoreSettings(storeData);
        }

        // Fetch participants
        const { data: participantsData, error: participantsError } = await supabase
          .from('goal_participants')
          .select('*')
          .eq('campaign_id', id)
          .order('created_at', { ascending: false });
        
        if (participantsError) throw participantsError;
        setParticipants(participantsData || []);
        setStep('details');
      } else {
        // Fetch all active campaigns
        let query = supabase
          .from('goal_campaigns')
          .select('*')
          .eq('status', 'active');
        
        if (userId) {
          query = query.eq('user_id', userId);
        }

        const { data, error } = await query.order('created_at', { ascending: false });
        
        if (error) throw error;
        setCampaigns(data || []);

        // Also fetch store settings for the first campaign if available to get the theme
        if (data && data.length > 0) {
          const { data: storeData } = await supabase
            .from('store_settings')
            .select('*')
            .eq('user_id', data[0].user_id)
            .single();
          if (storeData) setStoreSettings(storeData);
        }

        setStep('list');
      }
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  }

  const handleJoinCampaign = (campaign: GoalCampaign) => {
    setSelectedCampaign(campaign);
    setFormData({
      name: '',
      city: '',
      cpf: '',
      phone: '',
      contribution_value: '0,00',
      message: ''
    });
    setIsUpdating(false);
    setIdentifiedParticipant(null);
    // Fetch participants for this campaign if not already fetched
    fetchParticipants(campaign.id);
    setStep('details');
  };

  const handleIdentify = async () => {
    if (!selectedCampaign || !cpfToIdentify) return;
    setIdentifying(true);
    try {
      const { data, error } = await supabase
        .from('goal_participants')
        .select('*')
        .eq('campaign_id', selectedCampaign.id)
        .eq('cpf', cpfToIdentify)
        .maybeSingle();
      
      if (data) {
        setIdentifiedParticipant(data);
        setFormData({
          name: data.name,
          city: data.city,
          cpf: data.cpf || '',
          phone: data.phone || '',
          contribution_value: data.contribution_value ? data.contribution_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '0,00',
          message: data.message || ''
        });
        setIsUpdating(true);
        setStep('form');
      } else {
        addNotification({
          type: 'warning',
          title: 'Não encontrado',
          message: 'Participante não encontrado com este CPF nesta campanha.'
        });
      }
    } catch (err) {
      console.error('Error identifying participant:', err);
      addNotification({
        type: 'error',
        title: 'Erro',
        message: formatError(err)
      });
    } finally {
      setIdentifying(false);
    }
  };

  async function fetchParticipants(campaignId: string) {
    try {
      const { data, error } = await supabase
        .from('goal_participants')
        .select('*')
        .eq('campaign_id', campaignId)
        .order('contribution_value', { ascending: false });
      if (error) throw error;
      setParticipants(data || []);
    } catch (err) {
      console.error('Error fetching participants:', err);
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCampaign) return;
    
    setSubmitting(true);
    try {
      if (isUpdating && identifiedParticipant) {
        const { error } = await supabase
          .from('goal_participants')
          .update({
            name: formData.name,
            city: formData.city,
            phone: formData.phone,
            contribution_value: typeof formData.contribution_value === 'string' ? parseMoney(formData.contribution_value) : formData.contribution_value,
            message: formData.message
          })
          .eq('id', identifiedParticipant.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('goal_participants')
          .insert([{
            campaign_id: selectedCampaign.id,
            name: formData.name,
            city: formData.city,
            cpf: formData.cpf,
            phone: formData.phone,
            contribution_value: typeof formData.contribution_value === 'string' ? parseMoney(formData.contribution_value) : formData.contribution_value,
            message: formData.message
          }]);

        if (error) throw error;
      }

      // Recalculate current_value in campaign (sum of contributions or count)
      const { data: allParticipants } = await supabase
        .from('goal_participants')
        .select('contribution_value')
        .eq('campaign_id', selectedCampaign.id);
      
      let newValue = 0;
      if (selectedCampaign.type === 'value') {
        newValue = allParticipants?.reduce((acc, p) => acc + (p.contribution_value || 0), 0) || 0;
      } else {
        newValue = allParticipants?.length || 0;
      }

      const { error: updateError } = await supabase
        .from('goal_campaigns')
        .update({ current_value: newValue })
        .eq('id', selectedCampaign.id);
      
      if (updateError) throw updateError;

      setStep('success');
    } catch (err) {
      console.error('Error joining campaign:', err);
      addNotification({
        type: 'error',
        title: 'Erro ao participar',
        message: formatError(err)
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !selectedCampaign && campaigns.length === 0) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 pb-24">
      {/* Store Header */}
      {storeSettings && (
        <header className="bg-white border-b border-zinc-100 px-6 py-4 sticky top-0 z-30 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {storeSettings.logo_url ? (
              <img src={storeSettings.logo_url} alt="Logo" className="h-8 w-auto object-contain" referrerPolicy="no-referrer" />
            ) : (
              <span className="font-serif italic font-bold text-zinc-900">{storeSettings.store_name}</span>
            )}
          </div>
          {storeSettings.store_slug && (
            <button 
              onClick={() => window.location.href = `/?s=${storeSettings.store_slug}`}
              className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest hover:text-zinc-600 flex items-center gap-1"
            >
              <ChevronLeft className="w-3 h-3" />
              Voltar para a Loja
            </button>
          )}
        </header>
      )}

      <div className="max-w-3xl mx-auto space-y-8 py-12 px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="bg-white rounded-[40px] p-8 sm:p-12 shadow-sm text-center space-y-6">
          <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto" style={storeSettings?.primary_color ? { backgroundColor: `${storeSettings.primary_color}1a` } : {}}>
            <Target className="w-8 h-8 text-emerald-500" style={storeSettings?.primary_color ? { color: storeSettings.primary_color } : {}} />
          </div>
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-zinc-800 tracking-tight mb-4">
              {step === 'list' ? 'Metas e Brindes' : selectedCampaign?.title}
            </h1>
            <p className="text-zinc-500 max-w-xl mx-auto">
              {step === 'list' 
                ? 'Escolha uma campanha, participe e ganhe brindes incríveis!' 
                : selectedCampaign?.description || 'Participe desta meta e ajude a todos a ganharem o brinde!'}
            </p>
          </div>
        </div>

        {/* List View */}
        {step === 'list' && (
          <div className="grid grid-cols-1 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {campaigns.length === 0 ? (
              <div className="bg-white rounded-[32px] p-12 text-center text-zinc-400 italic shadow-sm">
                Nenhuma campanha ativa no momento.
              </div>
            ) : (
              campaigns.map(campaign => (
                <div 
                  key={campaign.id} 
                  onClick={() => handleJoinCampaign(campaign)}
                  className="bg-white border border-zinc-100 rounded-[32px] p-8 shadow-sm hover:shadow-md transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center group-hover:scale-110 transition-transform" style={storeSettings?.primary_color ? { backgroundColor: `${storeSettings.primary_color}1a` } : {}}>
                        <Target className="w-6 h-6 text-emerald-500" style={storeSettings?.primary_color ? { color: storeSettings.primary_color } : {}} />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-zinc-800">{campaign.title}</h3>
                        <p className="text-xs text-zinc-400 font-bold uppercase tracking-widest flex items-center gap-1.5">
                          <Gift className="w-3 h-3" />
                          Brinde: {campaign.reward_description}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-6 h-6 text-zinc-300 group-hover:text-emerald-500 transition-colors" style={storeSettings?.primary_color ? { '--tw-text-opacity': '1', color: storeSettings.primary_color } as any : {}} />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-bold uppercase tracking-widest">
                      <span className="text-zinc-400">Progresso</span>
                      <span className="text-emerald-600" style={storeSettings?.primary_color ? { color: storeSettings.primary_color } : {}}>
                        {Math.min(100, (campaign.current_value / campaign.goal_value) * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-emerald-500 transition-all duration-500"
                        style={{ 
                          width: `${Math.min(100, (campaign.current_value / campaign.goal_value) * 100)}%`,
                          backgroundColor: storeSettings?.primary_color || undefined
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Details View */}
        {step === 'details' && selectedCampaign && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Campaign Stats */}
            <div className="bg-white rounded-[40px] p-8 shadow-sm">
              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="bg-zinc-50 px-6 py-4 rounded-2xl text-center">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">
                    {selectedCampaign.type === 'value' ? 'Total Arrecadado' : 'Participantes'}
                  </p>
                  <p className="text-2xl font-bold text-zinc-800">
                    {selectedCampaign.type === 'value' 
                      ? selectedCampaign.current_value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                      : selectedCampaign.current_value}
                  </p>
                </div>
                <div className="bg-zinc-50 px-6 py-4 rounded-2xl text-center">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Meta</p>
                  <p className="text-2xl font-bold text-emerald-600" style={storeSettings?.primary_color ? { color: storeSettings.primary_color } : {}}>
                    {selectedCampaign.type === 'value'
                      ? selectedCampaign.goal_value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                      : selectedCampaign.goal_value}
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between text-xs font-bold uppercase tracking-widest">
                  <span className="text-zinc-400">Progresso da Meta</span>
                  <span className="text-emerald-600" style={storeSettings?.primary_color ? { color: storeSettings.primary_color } : {}}>
                    {Math.min(100, (selectedCampaign.current_value / selectedCampaign.goal_value) * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="h-4 bg-zinc-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 transition-all duration-500"
                    style={{ 
                      width: `${Math.min(100, (selectedCampaign.current_value / selectedCampaign.goal_value) * 100)}%`,
                      backgroundColor: storeSettings?.primary_color || undefined
                    }}
                  />
                </div>

                {selectedCampaign.end_date && (
                  <div className="flex items-center justify-between text-xs pt-4 border-t border-zinc-100 mt-4">
                    <span className="text-zinc-400 uppercase font-bold tracking-widest flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Prazo Restante
                    </span>
                    <span className={cn(
                      "font-bold",
                      differenceInDays(new Date(selectedCampaign.end_date), new Date()) < 3 ? "text-red-500" : "text-zinc-600"
                    )}>
                      {differenceInDays(new Date(selectedCampaign.end_date), new Date()) > 0 
                        ? `${differenceInDays(new Date(selectedCampaign.end_date), new Date())} dias`
                        : "Encerrada"}
                    </span>
                  </div>
                )}
              </div>

              <div className="mt-8 pt-8 border-t border-zinc-100 space-y-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  <button 
                    onClick={() => setStep('form')}
                    className="flex-1 bg-[#00a86b] hover:bg-[#008f5b] text-white px-8 py-4 rounded-2xl font-bold transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
                    style={storeSettings?.primary_color ? { backgroundColor: storeSettings.primary_color, boxShadow: `0 10px 15px -3px ${storeSettings.primary_color}33` } : {}}
                  >
                    <User className="w-5 h-5" />
                    Participar Agora
                  </button>
                  <button 
                    onClick={() => setShowRanking(!showRanking)}
                    className="flex-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 px-8 py-4 rounded-2xl font-bold transition-all flex items-center justify-center gap-2"
                  >
                    <BarChart3 className="w-5 h-5" />
                    {showRanking ? 'Ver Recados' : 'Ver Ranking'}
                  </button>
                </div>

                <div className="bg-zinc-50 p-6 rounded-3xl space-y-4">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-center">Já participa? Atualize seu progresso</p>
                  <div className="flex gap-2">
                    <input 
                      type="text"
                      placeholder="Seu CPF"
                      value={cpfToIdentify}
                      onChange={e => setCpfToIdentify(e.target.value)}
                      className="flex-1 bg-white border border-zinc-200 rounded-xl px-4 py-2 text-sm focus:border-emerald-500 outline-none transition-all"
                    />
                    <button 
                      onClick={handleIdentify}
                      disabled={identifying}
                      className="bg-zinc-800 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-zinc-900 transition-all disabled:opacity-50"
                    >
                      {identifying ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Entrar'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Messages / Participants or Ranking */}
            <div className="bg-white rounded-[40px] p-8 shadow-sm">
              <h3 className="text-xl font-bold text-zinc-800 mb-6 flex items-center gap-2">
                {showRanking ? (
                  <>
                    <BarChart3 className="w-5 h-5 text-emerald-500" style={storeSettings?.primary_color ? { color: storeSettings.primary_color } : {}} />
                    Ranking de Competição
                  </>
                ) : (
                  <>
                    <MessageSquare className="w-5 h-5 text-emerald-500" style={storeSettings?.primary_color ? { color: storeSettings.primary_color } : {}} />
                    Recados dos Participantes
                  </>
                )}
              </h3>
              
              <div className="space-y-6">
                {participants.length === 0 ? (
                  <p className="text-center text-zinc-400 italic py-8">Ainda não há participantes.</p>
                ) : showRanking ? (
                  <div className="space-y-4">
                    {participants
                      .sort((a, b) => (b.contribution_value || 0) - (a.contribution_value || 0))
                      .map((p, idx) => (
                      <div key={p.id} className="flex items-center justify-between p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                        <div className="flex items-center gap-4">
                          <span className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm",
                            idx === 0 ? "bg-yellow-100 text-yellow-700" : 
                            idx === 1 ? "bg-zinc-200 text-zinc-700" :
                            idx === 2 ? "bg-orange-100 text-orange-700" :
                            "bg-white text-zinc-400"
                          )}>
                            {idx + 1}
                          </span>
                          <div>
                            <p className="text-sm font-bold text-zinc-800">{p.name}</p>
                            <p className="text-[10px] text-zinc-400 uppercase tracking-widest">{p.city}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-emerald-600" style={storeSettings?.primary_color ? { color: storeSettings.primary_color } : {}}>
                            {p.contribution_value?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </p>
                          <div className="w-24 h-1.5 bg-zinc-200 rounded-full mt-1 overflow-hidden">
                            <div 
                              className="h-full bg-emerald-500" 
                              style={{ 
                                width: `${Math.min(100, (p.contribution_value || 0) / selectedCampaign.goal_value * 100)}%`,
                                backgroundColor: storeSettings?.primary_color || undefined
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  participants.map(p => (
                    <div key={p.id} className="bg-zinc-50 rounded-3xl p-6 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center" style={storeSettings?.primary_color ? { backgroundColor: `${storeSettings.primary_color}1a` } : {}}>
                            <User className="w-4 h-4 text-emerald-600" style={storeSettings?.primary_color ? { color: storeSettings.primary_color } : {}} />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-zinc-800">{p.name}</p>
                            <p className="text-[10px] text-zinc-400 flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {p.city}
                            </p>
                          </div>
                        </div>
                        <span className="text-[10px] text-zinc-300 font-bold uppercase tracking-widest">
                          {format(new Date(p.created_at), "dd/MM/yy")}
                        </span>
                      </div>
                      {p.message && (
                        <p className="text-sm text-zinc-600 italic leading-relaxed">
                          "{p.message}"
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Form View */}
        {step === 'form' && selectedCampaign && (
          <div className="bg-white rounded-[40px] p-8 sm:p-12 shadow-sm max-w-xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-zinc-800">
                {isUpdating ? 'Atualizar meu Progresso' : 'Participar da Meta'}
              </h2>
              <p className="text-sm text-zinc-500 mt-2">
                {isUpdating 
                  ? 'Atualize seu valor atingido e deixe um novo recado.' 
                  : 'Preencha seus dados para entrar na competição!'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Seu Nome</label>
                  <input 
                    required
                    type="text" 
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-4 text-sm focus:border-emerald-500 outline-none transition-all"
                    style={{ '--tw-ring-color': storeSettings?.primary_color } as any}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Sua Cidade</label>
                  <input 
                    required
                    type="text" 
                    value={formData.city}
                    onChange={e => setFormData({...formData, city: e.target.value})}
                    className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-4 text-sm focus:border-emerald-500 outline-none transition-all"
                    style={{ '--tw-ring-color': storeSettings?.primary_color } as any}
                  />
                </div>
              </div>

              {!isUpdating && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Seu CPF</label>
                    <input 
                      required
                      type="text" 
                      value={formData.cpf}
                      onChange={e => setFormData({...formData, cpf: e.target.value})}
                      className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-4 text-sm focus:border-emerald-500 outline-none transition-all"
                      style={{ '--tw-ring-color': storeSettings?.primary_color } as any}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Seu Telefone</label>
                    <input 
                      required
                      type="text" 
                      value={formData.phone}
                      onChange={e => setFormData({...formData, phone: e.target.value})}
                      className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-4 text-sm focus:border-emerald-500 outline-none transition-all"
                      style={{ '--tw-ring-color': storeSettings?.primary_color } as any}
                    />
                  </div>
                </div>
              )}

              {selectedCampaign.type === 'value' && (
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Seu Valor Atingido (R$)</label>
                  <input 
                    required
                    type="text" 
                    inputMode="numeric"
                    value={formData.contribution_value}
                    onChange={e => setFormData({...formData, contribution_value: formatMoneyInput(e.target.value)})}
                    className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-4 text-sm focus:border-emerald-500 outline-none transition-all"
                    style={{ '--tw-ring-color': storeSettings?.primary_color } as any}
                  />
                </div>
              )}

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Recado (Opcional)</label>
                <textarea 
                  value={formData.message}
                  onChange={e => setFormData({...formData, message: e.target.value})}
                  placeholder="Deixe uma mensagem de incentivo..."
                  className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-4 text-sm focus:border-emerald-500 outline-none transition-all min-h-[100px]"
                  style={{ '--tw-ring-color': storeSettings?.primary_color } as any}
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  type="button"
                  onClick={() => setStep('details')}
                  className="flex-1 px-6 py-4 text-sm font-bold text-zinc-500 bg-zinc-50 hover:bg-zinc-100 rounded-2xl transition-all"
                >
                  Voltar
                </button>
                <button 
                  type="submit"
                  disabled={submitting}
                  className="flex-1 bg-[#00a86b] hover:bg-[#008f5b] text-white px-6 py-4 rounded-2xl font-bold transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
                  style={storeSettings?.primary_color ? { backgroundColor: storeSettings.primary_color, boxShadow: `0 10px 15px -3px ${storeSettings.primary_color}33` } : {}}
                >
                  {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                  {isUpdating ? 'Atualizar' : 'Participar'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Success View */}
        {step === 'success' && (
          <div className="bg-white rounded-[40px] p-8 sm:p-12 shadow-sm max-w-xl mx-auto text-center animate-in zoom-in-95 duration-500">
            <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6" style={storeSettings?.primary_color ? { backgroundColor: `${storeSettings.primary_color}1a` } : {}}>
              <CheckCircle2 className="w-10 h-10 text-emerald-500" style={storeSettings?.primary_color ? { color: storeSettings.primary_color } : {}} />
            </div>
            <h2 className="text-3xl font-bold text-zinc-800 mb-4">Participação Confirmada!</h2>
            <p className="text-zinc-600 mb-8">
              Obrigado por participar! Seu recado já está visível para todos. 
              Ajude-nos a bater a meta compartilhando esta campanha!
            </p>
            <div className="flex flex-col gap-3">
              <button 
                onClick={() => {
                  fetchData();
                  setStep('details');
                }}
                className="bg-[#00a86b] hover:bg-[#008f5b] text-white px-8 py-4 rounded-2xl font-bold transition-all"
                style={storeSettings?.primary_color ? { backgroundColor: storeSettings.primary_color } : {}}
              >
                Voltar para a Campanha
              </button>
              <button 
                onClick={() => {
                  const url = window.location.href;
                  navigator.clipboard.writeText(url);
                  addNotification({
                    type: 'success',
                    title: 'Link copiado',
                    message: 'Link copiado para a área de transferência!'
                  });
                }}
                className="flex items-center justify-center gap-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 px-8 py-4 rounded-2xl font-bold transition-all"
              >
                <Share2 className="w-5 h-5" />
                Compartilhar Link
              </button>
            </div>
          </div>
        )}

      </div>

      {/* Disclaimer */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 border-t border-zinc-100 mt-12">
        <p className="text-[10px] text-zinc-400 text-center uppercase tracking-widest leading-relaxed max-w-2xl mx-auto">
          A plataforma da Consigna Beauty não se responsabiliza pela criação, distribuição ou eventuais ressarcimentos de produtos, brindes ou serviços disponibilizados através dos seus usuários.
        </p>
      </div>
    </div>
  );
}
