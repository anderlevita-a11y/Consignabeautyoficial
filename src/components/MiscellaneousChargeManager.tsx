import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Loader2, 
  Send, 
  Printer, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  Calendar, 
  User, 
  FileText,
  DollarSign,
  Info,
  ChevronDown,
  ChevronUp,
  Megaphone,
  UserCheck
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useNotifications } from './NotificationCenter';
import { cn, formatError, formatMoney, formatMoneyInput, parseMoney } from '../lib/utils';
import { Customer, MiscellaneousCharge, MiscellaneousChargeInstallment, Profile } from '../types';
import { addDays, format, parseISO, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ConfirmationModal } from './ConfirmationModal';

interface MiscellaneousChargeManagerProps {
  profile: Profile | null;
}

export function MiscellaneousChargeManager({ profile }: MiscellaneousChargeManagerProps) {
  const { addNotification } = useNotifications();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [charges, setCharges] = useState<MiscellaneousCharge[]>([]);
  const [installmentsMap, setInstallmentsMap] = useState<Record<string, MiscellaneousChargeInstallment[]>>({});
  const [expandedCharge, setExpandedCharge] = useState<string | null>(null);
  const [chargeToDelete, setChargeToDelete] = useState<string | null>(null);

  // Form State
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchingCustomers, setSearchingCustomers] = useState(false);
  const [description, setDescription] = useState('');
  const [totalValue, setTotalValue] = useState('');
  const [dueDate, setDueDate] = useState(new Date().toISOString().split('T')[0]);
  const [originalDueDate, setOriginalDueDate] = useState('');
  const [installmentsCount, setInstallmentsCount] = useState(1);
  const [applyLateFees, setApplyLateFees] = useState(true);

  const calculateLateFees = (value: number, dueDateStr: string) => {
    const dueDate = parseISO(dueDateStr);
    const today = new Date();
    
    if (today <= dueDate) return { total: value, multa: 0, juros: 0, daysPast: 0 };

    const daysPast = differenceInDays(today, dueDate);
    const multa = value * 0.02;
    const juros = value * (0.01 * (daysPast / 30));
    
    return {
      total: value + multa + juros,
      multa,
      juros,
      daysPast
    };
  };

  useEffect(() => {
    fetchCharges();
  }, []);

  useEffect(() => {
    if (customerSearch.length >= 2) {
      searchCustomers();
    } else {
      setCustomers([]);
    }
  }, [customerSearch]);

  async function searchCustomers() {
    setSearchingCustomers(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('user_id', session.user.id)
        .ilike('nome', `%${customerSearch}%`)
        .limit(5);

      if (error) throw error;
      setCustomers(data || []);
    } catch (err) {
      console.error('Error searching customers:', err);
    } finally {
      setSearchingCustomers(false);
    }
  }

  async function fetchCharges() {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase
        .from('miscellaneous_charges')
        .select('*, customer:customers(nome, cpf, whatsapp)')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCharges(data || []);
    } catch (err) {
      console.error('Error fetching charges:', err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchInstallments(chargeId: string) {
    try {
      const { data, error } = await supabase
        .from('miscellaneous_charge_installments')
        .select('*')
        .eq('charge_id', chargeId)
        .order('installment_number');

      if (error) throw error;
      setInstallmentsMap(prev => ({ ...prev, [chargeId]: data || [] }));
    } catch (err) {
      console.error('Error fetching installments:', err);
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || !description || !totalValue) {
      addNotification({ type: 'error', title: 'Erro', message: 'Preencha todos os campos obrigatórios' });
      return;
    }

    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const baseValueNum = parseMoney(totalValue);
      let valueWithFees = baseValueNum;
      
      if (applyLateFees && originalDueDate) {
        const fees = calculateLateFees(baseValueNum, originalDueDate);
        valueWithFees = fees.total;
      }

      const { data: charge, error: chargeError } = await supabase
        .from('miscellaneous_charges')
        .insert([{
          user_id: session.user.id,
          customer_id: selectedCustomer.id,
          description,
          total_value: valueWithFees,
          installments_count: installmentsCount,
          apply_late_fees: applyLateFees,
          original_due_date: originalDueDate || null
        }])
        .select()
        .single();

      if (chargeError) {
        console.error('Erro ao inserir cobrança:', chargeError);
        throw chargeError;
      }

      // Create installments with precision handling
      const installments = [];
      const baseInstallmentValue = Math.floor((valueWithFees / installmentsCount) * 100) / 100;
      const remainder = Math.round((valueWithFees - (baseInstallmentValue * installmentsCount)) * 100) / 100;

      for (let i = 1; i <= installmentsCount; i++) {
        const installmentValue = i === installmentsCount ? (baseInstallmentValue + remainder) : baseInstallmentValue;
        const installmentDueDate = addDays(parseISO(dueDate), (i - 1) * 30); // Approx 30 days per installment
        
        installments.push({
          charge_id: charge.id,
          installment_number: i,
          value: installmentValue,
          due_date: installmentDueDate.toISOString().split('T')[0],
          status: 'pending'
        });
      }

      const { error: installmentsError } = await supabase
        .from('miscellaneous_charge_installments')
        .insert(installments);

      if (installmentsError) {
        console.error('Erro ao inserir parcelas:', installmentsError);
        throw installmentsError;
      }

      addNotification({ type: 'success', title: 'Sucesso', message: 'Cobrança cadastrada com sucesso!' });
      setShowForm(false);
      resetForm();
      fetchCharges();
    } catch (err) {
      console.error('Error saving charge:', err);
      addNotification({ 
        type: 'error', 
        title: 'Erro ao salvar cobrança', 
        message: formatError(err) 
      });
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setSelectedCustomer(null);
    setCustomerSearch('');
    setDescription('');
    setTotalValue('');
    setDueDate(new Date().toISOString().split('T')[0]);
    setOriginalDueDate('');
    setInstallmentsCount(1);
    setApplyLateFees(true);
  };

  const markInstallmentPaid = async (chargeId: string, installmentId: string) => {
    try {
      const { error } = await supabase
        .from('miscellaneous_charge_installments')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', installmentId);

      if (error) throw error;
      fetchInstallments(chargeId);
      addNotification({ type: 'success', title: 'Pago', message: 'Parcela marcada como paga' });
    } catch (err) {
      console.error('Error marking as paid:', err);
    }
  };

  const handleShareWhatsApp = (charge: MiscellaneousCharge, installments: MiscellaneousChargeInstallment[]) => {
    const customer = charge.customer;
    if (!customer) return;

    let message = `*COBRANÇA AVULSA - ${charge.description}*\n\n`;
    
    const feesBaseDate = charge.original_due_date || (installments[0]?.due_date);
    const fees = charge.apply_late_fees && feesBaseDate ? calculateLateFees(charge.total_value, feesBaseDate) : null;

    if (charge.original_due_date) {
      message += `*Vencimento Original:* ${format(parseISO(charge.original_due_date), 'dd/MM/yyyy')}\n`;
    }
    
    message += `Olá ${customer.nome}, consta uma pendência em seu nome.\n\n`;
    
    if (fees && fees.daysPast > 0) {
      message += `*Valor Original:* R$ ${charge.total_value.toFixed(2)}\n`;
      message += `*Multa (2%):* R$ ${fees.multa.toFixed(2)}\n`;
      message += `*Juros Mora:* R$ ${fees.juros.toFixed(2)} (${fees.daysPast} dias de atraso)\n`;
      message += `*Valor Atualizado (Dívida Total):* R$ ${fees.total.toFixed(2)}\n\n`;
    } else {
      message += `*Valor da Dívida:* R$ ${charge.total_value.toFixed(2)}\n\n`;
    }

    message += `*Acordo de Pagamento Negociado:*\n`;
    message += `Condição: ${charge.installments_count}x de R$ ${(charge.total_value / charge.installments_count).toFixed(2)}\n\n`;
    
    if (charge.installments_count > 1) {
      message += `*Detalhamento das Parcelas:*\n`;
      installments.forEach(inst => {
        message += `- Parcela ${inst.installment_number}: R$ ${inst.value.toFixed(2)} (${inst.status === 'paid' ? 'PAGO' : 'Vence em ' + format(parseISO(inst.due_date), 'dd/MM/yyyy')})\n`;
      });
    } else if (installments[0]) {
      message += `Vencimento: ${format(parseISO(installments[0].due_date), 'dd/MM/yyyy')}\n`;
    }

    if (charge.apply_late_fees) {
      message += `\n_Atenção: Atrasos sujeitos a multa de 2% e juros de 1% ao mês. Em caso de inadimplência acarretará ação de cobrança e custas processuais._\n`;
    }

    message += `\n*Cliente:* ${customer.nome}`;
    message += customer.cpf ? `\n*CPF:* ${customer.cpf}` : "";
    message += customer.whatsapp ? `\n*WhatsApp:* ${customer.whatsapp}` : "";
    message += `\n\nAssinatura: ___________________________`;

    message += `\n\nPara mais informações, entre em contato comigo.`;

    const encoded = encodeURIComponent(message);
    window.open(`https://wa.me/?text=${encoded}`, '_blank');
  };

  const handleDelete = async () => {
    if (!chargeToDelete) return;
    try {
      const { error } = await supabase
        .from('miscellaneous_charges')
        .delete()
        .eq('id', chargeToDelete);
      if (error) throw error;
      setChargeToDelete(null);
      fetchCharges();
      addNotification({ type: 'success', title: 'Excluído', message: 'Cobrança excluída com sucesso' });
    } catch (err) {
      console.error('Error deleting charge:', err);
      addNotification({ type: 'error', title: 'Erro', message: 'Erro ao excluir cobrança' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-zinc-100 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center">
            <DollarSign className="w-6 h-6 text-amber-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-zinc-800 tracking-tight">Cobranças Avulsas</h2>
            <p className="text-xs text-zinc-500 italic">Cadastre e gerencie dívidas manuais e parcelamentos.</p>
          </div>
        </div>
        <button 
          onClick={() => setShowForm(!showForm)}
          className={cn(
            "flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-sm transition-all shadow-lg",
            showForm ? "bg-zinc-100 text-zinc-600" : "bg-amber-500 text-white shadow-amber-500/20 hover:bg-amber-600"
          )}
        >
          {showForm ? 'Voltar' : <><Plus className="w-5 h-5" /> Cadastrar Cobrança</>}
        </button>
      </div>

      {showForm && (
        <div className="bg-white border border-zinc-200 rounded-[32px] p-8 shadow-md animate-in slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
              <Plus className="w-5 h-5 text-amber-500" />
            </div>
            <h3 className="text-lg font-bold text-zinc-800">Nova Cobrança Avulsa</h3>
          </div>

          <form onSubmit={handleSave} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                {/* Customer Search */}
                <div className="space-y-2 relative">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Selecionar Cliente</label>
                  {!selectedCustomer ? (
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                      <input 
                        type="text"
                        placeholder="Nome da cliente..."
                        value={customerSearch}
                        maxLength={100}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                        className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl pl-12 pr-4 py-4 text-sm focus:border-amber-500 outline-none transition-all"
                      />
                      {searchingCustomers && (
                        <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-amber-500" />
                      )}
                      {customers.length > 0 && (
                        <div className="absolute z-10 w-full mt-2 bg-white border border-zinc-200 rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                          {customers.map(c => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => setSelectedCustomer(c)}
                              className="w-full px-5 py-4 text-left hover:bg-zinc-50 transition-colors border-b border-zinc-50 last:border-0"
                            >
                              <p className="text-sm font-bold text-zinc-800">{c.nome}</p>
                              <p className="text-[10px] text-zinc-400">CPF: {c.cpf || '---'}</p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between bg-zinc-50 border border-zinc-100 rounded-2xl px-5 py-4">
                      <div className="flex items-center gap-3">
                        <UserCheck className="w-5 h-5 text-emerald-500" />
                        <div>
                          <p className="text-sm font-bold text-zinc-800">{selectedCustomer.nome}</p>
                          <p className="text-[10px] text-zinc-400">CPF: {selectedCustomer.cpf || '---'}</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => setSelectedCustomer(null)}
                        className="p-2 text-zinc-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Descrição do Débito</label>
                  <textarea 
                    required
                    value={description}
                    maxLength={255}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Ex: Ref. compra de perfumes importados (Lançamento avulso)"
                    rows={3}
                    className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-5 py-4 text-sm focus:border-amber-500 outline-none transition-all resize-none"
                  />
                </div>
              </div>

              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Valor Total (R$)</label>
                    <p className="text-[10px] text-zinc-400 font-medium ml-1">Valor da Despesa</p>
                    <input 
                      required
                      type="text"
                      inputMode="numeric"
                      value={totalValue}
                      maxLength={20}
                      onChange={(e) => setTotalValue(formatMoneyInput(e.target.value))}
                      placeholder="0,00"
                      className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-5 py-4 text-sm font-black text-zinc-800 focus:border-amber-500 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Vencimento Negociação</label>
                    <input 
                      required
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-5 py-4 text-sm focus:border-amber-500 outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Condições de Parcelamento</label>
                  <div className="grid grid-cols-4 gap-2">
                    {[1, 2, 3, 4, 5, 6, 8, 10, 12].map(n => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setInstallmentsCount(n)}
                        className={cn(
                          "py-3 rounded-xl border text-xs font-bold transition-all",
                          installmentsCount === n 
                            ? "bg-amber-500 border-amber-500 text-white shadow-lg shadow-amber-500/20" 
                            : "border-zinc-200 text-zinc-500 hover:border-zinc-300"
                        )}
                      >
                        {n}x
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Data de Vencimento Original (Para cálculo de juros)</label>
                  <input 
                    type="date"
                    value={originalDueDate}
                    onChange={(e) => setOriginalDueDate(e.target.value)}
                    className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-5 py-4 text-sm focus:border-amber-500 outline-none transition-all"
                  />
                  <p className="text-[10px] text-zinc-400 ml-1 italic">Opcional: Informe a data original da dívida para registro documental.</p>
                </div>

                <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <input 
                      type="checkbox"
                      id="fees"
                      checked={applyLateFees}
                      onChange={(e) => setApplyLateFees(e.target.checked)}
                      className="w-5 h-5 rounded border-amber-300 text-amber-500 focus:ring-amber-500"
                    />
                    <label htmlFor="fees" className="text-sm font-bold text-amber-800 cursor-pointer">
                      Atribuir juros automáticos?
                    </label>
                  </div>
                  <p className="text-[10px] text-amber-600 italic">
                    Ao ativar, a nota indicará juros de 2% de atraso + mora de 1% ao mês conforme a data de vencimento.
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-8 border-t border-zinc-100 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-zinc-400">
                <Info className="w-4 h-4" />
                <span className="text-xs">Uma nota promissória será gerada com os dados do cliente.</span>
              </div>
              <button
                type="submit"
                disabled={saving || !selectedCustomer}
                className="bg-zinc-900 text-white px-10 py-4 rounded-2xl font-bold hover:bg-amber-600 transition-all shadow-xl disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : 'Finalizar e Gerar Cobrança'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* List */}
      <div className="bg-white border border-zinc-100 rounded-[32px] overflow-hidden shadow-sm">
        <div className="p-8 border-b border-zinc-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-zinc-400" />
            <h3 className="text-sm font-black uppercase tracking-widest text-zinc-400">Histórico de Cobranças Avulsas</h3>
          </div>
        </div>

        <div className="divide-y divide-zinc-50">
          {loading ? (
            <div className="p-12 text-center text-zinc-400">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
              <p className="text-sm">Carregando cobranças...</p>
            </div>
          ) : charges.length === 0 ? (
            <div className="p-12 text-center text-zinc-400 italic">
              Nenhuma cobrança avulsa cadastrada até o momento.
            </div>
          ) : charges.map(charge => (
            <div key={charge.id} className="group">
              <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-zinc-50/50 transition-colors">
                <div className="flex items-start gap-4 flex-1">
                  <div className="w-10 h-10 rounded-xl bg-zinc-100 flex items-center justify-center shrink-0">
                    <User className="w-5 h-5 text-zinc-500" />
                  </div>
                  <div>
                    <h4 className="font-bold text-zinc-800">{charge.customer?.nome || '---'}</h4>
                    <p className="text-xs text-zinc-500 mt-0.5">{charge.description}</p>
                    <div className="flex items-center gap-3 mt-2">
                       <span className="text-[10px] bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded-full font-bold">
                        {charge.installments_count} {charge.installments_count === 1 ? 'Parcela' : 'Parcelas'}
                      </span>
                      {charge.original_due_date && (
                        <span className="text-[10px] bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded-full font-bold">
                          Venc. Original: {format(parseISO(charge.original_due_date), 'dd/MM/yyyy')}
                        </span>
                      )}
                      {charge.apply_late_fees && (
                        <span className="text-[10px] bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full font-bold">
                          Juros Automáticos
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Valor Total</p>
                    {(() => {
                      const feesBaseDate = charge.original_due_date;
                      const fees = charge.apply_late_fees && feesBaseDate ? calculateLateFees(charge.total_value, feesBaseDate) : null;
                      
                      if (fees && fees.daysPast > 0) {
                        return (
                          <div className="space-y-0.5 group/fees relative">
                            <p className="text-[10px] text-zinc-400 line-through">R$ {charge.total_value.toFixed(2)}</p>
                            <p className="text-lg font-black text-red-600">R$ {fees.total.toFixed(2)}</p>
                            <div className="absolute right-0 top-full mt-1 hidden group-hover/fees:block z-20 bg-zinc-800 text-white p-2 rounded-lg text-[10px] w-40 shadow-xl border border-zinc-700">
                              <p className="mb-1 border-b border-zinc-700 pb-1 font-bold">Detalhamento:</p>
                              <div className="flex justify-between"><span>Base:</span> <span>R$ {charge.total_value.toFixed(2)}</span></div>
                              <div className="flex justify-between"><span>Multa (2%):</span> <span>R$ {fees.multa.toFixed(2)}</span></div>
                              <div className="flex justify-between"><span>Juros ({fees.daysPast}d):</span> <span>R$ {fees.juros.toFixed(2)}</span></div>
                            </div>
                          </div>
                        );
                      }
                      
                      return <p className="text-lg font-black text-zinc-800">R$ {charge.total_value.toFixed(2)}</p>;
                    })()}
                  </div>

                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => {
                        if (expandedCharge === charge.id) {
                          setExpandedCharge(null);
                        } else {
                          setExpandedCharge(charge.id);
                          if (!installmentsMap[charge.id]) {
                            fetchInstallments(charge.id);
                          }
                        }
                      }}
                      className="p-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-500 rounded-xl transition-all"
                      title="Ver Parcelas"
                    >
                      {expandedCharge === charge.id ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </button>
                    <button 
                      onClick={() => handleShareWhatsApp(charge, installmentsMap[charge.id] || [])}
                      className="p-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-xl transition-all"
                      title="Compartilhar"
                    >
                      <Megaphone className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => setChargeToDelete(charge.id)}
                      className="p-2.5 hover:bg-red-50 text-zinc-300 hover:text-red-500 rounded-xl transition-all"
                      title="Excluir"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Installments Expanded View */}
              {expandedCharge === charge.id && (
                <div className="bg-zinc-50/50 p-6 pt-0 animate-in slide-in-from-top-2 duration-300">
                  <div className="bg-white border border-zinc-100 rounded-2xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-zinc-50 border-b border-zinc-100">
                            <th className="px-6 py-3 text-[10px] font-bold text-zinc-400 uppercase">Nº</th>
                            <th className="px-6 py-3 text-[10px] font-bold text-zinc-400 uppercase text-center">Vencimento</th>
                            <th className="px-6 py-3 text-[10px] font-bold text-zinc-400 uppercase text-right">Valor</th>
                            <th className="px-6 py-3 text-[10px] font-bold text-zinc-400 uppercase text-center">Status</th>
                            <th className="px-6 py-3 text-[10px] font-bold text-zinc-400 uppercase text-right">Ação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-50">
                          {installmentsMap[charge.id]?.map(inst => (
                            <tr key={inst.id}>
                              <td className="px-6 py-3 text-xs font-bold text-zinc-400">{inst.installment_number}ª</td>
                              <td className="px-6 py-3 text-center">
                                <span className={cn(
                                  "text-xs font-bold",
                                  inst.status === 'pending' && new Date(inst.due_date) < new Date() ? 'text-red-500' : 'text-zinc-600'
                                )}>
                                  {format(parseISO(inst.due_date), 'dd/MM/yyyy')}
                                </span>
                              </td>
                              <td className="px-6 py-3 text-right">
                                {(() => {
                                  const fees = charge.apply_late_fees && inst.status === 'pending' ? calculateLateFees(inst.value, inst.due_date) : null;
                                  if (fees && fees.daysPast > 0) {
                                    return (
                                      <div className="text-right">
                                        <p className="text-[9px] text-zinc-400 line-through">R$ {inst.value.toFixed(2)}</p>
                                        <p className="text-xs font-bold text-red-600">R$ {fees.total.toFixed(2)}</p>
                                      </div>
                                    );
                                  }
                                  return <span className="text-xs font-bold text-zinc-800">R$ {inst.value.toFixed(2)}</span>;
                                })()}
                              </td>
                              <td className="px-6 py-3 text-center">
                                {inst.status === 'paid' ? (
                                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-emerald-50 text-emerald-600 text-[10px] font-bold uppercase rounded-full">
                                    <CheckCircle2 className="w-3 h-3" /> Pago
                                  </span>
                                ) : (
                                  <span className={cn(
                                    "inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold uppercase rounded-full",
                                    new Date(inst.due_date) < new Date() ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
                                  )}>
                                    <Clock className="w-3 h-3" /> {new Date(inst.due_date) < new Date() ? 'Atrasado' : 'Aberto'}
                                  </span>
                                )}
                              </td>
                              <td className="px-6 py-3 text-right">
                                {inst.status === 'pending' && (
                                  <button 
                                    onClick={() => markInstallmentPaid(charge.id, inst.id)}
                                    className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest hover:underline"
                                  >
                                    Baixar
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {/* Nota / Recibo Area */}
                    <div className="p-8 border-t border-zinc-100 bg-zinc-50/30">
                      <div className="max-w-xl mx-auto space-y-8 bg-white p-10 border border-zinc-100 shadow-lg rounded-xl">
                         <div className="text-center space-y-2 mb-8">
                            <h5 className="font-serif italic text-xl">Recibo de Cobrança Avulsa</h5>
                            <p className="text-xs text-zinc-400">Título para fins de acompanhamento e acerto de contas.</p>
                         </div>
                         
                         <div className="space-y-6 text-sm text-zinc-600 leading-relaxed">
                            <p>Eu, <span className="font-bold text-zinc-800">{charge.customer?.nome || '[Nome do Cliente]'}</span>, CPF nº <span className="font-bold text-zinc-800">{charge.customer?.cpf || '[CPF]'}</span>, declaro-me devedor(a) da importância de <span className="font-bold text-zinc-800">R$ {charge.total_value.toFixed(2)}</span>, referente a <span className="italic underline underline-offset-4">{charge.description}</span>.</p>
                            
                            <p>Comprometo-me a efetuar o pagamento conforme o cronograma de parcelas descrito nesta nota.</p>

                            <div className="bg-zinc-50/50 p-4 rounded-xl border border-zinc-100 space-y-1.5 mt-6">
                               <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Informações Legais</p>
                               <p className="text-[10px] text-zinc-500 leading-relaxed italic">
                                  Atenção: Atrasos sujeitos a multa de 2% e juros de 1% ao mês. Em caso de inadimplência acarretará ação de cobrança e custas processuais.
                               </p>
                             </div>
                         </div>

                         <div className="pt-16 flex flex-col items-center gap-4">
                            <div className="w-full max-w-[300px] h-px bg-zinc-200"></div>
                            <div className="text-center">
                              <p className="text-sm font-black text-zinc-800 uppercase tracking-tight leading-none">{charge.customer?.nome}</p>
                              <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-widest mt-1.5">Assinatura do Devedor(a)</p>
                              <p className="text-[10px] text-zinc-500 mt-1 uppercase">CPF: {charge.customer?.cpf || '---'}</p>
                              {charge.customer?.whatsapp && <p className="text-[10px] text-zinc-500 uppercase">WhatsApp: {charge.customer.whatsapp}</p>}
                            </div>
                         </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <ConfirmationModal
        isOpen={!!chargeToDelete}
        title="Excluir Cobrança"
        message="Tem certeza que deseja excluir esta cobrança? Todas as parcelas vinculadas também serão removidas."
        onConfirm={handleDelete}
        onCancel={() => setChargeToDelete(null)}
        variant="danger"
        confirmText="Excluir"
      />
    </div>
  );
}
