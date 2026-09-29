import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { ShoppingBag, ArrowUpDown, Filter, CheckCircle2, Clock } from 'lucide-react';
import { cn, formatMoney } from '../../lib/utils';

export interface BagPerformanceData {
  id: string;
  bagNumber: string;
  customerName: string;
  status: 'open' | 'closed';
  totalValue: number;       // Sold value (if closed) or consigned value (if open)
  receivedAmount: number;
  pendingAmount: number;
  totalItems: number;
  soldItems: number;
  returnedItems: number;
  conversionRate: number;   // 0 - 100%
  date: string;
}

interface BagPerformanceChartProps {
  bags: BagPerformanceData[];
  theme?: 'light' | 'dark';
}

export function BagPerformanceChart({ bags, theme = 'light' }: BagPerformanceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [sortBy, setSortBy] = useState<'value' | 'conversion' | 'received'>('value');
  const [statusFilter, setStatusFilter] = useState<'all' | 'closed' | 'open'>('all');
  const [limitCount, setLimitCount] = useState<number>(10);
  const [hoveredBag, setHoveredBag] = useState<BagPerformanceData | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  // Filter and sort bags
  const filteredBags = useMemo(() => {
    let result = [...bags];
    if (statusFilter === 'closed') {
      result = result.filter(b => b.status === 'closed');
    } else if (statusFilter === 'open') {
      result = result.filter(b => b.status === 'open');
    }

    result.sort((a, b) => {
      if (sortBy === 'value') return b.totalValue - a.totalValue;
      if (sortBy === 'conversion') return b.conversionRate - a.conversionRate;
      if (sortBy === 'received') return b.receivedAmount - a.receivedAmount;
      return 0;
    });

    return result.slice(0, limitCount);
  }, [bags, statusFilter, sortBy, limitCount]);

  // Aggregate stats
  const stats = useMemo(() => {
    if (bags.length === 0) return { avgConversion: 0, avgTicket: 0, topBag: null, totalAnalyzed: 0 };
    const closedBags = bags.filter(b => b.status === 'closed');
    const targetBags = closedBags.length > 0 ? closedBags : bags;
    
    const totalVal = targetBags.reduce((acc, b) => acc + b.totalValue, 0);
    const avgTicket = targetBags.length > 0 ? totalVal / targetBags.length : 0;
    
    const bagsWithItems = targetBags.filter(b => b.totalItems > 0);
    const avgConversion = bagsWithItems.length > 0 
      ? bagsWithItems.reduce((acc, b) => acc + b.conversionRate, 0) / bagsWithItems.length 
      : 0;

    const topBag = [...bags].sort((a, b) => b.totalValue - a.totalValue)[0] || null;

    return {
      avgConversion,
      avgTicket,
      topBag,
      totalAnalyzed: bags.length
    };
  }, [bags]);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const barHeight = 36;
    const gap = 16;
    const rowCount = Math.max(1, filteredBags.length);
    const height = Math.max(260, rowCount * (barHeight + gap) + 60);

    const margin = { top: 20, right: 30, bottom: 30, left: 160 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    svg.attr('width', width).attr('height', height).attr('viewBox', `0 0 ${width} ${height}`);

    if (filteredBags.length === 0 || innerWidth <= 0 || innerHeight <= 0) return;

    const isDark = document.documentElement.classList.contains('dark') || theme === 'dark';
    const gridColor = isDark ? '#27272a' : '#f1f5f9';
    const textColor = isDark ? '#a1a1aa' : '#64748b';
    const labelColor = isDark ? '#f4f4f5' : '#1e293b';

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    // Y Scale: categorical bag labels
    const yScale = d3.scaleBand()
      .domain(filteredBags.map(d => d.id))
      .range([0, innerHeight])
      .padding(0.28);

    // X Scale: based on metric selected
    const isConversionMode = sortBy === 'conversion';
    const maxVal = isConversionMode 
      ? 100 
      : (d3.max(filteredBags, d => Math.max(d.totalValue, d.receivedAmount)) || 100);

    const xScale = d3.scaleLinear()
      .domain([0, maxVal * (isConversionMode ? 1 : 1.15)])
      .nice()
      .range([0, innerWidth]);

    // X Axis Grid
    const xAxisGrid = d3.axisBottom(xScale)
      .tickSize(innerHeight)
      .tickFormat(() => '')
      .ticks(5);

    g.append('g')
      .attr('class', 'grid-lines')
      .call(xAxisGrid)
      .selectAll('line')
      .attr('stroke', gridColor)
      .attr('stroke-dasharray', '3 3')
      .attr('stroke-width', 1);

    g.select('.grid-lines').select('.domain').remove();

    // Bars
    filteredBags.forEach((bag) => {
      const y = yScale(bag.id) || 0;
      const h = yScale.bandwidth();
      
      const primaryVal = isConversionMode 
        ? bag.conversionRate 
        : (sortBy === 'received' ? bag.receivedAmount : bag.totalValue);
      const barWidth = Math.max(2, xScale(primaryVal));

      // Bar container group
      const barG = g.append('g')
        .attr('class', 'bag-bar-group')
        .attr('cursor', 'pointer')
        .on('mouseenter', (event) => {
          setHoveredBag(bag);
          const [mx, my] = d3.pointer(event, container);
          setTooltipPos({ x: mx, y: my });
        })
        .on('mousemove', (event) => {
          const [mx, my] = d3.pointer(event, container);
          setTooltipPos({ x: mx, y: my });
        })
        .on('mouseleave', () => {
          setHoveredBag(null);
          setTooltipPos(null);
        });

      // Background subtle full-width track
      barG.append('rect')
        .attr('x', 0)
        .attr('y', y)
        .attr('width', innerWidth)
        .attr('height', h)
        .attr('rx', 6)
        .attr('fill', isDark ? '#1f1f23' : '#f8fafc');

      // Gradient defs for bar
      const gradId = `bar-grad-${bag.id}`;
      const grad = svg.append('defs').append('linearGradient')
        .attr('id', gradId)
        .attr('x1', '0%')
        .attr('y1', '0%')
        .attr('x2', '100%')
        .attr('y2', '0%');

      if (isConversionMode) {
        grad.append('stop').attr('offset', '0%').attr('stop-color', '#3b82f6');
        grad.append('stop').attr('offset', '100%').attr('stop-color', '#60a5fa');
      } else if (bag.status === 'open') {
        grad.append('stop').attr('offset', '0%').attr('stop-color', '#f59e0b');
        grad.append('stop').attr('offset', '100%').attr('stop-color', '#fbbf24');
      } else {
        grad.append('stop').attr('offset', '0%').attr('stop-color', '#059669');
        grad.append('stop').attr('offset', '100%').attr('stop-color', '#10b981');
      }

      // Main value bar with rounded corners
      barG.append('rect')
        .attr('x', 0)
        .attr('y', y)
        .attr('width', barWidth)
        .attr('height', h)
        .attr('rx', 6)
        .attr('fill', `url(#${gradId})`)
        .attr('opacity', 0.95)
        .transition()
        .duration(400)
        .attr('width', barWidth);

      // Value label inside or right next to bar
      const formattedVal = isConversionMode 
        ? `${bag.conversionRate.toFixed(0)}%` 
        : formatMoney(primaryVal);

      barG.append('text')
        .attr('x', barWidth + 8)
        .attr('y', y + h / 2 + 4)
        .attr('fill', labelColor)
        .attr('font-size', '12px')
        .attr('font-weight', '700')
        .attr('font-family', 'inherit')
        .attr('class', 'tabular-nums')
        .text(formattedVal);

      // Y-axis label: Bag Number & Customer Name (Left side)
      const bagLabel = bag.bagNumber.startsWith('#') ? bag.bagNumber : `#${bag.bagNumber}`;
      const customerShort = bag.customerName.length > 15 
        ? `${bag.customerName.slice(0, 14)}…` 
        : bag.customerName;

      const yLabelG = g.append('g')
        .attr('cursor', 'pointer')
        .on('mouseenter', (event) => {
          setHoveredBag(bag);
          const [mx, my] = d3.pointer(event, container);
          setTooltipPos({ x: mx, y: my });
        })
        .on('mouseleave', () => {
          setHoveredBag(null);
          setTooltipPos(null);
        });

      yLabelG.append('text')
        .attr('x', -10)
        .attr('y', y + h / 2 - 2)
        .attr('text-anchor', 'end')
        .attr('fill', labelColor)
        .attr('font-size', '12px')
        .attr('font-weight', '600')
        .attr('font-family', 'inherit')
        .text(bagLabel);

      yLabelG.append('text')
        .attr('x', -10)
        .attr('y', y + h / 2 + 12)
        .attr('text-anchor', 'end')
        .attr('fill', textColor)
        .attr('font-size', '10px')
        .attr('font-family', 'inherit')
        .text(customerShort);
    });

    // X Axis
    const xAxis = d3.axisBottom(xScale)
      .ticks(5)
      .tickFormat(d => {
        const val = Number(d);
        if (isConversionMode) return `${val}%`;
        if (val >= 1000) return `R$ ${(val / 1000).toFixed(1)}k`;
        return `R$ ${val.toFixed(0)}`;
      })
      .tickSizeOuter(0);

    const xAxisG = g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis);

    xAxisG.select('.domain').attr('stroke', gridColor);
    xAxisG.selectAll('text')
      .attr('fill', textColor)
      .attr('font-size', '11px')
      .attr('font-family', 'inherit')
      .attr('dy', '10px');

  }, [filteredBags, sortBy, theme]);

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-sm">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-100 dark:border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-100 tracking-tight">
              Comparativo de Desempenho entre Sacolas
            </h3>
            <span className="text-xs text-zinc-400 font-mono">D3.js</span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Compare vendas, taxa de conversão e recebimentos entre sacolas consignadas.
          </p>
        </div>

        {/* Filters and Controls */}
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {/* Status Segmented Control */}
          <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
            <button
              onClick={() => setStatusFilter('all')}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap",
                statusFilter === 'all'
                  ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
              )}
            >
              Todas
            </button>
            <button
              onClick={() => setStatusFilter('closed')}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1",
                statusFilter === 'closed'
                  ? "bg-white dark:bg-zinc-700 text-emerald-600 dark:text-emerald-400 shadow-sm"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
              )}
            >
              <CheckCircle2 className="w-3 h-3" />
              Acertadas
            </button>
            <button
              onClick={() => setStatusFilter('open')}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1",
                statusFilter === 'open'
                  ? "bg-white dark:bg-zinc-700 text-amber-600 dark:text-amber-400 shadow-sm"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
              )}
            >
              <Clock className="w-3 h-3" />
              Em Aberto
            </button>
          </div>

          {/* Metric Selector Dropdown / Buttons */}
          <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
            <button
              onClick={() => setSortBy('value')}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap",
                sortBy === 'value'
                  ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
              )}
              title="Ordenar por Valor Vendido / Consignado"
            >
              Faturamento
            </button>
            <button
              onClick={() => setSortBy('conversion')}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap",
                sortBy === 'conversion'
                  ? "bg-white dark:bg-zinc-700 text-blue-600 dark:text-blue-400 shadow-sm"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
              )}
              title="Ordenar por Taxa de Conversão (% peças vendidas)"
            >
              Taxa de Venda (%)
            </button>
            <button
              onClick={() => setSortBy('received')}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap",
                sortBy === 'received'
                  ? "bg-white dark:bg-zinc-700 text-indigo-600 dark:text-indigo-400 shadow-sm"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
              )}
              title="Ordenar por Valor Recebido em Caixa"
            >
              Recebido
            </button>
          </div>
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 py-2 border-b border-zinc-100 dark:border-zinc-800">
        <div>
          <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider block">Taxa Média de Venda</span>
          <span className="text-xl sm:text-2xl font-bold text-blue-600 dark:text-blue-400 font-mono tabular-nums">
            {stats.avgConversion.toFixed(1)}%
          </span>
          <span className="text-[11px] text-zinc-400 block mt-0.5">das peças enviadas</span>
        </div>
        <div>
          <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider block">Ticket Médio por Sacola</span>
          <span className="text-xl sm:text-2xl font-bold text-zinc-800 dark:text-zinc-100 font-mono tabular-nums">
            {formatMoney(stats.avgTicket)}
          </span>
          <span className="text-[11px] text-zinc-400 block mt-0.5">média por acerto</span>
        </div>
        <div>
          <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider block">Sacola Campeã</span>
          <span className="text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono tabular-nums truncate block">
            {stats.topBag ? stats.topBag.bagNumber : '—'}
          </span>
          <span className="text-[11px] text-zinc-400 block mt-0.5 truncate">
            {stats.topBag ? `${formatMoney(stats.topBag.totalValue)} (${stats.topBag.customerName})` : 'Sem sacolas'}
          </span>
        </div>
        <div>
          <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider block">Sacolas Monitoradas</span>
          <span className="text-xl sm:text-2xl font-bold text-zinc-800 dark:text-zinc-100 font-mono tabular-nums">
            {stats.totalAnalyzed}
          </span>
          <span className="text-[11px] text-zinc-400 block mt-0.5">
            Mostrando top {Math.min(filteredBags.length, limitCount)}
          </span>
        </div>
      </div>

      {/* D3 Canvas Container */}
      <div ref={containerRef} className="relative w-full overflow-hidden select-none">
        {filteredBags.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400 mb-3">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              Nenhuma sacola encontrada para este filtro
            </p>
            <p className="text-xs text-zinc-400 max-w-sm mt-1">
              Alterne os filtros acima para visualizar sacolas em aberto ou acertadas.
            </p>
          </div>
        ) : (
          <>
            <svg ref={svgRef} className="w-full overflow-visible" />

            {/* Custom Tooltip */}
            {hoveredBag && tooltipPos && (
              <div
                className="absolute pointer-events-none z-20 bg-zinc-900/95 dark:bg-zinc-800/95 text-white backdrop-blur-md px-4 py-3 rounded-xl shadow-xl border border-white/10 text-xs transition-transform duration-75 ease-out min-w-[210px]"
                style={{
                  left: `${Math.min(Math.max(10, tooltipPos.x + 15), (containerRef.current?.clientWidth || 300) - 230)}px`,
                  top: `${Math.max(10, tooltipPos.y - 70)}px`
                }}
              >
                <div className="border-b border-white/10 pb-1.5 mb-2 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-sm text-zinc-100">
                      {hoveredBag.bagNumber}
                    </span>
                    <p className="text-[11px] text-zinc-300 truncate max-w-[150px]">
                      {hoveredBag.customerName}
                    </p>
                  </div>
                  <span className={cn(
                    "text-[10px] font-bold px-2 py-0.5 rounded-md",
                    hoveredBag.status === 'closed'
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-amber-500/20 text-amber-400"
                  )}>
                    {hoveredBag.status === 'closed' ? 'Acertada' : 'Em Aberto'}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-zinc-400">
                      {hoveredBag.status === 'closed' ? 'Valor Vendido:' : 'Valor Consignado:'}
                    </span>
                    <span className="font-bold text-emerald-400 font-mono tabular-nums">
                      {formatMoney(hoveredBag.totalValue)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span className="text-zinc-400">Recebido em Caixa:</span>
                    <span className="font-bold text-indigo-400 font-mono tabular-nums">
                      {formatMoney(hoveredBag.receivedAmount)}
                    </span>
                  </div>

                  {hoveredBag.totalItems > 0 && (
                    <div className="flex items-center justify-between gap-3 pt-1 border-t border-white/10">
                      <span className="text-zinc-400">Aproveitamento:</span>
                      <span className="font-bold text-blue-400 font-mono tabular-nums">
                        {hoveredBag.conversionRate.toFixed(1)}% ({hoveredBag.soldItems}/{hoveredBag.totalItems} un.)
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Legend & Pagination Limit */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500 dark:text-zinc-400 pt-2 border-t border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-emerald-500 rounded-sm" />
            <span>Sacola Acertada (Fechada)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-amber-500 rounded-sm" />
            <span>Sacola Em Aberto</span>
          </div>
        </div>

        {bags.length > 10 && (
          <div className="flex items-center gap-2">
            <span className="text-zinc-400">Exibir:</span>
            <button
              onClick={() => setLimitCount(10)}
              className={cn(
                "px-2 py-0.5 rounded text-[11px] font-medium transition-colors",
                limitCount === 10 
                  ? "bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900" 
                  : "text-zinc-500 hover:text-zinc-800"
              )}
            >
              Top 10
            </button>
            <button
              onClick={() => setLimitCount(20)}
              className={cn(
                "px-2 py-0.5 rounded text-[11px] font-medium transition-colors",
                limitCount === 20 
                  ? "bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900" 
                  : "text-zinc-500 hover:text-zinc-800"
              )}
            >
              Top 20
            </button>
            <button
              onClick={() => setLimitCount(50)}
              className={cn(
                "px-2 py-0.5 rounded text-[11px] font-medium transition-colors",
                limitCount === 50 
                  ? "bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900" 
                  : "text-zinc-500 hover:text-zinc-800"
              )}
            >
              Top 50
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
