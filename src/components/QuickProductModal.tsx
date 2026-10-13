import React, { useState, useEffect } from 'react';
import { X, Save, Plus, Package, Barcode, Sparkles, Loader2, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Product, ProductGridItem } from '../types';
import { cn, formatError, formatMoneyInput, parseMoney } from '../lib/utils';
import { useNotifications } from './NotificationCenter';
import { sanitizeString } from '../lib/sanitizer';

interface QuickProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (product: Product, autoAddToBag: boolean) => void;
  initialQuery?: string;
  existingProducts: Product[];
}

export function QuickProductModal({
  isOpen,
  onClose,
  onSave,
  initialQuery = '',
  existingProducts
}: QuickProductModalProps) {
  const { addNotification } = useNotifications();
  const [saving, setSaving] = useState(false);
  
  // Detect if initialQuery is a barcode (numeric 6+ digits) or product name
  const isQueryBarcode = Boolean(initialQuery && /^\d{6,}$/.test(initialQuery.trim()));
  
  const [name, setName] = useState(isQueryBarcode ? '' : initialQuery.trim());
  const [labelName, setLabelName] = useState('');
  const [barcode, setBarcode] = useState(isQueryBarcode ? initialQuery.trim() : '');
  const [ean, setEan] = useState(isQueryBarcode && initialQuery.trim().length >= 8 ? initialQuery.trim() : '');
  const [salePriceInput, setSalePriceInput] = useState('0,00');
  const [costPriceInput, setCostPriceInput] = useState('0,00');
  const [stockInput, setStockInput] = useState('1');
  const [category, setCategory] = useState('');
  const [autoAddToBag, setAutoAddToBag] = useState(true);
  
  // Simple grid support
  const [hasGrid, setHasGrid] = useState(false);
  const [gridColor, setGridColor] = useState('');
  const [gridSize, setGridSize] = useState('');
  const [gridQty, setGridQty] = useState('1');
  const [gridData, setGridData] = useState<ProductGridItem[]>([]);

  useEffect(() => {
    if (isOpen) {
      const isBarcode = Boolean(initialQuery && /^\d{6,}$/.test(initialQuery.trim()));
      setName(isBarcode ? '' : initialQuery.trim());
      setLabelName(isBarcode ? '' : initialQuery.trim());
      setBarcode(isBarcode ? initialQuery.trim() : '');
      setEan(isBarcode && initialQuery.trim().length >= 8 ? initialQuery.trim() : '');
      setSalePriceInput('0,00');
      setCostPriceInput('0,00');
      setStockInput('1');
      setCategory('');
      setAutoAddToBag(true);
      setHasGrid(false);
      setGridData([]);
      setGridColor('');
      setGridSize('');
      setGridQty('1');
    }
  }, [isOpen, initialQuery]);

  if (!isOpen) return null;

  const handleGenerateBarcode = () => {
    const numericBarcodes = existingProducts
      .map(p => {
        const b = p.barcode || '';
        return b.match(/^\d{6}$/) ? parseInt(b) : null;
      })
      .filter((n): n is number => n !== null);

    const maxBarcode = numericBarcodes.length > 0 ? Math.max(...numericBarcodes) : 500849;
    const nextValue = Math.max(maxBarcode + 1, 500850);
    let finalBarcode = nextValue;
    while (existingProducts.some(p => p.barcode === finalBarcode.toString().padStart(6, '0') || p.ean === finalBarcode.toString().padStart(6, '0'))) {
      finalBarcode++;
    }
    const generated = finalBarcode.toString().padStart(6, '0');
    setBarcode(generated);
    if (!ean) setEan(generated);
    addNotification({
      type: 'success',
      title: 'Código Gerado',
      message: `Código ${generated} atribuído ao produto.`
    });
  };

  const handleAddGridItem = () => {
    if (!gridColor.trim() || !gridSize.trim()) {
      addNotification({
        type: 'warning',
        title: 'Dados incompletos',
        message: 'Informe cor e tamanho para adicionar à grade.'
      });
      return;
    }
    const qty = parseInt(gridQty) || 1;
    const existingIndex = gridData.findIndex(
      g => g.color.toLowerCase() === gridColor.trim().toLowerCase() && 
           g.size.toLowerCase() === gridSize.trim().toLowerCase()
    );

    if (existingIndex >= 0) {
      setGridData(prev => prev.map((item, idx) => 
        idx === existingIndex ? { ...item, quantity: item.quantity + qty } : item
      ));
    } else {
      setGridData(prev => [...prev, { color: gridColor.trim(), size: gridSize.trim(), quantity: qty }]);
    }
    setGridColor('');
    setGridSize('');
    setGridQty('1');
  };

  const handleRemoveGridItem = (index: number) => {
    setGridData(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      addNotification({
        type: 'warning',
        title: 'Campo obrigatório',
        message: 'Por favor, informe o nome do produto.'
      });
      return;
    }

    const salePrice = parseMoney(salePriceInput);
    if (salePrice <= 0) {
      addNotification({
        type: 'warning',
        title: 'Preço inválido',
        message: 'O preço de venda deve ser maior que zero.'
      });
      return;
    }

    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) throw new Error('Sessão expirada. Faça login novamente.');

      const trimmedEan = ean.trim();
      const finalEan = (trimmedEan === '' || trimmedEan === '0') ? null : trimmedEan;
      const finalBarcode = barcode.trim() || null;

      // Check if EAN or Barcode already exists in current user catalog
      if (finalEan) {
        const conflict = existingProducts.find(p => p.ean === finalEan);
        if (conflict) {
          addNotification({
            type: 'warning',
            title: 'Código já cadastrado',
            message: `O código EAN ${finalEan} já pertence ao produto "${conflict.name}".`
          });
          setSaving(false);
          return;
        }
      }

      const totalStock = hasGrid
        ? gridData.reduce((sum, item) => sum + item.quantity, 0)
        : (parseInt(stockInput.replace(/\D/g, '')) || 1);

      const payload = {
        user_id: user.id,
        name: sanitizeString(name),
        label_name: sanitizeString(labelName || name),
        description: '',
        category: sanitizeString(category),
        ean: finalEan,
        barcode: finalBarcode,
        photo_url: '',
        image_urls: [],
        cost_price: parseMoney(costPriceInput),
        sale_price: salePrice,
        current_stock: Math.max(0, totalStock),
        has_grid: hasGrid,
        grid_data: hasGrid ? gridData : [],
        is_visible_in_store: true
      };

      const { data, error } = await supabase
        .from('products')
        .insert([payload])
        .select()
        .single();

      if (error) throw error;

      addNotification({
        type: 'success',
        title: 'Produto Cadastrado',
        message: `Produto "${data.name}" salvo com sucesso no catálogo!`
      });

      onSave(data as Product, autoAddToBag);
      onClose();
    } catch (err: any) {
      console.error('Error saving quick product:', err);
      addNotification({
        type: 'error',
        title: 'Erro ao cadastrar produto',
        message: formatError(err)
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-zinc-200 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 my-auto">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-zinc-100 flex items-center justify-between gap-4 bg-zinc-50/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-2xl">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-zinc-800">Cadastrar Novo Produto</h2>
              <p className="text-xs text-zinc-400">Salve no catálogo e inclua na sacola sem perder a montagem</p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-zinc-200/60 rounded-xl text-zinc-400 hover:text-zinc-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Nome do Produto */}
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">
                Nome do Produto *
              </label>
              <input 
                type="text"
                required
                autoFocus={!isQueryBarcode}
                placeholder="Ex: Conjunto Brinco e Colar Ponto de Luz"
                value={name}
                maxLength={100}
                onChange={e => {
                  setName(e.target.value);
                  if (!labelName) setLabelName(e.target.value);
                }}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm text-zinc-800 focus:border-emerald-500 outline-none transition-all font-medium"
              />
            </div>

            {/* Nome na Etiqueta */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">
                Nome na Etiqueta
              </label>
              <input 
                type="text"
                placeholder="Ex: Conjunto Ponto Luz"
                value={labelName}
                maxLength={40}
                onChange={e => setLabelName(e.target.value)}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2.5 text-sm text-zinc-800 focus:border-emerald-500 outline-none transition-all"
              />
            </div>

            {/* Categoria */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">
                Categoria (Opcional)
              </label>
              <input 
                type="text"
                placeholder="Ex: Brincos, Colares, Batons..."
                value={category}
                maxLength={50}
                onChange={e => setCategory(e.target.value)}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2.5 text-sm text-zinc-800 focus:border-emerald-500 outline-none transition-all"
              />
            </div>

            {/* Código de Barras / EAN */}
            <div className="space-y-1.5 sm:col-span-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">
                  Código de Barras / EAN (Bipe ou digite)
                </label>
                <button
                  type="button"
                  onClick={handleGenerateBarcode}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 hover:text-emerald-700 hover:underline"
                >
                  <Sparkles className="w-3 h-3" />
                  Gerar Código Automático
                </button>
              </div>
              <div className="relative">
                <input 
                  type="text"
                  placeholder="Bipe com o leitor ou digite o código..."
                  value={barcode}
                  onChange={e => {
                    setBarcode(e.target.value);
                    if (!ean || ean === barcode) setEan(e.target.value);
                  }}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2.5 pl-10 text-sm text-zinc-800 focus:border-emerald-500 outline-none transition-all font-mono"
                />
                <Barcode className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              </div>
            </div>

            {/* Preço de Venda */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">
                Preço de Venda (R$) *
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-zinc-400">R$</span>
                <input 
                  type="text"
                  required
                  inputMode="numeric"
                  placeholder="0,00"
                  value={salePriceInput}
                  onChange={e => setSalePriceInput(formatMoneyInput(e.target.value))}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2.5 pl-10 text-sm font-bold text-emerald-700 focus:border-emerald-500 outline-none transition-all"
                />
              </div>
            </div>

            {/* Preço de Custo */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">
                Preço de Custo (R$)
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-zinc-400">R$</span>
                <input 
                  type="text"
                  inputMode="numeric"
                  placeholder="0,00"
                  value={costPriceInput}
                  onChange={e => setCostPriceInput(formatMoneyInput(e.target.value))}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2.5 pl-10 text-sm text-zinc-700 focus:border-emerald-500 outline-none transition-all"
                />
              </div>
            </div>

            {/* Estoque Inicial (quando sem grade) */}
            {!hasGrid && (
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">
                  Estoque Inicial Disponível
                </label>
                <input 
                  type="number"
                  min="0"
                  placeholder="1"
                  value={stockInput}
                  onChange={e => setStockInput(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2.5 text-sm text-zinc-800 focus:border-emerald-500 outline-none transition-all"
                />
                <p className="text-[11px] text-zinc-400">
                  Dica: Para colocar na sacola agora, certifique-se de que o estoque seja de pelo menos 1 unidade.
                </p>
              </div>
            )}
          </div>

          {/* Toggle Grade de Variações */}
          <div className="pt-2 border-t border-zinc-100">
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-sm font-bold text-zinc-700 block">Produto com Grade (Cor / Tamanho)</span>
                <span className="text-xs text-zinc-400">Ative se o produto tiver variações específicas</span>
              </div>
              <button
                type="button"
                onClick={() => setHasGrid(!hasGrid)}
                className={cn(
                  "w-11 h-6 rounded-full transition-colors relative",
                  hasGrid ? "bg-emerald-600" : "bg-zinc-200"
                )}
              >
                <div className={cn(
                  "w-4 h-4 bg-white rounded-full transition-transform absolute top-1",
                  hasGrid ? "left-6" : "left-1"
                )} />
              </button>
            </div>

            {hasGrid && (
              <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-200 space-y-3 animate-in fade-in duration-200">
                <div className="grid grid-cols-3 gap-2">
                  <input 
                    type="text"
                    placeholder="Cor (ex: Dourado)"
                    value={gridColor}
                    onChange={e => setGridColor(e.target.value)}
                    className="bg-white border border-zinc-200 rounded-xl px-3 py-2 text-xs focus:border-emerald-500 outline-none"
                  />
                  <input 
                    type="text"
                    placeholder="Tamanho (ex: U, P, 18)"
                    value={gridSize}
                    onChange={e => setGridSize(e.target.value)}
                    className="bg-white border border-zinc-200 rounded-xl px-3 py-2 text-xs focus:border-emerald-500 outline-none"
                  />
                  <div className="flex gap-1.5">
                    <input 
                      type="number"
                      min="1"
                      placeholder="Qtd"
                      value={gridQty}
                      onChange={e => setGridQty(e.target.value)}
                      className="w-16 bg-white border border-zinc-200 rounded-xl px-2 py-2 text-xs focus:border-emerald-500 outline-none text-center"
                    />
                    <button
                      type="button"
                      onClick={handleAddGridItem}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {gridData.length > 0 && (
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pt-1">
                    {gridData.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-white px-3 py-1.5 rounded-lg border border-zinc-200 text-xs">
                        <span className="font-medium text-zinc-700">{item.color} — {item.size}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-emerald-600">{item.quantity} un</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveGridItem(idx)}
                            className="text-red-500 hover:text-red-700 p-0.5"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Checkbox Adicionar Automaticamente à Sacola */}
          <div className="p-3.5 bg-emerald-50/60 rounded-2xl border border-emerald-100 flex items-center gap-3">
            <input 
              type="checkbox"
              id="autoAddToBag"
              checked={autoAddToBag}
              onChange={e => setAutoAddToBag(e.target.checked)}
              className="w-4 h-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
            />
            <label htmlFor="autoAddToBag" className="text-xs font-bold text-emerald-900 cursor-pointer select-none">
              Adicionar este produto imediatamente à sacola em montagem
            </label>
          </div>

          {/* Modal Footer */}
          <div className="pt-3 border-t border-zinc-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
            <button 
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-sm text-zinc-600 hover:text-zinc-800 font-bold transition-colors bg-zinc-100 hover:bg-zinc-200 rounded-xl text-center"
            >
              Cancelar
            </button>
            <button 
              type="submit"
              disabled={saving}
              className="flex items-center justify-center gap-2 bg-[#00a86b] hover:bg-[#008f5b] text-white px-6 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>Salvar Produto</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
