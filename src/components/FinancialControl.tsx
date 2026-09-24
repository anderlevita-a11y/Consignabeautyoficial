import React, { useState, useEffect, useMemo } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  Plus, 
  Trash2, 
  Filter, 
  Calendar, 
  ArrowUpRight, 
  ArrowDownRight,
  DollarSign,
  PieChart as PieChartIcon,
  BarChart3,
  Download,
  Search,
  Tag,
  Loader2,
  Save,
  RefreshCcw,
  Megaphone,
  Receipt,
  Share2,
  X
} from 'lucide-react';
import { cn, formatError, formatMoney, formatMoneyInput, parseMoney } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { supabase, isConfigured } from '../lib/supabase';
import { useNotifications } from './NotificationCenter';
import { ConfirmationModal } from './ConfirmationModal';
import { format } from 'date-fns';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { MiscellaneousChargeManager } from './MiscellaneousChargeManager';
import { Profile } from '../types';

interface FinancialControlProps {
  profile: Profile | null;
}

interface Transaction {
  id: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  date: string;
  due_date?: string;
  reminder_enabled?: boolean;
  status?: 'paid' | 'pending';
}

interface CategoryState {
  income: string[];
  expense: string[];
}

const DEFAULT_CATEGORIES: CategoryState = {
  income: ['Vendas', 'Serviços', 'Comissões', 'Outros'],
  expense: ['Fornecedores', 'Marketing', 'Aluguel', 'Impostos', 'Salários', 'Software', 'Outros']
};

const COLORS = ['#38a89d', '#4a1d33', '#f59e0b', '#ef4444', '#8b5cf6', '#3b82f6', '#10b981'];

export function FinancialControl({ profile }: FinancialControlProps) {
  const { addNotification } = useNotifications();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<CategoryState>(DEFAULT_CATEGORIES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense' | 'pending'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    variant: 'danger' | 'warning' | 'info';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    variant: 'info',
    onConfirm: () => {}
  });

  const [dueReminders, setDueReminders] = useState<Transaction[]>([]);
  const [isDueModalOpen, setIsDueModalOpen] = useState(false);

  // Reports data moved from Reports tab
  const [delinquents, setDelinquents] = useState<any[]>([]);
  const [finalizedSales, setFinalizedSales] = useState<any[]>([]);
  const [selectedBagForPayment, setSelectedBagForPayment] = useState<any | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [loadingReports, setLoadingReports] = useState(false);

  // Form State
  const [newTransaction, setNewTransaction] = useState<any>({
    type: 'expense',
    date: new Date().toISOString().split('T')[0],
    category: DEFAULT_CATEGORIES.expense[0],
    status: 'paid',
    reminder_enabled: false,
    amount: '0,00'
  });

  // Load data from Supabase
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
        if (user) {
          // Load transactions
          const { data: transData, error: transError } = await supabase
            .from('financial_transactions')
            .select('*')
            .eq('user_id', user.id)
            .order('date', { ascending: false });

          if (transError) throw transError;
          if (transData) {
            setTransactions(transData);
            checkReminders(transData);
          }

          // Load categories
          const { data: catData, error: catError } = await supabase
            .from('financial_categories')
            .select('categories')
            .eq('user_id', user.id)
            .single();

          if (catData?.categories) {
            setCategories(catData.categories);
          }

          // Load reports data (Delinquency and Finalized Sales)
          await fetchReportsData(user.id);
        }
      } catch (err) {
        console.error('Error loading financial data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const handleAddCategory = () => {
    if (!newCategoryName.trim()) return;
    const type = newTransaction.type as keyof CategoryState;
    if (categories[type].includes(newCategoryName.trim())) return;

    setCategories({
      ...categories,
      [type]: [...categories[type], newCategoryName.trim()]
    });
    setNewTransaction({ ...newTransaction, category: newCategoryName.trim() });
    setNewCategoryName('');
    setIsAddingCategory(false);
  };

  useEffect(() => {
    if (!isConfigured) return;

    const checkInstallmentReminders = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const today = new Date().toISOString().split('T')[0];
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().split('T')[0];

        const { data, error } = await supabase
          .from('miscellaneous_charge_installments')
          .select('*, charge:miscellaneous_charges(description, customer:customers(nome, cpf, whatsapp))')
          .eq('status', 'pending')
          .or(`due_date.eq.${today},due_date.eq.${tomorrowStr}`);

        if (error) {
          if (error.code === 'PGRST116' || error.code === '42P01' || error.message?.includes('Failed to fetch')) return;
          console.warn('Installment reminders notice:', error.message);
          return;
        }

        data?.forEach(inst => {
          const chargeDesc = (inst as any).charge?.description || 'Cobrança Avulsa';
          const customerName = (inst as any).charge?.customer?.nome || 'Cliente';
          const type = inst.due_date === today ? 'warning' : 'info';
          const title = inst.due_date === today ? 'Parcela Vence Hoje' : 'Parcela Vence Amanhã';
          
          addNotification({
            type,
            title,
            message: `A parcela ${inst.installment_number} de "${chargeDesc}" (${customerName}) vence ${inst.due_date === today ? 'hoje' : 'amanhã'}! Valor: R$ ${inst.value.toFixed(2)}`
          });
        });
      } catch (err: any) {
        if (!err?.message?.includes?.('Failed to fetch')) {
          console.warn('Installment reminders notice:', err);
        }
      }
    };

    checkInstallmentReminders();
  }, []);

  async function fetchReportsData(userId: string) {
    setLoadingReports(true);
    try {
      // 1. Finalized Sales (Closed Bags)
      const { data: closedBags } = await supabase
        .from('bags')
        .select('*, customer:customers(nome, cpf, whatsapp)')
        .eq('user_id', userId)
        .eq('status', 'closed')
        .order('created_at', { ascending: false })
        .limit(100);

      setFinalizedSales(closedBags || []);

      // 2. Delinquents (Closed Bags pending/partial + Overdue Open Bags)
      const { data: pendingBags } = await supabase
        .from('bags')
        .select('*, customer:customers(nome, cpf, whatsapp), campaign:campaigns(name, return_date)')
        .eq('user_id', userId)
        .or('status.eq.closed,status.eq.open')
        .limit(30000);

      const today = new Date().toISOString().split('T')[0];
      const filteredDelinquents = (pendingBags || []).filter(bag => {
        if (bag.status === 'closed') {
          return ['pending', 'partial'].includes(bag.payment_status);
        }
        if (bag.status === 'open') {
          const returnDate = bag.campaign?.return_date;
          return returnDate && returnDate < today;
        }
        return false;
      }).slice(0, 50);

      setDelinquents(filteredDelinquents);
    } catch (err) {
      console.error('Error fetching reports data:', err);
    } finally {
      setLoadingReports(false);
    }
  }

  const handleWhatsAppShare = async (bag: any) => {
    try {
      const { data: items } = await supabase
        .from('bag_items')
        .select('*')
        .eq('bag_id', bag.id)
        .limit(30000);

      if (!items) return;

      const { data: campaign } = await supabase
        .from('campaigns')
        .select('discount_pct')
        .eq('id', bag.campaign_id)
        .single();

      const discountPct = campaign?.discount_pct || 0;
      const totalGross = bag.total_value || 0;
      const discountAmount = totalGross * (discountPct / 100);
      const finalAmount = totalGross - discountAmount;

      const customerName = bag.customer?.nome || 'Cliente';
      const customerCPF = bag.customer?.cpf || '---';
      const customerWhatsApp = bag.customer?.whatsapp || '---';
      let message = `*Resumo da Sacola #${bag.bag_number.replace(/\D/g, '')}*\n`;
      message += `Cliente: ${customerName}\n`;
      if (customerCPF !== '---') {
        message += `CPF: ${customerCPF}\n`;
      }
      if (customerWhatsApp !== '---') {
        message += `WhatsApp: ${customerWhatsApp}\n`;
      }
      message += `Data: ${format(new Date(bag.created_at), "dd/MM/yyyy")}\n\n`;
      message += `*Itens:*\n`;
      
      items.forEach(item => {
        const productName = item.product_name || 'Produto';
        const sold = item.quantity - (item.returned_quantity || 0);
        if (sold > 0) {
          message += `- ${productName}\n  ${sold} un x R$ ${item.unit_price.toFixed(2)}\n`;
        }
      });
      
      message += `\nSubtotal: R$ ${totalGross.toFixed(2)}`;
      message += `\nDesconto Campanha (${discountPct}%): R$ ${discountAmount.toFixed(2)}`;
      message += `\n*Total a Pagar: R$ ${finalAmount.toFixed(2)}*`;
      
      if (bag.received_amount && bag.received_amount > 0) {
        message += `\nValor Pago: R$ ${bag.received_amount.toFixed(2)}`;
        const debt = finalAmount - bag.received_amount;
        if (debt > 0) {
          message += `\n*Saldo Devedor: R$ ${debt.toFixed(2)}*`;
        }
      }

      message += `\n\n__________________________\nAssinatura: ${customerName}\nCPF: ${customerCPF}${customerWhatsApp !== '---' ? `\nWhatsApp: ${customerWhatsApp}` : ''}`;
      
      const encodedMessage = encodeURIComponent(message);
      window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');
    } catch (err) {
      console.error('Error sharing on WhatsApp:', err);
    }
  };

  const handleReceivePayment = async () => {
    if (!selectedBagForPayment || !paymentAmount) return;
    
    setIsProcessingPayment(true);
    try {
      const amount = parseFloat(paymentAmount);
      if (isNaN(amount) || amount <= 0) {
        addNotification({
          type: 'warning',
          title: 'Valor inválido',
          message: 'Por favor, insira um valor válido.'
        });
        return;
      }

      const newReceivedAmount = (selectedBagForPayment.received_amount || 0) + amount;
      const totalToPay = selectedBagForPayment.total_value;
      
      const { error } = await supabase
        .from('bags')
        .update({
          received_amount: newReceivedAmount,
          payment_status: newReceivedAmount >= totalToPay ? 'paid' : 'partial'
        })
        .eq('id', selectedBagForPayment.id);

      if (error) throw error;

      const customerName = selectedBagForPayment.customer?.nome || 'Cliente';
      const customerCPF = selectedBagForPayment.customer?.cpf || '---';
      const customerWhatsApp = selectedBagForPayment.customer?.whatsapp || '---';
      let message = `*Comprovante de Pagamento*\n`;
      message += `Cliente: ${customerName}\n`;
      if (customerCPF !== '---') {
        message += `CPF: ${customerCPF}\n`;
      }
      if (customerWhatsApp !== '---') {
        message += `WhatsApp: ${customerWhatsApp}\n`;
      }
      message += `Sacola: #${selectedBagForPayment.bag_number}\n`;
      message += `Data: ${format(new Date(), "dd/MM/yyyy HH:mm")}\n\n`;
      message += `Valor Recebido: *R$ ${amount.toFixed(2)}*\n`;
      message += `Total Pago: R$ ${newReceivedAmount.toFixed(2)}\n`;
      
      const debt = totalToPay - newReceivedAmount;
      if (debt > 0) {
        message += `Saldo Devedor: R$ ${debt.toFixed(2)}\n`;
      } else {
        message += `*Dívida Quitada!* 🎉\n`;
      }
      
      message += `\nObrigado pela preferência!`;
      message += `\n\n__________________________\nAssinatura: ${customerName}\nCPF: ${customerCPF}${customerWhatsApp !== '---' ? `\nWhatsApp: ${customerWhatsApp}` : ''}`;

      const encodedMessage = encodeURIComponent(message);
      window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');

      const { data: { session } } = await supabase.auth.getSession();
      if (session) await fetchReportsData(session.user.id);

      setSelectedBagForPayment(null);
      setPaymentAmount('');
    } catch (err) {
      console.error('Error processing payment:', err);
      addNotification({
        type: 'error',
        title: 'Erro no pagamento',
        message: formatError(err)
      });
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleShareReceipt = (bag: any) => {
    const customerName = bag.customer?.nome || 'Cliente';
    const customerCPF = bag.customer?.cpf || '---';
    const customerWhatsApp = bag.customer?.whatsapp || '---';
    let message = `*Comprovante de Pagamento*\n`;
    message += `Cliente: ${customerName}\n`;
    if (customerCPF !== '---') {
      message += `CPF: ${customerCPF}\n`;
    }
    if (customerWhatsApp !== '---') {
      message += `WhatsApp: ${customerWhatsApp}\n`;
    }
    message += `Sacola: #${bag.bag_number}\n\n`;
    message += `Valor Total: R$ ${bag.total_value.toFixed(2)}\n`;
    message += `Valor Pago: *R$ ${(bag.received_amount || 0).toFixed(2)}*\n`;
    
    const debt = bag.total_value - (bag.received_amount || 0);
    if (debt > 0) {
      message += `Saldo Devedor: R$ ${debt.toFixed(2)}\n`;
    } else {
      message += `*Dívida Totalmente Quitada!* 🎉\n`;
    }
    
    message += `\nObrigado pela preferência!`;
    message += `\n\n__________________________\nAssinatura: ${customerName}\nCPF: ${customerCPF}${customerWhatsApp !== '---' ? `\nWhatsApp: ${customerWhatsApp}` : ''}`;

    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');
  };

  const handleReverseSale = async (bag: any) => {
    setConfirmModal({
      isOpen: true,
      title: 'Extornar Venda',
      message: `Deseja realmente extornar a venda da sacola #${bag.bag_number}? A sacola voltará para o status "Aberta" e o pagamento será zerado.`,
      variant: 'warning',
      onConfirm: async () => {
        try {
          const { data: items } = await supabase
            .from('bag_items')
            .select('*, product:products(id, current_stock, has_grid, grid_data)')
            .eq('bag_id', bag.id);
          
          if (items) {
            for (const item of items) {
              if (item.returned_quantity > 0) {
                const product = item.product as any;
                if (product) {
                  let updateData: any = {
                    current_stock: Math.max(0, Number(product.current_stock || 0) - item.returned_quantity)
                  };

                  if (product.has_grid && product.grid_data && item.color && item.size) {
                    const newGridData = product.grid_data.map((g: any) => {
                      if (g.color === item.color && g.size === item.size) {
                        return { ...g, quantity: Math.max(0, (g.quantity || 0) - item.returned_quantity) };
                      }
                      return g;
                    });
                    updateData.grid_data = newGridData;
                  }

                  await supabase.from('products').update(updateData).eq('id', product.id);
                }
              }
            }
          }

          const { error } = await supabase.from('bags').update({
            status: 'open',
            payment_status: 'pending',
            received_amount: 0,
            closed_at: null
          }).eq('id', bag.id);

          if (error) throw error;

          addNotification({
            type: 'success',
            title: 'Venda extornada',
            message: `A sacola #${bag.bag_number} foi reaberta.`
          });
          
          const { data: { session } } = await supabase.auth.getSession();
          if (session) await fetchReportsData(session.user.id);
        } catch (err) {
          console.error('Error reversing sale:', err);
          addNotification({
            type: 'error',
            title: 'Erro ao extornar',
            message: formatError(err)
          });
        } finally {
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const stats = useMemo(() => {
    const income = transactions
      .filter(t => t.type === 'income')
      .reduce((acc, t) => acc + t.amount, 0);
    const expenses = transactions
      .filter(t => t.type === 'expense' && t.status !== 'pending')
      .reduce((acc, t) => acc + t.amount, 0);
    const pendingExpenses = transactions
      .filter(t => t.type === 'expense' && t.status === 'pending')
      .reduce((acc, t) => acc + t.amount, 0);
    return {
      income,
      expenses,
      pendingExpenses,
      balance: income - expenses
    };
  }, [transactions]);

  const chartData = useMemo(() => {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return d.toISOString().split('T')[0];
    }).reverse();

    return last7Days.map(date => {
      const dayTransactions = transactions.filter(t => t.date === date);
      return {
        date: new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
        income: dayTransactions.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0),
        expense: dayTransactions.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0)
      };
    });
  }, [transactions]);

  const categoryData = useMemo(() => {
    const categories: Record<string, number> = {};
    transactions
      .filter(t => t.type === 'expense')
      .forEach(t => {
        categories[t.category] = (categories[t.category] || 0) + t.amount;
      });
    
    return Object.entries(categories).map(([name, value]) => ({ name, value }));
  }, [transactions]);

  const filteredTransactions = transactions
    .filter(t => {
      const matchesType = 
        filterType === 'all' ? true : 
        filterType === 'income' ? t.type === 'income' : 
        filterType === 'expense' ? t.type === 'expense' :
        filterType === 'pending' ? t.status === 'pending' : true;
      
      const matchesSearch = t.description.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           t.category.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesType && matchesSearch;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const checkReminders = (data: Transaction[]) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const tomorrowDate = new Date();
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrowStr = tomorrowDate.toISOString().split('T')[0];

    const dueToday: Transaction[] = [];

    data.forEach(t => {
      if (t.type === 'expense' && t.status === 'pending' && t.due_date && t.reminder_enabled) {
        // Check if due today
        if (t.due_date === todayStr) {
          dueToday.push(t);
          addNotification({
            type: 'warning',
            title: 'Vencimento Hoje',
            message: `A conta "${t.description}" vence hoje! Valor: R$ ${t.amount.toLocaleString('pt-BR')}`
          });
        }
        // Check if due tomorrow
        else if (t.due_date === tomorrowStr) {
          addNotification({
            type: 'info',
            title: 'Vencimento Amanhã',
            message: `A conta "${t.description}" vence amanhã. Valor: R$ ${t.amount.toLocaleString('pt-BR')}`
          });
        }
      }
    });

    if (dueToday.length > 0) {
      setDueReminders(dueToday);
      setIsDueModalOpen(true);
    }
  };

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTransaction.description || !newTransaction.amount) return;

    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
      if (!user) throw new Error('Usuário não autenticado');

      const transactionData = {
        user_id: user.id,
        description: newTransaction.description as string,
        amount: parseMoney(newTransaction.amount.toString()),
        type: newTransaction.type as 'income' | 'expense',
        category: newTransaction.category as string,
        date: newTransaction.date as string,
        due_date: newTransaction.status === 'pending' ? newTransaction.due_date : null,
        reminder_enabled: newTransaction.reminder_enabled || false,
        status: newTransaction.status || 'paid'
      };

      const { data, error } = await supabase
        .from('financial_transactions')
        .insert([transactionData])
        .select()
        .single();

      if (error) throw error;

      setTransactions([data, ...transactions]);
      
      // Check for reminders if it's a pending expense
      if (data.type === 'expense' && data.status === 'pending' && data.due_date && data.reminder_enabled) {
        const todayStr = new Date().toISOString().split('T')[0];
        const tomorrowDate = new Date();
        tomorrowDate.setDate(tomorrowDate.getDate() + 1);
        const tomorrowStr = tomorrowDate.toISOString().split('T')[0];

        if (data.due_date === todayStr) {
          setDueReminders(prev => [data, ...prev]);
          setIsDueModalOpen(true);
          addNotification({
            type: 'warning',
            title: 'Vencimento Hoje',
            message: `A conta "${data.description}" vence hoje! Valor: R$ ${data.amount.toLocaleString('pt-BR')}`
          });
        } else if (data.due_date === tomorrowStr) {
          addNotification({
            type: 'info',
            title: 'Vencimento Amanhã',
            message: `A conta "${data.description}" vence amanhã. Valor: R$ ${data.amount.toLocaleString('pt-BR')}`
          });
        }
      }

      setIsModalOpen(false);
      setNewTransaction({
        type: 'expense',
        date: new Date().toISOString().split('T')[0],
        category: categories.expense[0],
        status: 'paid',
        reminder_enabled: false,
        amount: '0,00'
      });
      
      // Also save categories to Supabase if they changed (added new one)
      await supabase
        .from('financial_categories')
        .upsert({
          user_id: user.id,
          categories: categories,
          updated_at: new Date().toISOString()
        });

    } catch (err: any) {
      console.error('Error adding transaction:', err);
      addNotification({
        type: 'error',
        title: 'Erro ao salvar',
        message: formatError(err)
      });
    } finally {
      setSaving(false);
    }
  };

  const markAsPaid = async (id: string) => {
    try {
      const { data, error } = await supabase
        .from('financial_transactions')
        .update({ status: 'paid', date: new Date().toISOString().split('T')[0] })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      setTransactions(transactions.map(t => t.id === id ? data : t));
      addNotification({
        type: 'success',
        title: 'Pagamento Confirmado',
        message: 'A conta foi marcada como paga e o saldo atualizado.'
      });
    } catch (err: any) {
      console.error('Error marking as paid:', err);
      addNotification({
        type: 'error',
        title: 'Erro ao atualizar',
        message: formatError(err)
      });
    }
  };

  const removeTransaction = async (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Excluir Lançamento',
      message: 'Deseja realmente excluir este lançamento? Esta ação não pode ser desfeita.',
      variant: 'danger',
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from('financial_transactions')
            .delete()
            .eq('id', id);

          if (error) throw error;

          setTransactions(transactions.filter(t => t.id !== id));
          addNotification({
            type: 'success',
            title: 'Lançamento excluído',
            message: 'O lançamento foi removido com sucesso.'
          });
        } catch (err: any) {
          console.error('Error removing transaction:', err);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 text-[#38a89d] animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-20 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-8 rounded-[32px] border border-zinc-100 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-[#4a1d33]/10 rounded-2xl flex items-center justify-center">
            <Wallet className="w-7 h-7 text-[#4a1d33]" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-zinc-800 tracking-tight">Controle Financeiro</h2>
            <p className="text-sm text-zinc-500">Gestão profissional do seu fluxo de caixa.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-[#38a89d] text-white px-6 py-3 rounded-2xl font-bold hover:bg-[#2d8a81] transition-all shadow-lg shadow-[#38a89d]/20"
          >
            <Plus className="w-5 h-5" />
            Novo Lançamento
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Saldo Geral" 
          value={stats.balance} 
          icon={Wallet} 
          color="indigo" 
          trend={stats.balance >= 0 ? 'up' : 'down'}
        />
        <StatCard 
          title="Total Receitas" 
          value={stats.income} 
          icon={ArrowUpRight} 
          color="emerald" 
          trend="up"
        />
        <StatCard 
          title="Total Despesas" 
          value={stats.expenses} 
          icon={ArrowDownRight} 
          color="rose" 
          trend="down"
        />
        <StatCard 
          title="Contas a Pagar" 
          value={stats.pendingExpenses} 
          icon={Calendar} 
          color="amber" 
          trend="none"
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white p-8 rounded-[32px] border border-zinc-100 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-[#38a89d]" />
              <h3 className="font-bold text-zinc-800 uppercase tracking-wider text-xs">Fluxo de Caixa (7 dias)</h3>
            </div>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#38a89d" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#38a89d" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickFormatter={(value) => `R$ ${value}`}
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number) => [`R$ ${value.toFixed(2)}`, '']}
                />
                <Area 
                  type="monotone" 
                  dataKey="income" 
                  stroke="#38a89d" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorIncome)" 
                />
                <Area 
                  type="monotone" 
                  dataKey="expense" 
                  stroke="#ef4444" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorExpense)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-8 rounded-[32px] border border-zinc-100 shadow-sm space-y-6">
          <div className="flex items-center gap-3">
            <PieChartIcon className="w-5 h-5 text-[#4a1d33]" />
            <h3 className="font-bold text-zinc-800 uppercase tracking-wider text-xs">Despesas por Categoria</h3>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number) => `R$ ${value.toFixed(2)}`}
                />
                <Legend 
                  verticalAlign="bottom" 
                  height={36}
                  iconType="circle"
                  formatter={(value) => <span className="text-[10px] font-bold text-zinc-500 uppercase">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Transactions List */}
      <div className="bg-white rounded-[32px] border border-zinc-100 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-zinc-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BarChart3 className="w-5 h-5 text-zinc-400" />
            <h3 className="font-bold text-zinc-800 uppercase tracking-wider text-xs">Lançamentos Recentes</h3>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text"
                placeholder="Buscar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 bg-zinc-50 border border-zinc-100 rounded-xl text-sm focus:ring-2 focus:ring-[#38a89d]/10 focus:border-[#38a89d] outline-none transition-all w-full md:w-64"
              />
            </div>
            <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-xl">
              <FilterButton active={filterType === 'all'} onClick={() => setFilterType('all')} label="Todos" />
              <FilterButton active={filterType === 'income'} onClick={() => setFilterType('income')} label="Receitas" />
              <FilterButton active={filterType === 'expense'} onClick={() => setFilterType('expense')} label="Despesas" />
              <FilterButton active={filterType === 'pending'} onClick={() => setFilterType('pending')} label="Pendentes" />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50/50">
                <th className="px-8 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Data</th>
                <th className="px-8 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Descrição</th>
                <th className="px-8 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Categoria</th>
                <th className="px-8 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right">Vencimento</th>
                <th className="px-8 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right">Valor</th>
                <th className="px-8 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {filteredTransactions.map((t) => (
                <tr key={t.id} className="hover:bg-zinc-50/50 transition-colors group">
                  <td className="px-8 py-4">
                    <span className="text-xs font-bold text-zinc-400">
                      {new Date(t.date).toLocaleDateString('pt-BR')}
                    </span>
                  </td>
                  <td className="px-8 py-4">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center",
                        t.type === 'income' ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                      )}>
                        {t.type === 'income' ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                      </div>
                      <div>
                        <span className="text-sm font-bold text-zinc-700 block">{t.description}</span>
                        {t.status === 'pending' && (
                          <span className="text-[10px] font-bold text-amber-600 uppercase">Pendente</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-4">
                    <div className="flex items-center gap-2">
                      <Tag className="w-3 h-3 text-zinc-300" />
                      <span className="text-xs font-semibold text-zinc-500">{t.category}</span>
                    </div>
                  </td>
                  <td className="px-8 py-4 text-right">
                    {t.due_date ? (
                      <div className="flex flex-col items-end">
                        <span className="text-xs font-bold text-zinc-500">
                          {new Date(t.due_date).toLocaleDateString('pt-BR')}
                        </span>
                        {t.reminder_enabled && (
                          <Calendar className="w-3 h-3 text-[#38a89d]" />
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-zinc-300">-</span>
                    )}
                  </td>
                  <td className="px-8 py-4 text-right">
                    <span className={cn(
                      "text-sm font-bold",
                      t.type === 'income' ? "text-emerald-600" : "text-rose-600"
                    )}>
                      {t.type === 'income' ? '+' : '-'} R$ {t.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </td>
                  <td className="px-8 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {t.status === 'pending' && (
                        <button 
                          onClick={() => markAsPaid(t.id)}
                          className="p-2 hover:bg-emerald-50 text-emerald-600 rounded-lg opacity-0 group-hover:opacity-100 transition-all flex items-center gap-1"
                          title="Marcar como Pago"
                        >
                          <DollarSign className="w-4 h-4" />
                          <span className="text-[10px] font-bold uppercase">Pagar</span>
                        </button>
                      )}
                      <button 
                        onClick={() => removeTransaction(t.id)}
                        className="p-2 hover:bg-red-50 text-red-500 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredTransactions.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-8 py-12 text-center text-zinc-400 italic text-sm">
                    Nenhum lançamento encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <MiscellaneousChargeManager profile={profile} />

      {/* Reports Tables Section */}
      <div className="space-y-8 mt-8">
        {/* Delinquency Table */}
        <div className="bg-white border border-zinc-200 rounded-[32px] overflow-hidden shadow-sm">
          <div className="p-4 sm:p-8 border-b border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h3 className="text-lg font-bold text-zinc-800 text-center sm:text-left">Lista de Inadimplência (Cobrança)</h3>
            <span className="bg-red-50 text-red-600 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest w-fit mx-auto sm:mx-0">
              {delinquents.length} Pendentes
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-50/50">
                  <th className="px-8 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Cliente</th>
                  <th className="px-8 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Campanha</th>
                  <th className="px-8 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Sacola</th>
                  <th className="px-8 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Total</th>
                  <th className="px-8 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Pago</th>
                  <th className="px-8 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Dívida</th>
                  <th className="px-8 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {loadingReports ? (
                  <tr>
                    <td colSpan={7} className="px-8 py-12 text-center">
                      <Loader2 className="w-6 h-6 text-[#38a89d] animate-spin mx-auto" />
                    </td>
                  </tr>
                ) : delinquents.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-8 py-20 text-center text-zinc-400 italic">
                      Nenhuma inadimplência registrada.
                    </td>
                  </tr>
                ) : (
                  delinquents.map(bag => (
                    <tr key={bag.id} className="hover:bg-zinc-50/50 transition-colors">
                      <td className="px-8 py-4 font-bold text-zinc-800 text-sm">{bag.customer?.nome}</td>
                      <td className="px-8 py-4 text-zinc-500 text-sm">{(bag as any).campaign?.name || '---'}</td>
                      <td className="px-8 py-4 text-zinc-500 text-sm">#{bag.bag_number}</td>
                      <td className="px-8 py-4 font-bold text-zinc-800 text-sm">R$ {bag.total_value.toFixed(2)}</td>
                      <td className="px-8 py-4 text-emerald-600 text-sm font-bold">R$ {(bag.received_amount || 0).toFixed(2)}</td>
                      <td className="px-8 py-4 text-red-600 text-sm font-bold">R$ {Math.max(0, bag.total_value - (bag.received_amount || 0)).toFixed(2)}</td>
                      <td className="px-8 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={() => setSelectedBagForPayment(bag)}
                            className="p-2 hover:bg-emerald-50 text-emerald-600 rounded-lg transition-colors"
                            title="Receber Pagamento"
                          >
                            <DollarSign className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleShareReceipt(bag)}
                            className="p-2 hover:bg-blue-50 text-blue-500 rounded-lg transition-colors"
                            title="Compartilhar Comprovante"
                          >
                            <Receipt className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleWhatsAppShare(bag)}
                            className="p-2 hover:bg-emerald-50 text-emerald-500 rounded-lg transition-colors"
                            title="Compartilhar Resumo WhatsApp"
                          >
                            <Megaphone className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Finalized Sales Table */}
        <div className="bg-white border border-zinc-200 rounded-[32px] overflow-hidden shadow-sm">
          <div className="p-4 sm:p-8 border-b border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h3 className="text-lg font-bold text-zinc-800 text-center sm:text-left">Vendas Finalizadas</h3>
            <span className="bg-emerald-50 text-emerald-600 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest w-fit mx-auto sm:mx-0">
              {finalizedSales.length} Sacolas
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-50/50">
                  <th className="px-8 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Data</th>
                  <th className="px-8 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Cliente</th>
                  <th className="px-8 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Total</th>
                  <th className="px-8 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {loadingReports ? (
                  <tr>
                    <td colSpan={4} className="px-8 py-12 text-center text-zinc-400 italic">
                      <Loader2 className="w-6 h-6 text-[#38a89d] animate-spin mx-auto" />
                    </td>
                  </tr>
                ) : finalizedSales.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-8 py-20 text-center text-zinc-400 italic">
                      Nenhuma venda finalizada registrada.
                    </td>
                  </tr>
                ) : (
                  finalizedSales.map(bag => (
                    <tr key={bag.id} className="hover:bg-zinc-50/50 transition-colors">
                      <td className="px-8 py-4 text-zinc-500 text-sm">
                        {format(new Date(bag.created_at), "dd/MM/yyyy")}
                      </td>
                      <td className="px-8 py-4 font-bold text-zinc-800 text-sm">{bag.customer?.nome}</td>
                      <td className="px-8 py-4 font-bold text-zinc-800 text-sm">R$ {bag.total_value.toFixed(2)}</td>
                      <td className="px-8 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={() => handleWhatsAppShare(bag)}
                            className="p-2 hover:bg-emerald-50 text-emerald-500 rounded-lg transition-colors"
                            title="Compartilhar WhatsApp"
                          >
                            <Megaphone className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleReverseSale(bag)}
                            className="p-2 hover:bg-red-50 text-red-400 rounded-lg transition-colors"
                            title="Extornar Venda"
                          >
                            <RefreshCcw className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Payment Modal moved from Reports */}
      {selectedBagForPayment && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-[32px] w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-8 space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-zinc-800">Receber Pagamento</h3>
                    <p className="text-xs text-zinc-500">Sacola #{selectedBagForPayment.bag_number}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedBagForPayment(null)}
                  className="p-2 hover:bg-zinc-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>

              <div className="bg-zinc-50 rounded-2xl p-6 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Total da Sacola</span>
                  <span className="font-bold text-zinc-800">R$ {selectedBagForPayment.total_value.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Já Recebido</span>
                  <span className="font-bold text-emerald-600">R$ {(selectedBagForPayment.received_amount || 0).toFixed(2)}</span>
                </div>
                <div className="pt-3 border-t border-zinc-200 flex justify-between items-center">
                  <span className="text-sm font-bold text-zinc-800">Saldo Devedor</span>
                  <span className="text-xl font-black text-red-600">
                    R$ {Math.max(0, selectedBagForPayment.total_value - (selectedBagForPayment.received_amount || 0)).toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Valor a Receber (R$)</label>
                <input 
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={paymentAmount}
                  onChange={(e) => {
                    const val = e.target.value.replace(',', '.');
                    if (val === '' || /^\d*\.?\d*$/.test(val)) {
                      setPaymentAmount(val);
                    }
                  }}
                  className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-4 text-2xl font-black text-zinc-800 focus:outline-none focus:border-emerald-500 transition-all"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button 
                    onClick={() => setPaymentAmount(Math.max(0, selectedBagForPayment.total_value - (selectedBagForPayment.received_amount || 0)).toString())}
                    className="text-[10px] font-bold text-emerald-600 hover:bg-emerald-50 px-2 py-1 rounded-lg transition-colors"
                  >
                    Receber Valor Total
                  </button>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  onClick={() => setSelectedBagForPayment(null)}
                  className="flex-1 px-6 py-4 rounded-2xl font-bold text-zinc-500 hover:bg-zinc-50 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleReceivePayment}
                  disabled={isProcessingPayment || !paymentAmount}
                  className="flex-[2] bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-4 rounded-2xl font-bold transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isProcessingPayment ? <Loader2 className="w-5 h-5 animate-spin" /> : <Share2 className="w-5 h-5" />}
                  Confirmar e Compartilhar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Transaction Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-lg rounded-[32px] shadow-2xl overflow-hidden"
            >
              <div className="p-8 border-b border-zinc-100">
                <h3 className="text-xl font-bold text-zinc-800">Novo Lançamento</h3>
                <p className="text-sm text-zinc-500">Registre uma nova movimentação financeira.</p>
              </div>
              
              <form onSubmit={handleAddTransaction} className="p-8 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <button 
                    type="button"
                    onClick={() => {
                      const type = 'income';
                      setNewTransaction({ ...newTransaction, type, category: categories[type][0] });
                    }}
                    className={cn(
                      "flex items-center justify-center gap-2 p-4 rounded-2xl border-2 transition-all font-bold text-sm",
                      newTransaction.type === 'income' 
                        ? "bg-emerald-50 border-emerald-500 text-emerald-700" 
                        : "bg-zinc-50 border-zinc-100 text-zinc-400 hover:border-zinc-200"
                    )}
                  >
                    <ArrowUpRight className="w-4 h-4" />
                    Receita
                  </button>
                  <button 
                    type="button"
                    onClick={() => {
                      const type = 'expense';
                      setNewTransaction({ ...newTransaction, type, category: categories[type][0] });
                    }}
                    className={cn(
                      "flex items-center justify-center gap-2 p-4 rounded-2xl border-2 transition-all font-bold text-sm",
                      newTransaction.type === 'expense' 
                        ? "bg-rose-50 border-rose-500 text-rose-700" 
                        : "bg-zinc-50 border-zinc-100 text-zinc-400 hover:border-zinc-200"
                    )}
                  >
                    <ArrowDownRight className="w-4 h-4" />
                    Despesa
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Descrição</label>
                    <input 
                      required
                      type="text"
                      value={newTransaction.description || ''}
                      maxLength={150}
                      onChange={(e) => setNewTransaction({ ...newTransaction, description: e.target.value })}
                      placeholder="Ex: Venda de Produto X"
                      className="w-full bg-zinc-50 border border-zinc-100 rounded-xl p-4 text-sm focus:ring-2 focus:ring-[#38a89d]/10 focus:border-[#38a89d] outline-none transition-all"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Valor (R$)</label>
                      <p className="text-[10px] text-zinc-400 font-medium ml-1 mb-1">Valor da Despesa</p>
                      <input 
                        required
                        type="text"
                        inputMode="numeric"
                        value={newTransaction.amount}
                        maxLength={15}
                        onChange={(e) => setNewTransaction({ ...newTransaction, amount: formatMoneyInput(e.target.value) })}
                        placeholder="0,00"
                        className="w-full bg-zinc-50 border border-zinc-100 rounded-xl p-4 text-sm focus:ring-2 focus:ring-[#38a89d]/10 focus:border-[#38a89d] outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Data do Lançamento</label>
                      <input 
                        required
                        type="date"
                        value={newTransaction.date || ''}
                        onChange={(e) => setNewTransaction({ ...newTransaction, date: e.target.value })}
                        className="w-full bg-zinc-50 border border-zinc-100 rounded-xl p-4 text-sm focus:ring-2 focus:ring-[#38a89d]/10 focus:border-[#38a89d] outline-none transition-all"
                      />
                    </div>
                  </div>

                  {newTransaction.type === 'expense' && (
                    <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100 space-y-4">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-zinc-700">Conta a Pagar?</label>
                        <button 
                          type="button"
                          onClick={() => setNewTransaction({ 
                            ...newTransaction, 
                            status: newTransaction.status === 'pending' ? 'paid' : 'pending',
                            due_date: newTransaction.status === 'pending' ? undefined : newTransaction.date
                          })}
                          className={cn(
                            "w-12 h-6 rounded-full transition-all relative",
                            newTransaction.status === 'pending' ? "bg-[#38a89d]" : "bg-zinc-300"
                          )}
                        >
                          <div className={cn(
                            "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                            newTransaction.status === 'pending' ? "right-1" : "left-1"
                          )} />
                        </button>
                      </div>

                      {newTransaction.status === 'pending' && (
                        <motion.div 
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="space-y-4 pt-2 border-t border-zinc-200"
                        >
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Data de Vencimento</label>
                            <input 
                              required
                              type="date"
                              value={newTransaction.due_date || ''}
                              onChange={(e) => setNewTransaction({ ...newTransaction, due_date: e.target.value })}
                              className="w-full bg-white border border-zinc-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-[#38a89d]/10 focus:border-[#38a89d] outline-none transition-all"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <input 
                              type="checkbox"
                              id="reminder"
                              checked={newTransaction.reminder_enabled}
                              onChange={(e) => setNewTransaction({ ...newTransaction, reminder_enabled: e.target.checked })}
                              className="w-4 h-4 rounded border-zinc-300 text-[#38a89d] focus:ring-[#38a89d]"
                            />
                            <label htmlFor="reminder" className="text-xs font-medium text-zinc-600">Criar lembrete de vencimento</label>
                          </div>
                        </motion.div>
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="flex items-center justify-between ml-1">
                      <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Categoria</label>
                      <button 
                        type="button"
                        onClick={() => setIsAddingCategory(!isAddingCategory)}
                        className="text-[10px] font-bold text-[#38a89d] uppercase tracking-widest hover:underline"
                      >
                        {isAddingCategory ? 'Cancelar' : '+ Nova Categoria'}
                      </button>
                    </div>
                    
                    {isAddingCategory ? (
                      <div className="flex gap-2">
                <input 
                  autoFocus
                  type="text"
                  value={newCategoryName}
                  maxLength={50}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="Nome da categoria..."
                  className="flex-1 bg-zinc-50 border border-zinc-100 rounded-xl p-4 text-sm focus:ring-2 focus:ring-[#38a89d]/10 focus:border-[#38a89d] outline-none transition-all"
                  onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddCategory();
                            }
                          }}
                        />
                        <button 
                          type="button"
                          onClick={handleAddCategory}
                          className="bg-[#38a89d] text-white px-4 rounded-xl font-bold hover:bg-[#2d8a81] transition-all"
                        >
                          Add
                        </button>
                      </div>
                    ) : (
                      <select 
                        value={newTransaction.category}
                        onChange={(e) => setNewTransaction({ ...newTransaction, category: e.target.value })}
                        className="w-full bg-zinc-50 border border-zinc-100 rounded-xl p-4 text-sm focus:ring-2 focus:ring-[#38a89d]/10 focus:border-[#38a89d] outline-none transition-all"
                      >
                        {categories[newTransaction.type as keyof CategoryState].map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-6 py-4 rounded-2xl font-bold text-zinc-500 hover:bg-zinc-50 transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    disabled={saving}
                    className="flex-1 bg-zinc-900 text-white px-6 py-4 rounded-2xl font-bold hover:bg-zinc-800 transition-all shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                    Confirmar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Due Date Reminder Modal */}
      <AnimatePresence>
        {isDueModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-white w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden p-8 text-center space-y-6"
            >
              <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mx-auto">
                <Calendar className="w-10 h-10 text-amber-500" />
              </div>
              
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-zinc-800">Contas a Vencer Hoje</h3>
                <p className="text-sm text-zinc-500">Você possui pagamentos agendados para hoje.</p>
              </div>

              <div className="bg-zinc-50 rounded-2xl p-4 space-y-3 text-left max-h-[200px] overflow-y-auto">
                {dueReminders.map(t => (
                  <div key={t.id} className="flex items-center justify-between p-3 bg-white rounded-xl border border-zinc-100">
                    <div>
                      <p className="text-sm font-bold text-zinc-700">{t.description}</p>
                      <p className="text-[10px] text-zinc-400 uppercase font-bold">{t.category}</p>
                    </div>
                    <p className="text-sm font-bold text-rose-600">R$ {t.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  </div>
                ))}
              </div>

              <button 
                onClick={() => setIsDueModalOpen(false)}
                className="w-full bg-zinc-900 text-white py-4 rounded-2xl font-bold hover:bg-zinc-800 transition-all shadow-lg"
              >
                Estou Ciente
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal */}
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

function StatCard({ title, value, icon: Icon, color, trend }: any) {
  const colors: any = {
    indigo: "bg-indigo-50 text-indigo-600",
    emerald: "bg-emerald-50 text-emerald-600",
    rose: "bg-rose-50 text-rose-600",
    amber: "bg-amber-50 text-amber-600"
  };

  return (
    <div className="bg-white p-8 rounded-[32px] border border-zinc-100 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center", colors[color])}>
          <Icon className="w-6 h-6" />
        </div>
        {trend !== 'none' && (
          <div className={cn(
            "px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider",
            trend === 'up' ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
          )}>
            {trend === 'up' ? '+12%' : '-5%'}
          </div>
        )}
      </div>
      <div>
        <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{title}</h4>
        <p className="text-2xl font-bold text-zinc-800 mt-1">
          R$ {value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
        </p>
      </div>
    </div>
  );
}

function FilterButton({ active, onClick, label }: { active: boolean, onClick: () => void, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all",
        active ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
      )}
    >
      {label}
    </button>
  );
}
