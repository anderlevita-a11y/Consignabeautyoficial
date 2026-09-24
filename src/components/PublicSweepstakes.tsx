import React, { useEffect, useState } from 'react';
import { 
  Trophy, 
  Users, 
  Ticket, 
  Search,
  Loader2,
  Calendar,
  Gift
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Sweepstakes, SweepstakesParticipant, StoreSettings } from '../types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function PublicSweepstakes() {
  const [sweep, setSweep] = useState<Sweepstakes | null>(null);
  const [participants, setParticipants] = useState<SweepstakesParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('sorteio');
    if (id) {
      fetchSweepstakes(id);
    }
  }, []);

  async function fetchSweepstakes(id: string) {
    setLoading(true);
    try {
      const { data: sweepData, error: sweepError } = await supabase
        .from('sweepstakes')
        .select('*')
        .eq('id', id)
        .single();
      
      if (sweepError) throw sweepError;
      setSweep(sweepData);

      // Fetch store settings for branding
      const { data: settingsData } = await supabase
        .from('store_settings')
        .select('*')
        .eq('user_id', sweepData.user_id)
        .single();
      
      if (settingsData) {
        setStoreSettings(settingsData);
      }

      const { data: participantsData, error: participantsError } = await supabase
        .from('sweepstakes_participants')
        .select('*')
        .eq('sweepstakes_id', id)
        .order('name', { ascending: true });
      
      if (participantsError) throw participantsError;
      setParticipants(participantsData || []);
    } catch (err) {
      console.error('Error fetching sweepstakes:', err);
    } finally {
      setLoading(false);
    }
  }

  const filteredParticipants = participants.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.contact.includes(searchTerm)
  );

  const winners = participants.filter(p => p.status === 'winner');

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  if (!sweep) {
    return (
      <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-4 text-center">
        <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-sm mb-6">
          <Trophy className="w-10 h-10 text-zinc-200" />
        </div>
        <h1 className="text-2xl font-bold text-zinc-800 mb-2">Sorteio não encontrado</h1>
        <p className="text-zinc-500 max-w-xs">O link que você acessou pode estar incorreto ou o sorteio foi removido.</p>
      </div>
    );
  }

  const primaryColor = storeSettings?.primary_color || '#00a86b';

  return (
    <div className="min-h-screen bg-zinc-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-zinc-100 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center" style={{ backgroundColor: `${primaryColor}1a` }}>
              <Trophy className="w-6 h-6 text-emerald-600" style={{ color: primaryColor }} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-zinc-800 leading-tight">{sweep.name}</h1>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {format(new Date(sweep.draw_date), "dd/MM/yyyy")}
                </span>
                <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest flex items-center gap-1" style={{ color: primaryColor }}>
                  <Gift className="w-3 h-3" />
                  R$ {sweep.voucher_value.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
          {storeSettings?.logo_url && (
            <img 
              src={storeSettings.logo_url} 
              alt={storeSettings.store_name} 
              className="h-10 w-auto object-contain"
              referrerPolicy="no-referrer"
            />
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 pt-8 space-y-8">
        {/* Winners Section */}
        {winners.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Trophy className="w-5 h-5 text-amber-500" />
              <h2 className="text-lg font-bold text-zinc-800">Ganhadores</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {winners.map((winner, idx) => (
                <div key={winner.id} className="bg-white border-2 border-amber-100 rounded-[32px] p-6 flex items-center gap-4 shadow-sm animate-in zoom-in-95 duration-500">
                  <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center shrink-0">
                    <Trophy className="w-7 h-7 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-1">Ganhador #{idx + 1}</p>
                    <p className="text-xl font-bold text-zinc-800">{winner.name}</p>
                    <p className="text-xs text-zinc-400">Parabéns!</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Search and Stats */}
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Users className="w-5 h-5 text-zinc-400" />
              <h2 className="text-lg font-bold text-zinc-800">Participantes</h2>
              <span className="bg-zinc-100 text-zinc-500 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-widest">
                {participants.length}
              </span>
            </div>
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input 
                type="text" 
                placeholder="Buscar por nome..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-white border border-zinc-100 rounded-2xl pl-11 pr-6 py-3 text-sm focus:border-emerald-500 outline-none transition-all shadow-sm"
              />
            </div>
          </div>

          {/* Participants Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredParticipants.length === 0 ? (
              <div className="col-span-full py-20 text-center bg-white border border-dashed border-zinc-200 rounded-[32px] space-y-4">
                <Users className="w-12 h-12 text-zinc-100 mx-auto" />
                <p className="text-zinc-400 text-sm italic">Nenhum participante encontrado.</p>
              </div>
            ) : (
              filteredParticipants.map(p => (
                <div key={p.id} className="bg-white border border-zinc-100 rounded-3xl p-6 shadow-sm hover:shadow-md transition-all">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 rounded-xl bg-zinc-50 flex items-center justify-center">
                      <Users className="w-5 h-5 text-zinc-400" />
                    </div>
                    <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-600 px-3 py-1 rounded-full" style={{ backgroundColor: `${primaryColor}1a`, color: primaryColor }}>
                      <Ticket className="w-3.5 h-3.5" />
                      <span className="text-xs font-bold">{p.coupons_count}</span>
                    </div>
                  </div>
                  <h4 className="font-bold text-zinc-800 truncate mb-1">{p.name}</h4>
                  <p className="text-[10px] text-zinc-400 uppercase font-bold tracking-widest">
                    {p.status === 'winner' ? 'Ganhador' : 'Participando'}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Rules Section */}
        {sweep.rules && (
          <div className="bg-white border border-zinc-100 rounded-[32px] p-8 space-y-4 shadow-sm">
            <h3 className="font-bold text-zinc-800 flex items-center gap-2">
              <span className="w-1.5 h-6 bg-emerald-500 rounded-full" style={{ backgroundColor: primaryColor }}></span>
              Regras e Informações
            </h3>
            <div className="text-sm text-zinc-600 leading-relaxed whitespace-pre-wrap">
              {sweep.rules}
            </div>
          </div>
        )}

        {/* Disclaimer */}
        <div className="text-center px-6 py-8 border-t border-zinc-100 mt-8">
          <p className="text-[10px] text-zinc-400 uppercase tracking-widest leading-relaxed max-w-2xl mx-auto">
            A plataforma da Consigna Beauty não se responsabiliza pela criação, distribuição ou eventuais ressarcimentos de produtos, brindes ou serviços disponibilizados através dos seus usuários.
          </p>
        </div>
      </div>
    </div>
  );
}
