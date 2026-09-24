import React, { useEffect, useState } from 'react';
import { 
  Plus, 
  Search, 
  User,
  Mail,
  Phone,
  MapPin,
  MoreHorizontal,
  Loader2,
  Trash2,
  AlertTriangle,
  Check
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Customer } from '../types';
import { CustomerForm } from './CustomerForm';
import { cn } from '../lib/utils';
import { useNotifications } from './NotificationCenter';
import { ConfirmationModal } from './ConfirmationModal';

export function Customers() {
  const { addNotification } = useNotifications();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;
  const [searchTerm, setSearchTerm] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | undefined>();
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchCustomers();
  }, []);

  async function fetchCustomers(isLoadMore = false) {
    if (isLoadMore) setLoadingMore(true);
    else setLoading(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;

      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error } = await supabase
        .from('customers')
        .select('id, nome, cpf, whatsapp, logradouro, bairro, cidade, estado, status, credit_limit, user_id')
        .eq('user_id', user.id)
        .order('nome', { ascending: true })
        .range(from, to);

      if (error) throw error;
      
      if (isLoadMore) {
        setCustomers(prev => [...prev, ...(data || [])]);
      } else {
        setCustomers(data || []);
      }
      
      setHasMore(data ? data.length === PAGE_SIZE : false);
    } catch (err) {
      console.error('Error fetching customers:', err);
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
      fetchCustomers(true);
    }
  }, [page]);

  const handleSave = () => {
    setIsAdding(false);
    setEditingCustomer(undefined);
    fetchCustomers();
  };

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setIsAdding(true);
  };

  const confirmDelete = async () => {
    if (!customerToDelete) return;

    setDeleting(true);
    try {
      const { error } = await supabase
        .from('customers')
        .delete()
        .eq('id', customerToDelete.id);

      if (error) throw error;

      addNotification({
        type: 'success',
        title: 'Sucesso',
        message: 'Cliente duplicado excluído com sucesso.'
      });
      fetchCustomers();
    } catch (err: any) {
      console.error('Error deleting customer:', err);
      addNotification({
        type: 'error',
        title: 'Erro',
        message: err.message || 'Erro ao excluir cliente.'
      });
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
      setCustomerToDelete(null);
    }
  };

  const handleDeleteDuplicate = async (customer: Customer) => {
    setLoading(true);
    try {
      // Verificar se possui sacolas não finalizadas
      const { data: bags, error: bagsError } = await supabase
        .from('bags')
        .select('id, bag_number')
        .eq('customer_id', customer.id)
        .neq('status', 'closed');

      if (bagsError) throw bagsError;

      if (bags && bags.length > 0) {
        addNotification({
          type: 'error',
          title: 'Não é possível excluir',
          message: `O cliente possui ${bags.length} sacola(s) em aberto (${bags.map(b => b.bag_number).join(', ')}). Finalize os acertos primeiro.`
        });
        return;
      }

      setCustomerToDelete(customer);
      setDeleteDialogOpen(true);
    } catch (err) {
      console.error('Error checking bags:', err);
      addNotification({
        type: 'error',
        title: 'Erro',
        message: 'Erro ao verificar pendências do cliente.'
      });
    } finally {
      setLoading(false);
    }
  };

  if (isAdding) {
    return <CustomerForm customer={editingCustomer} onClose={() => { setIsAdding(false); setEditingCustomer(undefined); }} onSave={handleSave} />;
  }

  const filteredCustomers = customers.filter(c => 
    c.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    String(c.whatsapp || '').includes(searchTerm) ||
    String(c.cpf || '').includes(searchTerm)
  );

  const duplicateGroups = Object.values(
    customers.reduce((acc, curr) => {
      const cpf = curr.cpf?.replace(/\D/g, '');
      if (!cpf) return acc;
      if (!acc[cpf]) acc[cpf] = [];
      acc[cpf].push(curr);
      return acc;
    }, {} as Record<string, Customer[]>)
  ).filter(group => group.length > 1);

  const displayedCustomers = showDuplicatesOnly 
    ? duplicateGroups.flat() 
    : filteredCustomers;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-zinc-800">Clientes</h2>
          <p className="text-sm text-zinc-500">Gerencie sua rede de vendedores e clientes.</p>
        </div>
        <div className="flex items-center gap-2">
          {duplicateGroups.length > 0 && (
            <button
              onClick={() => setShowDuplicatesOnly(!showDuplicatesOnly)}
              className={cn(
                "flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold transition-all shadow-sm border",
                showDuplicatesOnly 
                  ? "bg-amber-50 border-amber-200 text-amber-700" 
                  : "bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50"
              )}
            >
              <AlertTriangle className="w-4 h-4" />
              <span className="hidden sm:inline">
                {showDuplicatesOnly ? 'Ver Todos' : `Duplicados (${duplicateGroups.length})`}
              </span>
              <span className="sm:hidden">
                {showDuplicatesOnly ? 'Todos' : `Dup. (${duplicateGroups.length})`}
              </span>
            </button>
          )}
          <button 
            onClick={() => setIsAdding(true)}
            className="flex items-center justify-center gap-2 bg-[#00a86b] hover:bg-[#008f5b] text-white px-4 py-2.5 rounded-xl font-bold transition-all shadow-sm"
          >
            <Plus className="w-5 h-5" />
            Novo Cliente
          </button>
        </div>
      </div>

      {/* Legenda de Ações */}
      <div className="bg-white border border-zinc-100 rounded-2xl p-4 flex flex-wrap gap-6 items-center shadow-sm">
        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Legenda de Ações:</span>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <div className="p-1.5 bg-zinc-50 rounded-lg text-zinc-600">
            <MoreHorizontal className="w-3.5 h-3.5" />
          </div>
          <span>Editar</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <div className="p-1.5 bg-red-50 rounded-lg text-red-500">
            <Trash2 className="w-3.5 h-3.5" />
          </div>
          <span>Excluir Duplicado</span>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
        <input 
          type="text" 
          placeholder="Buscar por nome ou whatsapp..." 
          className="w-full bg-white border border-zinc-200 rounded-xl pl-10 pr-4 py-3 text-zinc-800 focus:outline-none focus:border-emerald-500 transition-colors shadow-sm"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full py-12 text-center text-zinc-400 flex flex-col items-center gap-2">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
            Carregando clientes...
          </div>
        ) : displayedCustomers.length === 0 ? (
          <div className="col-span-full py-12 text-center text-zinc-500">Nenhum cliente encontrado.</div>
        ) : (
          <>
            {displayedCustomers.map((customer) => (
              <div key={customer.id} className="bg-white border border-zinc-200 rounded-2xl p-6 hover:border-emerald-500/30 transition-all group shadow-sm">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center">
                      <User className="w-6 h-6 text-emerald-600" />
                    </div>
                    <div>
                      <h4 className="text-zinc-800 font-bold">{customer.nome}</h4>
                      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">CPF: {customer.cpf || 'Não informado'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {showDuplicatesOnly && (
                      <button 
                        onClick={() => handleDeleteDuplicate(customer)}
                        className="p-2 hover:bg-red-50 rounded-lg transition-colors text-red-400"
                        title="Excluir Duplicado"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    )}
                    <button 
                      onClick={() => handleEdit(customer)}
                      className="p-2 hover:bg-zinc-50 rounded-lg transition-colors text-zinc-400 hover:text-emerald-600"
                      title="Editar Cliente"
                    >
                      <MoreHorizontal className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-zinc-500">
                    <Phone className="w-4 h-4 text-zinc-400" />
                    <span>{customer.whatsapp || 'Sem whatsapp'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-zinc-500">
                    <MapPin className="w-4 h-4 text-zinc-400" />
                    <span className="truncate">{customer.logradouro ? `${customer.logradouro}, ${customer.bairro || ''}` : 'Sem endereço'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-zinc-500">
                    <MapPin className="w-4 h-4 opacity-0" />
                    <span className="truncate">{customer.cidade || ''} - {customer.estado || ''}</span>
                  </div>
                  {customer.credit_limit !== undefined && customer.credit_limit > 0 && (
                    <div className="flex items-center gap-2 text-sm font-bold text-emerald-600 mt-2">
                      <span className="w-4 h-4 flex items-center justify-center">R$</span>
                      <span>Limite: R$ {customer.credit_limit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                </div>

                <div className="mt-6 pt-4 border-t border-zinc-800 flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-500 uppercase">Status</span>
                  <span className={cn(
                    "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                    customer.status === 'active' ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-500/10 text-zinc-400"
                  )}>
                    {customer.status === 'active' ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
              </div>
            ))}
            {hasMore && !showDuplicatesOnly && !searchTerm && (
              <div className="col-span-full py-8 text-center">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="px-6 py-2 bg-white border border-zinc-200 rounded-xl font-bold text-zinc-600 hover:bg-zinc-50 transition-all shadow-sm disabled:opacity-50"
                >
                  {loadingMore ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Carregando...
                    </span>
                  ) : 'Carregar Mais Clientes'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <ConfirmationModal
        isOpen={deleteDialogOpen}
        title="Excluir Cliente Duplicado"
        message={`Tem certeza que deseja excluir o cadastro duplicado de "${customerToDelete?.nome}"? Esta ação não pode ser desfeita.`}
        confirmText={deleting ? 'Excluindo...' : 'Confirmar Exclusão'}
        onConfirm={confirmDelete}
        onCancel={() => {
          setDeleteDialogOpen(false);
          setCustomerToDelete(null);
        }}
        variant="danger"
      />
    </div>
  );
}
