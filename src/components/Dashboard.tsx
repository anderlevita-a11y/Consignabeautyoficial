import React, { useEffect, useState } from 'react';
import { 
  TrendingUp, 
  Users, 
  ShoppingBag, 
  Package,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { supabase } from '../lib/supabase';

export function Dashboard() {
  const [stats, setStats] = useState({
    totalSales: 0,
    activeBags: 0,
    totalCustomers: 0,
    totalProducts: 0,
    totalStockValue: 0
  });

  useEffect(() => {
    async function fetchStats() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
        if (!user) return;

        const { data: productsData } = await supabase
          .from('products')
          .select('sale_price, current_stock')
          .eq('user_id', user.id);

        const { count: customersCount } = await supabase.from('customers').select('id', { count: 'exact', head: true }).eq('user_id', user.id);
        const { count: bagsCount } = await supabase.from('bags').select('id', { count: 'exact', head: true }).eq('user_id', user.id);
        const { data: salesData } = await supabase.from('bags').select('total_value').eq('user_id', user.id).eq('status', 'closed');

        let totalProducts = 0;
        let totalStockValue = 0;
        let totalSales = 0;

        if (productsData) {
          totalProducts = productsData.length;
          totalStockValue = productsData.reduce((acc, p) => {
            const price = typeof p.sale_price === 'string' ? parseFloat(p.sale_price.replace(',', '.')) : p.sale_price;
            const stock = typeof p.current_stock === 'string' ? parseInt(p.current_stock) : p.current_stock;
            return acc + ((price || 0) * (stock || 0));
          }, 0);
        }

        if (salesData) {
          totalSales = salesData.reduce((acc, b) => acc + (b.total_value || 0), 0);
        }

        setStats({
          totalSales: totalSales,
          activeBags: bagsCount || 0,
          totalCustomers: customersCount || 0,
          totalProducts: totalProducts,
          totalStockValue: totalStockValue
        });
      } catch (err) {
        console.error('Error fetching dashboard stats:', err);
      }
    }

    fetchStats();
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-[#4a1d33]">Visão Geral</h2>
        <p className="text-zinc-500">Bem-vindo ao painel de controle da Consigna Beauty.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Vendas Totais" 
          value={`R$ ${stats.totalSales.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} 
          subValue={`Estoque: R$ ${stats.totalStockValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          icon={TrendingUp} 
          trend="+12.5%" 
          trendUp={true} 
        />
        <StatCard 
          title="Malas Ativas" 
          value={stats.activeBags.toString()} 
          icon={ShoppingBag} 
          trend="+3" 
          trendUp={true} 
        />
        <StatCard 
          title="Clientes" 
          value={stats.totalCustomers.toString()} 
          icon={Users} 
          trend="+2" 
          trendUp={true} 
        />
        <StatCard 
          title="Produtos" 
          value={stats.totalProducts.toString()} 
          subValue={`Estoque: R$ ${stats.totalStockValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          icon={Package} 
          trend="Estável" 
          trendUp={true} 
        />
        <div 
          onClick={() => window.dispatchEvent(new CustomEvent('setTab', { detail: 'virtual-store' }))}
          className="bg-gradient-to-br from-[#FF007F] to-[#FF69B4] border border-white/20 rounded-2xl p-6 hover:scale-[1.02] transition-all shadow-lg shadow-[#FF007F]/20 group cursor-pointer flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="p-2.5 bg-white/20 rounded-xl group-hover:rotate-12 transition-transform">
              <ShoppingBag className="w-6 h-6 text-white" />
            </div>
            <div className="bg-white/20 text-white text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-wider">
              Novo
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold text-white/80 uppercase tracking-widest mb-1">E-commerce</p>
            <h4 className="text-xl font-bold text-white">Loja Virtual</h4>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                window.dispatchEvent(new CustomEvent('setTab', { detail: 'store-settings' }));
              }}
              className="text-[10px] font-medium text-white/60 mt-2 italic hover:text-white transition-colors underline underline-offset-2"
            >
              crie aqui a configuracoes da loja
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
          <h3 className="text-lg font-bold text-[#4a1d33] mb-4 uppercase tracking-tight">Atividade Recente</h3>
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center justify-between py-3 border-b border-zinc-50 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#fdf8e1] flex items-center justify-center">
                    <ShoppingBag className="w-5 h-5 text-[#38a89d]" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-zinc-800">Mala #1024 entregue</p>
                    <p className="text-xs text-zinc-500">Para: Maria Oliveira</p>
                  </div>
                </div>
                <span className="text-xs text-zinc-400">Há 2 horas</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
          <h3 className="text-lg font-bold text-[#4a1d33] mb-4 uppercase tracking-tight">Produtos Mais Vendidos</h3>
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center justify-between py-3 border-b border-zinc-50 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-zinc-50 flex items-center justify-center">
                    <Package className="w-5 h-5 text-zinc-300" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-zinc-800">Camiseta Basic Cotton</p>
                    <p className="text-xs text-zinc-500">SKU: TS-00{i}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-zinc-800">45 vendas</p>
                  <p className="text-xs text-[#38a89d] font-bold">R$ 2.450,00</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, subValue, icon: Icon, trend, trendUp }: any) {
  return (
    <div className="bg-white border border-zinc-100 rounded-2xl p-6 hover:border-[#38a89d]/30 transition-all shadow-sm group">
      <div className="flex items-center justify-between mb-4">
        <div className="p-2.5 bg-[#fdf8e1] rounded-xl group-hover:scale-110 transition-transform">
          <Icon className="w-6 h-6 text-[#38a89d]" />
        </div>
        <div className={cn(
          "flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-wider",
          trendUp ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
        )}>
          {trendUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
          {trend}
        </div>
      </div>
      <div>
        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">{title}</p>
        <h4 className="text-2xl font-bold text-[#4a1d33]">{value}</h4>
        {subValue && (
          <p className="text-xs font-bold text-[#38a89d] mt-1">{subValue}</p>
        )}
      </div>
    </div>
  );
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}
