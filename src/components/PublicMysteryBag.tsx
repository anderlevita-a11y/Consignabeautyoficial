import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { MysteryBagCampaign, MysteryBag, StoreSettings } from '../types';
import { Loader2, ShoppingBag, Trophy, Info, Upload, CheckCircle2, Gift, ChevronLeft } from 'lucide-react';
import { cn, validateCPF, validatePhone, formatError } from '../lib/utils';
import { useNotifications } from './NotificationCenter';

export function PublicMysteryBag() {
  const { addNotification } = useNotifications();
  const [id, setId] = useState<string | null>(null);
  const [campaign, setCampaign] = useState<MysteryBagCampaign | null>(null);
  const [bags, setBags] = useState<MysteryBag[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBag, setSelectedBag] = useState<MysteryBag | null>(null);
  const [step, setStep] = useState<'select' | 'form' | 'payment' | 'success'>('select');
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    cpf: '',
    phone: ''
  });
  const [uploading, setUploading] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sacolaParam = params.get('sacola');
    const path = window.location.pathname;
    
    if (sacolaParam) {
      setId(sacolaParam);
    } else if (path.startsWith('/sacola/')) {
      const campaignId = path.split('/sacola/')[1];
      if (campaignId) {
        setId(campaignId);
      }
    }
  }, []);

  useEffect(() => {
    if (id) {
      fetchCampaign();
    }
  }, [id]);

  async function fetchCampaign() {
    setLoading(true);
    try {
      const { data: campaignData, error: campaignError } = await supabase
        .from('mystery_bag_campaigns')
        .select('*')
        .eq('id', id)
        .single();
      
      if (campaignError) throw campaignError;
      setCampaign(campaignData);

      // Fetch Store Settings
      const { data: storeData } = await supabase
        .from('store_settings')
        .select('*')
        .eq('user_id', campaignData.user_id)
        .single();
      
      if (storeData) {
        setStoreSettings(storeData);
      }

      const { data: bagsData, error: bagsError } = await supabase
        .from('mystery_bags')
        .select('*')
        .eq('campaign_id', id)
        .order('display_number', { ascending: true });
      
      if (bagsError) throw bagsError;
      setBags(bagsData || []);
    } catch (err) {
      console.error('Error fetching campaign:', err);
    } finally {
      setLoading(false);
    }
  }

  const handleSelectBag = (bag: MysteryBag) => {
    if (bag.status === 'available') {
      setSelectedBag(bag);
      setStep('form');
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.name.trim().split(' ').length < 2) {
      addNotification({
        type: 'warning',
        title: 'Nome incompleto',
        message: 'Por favor, insira seu nome completo.'
      });
      return;
    }

    if (!validateCPF(formData.cpf)) {
      addNotification({
        type: 'warning',
        title: 'CPF inválido',
        message: 'CPF inválido. Por favor, verifique o número digitado.'
      });
      return;
    }

    if (!validatePhone(formData.phone)) {
      addNotification({
        type: 'warning',
        title: 'Telefone inválido',
        message: 'Telefone inválido. Por favor, insira um número válido com DDD.'
      });
      return;
    }

    setStep('payment');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${id}/${fileName}`;
      const bucket = 'payment_proofs';

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        // Fallback to 'products' bucket
        const { error: fallbackError } = await supabase.storage
          .from('products')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
          });
        
        if (fallbackError) throw uploadError;

        const { data } = supabase.storage
          .from('products')
          .getPublicUrl(filePath);

        setReceiptUrl(data.publicUrl);
      } else {
        const { data } = supabase.storage
          .from(bucket)
          .getPublicUrl(filePath);

        setReceiptUrl(data.publicUrl);
      }
    } catch (err) {
      console.error('Error uploading receipt:', err);
      addNotification({
        type: 'error',
        title: 'Erro no upload',
        message: 'Erro ao fazer upload do comprovante.'
      });
    } finally {
      setUploading(false);
    }
  };

  const handleConfirmPurchase = async () => {
    if (!selectedBag || !receiptUrl) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('mystery_bags')
        .update({
          buyer_name: formData.name,
          buyer_cpf: formData.cpf,
          buyer_phone: formData.phone,
          receipt_url: receiptUrl,
          status: 'reserved',
          reserved_at: new Date().toISOString()
        })
        .eq('id', selectedBag.id)
        .eq('status', 'available'); // Ensure it's still available

      if (error) throw error;
      setStep('success');
    } catch (err) {
      console.error('Error confirming purchase:', err);
      addNotification({
        type: 'error',
        title: 'Erro na confirmação',
        message: 'Erro ao confirmar compra. A sacola pode já ter sido reservada.'
      });
      fetchCampaign(); // Refresh to see if it was taken
      setStep('select');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !campaign) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl shadow-sm text-center max-w-md w-full">
          <ShoppingBag className="w-12 h-12 text-zinc-300 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-zinc-800 mb-2">Campanha não encontrada</h2>
          <p className="text-zinc-500 text-sm">Esta campanha pode ter sido encerrada ou o link é inválido.</p>
        </div>
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
            <Gift className="w-8 h-8 text-emerald-500" style={storeSettings?.primary_color ? { color: storeSettings.primary_color } : {}} />
          </div>
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-zinc-800 tracking-tight mb-4">{campaign.title}</h1>
            {campaign.description && (
              <p className="text-zinc-500 max-w-xl mx-auto">{campaign.description}</p>
            )}
          </div>
          
          <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
            <div className="bg-zinc-50 px-6 py-3 rounded-2xl">
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Valor da Sacola</p>
              <p className="text-xl font-bold text-emerald-600" style={storeSettings?.primary_color ? { color: storeSettings.primary_color } : {}}>R$ {campaign.bag_price.toFixed(2)}</p>
            </div>
            <div className="bg-zinc-50 px-6 py-3 rounded-2xl">
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Total de Sacolas</p>
              <p className="text-xl font-bold text-zinc-800">{bags.length}</p>
            </div>
          </div>
        </div>

        {/* Main Content */}
        {step === 'select' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white rounded-[40px] p-8 shadow-sm">
              <h2 className="text-xl font-bold text-zinc-800 mb-6 flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-emerald-500" style={storeSettings?.primary_color ? { color: storeSettings.primary_color } : {}} />
                Escolha sua Sacola Surpresa
              </h2>
              
              {campaign.status === 'finished' ? (
                <div className="space-y-4">
                  <div className="bg-amber-50 border border-amber-100 rounded-2xl p-6 text-center mb-6">
                    <Trophy className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                    <h3 className="font-bold text-amber-800">Campanha Finalizada!</h3>
                    <p className="text-sm text-amber-700">Os prêmios foram revelados.</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {bags.map(bag => (
                      <div key={bag.id} className="bg-zinc-50 border border-zinc-100 rounded-2xl p-4 flex items-center gap-4">
                        <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center font-bold text-zinc-400 shadow-sm">
                          #{String(bag.display_number).padStart(2, '0')}
                        </div>
                        <div className="flex-1">
                          <p className="text-xs text-zinc-500 uppercase tracking-widest font-bold mb-1">Prêmio</p>
                          <p className="font-bold text-emerald-600" style={storeSettings?.primary_color ? { color: storeSettings.primary_color } : {}}>{bag.prize_description}</p>
                          {bag.buyer_name && (
                            <p className="text-xs text-zinc-600 mt-1">Ganhador(a): <span className="font-bold">{bag.buyer_name}</span></p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3 sm:gap-4">
                    {bags.map(bag => {
                      const isAvailable = bag.status === 'available';
                      return (
                        <button
                          key={bag.id}
                          disabled={!isAvailable}
                          onClick={() => handleSelectBag(bag)}
                          className={cn(
                            "aspect-square rounded-2xl flex flex-col items-center justify-center transition-all gap-1",
                            !isAvailable 
                              ? "bg-zinc-100 text-zinc-400 cursor-not-allowed" 
                              : "bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white shadow-sm hover:shadow-md hover:-translate-y-1 group"
                          )}
                          style={isAvailable && storeSettings?.primary_color ? { 
                            backgroundColor: `${storeSettings.primary_color}1a`,
                            color: storeSettings.primary_color
                          } : {}}
                          onMouseEnter={(e) => {
                            if (isAvailable && storeSettings?.primary_color) {
                              e.currentTarget.style.backgroundColor = storeSettings.primary_color;
                              e.currentTarget.style.color = 'white';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (isAvailable && storeSettings?.primary_color) {
                              e.currentTarget.style.backgroundColor = `${storeSettings.primary_color}1a`;
                              e.currentTarget.style.color = storeSettings.primary_color;
                            }
                          }}
                        >
                          <ShoppingBag className={cn("w-6 h-6", !isAvailable ? "opacity-50" : "group-hover:scale-110 transition-transform")} />
                          <span className="font-bold text-sm">#{String(bag.display_number).padStart(2, '0')}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-center gap-6 mt-8 pt-8 border-t border-zinc-100">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded bg-emerald-50 border border-emerald-100" style={storeSettings?.primary_color ? { backgroundColor: `${storeSettings.primary_color}1a`, borderColor: `${storeSettings.primary_color}33` } : {}}></div>
                      <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Disponível</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded bg-zinc-100 border border-zinc-200"></div>
                      <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Indisponível</span>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="bg-white rounded-[32px] p-8 shadow-sm">
              <h3 className="text-lg font-bold text-zinc-800 mb-4 flex items-center gap-2">
                <Info className="w-5 h-5 text-blue-500" />
                Regras
              </h3>
              <div className="text-sm text-zinc-600 whitespace-pre-wrap leading-relaxed">
                {campaign.rules}
              </div>
            </div>
          </div>
        )}

        {step === 'form' && selectedBag && (
          <div className="bg-white rounded-[40px] p-8 sm:p-12 shadow-sm max-w-xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center mb-8">
              <div className="inline-flex flex-col items-center justify-center w-20 h-20 rounded-2xl bg-emerald-50 text-emerald-600 font-bold mb-4" style={storeSettings?.primary_color ? { backgroundColor: `${storeSettings.primary_color}1a`, color: storeSettings.primary_color } : {}}>
                <ShoppingBag className="w-6 h-6 mb-1" />
                <span>#{String(selectedBag.display_number).padStart(2, '0')}</span>
              </div>
              <h2 className="text-2xl font-bold text-zinc-800">Seus Dados</h2>
              <p className="text-sm text-zinc-500 mt-2">Preencha para reservar a sacola escolhida.</p>
            </div>

            <form onSubmit={handleFormSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Nome Completo</label>
                <input 
                  required
                  type="text" 
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-4 text-sm text-zinc-900 focus:border-emerald-500 outline-none transition-all"
                  style={{ '--tw-ring-color': storeSettings?.primary_color } as any}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">CPF</label>
                <input 
                  required
                  type="text" 
                  value={formData.cpf}
                  onChange={e => setFormData({...formData, cpf: e.target.value})}
                  className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-4 text-sm text-zinc-900 focus:border-emerald-500 outline-none transition-all"
                  style={{ '--tw-ring-color': storeSettings?.primary_color } as any}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">WhatsApp</label>
                <input 
                  required
                  type="text" 
                  value={formData.phone}
                  onChange={e => setFormData({...formData, phone: e.target.value})}
                  className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-4 text-sm text-zinc-900 focus:border-emerald-500 outline-none transition-all"
                  style={{ '--tw-ring-color': storeSettings?.primary_color } as any}
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  type="button"
                  onClick={() => setStep('select')}
                  className="flex-1 px-6 py-4 text-sm font-bold text-zinc-500 bg-zinc-50 hover:bg-zinc-100 rounded-2xl transition-all"
                >
                  Voltar
                </button>
                <button 
                  type="submit"
                  className="flex-1 bg-[#00a86b] hover:bg-[#008f5b] text-white px-6 py-4 rounded-2xl font-bold transition-all shadow-lg shadow-emerald-500/20"
                  style={storeSettings?.primary_color ? { backgroundColor: storeSettings.primary_color, boxShadow: `0 10px 15px -3px ${storeSettings.primary_color}33` } : {}}
                >
                  Continuar
                </button>
              </div>
            </form>
          </div>
        )}

        {step === 'payment' && (
          <div className="bg-white rounded-[40px] p-8 sm:p-12 shadow-sm max-w-xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-zinc-800">Pagamento</h2>
              <p className="text-sm text-zinc-500 mt-2">Realize o pagamento e envie o comprovante para confirmar.</p>
            </div>

            <div className="bg-zinc-50 rounded-3xl p-6 mb-8 text-center">
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Total a Pagar</p>
              <p className="text-4xl font-bold text-emerald-600" style={storeSettings?.primary_color ? { color: storeSettings.primary_color } : {}}>R$ {campaign.bag_price.toFixed(2)}</p>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Dados para Pagamento</label>
                <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-6 text-sm text-zinc-700 whitespace-pre-wrap font-mono">
                  {campaign.payment_info}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Enviar Comprovante</label>
                <div className="relative">
                  <input 
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf,image/*"
                    onChange={handleFileUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    disabled={uploading}
                  />
                  <div className={cn(
                    "w-full border-2 border-dashed rounded-2xl p-8 text-center transition-all",
                    receiptUrl 
                      ? "border-emerald-500 bg-emerald-50" 
                      : "border-zinc-200 bg-zinc-50 hover:bg-zinc-100"
                  )}
                  style={receiptUrl && storeSettings?.primary_color ? { borderColor: storeSettings.primary_color, backgroundColor: `${storeSettings.primary_color}0d` } : {}}
                  >
                    {uploading ? (
                      <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mx-auto" style={storeSettings?.primary_color ? { color: storeSettings.primary_color } : {}} />
                    ) : receiptUrl ? (
                      <div className="space-y-2">
                        <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" style={storeSettings?.primary_color ? { color: storeSettings.primary_color } : {}} />
                        <p className="text-sm font-bold text-emerald-700" style={storeSettings?.primary_color ? { color: storeSettings.primary_color } : {}}>Comprovante anexado!</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Upload className="w-8 h-8 text-zinc-400 mx-auto" />
                        <p className="text-sm font-bold text-zinc-600">Clique para anexar o comprovante</p>
                        <p className="text-xs text-zinc-400">Imagens ou PDF</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  type="button"
                  onClick={() => setStep('form')}
                  className="flex-1 px-6 py-4 text-sm font-bold text-zinc-500 bg-zinc-50 hover:bg-zinc-100 rounded-2xl transition-all"
                >
                  Voltar
                </button>
                <button 
                  onClick={handleConfirmPurchase}
                  disabled={!receiptUrl || loading}
                  className="flex-1 bg-[#00a86b] hover:bg-[#008f5b] text-white px-6 py-4 rounded-2xl font-bold transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
                  style={storeSettings?.primary_color ? { backgroundColor: storeSettings.primary_color, boxShadow: `0 10px 15px -3px ${storeSettings.primary_color}33` } : {}}
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirmar Compra'}
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 'success' && selectedBag && (
          <div className="bg-white rounded-[40px] p-8 sm:p-12 shadow-sm max-w-xl mx-auto text-center animate-in zoom-in-95 duration-500">
            <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6" style={storeSettings?.primary_color ? { backgroundColor: `${storeSettings.primary_color}1a` } : {}}>
              <CheckCircle2 className="w-10 h-10 text-emerald-500" style={storeSettings?.primary_color ? { color: storeSettings.primary_color } : {}} />
            </div>
            <h2 className="text-3xl font-bold text-zinc-800 mb-4">Sucesso!</h2>
            <p className="text-zinc-600 mb-8">
              Seu comprovante foi enviado e a sacola <strong className="text-emerald-600" style={storeSettings?.primary_color ? { color: storeSettings.primary_color } : {}}>#{String(selectedBag.display_number).padStart(2, '0')}</strong> está reservada. 
              Aguarde a aprovação do administrador e o final da campanha para descobrir seu prêmio!
            </p>
            <button 
              onClick={() => {
                setStep('select');
                setSelectedBag(null);
                setReceiptUrl('');
                fetchCampaign();
              }}
              className="bg-zinc-100 hover:bg-zinc-200 text-zinc-800 px-8 py-4 rounded-2xl font-bold transition-all"
            >
              Voltar para a Campanha
            </button>
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
