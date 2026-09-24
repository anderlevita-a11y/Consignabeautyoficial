import React, { useState, useEffect, useRef } from 'react';
import { Save, X, Search, ShoppingBag, User, Package, Trash2, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Product, Customer } from '../types';
import { cn, formatError, doesProductMatchBarcode, isBarcodeMatch, isStrictBarcodeMatch, getProductDisplayCode, stripLeadingZeros } from '../lib/utils';
import { useNotifications } from './NotificationCenter';
import { ConfirmationModal } from './ConfirmationModal';
import { sanitizeString } from '../lib/sanitizer';

interface BagFormProps {
  onClose: () => void;
  onSave: () => void;
  campaignId?: string;
  bagId?: string;
}

interface BagItem {
  product: Product;
  quantity: number;
  color?: string;
  size?: string;
}

export function BagForm({ onClose, onSave, campaignId, bagId }: BagFormProps) {
  const { addNotification } = useNotifications();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(!!bagId);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [noStock, setNoStock] = useState(false);
  const [isInstallmentPlan, setIsInstallmentPlan] = useState(false);
  const [installmentsCount, setInstallmentsCount] = useState<number>(1);
  const [items, setItems] = useState<BagItem[]>([]);
  const [originalItems, setOriginalItems] = useState<BagItem[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [isGridModalOpen, setIsGridModalOpen] = useState(false);
  const [selectedProductForGrid, setSelectedProductForGrid] = useState<Product | null>(null);
  const [gridForm, setGridForm] = useState({ color: '', size: '' });
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [customerSearch, setCustomerSearch] = useState('');
  const productInputRef = useRef<HTMLInputElement>(null);
  const lastScanRef = useRef<{ code: string; time: number }>({ code: '', time: 0 });
  const scanTimerRef = useRef<NodeJS.Timeout | null>(null);

  const focusProductInput = () => {
    requestAnimationFrame(() => {
      productInputRef.current?.focus();
    });
    setTimeout(() => {
      productInputRef.current?.focus();
    }, 20);
    setTimeout(() => {
      productInputRef.current?.focus();
    }, 80);
  };

  useEffect(() => {
    if (!initialLoading && !isGridModalOpen) {
      focusProductInput();
    }
  }, [initialLoading, isGridModalOpen]);

  useEffect(() => {
    return () => {
      if (scanTimerRef.current) {
        clearTimeout(scanTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => setFeedback(null), 2500);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  useEffect(() => {
    fetchInitialData();
  }, []);

  async function fetchInitialData() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
      if (!user) return;

      // Fetch Customers in chunks
      let allCustomers: any[] = [];
      let cFrom = 0;
      let cTo = 999;
      let cHasMore = true;
      while (cHasMore) {
        const { data, error } = await supabase
          .from('customers')
          .select('id, nome, cpf')
          .eq('user_id', user.id)
          .order('nome')
          .range(cFrom, cTo);
        if (error) throw error;
        if (data && data.length > 0) {
          allCustomers = [...allCustomers, ...data];
          cFrom += 1000;
          cTo += 1000;
        } else {
          cHasMore = false;
        }
        if (allCustomers.length >= 10000) cHasMore = false;
      }
      setCustomers(allCustomers);

      // Fetch Products in chunks
      let allProducts: any[] = [];
      let pFrom = 0;
      let pTo = 999;
      let pHasMore = true;
      while (pHasMore) {
        const { data, error } = await supabase
          .from('products')
          .select('id, name, ean, ean_variations, sale_price, current_stock, label_name, has_grid, grid_data')
          .eq('user_id', user.id)
          .order('name')
          .range(pFrom, pTo);
        if (error) throw error;
        if (data && data.length > 0) {
          allProducts = [...allProducts, ...data];
          pFrom += 1000;
          pTo += 1000;
        } else {
          pHasMore = false;
        }
        if (allProducts.length >= 10000) pHasMore = false;
      }
      setProducts(allProducts);

      // If editing, fetch bag and items
      if (bagId) {
        const { data: bag, error: bagError } = await supabase
          .from('bags')
          .select('*')
          .eq('id', bagId)
          .single();
        
        if (bagError) throw bagError;
        if (bag) {
          setSelectedCustomer(bag.customer_id || '');
          setNotes(bag.notes || '');
          setIsInstallmentPlan(!!bag.installments && bag.installments > 1);
          setInstallmentsCount(bag.installments || 1);
          
          const { data: bagItems, error: itemsError } = await supabase
            .from('bag_items')
            .select('*')
            .eq('bag_id', bagId);
          
          if (itemsError) throw itemsError;
          if (bagItems) {
            const mappedItems = bagItems.map(item => {
              const product = allProducts.find(p => p.id === item.product_id);
              return {
                product: product || {
                  id: item.product_id,
                  name: item.product_name,
                  sale_price: item.unit_price,
                  current_stock: 0
                },
                quantity: item.quantity,
                color: item.color,
                size: item.size
              };
            });
            setItems(mappedItems);
            setOriginalItems(mappedItems);
          }
        }
      }
    } catch (err) {
      console.error('Error fetching initial data:', err);
      addNotification({
        type: 'error',
        title: 'Erro ao carregar dados',
        message: formatError(err)
      });
    } finally {
      setInitialLoading(false);
    }
  }

  const addItem = (product: Product, color?: string, size?: string) => {
    if (!noStock && product.current_stock <= 0) {
      addNotification({
        type: 'warning',
        title: 'Sem estoque',
        message: 'Produto indisponível no estoque.'
      });
      setFeedback({ message: 'Sem estoque', type: 'error' });
      setProductSearch('');
      if (productInputRef.current) productInputRef.current.value = '';
      focusProductInput();
      return;
    }

    if (product.has_grid && !color && !size) {
      setSelectedProductForGrid(product);
      setIsGridModalOpen(true);
      return;
    }

    const existing = items.find(i => 
      i.product.id === product.id && 
      i.color === color && 
      i.size === size
    );
    if (existing) {
      const remaining = items.filter(i => 
        !(i.product.id === product.id && i.color === color && i.size === size)
      );
      setItems([{ ...existing, quantity: existing.quantity + 1 }, ...remaining]);
    } else {
      setItems([{ product, quantity: 1, color, size }, ...items]);
    }
    const codeDisplay = getProductDisplayCode(product);
    setFeedback({ 
      message: codeDisplay 
        ? `Adicionado: ${product.name} (Cód: ${codeDisplay})` 
        : `Adicionado: ${product.name}`, 
      type: 'success' 
    });
    setProductSearch('');
    if (productInputRef.current) productInputRef.current.value = '';
    setIsGridModalOpen(false);
    setSelectedProductForGrid(null);
    setGridForm({ color: '', size: '' });
    focusProductInput();
  };

  const confirmRemoveItem = (productId: string) => {
    setItemToDelete(productId);
  };

  const removeItem = () => {
    if (itemToDelete) {
      setItems(items.filter(i => `${i.product.id}-${i.color}-${i.size}` !== itemToDelete));
      setItemToDelete(null);
    }
  };

  const updateQuantity = (productId: string, delta: number, color?: string, size?: string) => {
    setItems(items.map(i => {
      if (i.product.id === productId && i.color === color && i.size === size) {
        const newQty = Math.max(1, i.quantity + delta);
        return { ...i, quantity: newQty };
      }
      return i;
    }));
  };

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
  const totalValue = items.reduce((sum, i) => sum + (i.product.sale_price * i.quantity), 0);

  const handleSubmit = async () => {
    if (loading) return;

    if (items.length === 0) {
      addNotification({
        type: 'warning',
        title: 'Aviso',
        message: 'Adicione pelo menos um produto'
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
      if (!user) return;

      // 1. Create or Update Bag
      let bag;
      if (bagId) {
        // Revert stock for original items first
        if (!noStock) {
          for (const item of originalItems) {
            const { data: product } = await supabase
              .from('products')
              .select('current_stock, has_grid, grid_data')
              .eq('id', item.product.id)
              .single();
            
            if (product) {
              let updateData: any = { 
                current_stock: Number(product.current_stock || 0) + item.quantity 
              };

              if (product.has_grid && product.grid_data && item.color && item.size) {
                const newGridData = product.grid_data.map((g: any) => {
                  if (g.color === item.color && g.size === item.size) {
                    return { ...g, quantity: (g.quantity || 0) + item.quantity };
                  }
                  return g;
                });
                updateData.grid_data = newGridData;
              }

              await supabase
                .from('products')
                .update(updateData)
                .eq('id', item.product.id);
            }
          }
        }

        const { data: updatedBag, error: bagError } = await supabase
          .from('bags')
          .update({
            customer_id: selectedCustomer || null,
            notes: sanitizeString(notes) || null,
            installments: isInstallmentPlan ? installmentsCount : 1,
            total_value: totalValue,
            total_items: totalItems,
            updated_at: new Date().toISOString()
          })
          .eq('id', bagId)
          .select()
          .single();
        
        if (bagError) {
          console.error('Erro ao salvar sacola:', bagError);
          throw bagError;
        }
        bag = updatedBag;

        // Delete old items
        const { error: deleteError } = await supabase
          .from('bag_items')
          .delete()
          .eq('bag_id', bagId);
        
        if (deleteError) throw deleteError;
      } else {
        // Get next bag number
        const { data: lastBag } = await supabase
          .from('bags')
          .select('bag_number')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        let nextNumber = 1;
        if (lastBag) {
          const match = lastBag.bag_number.match(/\d+/);
          if (match) {
            nextNumber = parseInt(match[0]) + 1;
          }
        }

        const { data: newBag, error: bagError } = await supabase
          .from('bags')
          .insert([{
            bag_number: `M${nextNumber.toString().padStart(4, '0')}`,
            customer_id: selectedCustomer || null,
            campaign_id: campaignId || null,
            notes: notes || null,
            installments: isInstallmentPlan ? installmentsCount : 1,
            status: 'open',
            total_value: totalValue,
            total_items: totalItems,
            payment_status: 'pending',
            user_id: user.id
          }])
          .select()
          .single();

        if (bagError) {
          console.error('Erro ao inserir sacola:', bagError);
          throw bagError;
        }
        bag = newBag;
      }

      // 2. Create Bag Items
      const bagItems = items.map(item => ({
        bag_id: bag.id,
        product_id: item.product.id,
        product_name: item.product.name,
        quantity: item.quantity,
        returned_quantity: 0,
        unit_price: item.product.sale_price,
        color: item.color || null,
        size: item.size || null
      }));

      const { error: itemsError } = await supabase
        .from('bag_items')
        .insert(bagItems);

      if (itemsError) throw itemsError;

      // 3. Update stock if not noStock
      if (!noStock) {
        for (const item of items) {
          const { data: product } = await supabase
            .from('products')
            .select('current_stock, has_grid, grid_data')
            .eq('id', item.product.id)
            .single();
          
          if (product) {
            let updateData: any = { 
              current_stock: Math.max(0, Number(product.current_stock || 0) - item.quantity) 
            };

            if (product.has_grid && product.grid_data && item.color && item.size) {
              const newGridData = product.grid_data.map((g: any) => {
                if (g.color === item.color && g.size === item.size) {
                  return { ...g, quantity: Math.max(0, (g.quantity || 0) - item.quantity) };
                }
                return g;
              });
              updateData.grid_data = newGridData;
            }

            await supabase
              .from('products')
              .update(updateData)
              .eq('id', item.product.id);
          }
        }
      }

      onSave();
    } catch (err) {
      console.error('Error saving bag:', err);
      addNotification({
        type: 'error',
        title: 'Erro ao salvar sacola',
        message: formatError(err)
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = productSearch 
    ? products.filter(p => {
        const search = productSearch.toLowerCase().trim();
        const searchStripped = stripLeadingZeros(search);

        const nameMatch = (p.name?.toLowerCase() || '').includes(search);
        const labelMatch = (p.label_name?.toLowerCase() || '').includes(search);

        // 1. Match estrito de código (EAN, barcode ou variações)
        const codeStrict = isStrictBarcodeMatch(p, search);

        // 2. Prefixo de código (quando o usuário está digitando o início do código)
        const eanStr = (p.ean || '').toLowerCase().trim();
        const eanStripped = stripLeadingZeros(eanStr);
        const barcodeStr = (p.barcode || '').toLowerCase().trim();
        const barcodeStripped = stripLeadingZeros(barcodeStr);

        const codePrefixMatch = 
          (eanStr.length > 0 && eanStr.startsWith(search)) ||
          (eanStripped.length > 0 && searchStripped.length >= 2 && eanStripped.startsWith(searchStripped)) ||
          (barcodeStr.length > 0 && barcodeStr.startsWith(search)) ||
          (barcodeStripped.length > 0 && searchStripped.length >= 2 && barcodeStripped.startsWith(searchStripped));

        // 3. Substring de código (o código do produto contém a busca, NUNCA o contrário)
        const codeContainsMatch = 
          (eanStr.length > 0 && eanStr.includes(search)) ||
          (barcodeStr.length > 0 && barcodeStr.includes(search));

        const varMatch = (p.ean_variations || []).some(v => {
          const vStr = (v || '').toLowerCase().trim();
          const vStripped = stripLeadingZeros(vStr);
          return isBarcodeMatch(v, search) || 
                 (vStr.length > 0 && vStr.startsWith(search)) ||
                 (vStripped.length > 0 && searchStripped.length >= 2 && vStripped.startsWith(searchStripped)) ||
                 (vStr.length > 0 && vStr.includes(search));
        });

        return codeStrict || codePrefixMatch || codeContainsMatch || varMatch || nameMatch || labelMatch;
      }).sort((a, b) => {
        // Prioridade 1: Match EXATO de código no topo absoluto
        const search = productSearch.toLowerCase().trim();
        const aExact = isStrictBarcodeMatch(a, search) ? 1 : 0;
        const bExact = isStrictBarcodeMatch(b, search) ? 1 : 0;
        if (aExact !== bExact) return bExact - aExact;

        // Prioridade 2: Código que começa com o que foi digitado
        const aCode = (a.ean || a.barcode || '').toLowerCase();
        const bCode = (b.ean || b.barcode || '').toLowerCase();
        const aPrefix = aCode.startsWith(search) ? 1 : 0;
        const bPrefix = bCode.startsWith(search) ? 1 : 0;
        if (aPrefix !== bPrefix) return bPrefix - aPrefix;

        return 0;
      }).slice(0, 50)
    : [];

  const handleProductSearchChange = (val: string) => {
    if (scanTimerRef.current) {
      clearTimeout(scanTimerRef.current);
      scanTimerRef.current = null;
    }

    setProductSearch(val);
    const trimmed = val.trim();
    if (!trimmed) return;

    // Não adicionamos imediatamente no onChange para não interromper a leitura do leitor físico
    // (ex: ler 00000000032063 não pode disparar ao passar pelos caracteres de 0000000003206).
    // Leitores enviam 'Enter' ao final. Para scanners sem Enter, usamos um debounce seguro de 450ms.
    const isCodeLike = /^\d{3,}$/.test(trimmed) || trimmed.length >= 6;
    if (isCodeLike) {
      scanTimerRef.current = setTimeout(() => {
        processProductEntry(trimmed);
      }, 450);
    }
  };

  const processProductEntry = (rawValue?: string) => {
    if (scanTimerRef.current) {
      clearTimeout(scanTimerRef.current);
      scanTimerRef.current = null;
    }

    const raw = rawValue !== undefined ? rawValue : (productInputRef.current?.value || productSearch);
    const search = (raw || '').trim();

    if (!search) {
      setProductSearch('');
      if (productInputRef.current) productInputRef.current.value = '';
      focusProductInput();
      return;
    }

    const now = Date.now();
    const codeNorm = search.toLowerCase();
    // Prevenção de duplicatas disparadas em milissegundos (< 600ms)
    if (lastScanRef.current.code === codeNorm && now - lastScanRef.current.time < 600) {
      setProductSearch('');
      if (productInputRef.current) productInputRef.current.value = '';
      focusProductInput();
      return;
    }

    lastScanRef.current = { code: codeNorm, time: now };

    // 1. PRIORIDADE ABSOLUTA: Match EXATO de código de barras / EAN / Barcode
    let match = products.find(p => isStrictBarcodeMatch(p, search));

    // 2. Se não achou por código exato, verifica se o nome ou marca é idêntico
    if (!match) {
      const searchLower = search.toLowerCase();
      match = products.find(p => 
        (p.name && p.name.trim().toLowerCase() === searchLower) ||
        (p.label_name && p.label_name.trim().toLowerCase() === searchLower)
      );
    }

    // 3. Se for código numérico (ex: bipa código de barras com números) e não bateu exato:
    // NUNCA selecionar o primeiro produto arbitrariamente! Deve alertar que o código não foi localizado.
    const isNumericCode = /^\d{3,}$/.test(search);

    if (!match && !isNumericCode) {
      // Se for busca textual manual (ex: nome de produto digitado):
      const searchLower = search.toLowerCase();
      const textMatches = products.filter(p => 
        (p.name?.toLowerCase() || '').includes(searchLower) ||
        (p.label_name?.toLowerCase() || '').includes(searchLower)
      );

      // Se houver exatamente 1 produto correspondente na busca textual, adiciona
      if (textMatches.length === 1) {
        match = textMatches[0];
      }
    }

    if (match) {
      addItem(match);
    } else {
      // Alerta claro com o código ou termo pesquisado
      const errorMsg = isNumericCode 
        ? `Código "${search}" não localizado` 
        : `Produto "${search}" não localizado`;
      setFeedback({ message: errorMsg, type: 'error' });
      
      setProductSearch('');
      if (productInputRef.current) {
        productInputRef.current.value = '';
      }
      setTimeout(() => {
        setProductSearch('');
        if (productInputRef.current) {
          productInputRef.current.value = '';
        }
      }, 0);
      focusProductInput();
    }
  };

  const handleProductKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === 'Tab' || e.code === 'NumpadEnter' || e.keyCode === 13 || e.keyCode === 9) {
      e.preventDefault();
      e.stopPropagation();
      if (scanTimerRef.current) {
        clearTimeout(scanTimerRef.current);
        scanTimerRef.current = null;
      }
      processProductEntry(e.currentTarget.value);
    }
  };

  const filteredCustomers = customerSearch
    ? customers.filter(c => c.nome.toLowerCase().includes(customerSearch.toLowerCase()) || String(c.cpf || '').includes(customerSearch)).slice(0, 50)
    : [];

  if (initialLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
        <p className="text-zinc-500 font-medium">Carregando dados da sacola...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-zinc-800 tracking-tight">Sacolas</h2>
        <button 
          onClick={handleSubmit}
          disabled={loading}
          className="flex items-center justify-center gap-2 bg-[#00a86b] hover:bg-[#008f5b] text-white px-6 py-3 sm:py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 w-full sm:w-auto"
        >
          <Save className="w-4 h-4" />
          Salvar Sacola
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-6 border-b border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button onClick={onClose} className="p-2 hover:bg-zinc-100 rounded-lg transition-colors">
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
                <h3 className="font-serif italic text-xl text-zinc-700">Montagem da Sacola</h3>
              </div>
              <div className="w-full sm:flex-1 sm:max-w-xs sm:ml-8 relative">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Cliente (Opcional)</label>
                {selectedCustomer ? (
                  <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2">
                    <span className="text-sm font-bold text-emerald-800">
                      {customers.find(c => c.id === selectedCustomer)?.nome}
                    </span>
                    <button 
                      onClick={() => {
                        setSelectedCustomer('');
                        setCustomerSearch('');
                      }}
                      className="text-emerald-600 hover:text-emerald-800"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <input 
                      type="text" 
                      placeholder="Digite o nome ou CPF..."
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2 text-sm text-zinc-800 focus:border-emerald-500 outline-none transition-all"
                    />
                    {filteredCustomers.length > 0 && (
                      <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-zinc-200 rounded-xl shadow-xl max-h-60 overflow-y-auto">
                        {filteredCustomers.map(c => (
                          <button 
                            key={c.id}
                            onClick={() => {
                              setSelectedCustomer(c.id);
                              setCustomerSearch('');
                            }}
                            className="w-full flex items-center gap-3 px-4 py-2 hover:bg-zinc-50 text-left border-b border-zinc-50 last:border-0"
                          >
                            <div>
                              <p className="text-sm font-bold text-zinc-800">{c.nome}</p>
                              <p className="text-[10px] text-zinc-400">CPF: {c.cpf || '---'}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2 relative">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Produto (Bipe o código ou digite nome/código)</label>
                  <div className="relative">
                    <input 
                      ref={productInputRef}
                      type="text" 
                      placeholder="Bipe com leitor de código de barras ou digite..."
                      value={productSearch}
                      onChange={(e) => handleProductSearchChange(e.target.value)}
                      onKeyDown={handleProductKeyDown}
                      onKeyUp={(e) => {
                        if (e.key === 'Enter' || e.key === 'Tab' || e.code === 'NumpadEnter' || e.keyCode === 13 || e.keyCode === 9) {
                          e.preventDefault();
                          e.stopPropagation();
                        }
                      }}
                      className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-3 text-sm text-zinc-800 focus:border-emerald-500 outline-none transition-all font-medium"
                    />
                    <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-300" />
                  </div>
                  
                  {filteredProducts.length > 0 && (
                    <div className="absolute z-20 top-full left-0 right-0 mt-2 bg-white border border-zinc-200 rounded-xl shadow-xl max-h-64 overflow-y-auto">
                      <div className="p-2.5 bg-zinc-50 border-b border-zinc-100 text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center justify-between">
                        <span>{filteredProducts.length} {filteredProducts.length === 1 ? 'item encontrado' : 'itens encontrados'} — clique ou dê Enter para incluir:</span>
                      </div>
                      {filteredProducts.map(p => {
                        const code = getProductDisplayCode(p);
                        const isExact = isStrictBarcodeMatch(p, productSearch);
                        return (
                          <button 
                            key={p.id}
                            type="button"
                            onClick={() => addItem(p)}
                            className={cn(
                              "w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 text-left border-b border-zinc-50 last:border-0 transition-colors",
                              isExact && "bg-emerald-50/50 hover:bg-emerald-50 border-l-4 border-l-emerald-500"
                            )}
                          >
                            <div className={cn(
                              "w-8 h-8 rounded flex items-center justify-center shrink-0",
                              isExact ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-400"
                            )}>
                              <Package className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-bold text-zinc-800 truncate">{p.name}</p>
                                {isExact && (
                                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded shrink-0">
                                    Código Exato
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                <span className="font-mono text-[11px] font-bold text-zinc-700 bg-zinc-100 px-1.5 py-0.5 rounded border border-zinc-200">
                                  Cód: {code || 'Sem código'}
                                </span>
                                {p.label_name && <span className="text-[11px] text-zinc-400 truncate">{p.label_name}</span>}
                                <span className="text-[11px] text-zinc-400">Estoque: {p.current_stock}</span>
                              </div>
                            </div>
                            <p className="ml-auto text-sm font-bold text-emerald-600 shrink-0">R$ {p.sale_price.toFixed(2)}</p>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Anotações</label>
                  <textarea 
                    placeholder="Observações ou anotações sobre esta sacola..."
                    value={notes}
                    maxLength={500}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-3 text-sm text-zinc-800 focus:border-emerald-500 outline-none transition-all resize-none"
                  />
                </div>
              </div>

              <div className="bg-zinc-50 rounded-2xl p-4 flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <input 
                    type="checkbox" 
                    id="noStock"
                    checked={noStock}
                    onChange={(e) => setNoStock(e.target.checked)}
                    className="w-5 h-5 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <label htmlFor="noStock" className="text-sm font-medium text-zinc-600 cursor-pointer">
                    Criar sacola sem usar o estoque
                  </label>
                </div>

                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <input 
                      type="checkbox" 
                      id="installmentPlan"
                      checked={isInstallmentPlan}
                      onChange={(e) => {
                        setIsInstallmentPlan(e.target.checked);
                        if (e.target.checked && installmentsCount < 2) {
                          setInstallmentsCount(2);
                        }
                      }}
                      className="w-5 h-5 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <label htmlFor="installmentPlan" className="text-sm font-medium text-zinc-600 cursor-pointer">
                      Parcelar valor da sacola
                    </label>
                  </div>

                  {isInstallmentPlan && (
                    <div className="pl-8 animate-in slide-in-from-left-2 duration-200">
                      <div className="flex items-center gap-4">
                        <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Nº de Parcelas</label>
                        <select
                          value={installmentsCount}
                          onChange={(e) => setInstallmentsCount(Number(e.target.value))}
                          className="bg-white border border-zinc-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-emerald-500"
                        >
                          {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => (
                            <option key={n} value={n}>{n}x</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-100">
                      <th className="py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Produto</th>
                      <th className="py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-center">Qtd</th>
                      <th className="py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right">Preço</th>
                      <th className="py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right">Subtotal</th>
                      <th className="py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    {items.map((item) => (
                      <tr key={`${item.product.id}-${item.color || ''}-${item.size || ''}`} className="group">
                        <td className="py-4">
                          <p className="text-sm font-bold text-zinc-800">{item.product.name}</p>
                          <div className="flex items-center gap-2 flex-wrap mt-1">
                            <span className="font-mono text-[11px] font-bold bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded border border-zinc-200">
                              Cód: {getProductDisplayCode(item.product) || 'Sem código'}
                            </span>
                            {item.product.label_name && (
                              <p className="text-[11px] text-zinc-400">{item.product.label_name}</p>
                            )}
                            {(item.color || item.size) && (
                              <span className="text-[10px] bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded">
                                {item.color && `Cor: ${item.color}`}
                                {item.color && item.size && ' | '}
                                {item.size && `Tam: ${item.size}`}
                              </span>
                            )}
                            <span className="text-[11px] text-zinc-400">Estoque: {item.product.current_stock}</span>
                          </div>
                        </td>
                        <td className="py-4">
                          <div className="flex items-center justify-center gap-3">
                            <button 
                              onClick={() => updateQuantity(item.product.id, -1, item.color, item.size)}
                              className="w-6 h-6 rounded-full border border-zinc-200 flex items-center justify-center text-zinc-400 hover:border-emerald-500 hover:text-emerald-500 transition-all"
                            >
                              -
                            </button>
                            <span className="text-sm font-bold text-zinc-800 w-4 text-center">{item.quantity}</span>
                            <button 
                              onClick={() => updateQuantity(item.product.id, 1, item.color, item.size)}
                              className="w-6 h-6 rounded-full border border-zinc-200 flex items-center justify-center text-zinc-400 hover:border-emerald-500 hover:text-emerald-500 transition-all"
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td className="py-4 text-right text-sm text-zinc-500">
                          R$ {item.product.sale_price.toFixed(2)}
                        </td>
                        <td className="py-4 text-right text-sm font-bold text-zinc-800">
                          R$ {(item.product.sale_price * item.quantity).toFixed(2)}
                        </td>
                        <td className="py-4 text-right">
                          <button 
                            onClick={() => setItemToDelete(`${item.product.id}-${item.color}-${item.size}`)}
                            className="p-2 text-zinc-300 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {items.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-zinc-400 text-sm italic">
                          Nenhum produto adicionado à sacola.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white border border-zinc-200 rounded-2xl p-8 shadow-sm space-y-8 sticky top-24">
            <h3 className="font-serif italic text-xl text-zinc-700">Resumo da Sacola</h3>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between text-zinc-500">
                <span className="text-sm">Total de Itens</span>
                <span className="font-bold">{totalItems}</span>
              </div>
              <div className="pt-4 border-t border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0">
                <span className="text-lg font-bold text-zinc-800">Valor Total</span>
                <span className="text-2xl font-bold text-[#00a86b]">R$ {totalValue.toFixed(2)}</span>
              </div>
              {isInstallmentPlan && (
                <div className="flex flex-col items-end gap-1 pt-2">
                  <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Plano de Parcelamento</span>
                  <p className="text-emerald-600 font-black text-xl">
                    {Math.max(2, installmentsCount)}x de R$ {(totalValue / Math.max(2, installmentsCount)).toFixed(2)}
                  </p>
                  <p className="text-[10px] text-zinc-400 italic">Total parcelado</p>
                </div>
              )}
            </div>

            <button 
              onClick={handleSubmit}
              disabled={loading || items.length === 0}
              className="w-full bg-[#87ccb0] hover:bg-[#00a86b] text-white py-5 rounded-2xl font-bold text-lg transition-all shadow-lg shadow-emerald-900/5 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : 'Finalizar Sacola'}
            </button>
          </div>
        </div>
      </div>

      {/* Grid Selection Modal */}
      {isGridModalOpen && selectedProductForGrid && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-md p-8 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-serif italic text-zinc-900">Selecionar Variação</h3>
              <button 
                onClick={() => {
                  setIsGridModalOpen(false);
                  setSelectedProductForGrid(null);
                  setGridForm({ color: '', size: '' });
                  focusProductInput();
                }} 
                className="p-2 hover:bg-zinc-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-zinc-400" />
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <p className="text-sm font-bold text-zinc-800 mb-1">{selectedProductForGrid.name}</p>
                <p className="text-xs text-zinc-400">Escolha a cor e o tamanho para adicionar à sacola.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-2">Cor</label>
                  <div className="flex flex-wrap gap-2">
                    {Array.from(new Set(selectedProductForGrid.grid_data?.map(g => g.color))).map(color => (
                      <button
                        key={color}
                        onClick={() => setGridForm(prev => ({ ...prev, color, size: '' }))}
                        className={cn(
                          "px-4 py-2 rounded-xl border text-xs font-bold transition-all",
                          gridForm.color === color 
                            ? "border-emerald-500 text-emerald-600 bg-emerald-50" 
                            : "border-zinc-200 text-zinc-600 hover:border-zinc-300"
                        )}
                      >
                        {color}
                      </button>
                    ))}
                  </div>
                </div>

                {gridForm.color && (
                  <div>
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-2">Tamanho</label>
                    <div className="flex flex-wrap gap-2">
                      {selectedProductForGrid.grid_data
                        ?.filter(g => g.color === gridForm.color)
                        .map(g => (
                          <button
                            key={g.size}
                            disabled={g.quantity <= 0}
                            onClick={() => setGridForm(prev => ({ ...prev, size: g.size }))}
                            className={cn(
                              "w-10 h-10 rounded-xl border flex items-center justify-center text-xs font-bold transition-all",
                              g.quantity <= 0 
                                ? "opacity-30 cursor-not-allowed bg-zinc-50" 
                                : gridForm.size === g.size 
                                  ? "border-emerald-500 text-emerald-600 bg-emerald-50" 
                                  : "border-zinc-200 text-zinc-600 hover:border-zinc-300"
                            )}
                          >
                            {g.size}
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>

              <button
                disabled={!gridForm.color || !gridForm.size}
                onClick={() => addItem(selectedProductForGrid, gridForm.color, gridForm.size)}
                className="w-full bg-zinc-900 text-white py-4 rounded-2xl text-sm font-bold shadow-xl hover:bg-emerald-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Adicionar à Sacola
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={!!itemToDelete}
        title="Remover Item"
        message="Tem certeza que deseja remover este item da sacola?"
        onConfirm={removeItem}
        onCancel={() => setItemToDelete(null)}
        variant="danger"
        confirmText="Remover"
      />

      {/* Feedback Overlay */}
      {feedback && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-none animate-in fade-in zoom-in duration-200 p-4">
          <div className={cn(
            "px-8 py-6 max-w-xl w-full rounded-3xl shadow-2xl backdrop-blur-md flex flex-col items-center gap-3 border-4",
            feedback.type === 'success' 
              ? "bg-emerald-600/95 border-emerald-400 text-white" 
              : "bg-red-600/95 border-red-500 text-white"
          )}>
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-16 h-16 shrink-0" />
            ) : (
              <AlertCircle className="w-16 h-16 shrink-0" />
            )}
            <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-center break-words">
              {feedback.message}
            </h2>
          </div>
        </div>
      )}
    </div>
  );
}
