import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Raffle, RaffleTicket, StoreSettings } from '../types';
import { Loader2, Ticket, Trophy, Info, Upload, CheckCircle2, ChevronLeft } from 'lucide-react';
import { cn, formatError } from '../lib/utils';
import { useNotifications } from './NotificationCenter';

export function PublicRaffle() {
  const [id, setId] = useState<string | null>(null);
  const { addNotification } = useNotifications();
  const [raffle, setRaffle] = useState<Raffle | null>(null);
  const [tickets, setTickets] = useState<RaffleTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
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
    const rifaParam = params.get('rifa');
    const path = window.location.pathname;
    
    if (rifaParam) {
      setId(rifaParam);
    } else if (path.startsWith('/rifa/')) {
      const raffleId = path.split('/rifa/')[1];
      if (raffleId) {
        setId(raffleId);
      }
    }
  }, []);

  useEffect(() => {
    if (id) {
      fetchRaffle();
    }
  }, [id]);

  async function fetchRaffle() {
    setLoading(true);
    try {
      const { data: raffleData, error: raffleError } = await supabase
        .from('raffles')
        .select('*')
        .eq('id', id)
        .single();
      
      if (raffleError) throw raffleError;
      setRaffle(raffleData);

      // Fetch Store Settings
      const { data: storeData } = await supabase
        .from('store_settings')
        .select('*')
        .eq('user_id', raffleData.user_id)
        .single();
      
      if (storeData) {
        setStoreSettings(storeData);
      }

      const { data: ticketsData, error: ticketsError } = await supabase
        .from('raffle_tickets')
        .select('*')
        .eq('raffle_id', id);
      
      if (ticketsError) throw ticketsError;
      setTickets(ticketsData || []);
    } catch (err) {
      console.error('Error fetching raffle:', err);
    } finally {
      setLoading(false);
    }
  }

  const handleSelectNumber = (num: number) => {
    const isTaken = tickets.some(t => t.number === num);
    if (!isTaken) {
      setSelectedNumber(num);
      setStep('form');
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
    if (!selectedNumber || !receiptUrl) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('raffle_tickets')
        .insert([{
          raffle_id: id,
          number: selectedNumber,
          buyer_name: formData.name,
          buyer_cpf: formData.cpf,
          buyer_phone: formData.phone,
          receipt_url: receiptUrl,
          status: 'reserved'
        }]);

      if (error) throw error;
      setStep('success');
    } catch (err) {
      console.error('Error confirming purchase:', err);
      addNotification({
        type: 'error',
        title: 'Erro na reserva',
        message: 'Erro ao confirmar compra. O número pode já ter sido reservado.'
      });
      fetchRaffle(); // Refresh to see if it was taken
      setStep('select');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !raffle) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  if (!raffle) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl shadow-sm text-center max-w-md w-full">
          <Ticket className="w-12 h-12 text-zinc-300 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-zinc-800 mb-2">Rifa não encontrada</h2>
          <p className="text-zinc-500 text-sm">Esta rifa pode ter sido encerrada ou o link é inválido.</p>
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
            <Ticket className="w-8 h-8 text-emerald-500" style={storeSettings?.primary_color ? { color: storeSettings.primary_color } : {}} />
          </div>
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-zinc-800 tracking-tight mb-4">{raffle.title}</h1>
            {raffle.description && (
              <p className="text-zinc-500 max-w-xl mx-auto">{raffle.description}</p>
            )}
          </div>
          
          <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
            <div className="bg-zinc-50 px-6 py-3 rounded-2xl">
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Valor do Número</p>
              <p className="text-xl font-bold text-emerald-600" style={storeSettings?.primary_color ? { color: storeSettings.primary_color } : {}}>R$ {raffle.ticket_price.toFixed(2)}</p>
            </div>
            <div className="bg-zinc-50 px-6 py-3 rounded-2xl">
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Prêmios</p>
              <p className="text-xl font-bold text-zinc-800">{raffle.prizes.length}</p>
            </div>
          </div>
        </div>

        {/* Main Content */}
        {step === 'select' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white rounded-[40px] p-8 shadow-sm">
              <h2 className="text-xl font-bold text-zinc-800 mb-6 flex items-center gap-2">
                <Ticket className="w-5 h-5 text-emerald-500" style={storeSettings?.primary_color ? { color: storeSettings.primary_color } : {}} />
                Escolha seu Número
              </h2>
              <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2 sm:gap-3">
                {Array.from({ length: raffle.total_tickets }).map((_, i) => {
                  const num = i + 1;
                  const isTaken = tickets.some(t => t.number === num);
                  return (
                    <button
                      key={num}
                      disabled={isTaken}
                      onClick={() => handleSelectNumber(num)}
                      className={cn(
                        "aspect-square rounded-xl font-bold text-sm sm:text-base flex items-center justify-center transition-all",
                        isTaken 
                          ? "bg-zinc-100 text-zinc-400 cursor-not-allowed" 
                          : "bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white shadow-sm hover:shadow-md hover:-translate-y-0.5"
                      )}
                      style={!isTaken && storeSettings?.primary_color ? { 
                        backgroundColor: `${storeSettings.primary_color}1a`,
                        color: storeSettings.primary_color
                      } : {}}
                      onMouseEnter={(e) => {
                        if (!isTaken && storeSettings?.primary_color) {
                          e.currentTarget.style.backgroundColor = storeSettings.primary_color;
                          e.currentTarget.style.color = 'white';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isTaken && storeSettings?.primary_color) {
                          e.currentTarget.style.backgroundColor = `${storeSettings.primary_color}1a`;
                          e.currentTarget.style.color = storeSettings.primary_color;
                        }
                      }}
                    >
                      {String(num).padStart(3, '0')}
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
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="bg-white rounded-[32px] p-8 shadow-sm">
                <h3 className="text-lg font-bold text-zinc-800 mb-4 flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-amber-500" />
                  Prêmios
                </h3>
                <ul className="space-y-3">
                  {raffle.prizes.map((prize, idx) => (
                    <li key={idx} className="flex items-start gap-3 text-sm text-zinc-600">
                      <span className="font-bold text-amber-500">{idx + 1}º</span>
                      {prize}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-white rounded-[32px] p-8 shadow-sm">
                <h3 className="text-lg font-bold text-zinc-800 mb-4 flex items-center gap-2">
                  <Info className="w-5 h-5 text-blue-500" />
                  Regras
                </h3>
                <div className="text-sm text-zinc-600 whitespace-pre-wrap leading-relaxed">
                  {raffle.rules}
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 'form' && (
          <div className="bg-white rounded-[40px] p-8 sm:p-12 shadow-sm max-w-xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 font-bold text-2xl mb-4" style={storeSettings?.primary_color ? { backgroundColor: `${storeSettings.primary_color}1a`, color: storeSettings.primary_color } : {}}>
                {String(selectedNumber).padStart(3, '0')}
              </div>
              <h2 className="text-2xl font-bold text-zinc-800">Seus Dados</h2>
              <p className="text-sm text-zinc-500 mt-2">Preencha para reservar o número escolhido.</p>
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
              <p className="text-4xl font-bold text-emerald-600" style={storeSettings?.primary_color ? { color: storeSettings.primary_color } : {}}>R$ {raffle.ticket_price.toFixed(2)}</p>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Dados para Pagamento</label>
                <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-6 text-sm text-zinc-700 whitespace-pre-wrap font-mono">
                  {raffle.payment_info}
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

        {step === 'success' && (
          <div className="bg-white rounded-[40px] p-8 sm:p-12 shadow-sm max-w-xl mx-auto text-center animate-in zoom-in-95 duration-500">
            <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6" style={storeSettings?.primary_color ? { backgroundColor: `${storeSettings.primary_color}1a` } : {}}>
              <CheckCircle2 className="w-10 h-10 text-emerald-500" style={storeSettings?.primary_color ? { color: storeSettings.primary_color } : {}} />
            </div>
            <h2 className="text-3xl font-bold text-zinc-800 mb-4">Sucesso!</h2>
            <p className="text-zinc-600 mb-8">
              Seu comprovante foi enviado e o número <strong className="text-emerald-600" style={storeSettings?.primary_color ? { color: storeSettings.primary_color } : {}}>{String(selectedNumber).padStart(3, '0')}</strong> está reservado. 
              Aguarde a aprovação do administrador.
            </p>
            <button 
              onClick={() => {
                setStep('select');
                setSelectedNumber(null);
                setReceiptUrl('');
                fetchRaffle();
              }}
              className="bg-zinc-100 hover:bg-zinc-200 text-zinc-800 px-8 py-4 rounded-2xl font-bold transition-all"
            >
              Voltar para a Rifa
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
