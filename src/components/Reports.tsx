import React, { useEffect, useState, useMemo } from 'react';
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
  Loader2,
  BarChart3,
  LineChart,
  Layers
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { cn, formatError, formatMoney } from '../lib/utils';
import { format, subDays, eachDayOfInterval, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNotifications } from './NotificationCenter';
import { ConfirmationModal } from './ConfirmationModal';
import { DailySalesChart, DailySalePoint } from './reports/DailySalesChart';
import { BagPerformanceChart, BagPerformanceData } from './reports/BagPerformanceChart';

export function Reports() {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'week' | 'month' | 'quarter' | 'all'>('month');
  const [visualTab, setVisualTab] = useState<'both' | 'sales' | 'bags'>('both');
  
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

  const [dailySales, setDailySales] = useState<DailySalePoint[]>([]);
  const [bagPerformances, setBagPerformances] = useState<BagPerformanceData[]>([]);

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
      
      // Fetch open bags for stock calculation and bag performance
      const { data: openBags } = await supabase
        .from('bags')
        .select('id, bag_number, status, total_value, received_amount, total_items, created_at, closed_at, customer:customers(nome)')
        .eq('user_id', user.id)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(30000);
      
      const openBagIdsForStock = openBags?.map(b => b.id) || [];
      const consignedMap = new Map<string, number>();

      if (openBagIdsForStock.length > 0) {
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
      const consignedValue = openBags?.reduce((acc, b) => acc + (Number(b.total_value) || 0), 0) || 0;

      // 3. Date filtering for Closed Bags
      const now = new Date();
      let startDate: Date | null = null;
      if (period === 'week') {
        startDate = subDays(now, 7);
      } else if (period === 'month') {
        startDate = subDays(now, 30);
      } else if (period === 'quarter') {
        startDate = subDays(now, 90);
      }

      let closedBagsQuery = supabase
        .from('bags')
        .select('id, bag_number, status, total_value, received_amount, total_items, created_at, closed_at, customer:customers(nome)')
        .eq('user_id', user.id)
        .eq('status', 'closed')
        .order('created_at', { ascending: false })
        .limit(30000);

      if (startDate) {
        closedBagsQuery = closedBagsQuery.gte('created_at', startDate.toISOString());
      }

      const { data: closedBags } = await closedBagsQuery;

      const soldValue = closedBags?.reduce((acc, b) => acc + (Number(b.total_value) || 0), 0) || 0;
      const receivedValue = closedBags?.reduce((acc, b) => acc + (Number(b.received_amount) || 0), 0) || 0;

      // 3.1 Fetch items of closed bags for ranking & conversion stats
      const closedBagIds = closedBags?.map(b => b.id) || [];
      const bagItemStatsMap = new Map<string, { totalItems: number; soldItems: number; returnedItems: number }>();
      let topProducts: { name: string, quantity: number, total: number }[] = [];

      if (closedBagIds.length > 0) {
        for (let i = 0; i < closedBagIds.length; i += 500) {
          const chunk = closedBagIds.slice(i, i + 500);
          const { data: items } = await supabase
            .from('bag_items')
            .select('bag_id, product_name, quantity, returned_quantity, unit_price')
            .in('bag_id', chunk)
            .limit(30000);

          if (items) {
            const productMap = new Map<string, { quantity: number, total: number }>();

            items.forEach(item => {
              const qty = Number(item.quantity || 0);
              const ret = Number(item.returned_quantity || 0);
              const sold = Math.max(0, qty - ret);

              // Bag stats
              const curBagStat = bagItemStatsMap.get(item.bag_id) || { totalItems: 0, soldItems: 0, returnedItems: 0 };
              curBagStat.totalItems += qty;
              curBagStat.returnedItems += ret;
              curBagStat.soldItems += sold;
              bagItemStatsMap.set(item.bag_id, curBagStat);

              // Top products map
              if (sold > 0) {
                const current = productMap.get(item.product_name) || { quantity: 0, total: 0 };
                productMap.set(item.product_name, {
                  quantity: current.quantity + sold,
                  total: current.total + (sold * Number(item.unit_price || 0))
                });
              }
            });

            const chunkTopProducts = Array.from(productMap.entries())
              .map(([name, pStats]) => ({
                name,
                quantity: pStats.quantity,
                total: pStats.total
              }));
            
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

      // 4. Construct Continuous Daily Sales Series for D3 Chart
      const dailyMap = new Map<string, { soldValue: number; receivedValue: number; bagsCount: number }>();

      // Pre-populate continuous timeline dates if a bounded period is chosen
      if (startDate) {
        try {
          const daysRange = eachDayOfInterval({ start: startDate, end: now });
          daysRange.forEach(day => {
            const dayKey = format(day, 'yyyy-MM-dd');
            dailyMap.set(dayKey, { soldValue: 0, receivedValue: 0, bagsCount: 0 });
          });
        } catch {}
      }

      // Populate closed bags into daily map
      closedBags?.forEach(b => {
        const dateStr = b.closed_at || b.created_at;
        if (!dateStr) return;
        const dayKey = dateStr.slice(0, 10);

        const current = dailyMap.get(dayKey) || { soldValue: 0, receivedValue: 0, bagsCount: 0 };
        current.soldValue += Number(b.total_value || 0);
        current.receivedValue += Number(b.received_amount || 0);
        current.bagsCount += 1;
        dailyMap.set(dayKey, current);
      });

      const parsedDailyPoints: DailySalePoint[] = Array.from(dailyMap.entries())
        .map(([date, dStats]) => ({
          date,
          soldValue: dStats.soldValue,
          receivedValue: dStats.receivedValue,
          bagsCount: dStats.bagsCount
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      setDailySales(parsedDailyPoints);

      // 5. Construct Bag Performance Dataset for D3 Chart
      const allBagsForPerf = [
        ...(closedBags || []),
        ...(openBags || [])
      ];

      const perfDataset: BagPerformanceData[] = allBagsForPerf.map(b => {
        const itemStat = bagItemStatsMap.get(b.id) || {
          totalItems: Number(b.total_items || 0),
          soldItems: 0,
          returnedItems: 0
        };

        const totalItems = itemStat.totalItems || Number(b.total_items || 0);
        const soldItems = b.status === 'closed' ? itemStat.soldItems : 0;
        const returnedItems = b.status === 'closed' ? itemStat.returnedItems : 0;
        const conversionRate = totalItems > 0 && b.status === 'closed'
          ? Math.min(100, Math.max(0, (soldItems / totalItems) * 100))
          : 0;

        const totalVal = Number(b.total_value || 0);
        const recAmount = Number(b.received_amount || 0);

        return {
          id: b.id,
          bagNumber: b.bag_number || `#${b.id.slice(0, 4)}`,
          customerName: (b.customer as any)?.nome || 'Sem cliente atribuído',
          status: b.status as 'open' | 'closed',
          totalValue: totalVal,
          receivedAmount: recAmount,
          pendingAmount: Math.max(0, totalVal - recAmount),
          totalItems,
          soldItems,
          returnedItems,
          conversionRate,
          date: b.closed_at || b.created_at
        };
      });

      setBagPerformances(perfDataset);

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
      addNotification({
        type: 'error',
        title: 'Erro ao carregar relatórios',
        message: 'Não foi possível carregar todas as métricas. Tente novamente.'
      });
    } finally {
      setLoading(false);
    }
  }

  const periodLabels = {
    week: 'Últimos 7 dias',
    month: 'Últimos 30 dias',
    quarter: 'Últimos 90 dias',
    all: 'Todo o histórico'
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      {/* Top Header & Period Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-zinc-800 dark:text-zinc-100 tracking-tight">
            Relatórios Estratégicos & Dashboard Visual
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Inteligência de vendas, evolução diária e análise comparativa de sacolas consignadas.
          </p>
        </div>

        {/* Period Selector Tabs */}
        <div className="flex bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-1 rounded-2xl shadow-sm self-start sm:self-auto">
          <button 
            onClick={() => setPeriod('week')}
            className={cn(
              "px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap",
              period === 'week' 
                ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-sm" 
                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
            )}
          >
            Semana
          </button>
          <button 
            onClick={() => setPeriod('month')}
            className={cn(
              "px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap",
              period === 'month' 
                ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-sm" 
                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
            )}
          >
            Mês
          </button>
          <button 
            onClick={() => setPeriod('quarter')}
            className={cn(
              "px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap",
              period === 'quarter' 
                ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-sm" 
                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
            )}
          >
            90 Dias
          </button>
          <button 
            onClick={() => setPeriod('all')}
            className={cn(
              "px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap",
              period === 'all' 
                ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-sm" 
                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
            )}
          >
            Tudo
          </button>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <ReportCard 
          title="Estoque Total"
          value={`${stats.totalStock} un.`}
          extraValue={formatMoney(stats.stockValue)}
          subtitle={`Físico: ${stats.warehouseStock} · Consig: ${stats.consignedStock}`}
          icon={Package}
          color="blue"
        />
        <ReportCard 
          title="Valor Vendido"
          value={formatMoney(stats.soldValue)}
          subtitle={periodLabels[period]}
          icon={TrendingUp}
          color="emerald"
        />
        <ReportCard 
          title="Em Consignado"
          value={formatMoney(stats.consignedValue)}
          subtitle="Valor em sacolas abertas"
          icon={ShoppingBag}
          color="amber"
        />
        <ReportCard 
          title="Caixa Recebido"
          value={formatMoney(stats.receivedValue)}
          subtitle={stats.soldValue > 0 ? `${((stats.receivedValue / stats.soldValue) * 100).toFixed(0)}% do valor faturado` : 'Pagamentos no período'}
          icon={DollarSign}
          color="indigo"
        />
      </div>

      {/* D3 Visual Dashboard Section */}
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-zinc-100 dark:border-zinc-800 pt-8">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <h3 className="text-xl font-bold text-zinc-800 dark:text-zinc-100 tracking-tight">
                Painel Visual D3.js
              </h3>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Visualizações interativas com curvas de tendência temporal e ranking de eficiência.
            </p>
          </div>

          {/* Visual Mode Segmented Tabs */}
          <div className="flex items-center gap-1 p-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm self-start sm:self-auto">
            <button
              onClick={() => setVisualTab('both')}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap",
                visualTab === 'both'
                  ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-sm"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
              )}
            >
              <Layers className="w-3.5 h-3.5" />
              Visão Completa
            </button>
            <button
              onClick={() => setVisualTab('sales')}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap",
                visualTab === 'sales'
                  ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-sm"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
              )}
            >
              <LineChart className="w-3.5 h-3.5" />
              Evolução Diária
            </button>
            <button
              onClick={() => setVisualTab('bags')}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap",
                visualTab === 'bags'
                  ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-sm"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
              )}
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              Comparativo de Sacolas
            </button>
          </div>
        </div>

        {/* D3 Charts Display */}
        {loading ? (
          <div className="py-24 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
            <p className="text-xs text-zinc-400 font-medium">Calculando métricas e renderizando gráficos D3...</p>
          </div>
        ) : (
          <div className="space-y-8">
            {(visualTab === 'both' || visualTab === 'sales') && (
              <DailySalesChart 
                data={dailySales} 
                periodLabel={periodLabels[period]} 
              />
            )}

            {(visualTab === 'both' || visualTab === 'bags') && (
              <BagPerformanceChart 
                bags={bagPerformances} 
              />
            )}
          </div>
        )}
      </div>

      {/* Tables Section */}
      <div className="space-y-8 border-t border-zinc-100 dark:border-zinc-800 pt-8">
        <div>
          <h3 className="text-xl font-bold text-zinc-800 dark:text-zinc-100 tracking-tight">
            Rankings & Estoque Consolidado
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Detalhamento por produto dos itens mais vendidos e valor acumulado em estoque.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Top Products Table */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-sm">
            <div className="p-6 sm:p-8 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
              <div>
                <h4 className="text-base font-bold text-zinc-800 dark:text-zinc-100">Top 10 Produtos Mais Vendidos</h4>
                <p className="text-xs text-zinc-400 mt-0.5">Baseado nas sacolas acertadas do período</p>
              </div>
              <TrendingUp className="w-5 h-5 text-emerald-500" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-zinc-50/50 dark:bg-zinc-800/40">
                    <th className="px-6 sm:px-8 py-3.5 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Produto</th>
                    <th className="px-6 sm:px-8 py-3.5 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-center">Qtd.</th>
                    <th className="px-6 sm:px-8 py-3.5 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {stats.topProducts.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-8 py-16 text-center text-zinc-400 italic">
                        Nenhuma venda registrada para o ranking neste período.
                      </td>
                    </tr>
                  ) : (
                    stats.topProducts.map((p, i) => (
                      <tr key={i} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/50 transition-colors">
                        <td className="px-6 sm:px-8 py-4 font-bold text-zinc-800 dark:text-zinc-200 text-sm">
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-[10px] mr-3 font-mono">
                            {i + 1}
                          </span>
                          {p.name}
                        </td>
                        <td className="px-6 sm:px-8 py-4 text-center text-zinc-500 dark:text-zinc-400 text-sm font-bold font-mono tabular-nums">
                          {p.quantity}
                        </td>
                        <td className="px-6 sm:px-8 py-4 text-right font-bold text-emerald-600 dark:text-emerald-400 text-sm font-mono tabular-nums">
                          {formatMoney(p.total)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Stock Details Table */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-sm">
            <div className="p-6 sm:p-8 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
              <div>
                <h4 className="text-base font-bold text-zinc-800 dark:text-zinc-100">Estoque (Físico + Consignado)</h4>
                <p className="text-xs text-zinc-400 mt-0.5">Produtos com maior valor de estoque acumulado</p>
              </div>
              <Package className="w-5 h-5 text-blue-500" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-zinc-50/50 dark:bg-zinc-800/40">
                    <th className="px-6 sm:px-8 py-3.5 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Produto</th>
                    <th className="px-6 sm:px-8 py-3.5 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-center">Estoque</th>
                    <th className="px-6 sm:px-8 py-3.5 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right">Valor Venda</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {stats.stockDetails.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-8 py-16 text-center text-zinc-400 italic">
                        Nenhum produto cadastrado com estoque positivo.
                      </td>
                    </tr>
                  ) : (
                    stats.stockDetails.slice(0, 10).map((p, i) => (
                      <tr key={i} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/50 transition-colors">
                        <td className="px-6 sm:px-8 py-4 font-bold text-zinc-800 dark:text-zinc-200 text-sm">
                          {p.name}
                        </td>
                        <td className="px-6 sm:px-8 py-4 text-center text-zinc-500 dark:text-zinc-400 text-sm font-bold font-mono tabular-nums">
                          {p.stock}
                        </td>
                        <td className="px-6 sm:px-8 py-4 text-right font-bold text-blue-600 dark:text-blue-400 text-sm font-mono tabular-nums">
                          {formatMoney(p.value)}
                        </td>
                      </tr>
                    ))
                  )}
                  {stats.stockDetails.length > 10 && (
                    <tr>
                      <td colSpan={3} className="px-8 py-3 text-center text-xs text-zinc-400 bg-zinc-50/50 dark:bg-zinc-800/30">
                        Mostrando top 10 produtos por volume financeiro em estoque.
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
    blue: "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400",
    emerald: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400",
    amber: "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400",
    indigo: "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400"
  };

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-sm hover:shadow-md transition-all group">
      <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center mb-6 transition-transform group-hover:scale-110", colors[color])}>
        <Icon className="w-6 h-6" />
      </div>
      <div className="space-y-1">
        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{title}</p>
        <div className="flex flex-col">
          <h4 className={cn("text-2xl sm:text-3xl font-bold tracking-tight font-mono tabular-nums", 
            color === 'emerald' ? "text-emerald-600 dark:text-emerald-400" : 
            color === 'amber' ? "text-amber-600 dark:text-amber-400" : 
            color === 'indigo' ? "text-indigo-600 dark:text-indigo-400" : 
            "text-zinc-800 dark:text-zinc-100"
          )}>
            {value}
          </h4>
          {extraValue && (
            <p className={cn("text-sm sm:text-base font-bold mt-1 font-mono tabular-nums", 
              color === 'blue' ? "text-blue-600 dark:text-blue-400" : 
              color === 'emerald' ? "text-emerald-600 dark:text-emerald-400" : 
              color === 'amber' ? "text-amber-600 dark:text-amber-400" : 
              color === 'indigo' ? "text-indigo-600 dark:text-indigo-400" : 
              "text-zinc-600 dark:text-zinc-400"
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
