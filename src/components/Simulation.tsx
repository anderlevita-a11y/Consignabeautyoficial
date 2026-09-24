import React, { useState, useEffect } from 'react';
import { 
  Calculator, 
  TrendingUp, 
  DollarSign, 
  Percent, 
  ShoppingBag,
  RefreshCcw,
  Save,
  Trash2,
  Loader2,
  Calendar,
  FileText,
  Trophy,
  Plus,
  Share2,
  MinusCircle
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { CommissionSimulation } from '../types';
import { cn, formatError, formatMoneyInput, parseMoney } from '../lib/utils';
import { format } from 'date-fns';
import { ConfirmationModal } from './ConfirmationModal';
import { useNotifications } from './NotificationCenter';

export function Simulation() {
  const [description, setDescription] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [expenses, setExpenses] = useState<{ description: string; value: number }[]>([]);
  const [expenseDesc, setExpenseDesc] = useState('');
  const [inputExpenseValue, setInputExpenseValue] = useState('');
  const [simulations, setSimulations] = useState<CommissionSimulation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { addNotification } = useNotifications();

  const value = parseMoney(inputValue);
  const expenseValue = parseMoney(inputExpenseValue);

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
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
      if (!user) return;

      // Fetch manual simulations
      const { data: simData, error: simError } = await supabase
        .from('commission_simulations')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (simError) throw simError;
      setSimulations(simData || []);
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  }

  const getCommissionPct = (val: number) => {
    if (val >= 11000) return 20;
    if (val >= 10000) return 19.75;
    if (val >= 8500) return 19.5;
    if (val >= 7000) return 19.25;
    if (val >= 6000) return 19;
    if (val >= 5000) return 18.75;
    if (val >= 4500) return 18.5;
    if (val >= 4000) return 18.25;
    return 18;
  };

  const commissionPct = getCommissionPct(value);
  const commissionValue = (value * commissionPct) / 100;
  const totalExpenses = expenses.reduce((acc, e) => acc + e.value, 0);
  const liquidValue = value - commissionValue - totalExpenses;

  const handleAddExpense = () => {
    if (!expenseDesc || expenseValue <= 0) return;
    setExpenses([...expenses, { description: expenseDesc, value: expenseValue }]);
    setExpenseDesc('');
    setInputExpenseValue('');
  };

  const handleRemoveExpense = (index: number) => {
    setExpenses(expenses.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!description || value <= 0) {
      addNotification({
        type: 'warning',
        title: 'Campos obrigatórios',
        message: 'Preencha a descrição e o valor bruto.'
      });
      return;
    }

    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
      if (!user) return;

      const { error } = await supabase
        .from('commission_simulations')
        .insert([{
          user_id: user.id,
          description,
          total_value: value,
          commission_pct: commissionPct,
          commission_value: commissionValue,
          liquid_value: liquidValue,
          expenses: expenses
        }]);

      if (error) throw error;
      
      setDescription('');
      setInputValue('');
      setExpenses([]);
      fetchData();
    } catch (err: any) {
      console.error('Error saving simulation:', err);
      addNotification({
        type: 'error',
        title: 'Erro ao salvar',
        message: formatError(err)
      });
    } finally {
      setSaving(false);
    }
  };

  const handleShare = (sim: CommissionSimulation) => {
    let message = `*Simulação de Comissão - Beauty*\n\n`;
    message += `*Descrição:* ${sim.description}\n`;
    message += `*Data:* ${format(new Date(sim.created_at), "dd/MM/yyyy")}\n\n`;
    message += `Total Bruto: R$ ${sim.total_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
    message += `Comissão (${sim.commission_pct}%): - R$ ${sim.commission_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
    
    if (sim.expenses && sim.expenses.length > 0) {
      message += `\n*Despesas Adicionais:*\n`;
      sim.expenses.forEach(e => {
        message += `- ${e.description}: - R$ ${e.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
      });
      const totalExp = sim.expenses.reduce((acc, e) => acc + e.value, 0);
      message += `Total Despesas: - R$ ${totalExp.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
    }

    message += `\n*Valor Líquido a Pagar: R$ ${sim.liquid_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}*`;
    
    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');
  };

  const handleDelete = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Excluir Simulação',
      message: 'Deseja excluir esta simulação?',
      variant: 'danger',
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from('commission_simulations')
            .delete()
            .eq('id', id);
          if (error) throw error;
          fetchData();
        } catch (err: any) {
          console.error('Error deleting simulation:', err);
          addNotification({
            type: 'error',
            title: 'Erro ao excluir',
            message: formatError(err)
          });
        } finally {
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const allSimulations = [...simulations].sort((a, b) => 
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <div className="space-y-12 animate-in fade-in duration-500">
      <div className="bg-white border border-zinc-200 rounded-[40px] p-10 shadow-sm">
        <div className="flex items-center gap-4 mb-10">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center">
            <Calculator className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-zinc-800 tracking-tight">Simulador de Comissão</h2>
            <p className="text-sm text-zinc-500">Cálculo automático baseado em faixas de valor.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          <div className="space-y-8">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Descrição da Simulação</label>
              <input 
                type="text" 
                placeholder="Ex: Sacola da Maria - Março"
                value={description}
                maxLength={100}
                onChange={e => setDescription(e.target.value)}
                className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-4 text-sm focus:border-indigo-500 outline-none transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Valor Total Bruto (R$)</label>
              <div className="relative">
                <span className="absolute left-6 top-1/2 -translate-y-1/2 text-zinc-400 font-bold">R$</span>
                <input 
                  type="text" 
                  inputMode="numeric"
                  placeholder="0,00"
                  value={inputValue}
                  maxLength={20}
                  onChange={e => setInputValue(formatMoneyInput(e.target.value))}
                  className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl pl-14 pr-6 py-4 text-2xl font-bold text-zinc-700 focus:border-indigo-500 outline-none transition-all"
                />
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Despesas Adicionais (Opcional)</label>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-[2] space-y-1">
                  <p className="text-[10px] text-zinc-400 font-medium ml-1">Descrição</p>
                  <input 
                    type="text" 
                    placeholder="Descrição da despesa"
                    value={expenseDesc}
                    maxLength={50}
                    onChange={e => setExpenseDesc(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddExpense()}
                    className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-4 text-sm focus:border-indigo-500 outline-none transition-all"
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <p className="text-[10px] text-zinc-400 font-medium ml-1">Valor Despesa</p>
                  <input 
                    type="text" 
                    inputMode="numeric"
                    placeholder="0,00"
                    value={inputExpenseValue}
                    maxLength={20}
                    onChange={e => setInputExpenseValue(formatMoneyInput(e.target.value))}
                    onKeyDown={e => e.key === 'Enter' && handleAddExpense()}
                    className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-4 text-sm focus:border-indigo-500 outline-none transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-zinc-400 font-medium ml-1">Adicionar Despesa</p>
                  <button 
                    type="button"
                    onClick={handleAddExpense}
                    className="bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-2xl transition-all flex items-center justify-center h-[52px] shadow-lg shadow-blue-500/20"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              </div>
              
              {expenses.length > 0 && (
                <div className="mt-4 space-y-2">
                  {expenses.map((exp, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-rose-50/50 border border-rose-100 rounded-xl px-4 py-2">
                      <span className="text-xs font-medium text-rose-700">{exp.description}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-bold text-rose-700">- R$ {exp.value.toFixed(2)}</span>
                        <button 
                          type="button"
                          onClick={() => handleRemoveExpense(idx)} 
                          className="text-rose-400 hover:text-rose-600"
                        >
                          <MinusCircle className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button 
              onClick={handleSave}
              disabled={saving || !description || value <= 0}
              className="w-full bg-indigo-400 hover:bg-indigo-500 text-white py-5 rounded-2xl font-bold transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              Salvar Simulação
            </button>
          </div>

          <div className="bg-zinc-50/50 border border-zinc-100 rounded-[32px] p-10 space-y-8">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 sm:gap-0">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Percentual de Comissão</span>
              <span className="text-2xl font-bold text-indigo-600">{commissionPct}%</span>
            </div>
            
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 sm:gap-0">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Valor do Desconto</span>
              <span className="text-2xl font-bold text-rose-500">- R$ {commissionValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>

            {totalExpenses > 0 && (
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 sm:gap-0">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Total Despesas</span>
                <span className="text-2xl font-bold text-rose-500">- R$ {totalExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
            )}

            <div className="pt-8 border-t border-zinc-100 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 sm:gap-0">
              <span className="text-[10px] font-bold text-zinc-800 uppercase tracking-widest">Valor Líquido a Pagar</span>
              <div className="flex items-center gap-4">
                <span className="text-3xl sm:text-4xl font-black text-emerald-600">R$ {liquidValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                <button 
                  onClick={() => { setDescription(''); setInputValue(''); setExpenses([]); }}
                  className="p-2 hover:bg-rose-50 text-rose-400 rounded-lg transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest px-4">Simulações Salvas</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {loading ? (
            <div className="col-span-full py-12 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mx-auto" />
            </div>
          ) : allSimulations.length === 0 ? (
            <div className="col-span-full py-20 text-center bg-white border border-dashed border-zinc-200 rounded-[40px]">
              <p className="text-zinc-400 italic">Nenhuma simulação encontrada.</p>
            </div>
          ) : (
            allSimulations.map(sim => (
              <div key={sim.id} className="bg-white border border-zinc-100 rounded-[32px] p-8 shadow-sm hover:shadow-md transition-all space-y-6">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-bold text-zinc-800">{sim.description}</h4>
                    </div>
                    <p className="text-[10px] text-zinc-400">{format(new Date(sim.created_at), "dd/MM/yyyy")}</p>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleShare(sim)}
                      className="p-2 hover:bg-emerald-50 text-emerald-500 rounded-lg transition-colors"
                      title="Compartilhar WhatsApp"
                    >
                      <Share2 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleDelete(sim.id)}
                      className="p-2 hover:bg-rose-50 text-rose-400 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-400">Total Bruto:</span>
                    <span className="font-bold text-zinc-800">R$ {sim.total_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-400">Comissão ({sim.commission_pct}%):</span>
                    <span className="font-bold text-rose-500">- R$ {sim.commission_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                  {sim.expenses && sim.expenses.length > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-400">Despesas Adicionais:</span>
                      <span className="font-bold text-rose-500">- R$ {sim.expenses.reduce((acc, e) => acc + e.value, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-zinc-50 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 sm:gap-0">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Líquido:</span>
                  <span className="text-xl font-bold text-emerald-600">R$ {sim.liquid_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        variant={confirmModal.variant}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
