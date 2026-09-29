import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { format, parseISO, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { TrendingUp, DollarSign, Calendar, Info } from 'lucide-react';
import { cn, formatMoney } from '../../lib/utils';

export interface DailySalePoint {
  date: string; // YYYY-MM-DD
  soldValue: number;
  receivedValue: number;
  bagsCount: number;
}

interface DailySalesChartProps {
  data: DailySalePoint[];
  periodLabel?: string;
  theme?: 'light' | 'dark';
}

export function DailySalesChart({ data, periodLabel = 'Últimos 30 dias', theme = 'light' }: DailySalesChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredPoint, setHoveredPoint] = useState<DailySalePoint | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [metricView, setMetricView] = useState<'both' | 'sold' | 'received'>('both');

  // Calculated metrics
  const totalSold = useMemo(() => data.reduce((acc, d) => acc + d.soldValue, 0), [data]);
  const totalReceived = useMemo(() => data.reduce((acc, d) => acc + d.receivedValue, 0), [data]);
  const totalBags = useMemo(() => data.reduce((acc, d) => acc + d.bagsCount, 0), [data]);
  
  const peakDay = useMemo(() => {
    if (data.length === 0) return null;
    return [...data].sort((a, b) => b.soldValue - a.soldValue)[0];
  }, [data]);

  const dailyAverage = useMemo(() => {
    if (data.length === 0) return 0;
    const activeDays = data.filter(d => d.soldValue > 0).length;
    return activeDays > 0 ? totalSold / activeDays : totalSold / data.length;
  }, [data, totalSold]);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = Math.max(280, Math.min(380, width * 0.42));

    const margin = { top: 20, right: 24, bottom: 40, left: 65 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Clear previous SVG contents
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    svg.attr('width', width).attr('height', height).attr('viewBox', `0 0 ${width} ${height}`);

    if (data.length === 0 || innerWidth <= 0 || innerHeight <= 0) return;

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    // Parse dates and prepare sorted series
    const parsedData = data.map(d => {
      const parsed = parseISO(d.date);
      return {
        ...d,
        parsedDate: isValid(parsed) ? parsed : new Date(d.date)
      };
    }).sort((a, b) => a.parsedDate.getTime() - b.parsedDate.getTime());

    // X Scale
    const xExtent = d3.extent(parsedData, d => d.parsedDate) as [Date, Date];
    const xScale = d3.scaleTime()
      .domain(xExtent[0] && xExtent[1] ? xExtent : [new Date(), new Date()])
      .range([0, innerWidth]);

    // Y Scale
    const maxVal = d3.max(parsedData, d => Math.max(d.soldValue, d.receivedValue)) || 100;
    const yScale = d3.scaleLinear()
      .domain([0, maxVal * 1.15])
      .nice()
      .range([innerHeight, 0]);

    const isDark = document.documentElement.classList.contains('dark') || theme === 'dark';
    const gridColor = isDark ? '#27272a' : '#f1f5f9';
    const textColor = isDark ? '#a1a1aa' : '#94a3b8';

    // Background horizontal grid lines
    const yAxisGrid = d3.axisLeft(yScale)
      .tickSize(-innerWidth)
      .tickFormat(() => '')
      .ticks(5);

    g.append('g')
      .attr('class', 'grid-lines')
      .call(yAxisGrid)
      .selectAll('line')
      .attr('stroke', gridColor)
      .attr('stroke-dasharray', '3 3')
      .attr('stroke-width', 1);

    g.select('.grid-lines').select('.domain').remove();

    // Defs for gradients
    const defs = svg.append('defs');

    // Emerald gradient for sold area
    const soldGradient = defs.append('linearGradient')
      .attr('id', 'sold-area-gradient')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');

    soldGradient.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', '#10b981')
      .attr('stop-opacity', isDark ? 0.35 : 0.25);

    soldGradient.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', '#10b981')
      .attr('stop-opacity', 0.0);

    // Indigo gradient for received area
    const receivedGradient = defs.append('linearGradient')
      .attr('id', 'received-area-gradient')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');

    receivedGradient.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', '#6366f1')
      .attr('stop-opacity', isDark ? 0.25 : 0.15);

    receivedGradient.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', '#6366f1')
      .attr('stop-opacity', 0.0);

    // Generators
    const soldArea = d3.area<typeof parsedData[0]>()
      .x(d => xScale(d.parsedDate))
      .y0(innerHeight)
      .y1(d => yScale(d.soldValue))
      .curve(d3.curveMonotoneX);

    const soldLine = d3.line<typeof parsedData[0]>()
      .x(d => xScale(d.parsedDate))
      .y(d => yScale(d.soldValue))
      .curve(d3.curveMonotoneX);

    const receivedLine = d3.line<typeof parsedData[0]>()
      .x(d => xScale(d.parsedDate))
      .y(d => yScale(d.receivedValue))
      .curve(d3.curveMonotoneX);

    const receivedArea = d3.area<typeof parsedData[0]>()
      .x(d => xScale(d.parsedDate))
      .y0(innerHeight)
      .y1(d => yScale(d.receivedValue))
      .curve(d3.curveMonotoneX);

    // Render Sold Area & Line
    if (metricView === 'both' || metricView === 'sold') {
      g.append('path')
        .datum(parsedData)
        .attr('fill', 'url(#sold-area-gradient)')
        .attr('d', soldArea);

      g.append('path')
        .datum(parsedData)
        .attr('fill', 'none')
        .attr('stroke', '#10b981')
        .attr('stroke-width', 2.5)
        .attr('d', soldLine);
    }

    // Render Received Area & Line
    if (metricView === 'both' || metricView === 'received') {
      if (metricView === 'received') {
        g.append('path')
          .datum(parsedData)
          .attr('fill', 'url(#received-area-gradient)')
          .attr('d', receivedArea);
      }

      g.append('path')
        .datum(parsedData)
        .attr('fill', 'none')
        .attr('stroke', '#6366f1')
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', metricView === 'both' ? '4 4' : 'none')
        .attr('d', receivedLine);
    }

    // X Axis
    const tickCount = Math.max(3, Math.min(8, Math.floor(innerWidth / 90)));
    const xAxis = d3.axisBottom(xScale)
      .ticks(tickCount)
      .tickFormat(d => format(d as Date, 'dd/MM', { locale: ptBR }))
      .tickSizeOuter(0);

    const xAxisG = g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis);

    xAxisG.select('.domain').attr('stroke', gridColor);
    xAxisG.selectAll('text')
      .attr('fill', textColor)
      .attr('font-size', '11px')
      .attr('font-family', 'inherit')
      .attr('dy', '12px');

    // Y Axis
    const yAxis = d3.axisLeft(yScale)
      .ticks(5)
      .tickFormat(d => {
        const val = Number(d);
        if (val >= 1000) return `R$ ${(val / 1000).toFixed(1)}k`;
        return `R$ ${val.toFixed(0)}`;
      })
      .tickSizeOuter(0);

    const yAxisG = g.append('g').call(yAxis);
    yAxisG.select('.domain').remove();
    yAxisG.selectAll('text')
      .attr('fill', textColor)
      .attr('font-size', '11px')
      .attr('font-family', 'inherit')
      .attr('dx', '-6px');

    // Interactive elements for mouse tracking
    const focusG = g.append('g').style('display', 'none');

    // Crosshair line
    const focusLine = focusG.append('line')
      .attr('y1', 0)
      .attr('y2', innerHeight)
      .attr('stroke', isDark ? '#52525b' : '#cbd5e1')
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '4 3');

    // Focus circle for sold
    const soldCircle = focusG.append('circle')
      .attr('r', 5)
      .attr('fill', '#10b981')
      .attr('stroke', isDark ? '#18181b' : '#ffffff')
      .attr('stroke-width', 2);

    // Focus circle for received
    const receivedCircle = focusG.append('circle')
      .attr('r', 4.5)
      .attr('fill', '#6366f1')
      .attr('stroke', isDark ? '#18181b' : '#ffffff')
      .attr('stroke-width', 2);

    // Bisector for finding closest data point
    const bisectDate = d3.bisector<typeof parsedData[0], Date>(d => d.parsedDate).center;

    // Overlay rect for pointer events
    g.append('rect')
      .attr('width', innerWidth)
      .attr('height', innerHeight)
      .attr('fill', 'transparent')
      .attr('cursor', 'crosshair')
      .on('mouseover touchstart', () => {
        focusG.style('display', null);
      })
      .on('mouseout touchend', () => {
        focusG.style('display', 'none');
        setHoveredPoint(null);
        setTooltipPos(null);
      })
      .on('mousemove touchmove', function (event) {
        const [pointerX] = d3.pointer(event, this);
        const xDate = xScale.invert(pointerX);
        const index = bisectDate(parsedData, xDate);
        const d = parsedData[index];

        if (!d) return;

        const cx = xScale(d.parsedDate);
        const cySold = yScale(d.soldValue);
        const cyRec = yScale(d.receivedValue);

        focusLine.attr('x1', cx).attr('x2', cx);
        soldCircle.attr('cx', cx).attr('cy', cySold);
        receivedCircle.attr('cx', cx).attr('cy', cyRec);

        setHoveredPoint(d);
        setTooltipPos({
          x: cx + margin.left,
          y: Math.min(cySold, cyRec) + margin.top
        });
      });

  }, [data, metricView, theme]);

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-sm">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-100 dark:border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-100 tracking-tight">
              Evolução Diária de Vendas
            </h3>
            <span className="text-xs text-zinc-400 font-mono">D3.js</span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Acompanhe o faturamento realizado e recebimentos diários ({periodLabel}).
          </p>
        </div>

        {/* Metric Segmented Control */}
        <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl self-start sm:self-auto">
          <button
            onClick={() => setMetricView('both')}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap",
              metricView === 'both'
                ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
            )}
          >
            Ambos
          </button>
          <button
            onClick={() => setMetricView('sold')}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap",
              metricView === 'sold'
                ? "bg-white dark:bg-zinc-700 text-emerald-600 dark:text-emerald-400 shadow-sm"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
            )}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Vendido
          </button>
          <button
            onClick={() => setMetricView('received')}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap",
              metricView === 'received'
                ? "bg-white dark:bg-zinc-700 text-indigo-600 dark:text-indigo-400 shadow-sm"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
            )}
          >
            <span className="w-2 h-2 rounded-full bg-indigo-500" />
            Recebido
          </button>
        </div>
      </div>

      {/* KPI Overview Pills (Zero-Pill discipline compliant: clean unboxed metrics) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 py-2 border-b border-zinc-100 dark:border-zinc-800">
        <div>
          <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider block">Total Vendido</span>
          <span className="text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
            {formatMoney(totalSold)}
          </span>
          <span className="text-[11px] text-zinc-400 block mt-0.5">no período</span>
        </div>
        <div>
          <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider block">Caixa Recebido</span>
          <span className="text-xl sm:text-2xl font-bold text-indigo-600 dark:text-indigo-400 font-mono tabular-nums">
            {formatMoney(totalReceived)}
          </span>
          <span className="text-[11px] text-zinc-400 block mt-0.5">
            {totalSold > 0 ? `${((totalReceived / totalSold) * 100).toFixed(0)}% liquidado` : '0%'}
          </span>
        </div>
        <div>
          <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider block">Média Diária</span>
          <span className="text-xl sm:text-2xl font-bold text-zinc-800 dark:text-zinc-100 font-mono tabular-nums">
            {formatMoney(dailyAverage)}
          </span>
          <span className="text-[11px] text-zinc-400 block mt-0.5">por dia ativo</span>
        </div>
        <div>
          <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider block">Melhor Dia (Pico)</span>
          <span className="text-xl sm:text-2xl font-bold text-zinc-800 dark:text-zinc-100 font-mono tabular-nums">
            {peakDay && peakDay.soldValue > 0 ? formatMoney(peakDay.soldValue) : 'R$ 0,00'}
          </span>
          <span className="text-[11px] text-zinc-400 block mt-0.5 truncate">
            {peakDay && peakDay.soldValue > 0 
              ? format(parseISO(peakDay.date), "dd 'de' MMM", { locale: ptBR })
              : 'Sem vendas'}
          </span>
        </div>
      </div>

      {/* D3 Canvas Container */}
      <div ref={containerRef} className="relative w-full overflow-hidden select-none">
        {data.length === 0 || totalSold === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400 mb-3">
              <Calendar className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              Nenhuma venda registrada neste período
            </p>
            <p className="text-xs text-zinc-400 max-w-sm mt-1">
              Assim que sacolas forem fechadas ou pagamentos forem recebidos, a evolução diária será traçada aqui em tempo real.
            </p>
          </div>
        ) : (
          <>
            <svg ref={svgRef} className="w-full overflow-visible" />

            {/* Custom Interactive Tooltip */}
            {hoveredPoint && tooltipPos && (
              <div
                className="absolute pointer-events-none z-20 bg-zinc-900/95 dark:bg-zinc-800/95 text-white backdrop-blur-md px-3.5 py-2.5 rounded-xl shadow-xl border border-white/10 text-xs transition-transform duration-75 ease-out min-w-[180px]"
                style={{
                  left: `${Math.min(Math.max(10, tooltipPos.x - 90), (containerRef.current?.clientWidth || 300) - 190)}px`,
                  top: `${Math.max(10, tooltipPos.y - 85)}px`
                }}
              >
                <div className="font-semibold text-zinc-200 border-b border-white/10 pb-1 mb-1.5 flex items-center justify-between">
                  <span>
                    {format(parseISO(hoveredPoint.date), "EEEE, dd 'de' MMMM", { locale: ptBR })}
                  </span>
                  <span className="text-[10px] text-zinc-400 font-mono">
                    {hoveredPoint.bagsCount} {hoveredPoint.bagsCount === 1 ? 'sacola' : 'sacolas'}
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-zinc-400">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      Vendido:
                    </span>
                    <span className="font-bold text-emerald-400 font-mono tabular-nums">
                      {formatMoney(hoveredPoint.soldValue)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-zinc-400">
                      <span className="w-2 h-2 rounded-full bg-indigo-500" />
                      Recebido:
                    </span>
                    <span className="font-bold text-indigo-400 font-mono tabular-nums">
                      {formatMoney(hoveredPoint.receivedValue)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Legend & Footnote */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500 dark:text-zinc-400 pt-2">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-emerald-500 rounded-full" />
            <span>Valor Total Vendido (R$)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-indigo-500 border-b border-dashed border-indigo-500 rounded-full" />
            <span>Valor Recebido em Caixa (R$)</span>
          </div>
        </div>
        <div className="text-[11px] text-zinc-400">
          Baseado nas datas de acerto das sacolas consignadas
        </div>
      </div>
    </div>
  );
}
