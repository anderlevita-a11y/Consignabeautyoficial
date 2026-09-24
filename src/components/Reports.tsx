import React, { useEffect, useState } from 'react';
import { 
  Package, 
  TrendingUp, 
  ShoppingBag, 
  DollarSign,
  Calendar,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  RefreshCcw,
  Loader2
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { cn, formatError } from '../lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNotifications } from './NotificationCenter';
import { ConfirmationModal } from './ConfirmationModal';

export function Reports() {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'week' | 'month' | 'all'>('month');
  const [stats, setStats] = useState({
    totalStock: 0,
    warehouseStock: 0,
    consignedStock: 0,
    stockValue: 0,
    soldValue: 0,
    consignedValue: 0,
    receivedValue: 0,
    topProducts: [] as { name: string, quantity: number, total: number }[],
    stockDetails: [] as { name: string, stock: number, value: number }[]
  });
  const { addNotification } = useNotifications();
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

  useEffect(() => {
    fetchData();
  }, [period]);

  async function fetchData() {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
      if (!user) return;

      // 1. Stock Stats
      const { data: products } = await supabase
        .from('products')
        .select('id, name, current_stock, cost_price, sale_price')
        .eq('user_id', user.id)
        .limit(30000);
      
      // Fetch consigned items from open bags
      const { data: openBagsForStock } = await supabase
        .from('bags')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'open')
        .limit(30000);
      
      const openBagIdsForStock = openBagsForStock?.map(b => b.id) || [];
      const consignedMap = new Map<string, number>();

      if (openBagIdsForStock.length > 0) {
        // Process in chunks of 500 bag IDs to avoid URL length limits
        for (let i = 0; i < openBagIdsForStock.length; i += 500) {
          const chunk = openBagIdsForStock.slice(i, i + 500);
          const { data: bagItems } = await supabase
            .from('bag_items')
            .select('product_id, quantity')
            .in('bag_id', chunk)
            .limit(30000);
          
          if (bagItems) {
            bagItems.forEach(item => {
              const current = consignedMap.get(item.product_id) || 0;
              consignedMap.set(item.product_id, current + (item.quantity || 0));
            });
          }
        }
      }

      const warehouseStock = products?.reduce((acc, p) => acc + Number(p.current_stock || 0), 0) || 0;
      const consignedStock = Array.from(consignedMap.values()).reduce((acc, qty) => acc + qty, 0);
      const totalStock = warehouseStock + consignedStock;

      const stockValue = products?.reduce((acc, p) => {
        const consigned = consignedMap.get(p.id) || 0;
        const currentStock = Number(p.current_stock || 0);
        const totalQty = currentStock + consigned;
        return acc + (totalQty * Number(p.sale_price || 0));
      }, 0) || 0;

      const stockDetails = products?.map(p => {
        const consigned = consignedMap.get(p.id) || 0;
        const currentStock = Number(p.current_stock || 0);
        const totalQty = currentStock + consigned;
        return {
          name: (p as any).name || 'Sem nome',
          stock: totalQty,
          value: totalQty * Number(p.sale_price || 0)
        };
      }).filter(p => p.stock > 0).sort((a, b) => b.value - a.value) || [];

      // 2. Consigned Value (Open Bags)
      const { data: openBags } = await supabase
        .from('bags')
        .select('total_value')
        .eq('user_id', user.id)
        .eq('status', 'open')
        .limit(30000);
      
      const consignedValue = openBags?.reduce((acc, b) => acc + (b.total_value || 0), 0) || 0;

      // 3. Sold and Received Value (Closed Bags)
      let startDate: string | null = null;
      if (period === 'week') {
        const date = new Date();
        date.setDate(date.getDate() - 7);
        startDate = date.toISOString();
      } else if (period === 'month') {
        const date = new Date();
        date.setMonth(date.getMonth() - 1);
        startDate = date.toISOString();
      }

      let closedBagsQuery = supabase
        .from('bags')
        .select('*, customer:customers(nome)')
        .eq('user_id', user.id)
        .eq('status', 'closed')
        .order('created_at', { ascending: false })
        .limit(30000);

      if (startDate) {
        closedBagsQuery = closedBagsQuery.gte('created_at', startDate);
      }

      const { data: closedBags } = await closedBagsQuery;

      const soldValue = closedBags?.reduce((acc, b) => acc + (b.total_value || 0), 0) || 0;
      const receivedValue = closedBags?.reduce((acc, b) => acc + (b.received_amount || 0), 0) || 0;

      // 3.1 Top Selling Products
      const closedBagIds = closedBags?.map(b => b.id) || [];
      let topProducts: { name: string, quantity: number, total: number }[] = [];

      if (closedBagIds.length > 0) {
        // Process in chunks of 500 bag IDs to avoid URL length limits
        for (let i = 0; i < closedBagIds.length; i += 500) {
          const chunk = closedBagIds.slice(i, i + 500);
          const { data: items } = await supabase
            .from('bag_items')
            .select('product_name, quantity, returned_quantity, unit_price')
            .in('bag_id', chunk)
            .limit(30000);

          if (items) {
            const productMap = new Map<string, { quantity: number, total: number }>();
            items.forEach(item => {
              const sold = (item.quantity || 0) - (item.returned_quantity || 0);
              if (sold > 0) {
                const current = productMap.get(item.product_name) || { quantity: 0, total: 0 };
                productMap.set(item.product_name, {
                  quantity: current.quantity + sold,
                  total: current.total + (sold * (item.unit_price || 0))
                });
              }
            });

            const chunkTopProducts = Array.from(productMap.entries())
              .map(([name, stats]) => ({
                name,
                quantity: stats.quantity,
                total: stats.total
              }));
            
            // Merge with existing topProducts
            chunkTopProducts.forEach(ctp => {
              const existing = topProducts.find(tp => tp.name === ctp.name);
              if (existing) {
                existing.quantity += ctp.quantity;
                existing.total += ctp.total;
              } else {
                topProducts.push(ctp);
              }
            });
          }
        }
        topProducts.sort((a, b) => b.quantity - a.quantity).slice(0, 10);
      }

      setStats({
        totalStock,
        warehouseStock,
        consignedStock,
        stockValue,
        soldValue,
        consignedValue,
        receivedValue,
        topProducts,
        stockDetails
      });

    } catch (err) {
      console.error('Error fetching report data:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-zinc-800 tracking-tight">Relatórios Estratégicos</h2>
          <p className="text-sm text-zinc-500">Visão geral do seu negócio e gestão de cobrança.</p>
        </div>
        <div className="flex bg-white border border-zinc-200 p-1 rounded-xl shadow-sm self-start sm:self-auto">
          <button 
            onClick={() => setPeriod('week')}
            className={cn(
              "px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all",
              period === 'week' ? "bg-zinc-900 text-white" : "text-zinc-400 hover:text-zinc-600"
            )}
          >
            Semana
          </button>
          <button 
            onClick={() => setPeriod('month')}
            className={cn(
              "px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all",
              period === 'month' ? "bg-zinc-900 text-white" : "text-zinc-400 hover:text-zinc-600"
            )}
          >
            Mês
          </button>
          <button 
            onClick={() => setPeriod('all')}
            className={cn(
              "px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all",
              period === 'all' ? "bg-zinc-900 text-white" : "text-zinc-400 hover:text-zinc-600"
            )}
          >
            Tudo
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <ReportCard 
          title="Estoque Total"
          value={`${stats.totalStock} un.`}
          extraValue={`R$ ${stats.stockValue.toFixed(2)}`}
          subtitle={`Físico: ${stats.warehouseStock} | Consig: ${stats.consignedStock}`}
          icon={Package}
          color="blue"
        />
        <ReportCard 
          title="Valor Vendido"
          value={`R$ ${stats.soldValue.toFixed(2)}`}
          subtitle="No período selecionado"
          icon={TrendingUp}
          color="emerald"
        />
        <ReportCard 
          title="Em Consignado"
          value={`R$ ${stats.consignedValue.toFixed(2)}`}
          subtitle="Valor em sacolas abertas"
          icon={ShoppingBag}
          color="amber"
        />
        <ReportCard 
          title="Caixa Recebido"
          value={`R$ ${stats.receivedValue.toFixed(2)}`}
          subtitle="Total pago no período →"
          icon={DollarSign}
          color="indigo"
        />
      </div>

      {/* Tables Section */}
      <div className="space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Top Products Table */}
          <div className="bg-white border border-zinc-200 rounded-[32px] overflow-hidden shadow-sm">
            <div className="p-4 sm:p-8 border-b border-zinc-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-zinc-800">Top 10 Produtos Mais Vendidos</h3>
              <TrendingUp className="w-5 h-5 text-emerald-500" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-zinc-50/50">
                    <th className="px-8 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Produto</th>
                    <th className="px-8 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-center">Qtd.</th>
                    <th className="px-8 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {stats.topProducts.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-8 py-20 text-center text-zinc-400 italic">
                        Nenhuma venda registrada para o ranking.
                      </td>
                    </tr>
                  ) : (
                    stats.topProducts.map((p, i) => (
                      <tr key={i} className="hover:bg-zinc-50/50 transition-colors">
                        <td className="px-8 py-4 font-bold text-zinc-800 text-sm">
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-zinc-100 text-zinc-500 text-[10px] mr-3">
                            {i + 1}
                          </span>
                          {p.name}
                        </td>
                        <td className="px-8 py-4 text-center text-zinc-500 text-sm font-bold">{p.quantity}</td>
                        <td className="px-8 py-4 text-right font-bold text-emerald-600 text-sm">R$ {p.total.toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Stock Details Table */}
          <div className="bg-white border border-zinc-200 rounded-[32px] overflow-hidden shadow-sm">
            <div className="p-4 sm:p-8 border-b border-zinc-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-zinc-800">Produtos em Estoque (Físico + Consignado)</h3>
              <Package className="w-5 h-5 text-blue-500" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-zinc-50/50">
                    <th className="px-8 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Produto</th>
                    <th className="px-8 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-center">Qtd.</th>
                    <th className="px-8 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right">Valor Custo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {stats.stockDetails.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-8 py-20 text-center text-zinc-400 italic">
                        Nenhum produto em estoque.
                      </td>
                    </tr>
                  ) : (
                    stats.stockDetails.slice(0, 10).map((p, i) => (
                      <tr key={i} className="hover:bg-zinc-50/50 transition-colors">
                        <td className="px-8 py-4 font-bold text-zinc-800 text-sm">{p.name}</td>
                        <td className="px-8 py-4 text-center text-zinc-500 text-sm font-bold">{p.stock}</td>
                        <td className="px-8 py-4 text-right font-bold text-blue-600 text-sm">R$ {p.value.toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                  {stats.stockDetails.length > 10 && (
                    <tr>
                      <td colSpan={3} className="px-8 py-4 text-center text-xs text-zinc-400 bg-zinc-50">
                        Mostrando top 10 produtos por valor de estoque.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
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

function ReportCard({ title, value, subtitle, icon: Icon, color, extraValue }: any) {
  const colors: any = {
    blue: "bg-blue-50 text-blue-600",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    indigo: "bg-indigo-50 text-indigo-600"
  };

  return (
    <div className="bg-white border border-zinc-200 rounded-[32px] p-8 shadow-sm hover:shadow-md transition-all group">
      <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center mb-6 transition-transform group-hover:scale-110", colors[color])}>
        <Icon className="w-6 h-6" />
      </div>
      <div className="space-y-1">
        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{title}</p>
        <div className="flex flex-col">
          <h4 className={cn("text-3xl font-bold tracking-tight", color === 'emerald' ? "text-emerald-600" : color === 'amber' ? "text-amber-600" : color === 'indigo' ? "text-indigo-600" : "text-zinc-800")}>
            {value}
          </h4>
          {extraValue && (
            <p className={cn("text-lg font-bold mt-1", 
              color === 'blue' ? "text-blue-600" : 
              color === 'emerald' ? "text-emerald-600" : 
              color === 'amber' ? "text-amber-600" : 
              color === 'indigo' ? "text-indigo-600" : 
              "text-zinc-600"
            )}>
              {extraValue}
            </p>
          )}
        </div>
        <p className="text-xs text-zinc-400 font-medium">{subtitle}</p>
      </div>
    </div>
  );
}
