import React, { useEffect, useState } from 'react';
import { 
  Plus, 
  Search, 
  ShoppingBag,
  Calendar,
  User,
  ChevronRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  UserPlus,
  X,
  Loader2
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Bag, Customer } from '../types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { BagForm } from './BagForm';
import { BagSettlement } from './BagSettlement';
import { useNotifications } from './NotificationCenter';

export function Bags() {
  const { addNotification } = useNotifications();
  const [bags, setBags] = useState<Bag[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;
  const [showForm, setShowForm] = useState(false);
  const [selectedBag, setSelectedBag] = useState<Bag | null>(null);
  const [assigningBag, setAssigningBag] = useState<Bag | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    if (!showForm && !selectedBag && !assigningBag) {
      if (page === 0) {
        fetchBags();
      }
    }
  }, [showForm, selectedBag, assigningBag, page]);

  useEffect(() => {
    if (assigningBag) {
      fetchCustomers();
    }
  }, [assigningBag]);

  async function fetchCustomers() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
      if (!user) return;

      const { data, error } = await supabase
        .from('customers')
        .select('id, nome, cpf, user_id, status')
        .eq('user_id', user.id)
        .order('nome');
      if (error) throw error;
      setCustomers(data || []);
    } catch (err) {
      console.error('Error fetching customers:', err);
    }
  }

  const handleAssignCustomer = async (customerId: string) => {
    if (!assigningBag) return;
    setAssigning(true);
    try {
      const { error } = await supabase
        .from('bags')
        .update({ customer_id: customerId })
        .eq('id', assigningBag.id);
      
      if (error) throw error;
      setAssigningBag(null);
      fetchBags();
    } catch (err) {
      console.error('Error assigning customer:', err);
      addNotification({ type: 'error', title: 'Erro', message: 'Erro ao atribuir cliente' });
    } finally {
      setAssigning(false);
    }
  };

  async function fetchBags(isLoadMore = false) {
    if (isLoadMore) setLoadingMore(true);
    else setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;

      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error } = await supabase
        .from('bags')
        .select(`
          id, 
          bag_number, 
          customer_id, 
          campaign_id, 
          status, 
          total_value, 
          total_items, 
          payment_status, 
          created_at, 
          closed_at, 
          received_amount,
          installments,
          notes,
          customer:customers(nome), 
          campaign:campaigns(return_date)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      
      const newBags = (data || []).map(b => ({
        ...b,
        customer: Array.isArray(b.customer) ? b.customer[0] : b.customer
      })) as Bag[];

      if (isLoadMore) {
        setBags(prev => [...prev, ...newBags]);
      } else {
        setBags(newBags);
      }
      
      setHasMore(newBags.length === PAGE_SIZE);

      // Check for overdue open bags
      const today = new Date().toISOString().split('T')[0];
      const overdueBags = newBags.filter(b => 
        b.status === 'open' && 
        (b as any).campaign?.return_date && 
        (b as any).campaign.return_date < today
      );

      if (overdueBags.length > 0 && !isLoadMore) {
        addNotification({
          type: 'warning',
          title: 'Sacolas Vencidas',
          message: `Existem sacolas abertas com prazo de acerto vencido nesta página.`
        });
      }
    } catch (err) {
      console.error('Error fetching bags:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  const handleLoadMore = () => {
    setPage(prev => prev + 1);
  };

  useEffect(() => {
    if (page > 0) {
      fetchBags(true);
    }
  }, [page]);

  const getStatusInfo = (status: string, returnDate?: string) => {
    const isOverdue = status === 'open' && returnDate && new Date(returnDate) < new Date(new Date().setHours(0, 0, 0, 0));

    if (isOverdue) {
      return { label: 'Vencida', color: 'text-red-400', bg: 'bg-red-500/10', icon: AlertCircle };
    }

    switch (status) {
      case 'sent':
        return { label: 'Enviada', color: 'text-blue-400', bg: 'bg-blue-500/10', icon: Clock };
      case 'returned':
        return { label: 'Retornada', color: 'text-purple-400', bg: 'bg-purple-500/10', icon: Calendar };
      case 'closed':
        return { label: 'Finalizada', color: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: CheckCircle2 };
      default:
        return { label: 'Aberta', color: 'text-zinc-400', bg: 'bg-zinc-500/10', icon: AlertCircle };
    }
  };

  if (showForm) {
    return <BagForm onClose={() => setShowForm(false)} onSave={() => setShowForm(false)} />;
  }

  if (selectedBag) {
    return <BagSettlement bag={selectedBag} onClose={() => setSelectedBag(null)} onSave={() => setSelectedBag(null)} />;
  }

  const filteredCustomers = customerSearch
    ? customers.filter(c => c.nome.toLowerCase().includes(customerSearch.toLowerCase()) || String(c.cpf || '').includes(customerSearch)).slice(0, 10)
    : [];

  const displayedBags = bags;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-zinc-800">Acertos (Malas)</h2>
          <p className="text-zinc-500">Controle as malas em consignação.</p>
        </div>
        <button 
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-[#00a86b] hover:bg-[#008f5b] text-white px-4 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg shadow-emerald-500/20"
        >
          <Plus className="w-5 h-5" />
          Nova Mala
        </button>
      </div>

      {/* Legenda de Ações */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 flex flex-wrap gap-6 items-center">
        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Legenda de Ações:</span>
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <div className="p-1.5 bg-zinc-800 rounded-lg text-emerald-400">
            <UserPlus className="w-3.5 h-3.5" />
          </div>
          <span>Atribuir Cliente</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <div className="p-1.5 bg-zinc-800 rounded-lg text-emerald-400">
            <ChevronRight className="w-3.5 h-3.5" />
          </div>
          <span>Ver Detalhes / Acerto</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <div className="p-1.5 bg-[#00a86b] rounded-lg text-white">
            <Plus className="w-3.5 h-3.5" />
          </div>
          <span>Criar Nova Mala</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full py-12 text-center text-zinc-500">Carregando malas...</div>
        ) : displayedBags.length === 0 ? (
          <div className="col-span-full py-12 text-center text-zinc-500">Nenhuma mala encontrada.</div>
        ) : (
          <>
            {displayedBags.map((bag) => {
              const status = getStatusInfo(bag.status, (bag as any).campaign?.return_date);
              const StatusIcon = status.icon;
              
              return (
                <div key={bag.id} 
                  onClick={() => setSelectedBag(bag)}
                  className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 hover:border-zinc-700 transition-all group cursor-pointer"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center">
                        <ShoppingBag className="w-5 h-5 text-emerald-400" />
                      </div>
                      <div>
                        <h4 className="text-white font-semibold">Mala {bag.bag_number}</h4>
                        <p className="text-xs text-zinc-500">Criada em {format(new Date(bag.created_at), "dd 'de' MMM", { locale: ptBR })}</p>
                      </div>
                    </div>
                    <span className={cn(
                      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
                      status.bg,
                      status.color
                    )}>
                      <StatusIcon className="w-3.5 h-3.5" />
                      {status.label}
                    </span>
                  </div>

                  <div className="space-y-3 mb-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm text-zinc-400">
                        <User className="w-4 h-4" />
                        <span>{bag.customer?.nome || 'Sem Cliente'}</span>
                      </div>
                      {bag.notes && (
                        <p className="text-[10px] text-zinc-500 line-clamp-1 italic">
                          {bag.notes}
                        </p>
                      )}
                      {!bag.customer_id && bag.status === 'open' && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setAssigningBag(bag);
                          }}
                          className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-emerald-400 rounded-lg transition-colors"
                          title="Atribuir Cliente"
                        >
                          <UserPlus className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-zinc-500">Valor Total</span>
                      <span className="text-lg font-bold text-white">R$ {bag.total_value?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '0.00'}</span>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-zinc-800 flex items-center justify-between text-emerald-400 text-sm font-medium group-hover:text-emerald-300 transition-colors">
                    Ver Detalhes
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              );
            })}
            {hasMore && (
              <div className="col-span-full py-8 text-center">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="px-6 py-2 bg-zinc-900 border border-zinc-800 rounded-xl font-bold text-zinc-400 hover:bg-zinc-800 transition-all shadow-sm disabled:opacity-50"
                >
                  {loadingMore ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Carregando...
                    </span>
                  ) : 'Carregar Mais Malas'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Assign Customer Modal */}
      {assigningBag && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 w-full max-w-md rounded-2xl border border-zinc-800 shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Atribuir Cliente à Mala {assigningBag.bag_number}</h3>
              <button onClick={() => setAssigningBag(null)} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="relative">
                <input 
                  type="text" 
                  placeholder="Buscar cliente..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white focus:border-emerald-500 outline-none"
                />
                <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto">
                {filteredCustomers.map(c => (
                  <button 
                    key={c.id}
                    onClick={() => handleAssignCustomer(c.id)}
                    disabled={assigning}
                    className="w-full flex items-center justify-between p-3 bg-zinc-800/50 hover:bg-zinc-800 rounded-xl border border-zinc-700/50 transition-all text-left"
                  >
                    <div>
                      <p className="text-sm font-bold text-white">{c.nome}</p>
                      <p className="text-[10px] text-zinc-500">CPF: {c.cpf || '---'}</p>
                    </div>
                    {assigning ? <Loader2 className="w-4 h-4 animate-spin text-emerald-500" /> : <ChevronRight className="w-4 h-4 text-zinc-600" />}
                  </button>
                ))}
                {customerSearch && filteredCustomers.length === 0 && (
                  <p className="text-center py-4 text-zinc-500 text-sm">Nenhum cliente encontrado.</p>
                )}
                {!customerSearch && (
                  <p className="text-center py-4 text-zinc-500 text-sm italic">Digite para buscar clientes.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}
