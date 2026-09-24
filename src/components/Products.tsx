import React, { useEffect, useState, useMemo } from 'react';
import { 
  Plus, 
  Search, 
  Filter, 
  Edit2,
  Trash2,
  Package as PackageIcon,
  AlertCircle,
  Loader2,
  Upload,
  CheckCircle2,
  X,
  Barcode,
  ChevronLeft,
  TrendingUp,
  History,
  Bell,
  Tag,
  Printer,
  Eye,
  Lock,
  Link as LinkIcon,
  Save
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { compressImage } from '../lib/image-utils';
import { Product, PriceSuggestion } from '../types';
import { ConfirmationModal } from './ConfirmationModal';
import { PrintPreview } from './PrintPreview';
import { LabelCenter } from './LabelCenter';
import { cn, printFallback, formatError, formatMoney, formatMoneyInput, parseMoney, isStrictBarcodeMatch, getProductDisplayCode, stripLeadingZeros } from '../lib/utils';
import { useNotifications } from './NotificationCenter';
import { detectUserDuplicates, resolveDuplicates, getLinkedProductIds } from '../lib/syncCatalog';
import { sanitizeString } from '../lib/sanitizer';

export function Products() {
  const { addNotification } = useNotifications();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;
  const [searchTerm, setSearchTerm] = useState('');
  const [view, setView] = useState<'list' | 'form' | 'import' | 'labels' | 'quick_entry'>('list');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [quickEntryList, setQuickEntryList] = useState<{
    product: Product;
    quantity: number;
    color?: string;
    size?: string;
  }[]>([]);
  const [quickEntrySearch, setQuickEntrySearch] = useState('');
  const [quickEntryQuantity, setQuickEntryQuantity] = useState('1');
  const [quickEntryLoading, setQuickEntryLoading] = useState(false);
  const [isQuickEntryGridModalOpen, setIsQuickEntryGridModalOpen] = useState(false);
  const [selectedProductForQuickEntryGrid, setSelectedProductForQuickEntryGrid] = useState<Product | null>(null);
  const [quickEntryGridForm, setQuickEntryGridForm] = useState({ color: '', size: '' });
  const [profile, setProfile] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

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

  // Import State
  const [importing, setImporting] = useState(false);
  const [excelData, setExcelData] = useState('');
  const [centralProducts, setCentralProducts] = useState<any[]>([]);
  const [centralSearchTerm, setCentralSearchTerm] = useState('');
  const [loadingCentral, setLoadingCentral] = useState(false);
  const [priceSuggestions, setPriceSuggestions] = useState<PriceSuggestion[]>([]);
  const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [pdfUrl, setPdfUrl] = useState('');
  const [previewType, setPreviewType] = useState<'termica' | 'a4' | 'etiqueta'>('etiqueta');
  const [selectedCentralProduct, setSelectedCentralProduct] = useState<any>(null);
  const [isCentralEditModalOpen, setIsCentralEditModalOpen] = useState(false);
  const [editingCentralProduct, setEditingCentralProduct] = useState<any>(null);
  const [centralEanVariationInput, setCentralEanVariationInput] = useState('');
  const [suggestionForm, setSuggestionForm] = useState({
    cost_price: '0,00',
    sale_price: '0,00'
  });
  const [priceHistory, setPriceHistory] = useState<PriceSuggestion[]>([]);
  const [selectedProductForLabels, setSelectedProductForLabels] = useState<Product | null>(null);
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);
  const [selectedDuplicateIds, setSelectedDuplicateIds] = useState<Set<string>>(new Set());
  const [linkedProductIds, setLinkedProductIds] = useState<Set<string>>(new Set());

  // Form State
  const [formData, setFormData] = useState<{
    name: string;
    label_name: string;
    ean: string;
    barcode: string;
    cost_price: string | number;
    sale_price: string | number;
    current_stock: string | number;
    photo_url: string;
    image_urls: string[];
    has_grid: boolean;
    category: string;
    is_visible_in_store: boolean;
    description: string;
    ean_variations: string[];
    grid_data: { color: string; size: string; quantity: number }[];
  }>({
    name: '',
    label_name: '',
    ean: '',
    barcode: '',
    ean_variations: [],
    cost_price: '0,00',
    sale_price: '0,00',
    current_stock: '',
    photo_url: '',
    image_urls: ['', '', ''],
    has_grid: false,
    category: '',
    is_visible_in_store: true,
    description: '',
    grid_data: []
  });

  const [isGridModalOpen, setIsGridModalOpen] = useState(false);
  const [gridForm, setGridForm] = useState({
    color: '',
    size: '',
    quantity: ''
  });
  const [storeSettings, setStoreSettings] = useState<any>(null);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [eanVariationInput, setEanVariationInput] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');

  useEffect(() => {
    fetchProfile();
    fetchStoreSettings();
    if (view === 'list' || view === 'import' || view === 'quick_entry') {
      if (view === 'import') fetchProducts(); // Import view needs all products usually? Or same logic?
      fetchCentralProducts();
      fetchPriceSuggestions();
    }

    const handleSyncEvent = () => {
      fetchProducts();
      if (view === 'import') {
        fetchCentralProducts();
      }
    };

    window.addEventListener('catalog_synced', handleSyncEvent);
    return () => window.removeEventListener('catalog_synced', handleSyncEvent);
  }, [view]);

  useEffect(() => {
    if (view !== 'list' && view !== 'quick_entry') return;

    const handler = setTimeout(() => {
      setPage(0);
      fetchProducts();
    }, 500);

    return () => clearTimeout(handler);
  }, [searchTerm, selectedCategory, view]);

  async function fetchStoreSettings() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
      if (!user) return;
      const { data } = await supabase
        .from('store_settings')
        .select('*')
        .eq('user_id', user.id)
        .single();
      if (data) setStoreSettings(data);
    } catch (err) {
      console.error('Error fetching store settings:', err);
    }
  }

  async function fetchPriceSuggestions() {
    try {
      const { data, error } = await supabase
        .from('price_suggestions')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setPriceSuggestions(data || []);
    } catch (err) {
      console.error('Error fetching price suggestions:', err);
    }
  }

  async function fetchProfile() {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (user) {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      if (data) setProfile(data);
    }
  }

  async function fetchCentralProducts() {
    setLoadingCentral(true);
    try {
      const { data, error } = await supabase
        .from('central_products')
        .select('*')
        .order('name', { ascending: true })
        .order('id', { ascending: true });
      if (error) throw error;
      
      // Ensure unique products by ID to avoid React key warnings
      const uniqueProducts = Array.from(new Map((data || []).map(p => [p.id, p])).values());
      setCentralProducts(uniqueProducts);
    } catch (err) {
      console.error('Error fetching central products:', err);
    } finally {
      setLoadingCentral(false);
    }
  }

  const handleDeleteCentralProduct = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Excluir Produto',
      message: 'Deseja excluir este produto da central?',
      variant: 'danger',
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from('central_products')
            .delete()
            .eq('id', id);
          if (error) throw error;
          fetchCentralProducts();
        } catch (err) {
          console.error('Error deleting central product:', err);
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

  const handleEditCentralProduct = (product: any) => {
    setEditingCentralProduct({
      ...product,
      ean_variations: product.ean_variations || []
    });
    setIsCentralEditModalOpen(true);
  };

  const handleSaveCentralProduct = async () => {
    if (!editingCentralProduct) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('central_products')
        .update({
          name: editingCentralProduct.name,
          label_name: editingCentralProduct.label_name,
          ean: editingCentralProduct.ean || null,
          ean_variations: editingCentralProduct.ean_variations,
          cost_price: editingCentralProduct.cost_price,
          sale_price: editingCentralProduct.sale_price
        })
        .eq('id', editingCentralProduct.id);

      if (error) throw error;

      addNotification({
        type: 'success',
        title: 'Sucesso',
        message: 'Produto da central atualizado com sucesso!'
      });
      setIsCentralEditModalOpen(false);
      fetchCentralProducts();
    } catch (err: any) {
      console.error('Error saving central product:', err);
      addNotification({
        type: 'error',
        title: 'Erro ao salvar',
        message: formatError(err)
      });
    } finally {
      setSaving(false);
    }
  };

  const handleClearCentral = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Limpar Central',
      message: 'ATENÇÃO: Deseja excluir TODOS os produtos da central? Esta ação não pode ser desfeita.',
      variant: 'danger',
      onConfirm: async () => {
        try {
          // Supabase requires a filter for delete. Using .not('id', 'is', null) is a safe way to target all rows.
          const { error } = await supabase
            .from('central_products')
            .delete()
            .not('id', 'is', null);
            
          if (error) throw error;
          
          await fetchCentralProducts();
          addNotification({
            type: 'success',
            title: 'Sucesso',
            message: 'Central de produtos limpa com sucesso!'
          });
        } catch (err: any) {
          console.error('Error clearing central:', err);
          addNotification({
            type: 'error',
            title: 'Erro ao limpar central',
            message: formatError(err)
          });
        } finally {
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const handleImportProducts = async () => {
    if (!excelData.trim()) {
      addNotification({
        type: 'warning',
        title: 'Aviso',
        message: 'Cole os dados do Excel primeiro.'
      });
      return;
    }

    setImporting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
      if (!user) throw new Error('Usuário não autenticado');

      const rows = excelData.split('\n').filter(row => row.trim());
      const productsToInsert = rows.map(row => {
        const cols = row.split('\t');
        // Sequence: nome produto, nome etiqueta, código EAN, custo, valor
        const name = sanitizeString(cols[0] || 'Produto Sem Nome');
        const label_name = sanitizeString(cols[1] || '');
        const ean = cols[2]?.trim() || '';
        const cost_price = parseFloat(cols[3]?.replace(',', '.') || '0');
        const sale_price = parseFloat(cols[4]?.replace(',', '.') || '0');
        const ean_variations = cols[5]?.split(',').map(v => v.trim()).filter(v => v) || [];

        return {
          user_id: user.id,
          name,
          label_name,
          ean,
          ean_variations,
          cost_price: isNaN(cost_price) ? 0 : cost_price,
          sale_price: isNaN(sale_price) ? 0 : sale_price,
          has_grid: false
        };
      });

      if (productsToInsert.length === 0) {
        addNotification({
          type: 'warning',
          title: 'Aviso',
          message: 'Nenhum dado válido encontrado.'
        });
        setImporting(false);
        return;
      }

      // Insert products into central_products
      const { error } = await supabase
        .from('central_products')
        .insert(productsToInsert);

      if (error) throw error;

      addNotification({
        type: 'success',
        title: 'Sucesso',
        message: `${productsToInsert.length} produtos importados com sucesso para a Central!`
      });
      setExcelData('');
      fetchCentralProducts();
    } catch (err: any) {
      console.error('Error importing products:', err);
      addNotification({
        type: 'error',
        title: 'Erro ao importar',
        message: formatError(err)
      });
    } finally {
      setImporting(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, index?: number) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada. Por favor, faça login novamente.');

      const processedFile = await compressImage(file);
      const fileExt = processedFile.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `product-photos/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('products')
        .upload(filePath, processedFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('products')
        .getPublicUrl(filePath);

      if (typeof index === 'number') {
        const newUrls = [...formData.image_urls];
        newUrls[index] = publicUrl;
        
        // If it's the first image, also update photo_url for backward compatibility
        if (index === 0) {
          setFormData(prev => ({ ...prev, image_urls: newUrls, photo_url: publicUrl }));
        } else {
          setFormData(prev => ({ ...prev, image_urls: newUrls }));
        }
      } else {
        setFormData(prev => ({ ...prev, photo_url: publicUrl }));
      }
    } catch (err) {
      console.error('Error uploading image:', err);
      addNotification({
        type: 'error',
        title: 'Erro no upload',
        message: formatError(err)
      });
    } finally {
      setUploading(false);
    }
  };

  const [totalCount, setTotalCount] = useState(0);

  async function fetchProducts(isLoadMore = false) {
    if (isLoadMore) setLoadingMore(true);
    else setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;

      // Fetch linked product IDs
      const linkedIds = await getLinkedProductIds(user.id);
      setLinkedProductIds(linkedIds);

      const from = isLoadMore ? page * PAGE_SIZE : 0;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from('products')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id);

      if (searchTerm) {
        const search = searchTerm.trim();
        query = query.or(`name.ilike.%${search}%,label_name.ilike.%${search}%,barcode.ilike.%${search}%,ean.ilike.%${search}%`);
      }

      if (selectedCategory !== 'Todos') {
        query = query.eq('category', selectedCategory);
      }

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      
      if (count !== null) setTotalCount(count);

      const newProducts = data || [];
      if (isLoadMore) {
        setProducts(prev => [...prev, ...newProducts]);
      } else {
        setProducts(newProducts);
      }
      
      setHasMore(newProducts.length === PAGE_SIZE);
    } catch (err) {
      console.error('Error fetching products:', err);
      addNotification({
        type: 'error',
        title: 'Erro ao carregar produtos',
        message: formatError(err)
      });
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  const handleLoadMore = () => {
    setPage(prev => prev + 1);
  };

  useEffect(() => {
    if (page > 0) {
      fetchProducts(true);
    }
  }, [page]);

  const handleNewProduct = () => {
    setEditingProduct(null);
    setFormData({
      name: '',
      label_name: '',
      ean: '',
      barcode: '',
      cost_price: '0,00',
      sale_price: '0,00',
      current_stock: '',
      photo_url: '',
      image_urls: ['', '', ''],
      has_grid: false,
      category: selectedCategory !== 'Todos' ? selectedCategory : '',
      is_visible_in_store: true,
      description: '',
      ean_variations: [],
      grid_data: []
    });
    setView('form');
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name || '',
      label_name: product.label_name || '',
      ean: product.ean || '',
      barcode: product.barcode || '',
      cost_price: formatMoney(product.cost_price || 0),
      sale_price: formatMoney(product.sale_price || 0),
      current_stock: product.current_stock?.toString() || '',
      photo_url: product.photo_url || '',
      image_urls: product.image_urls && product.image_urls.length > 0 
        ? [...product.image_urls, '', '', ''].slice(0, 3) 
        : [product.photo_url || '', '', ''],
      has_grid: product.has_grid || false,
      category: product.category || '',
      is_visible_in_store: product.is_visible_in_store !== false,
      description: product.description || '',
      ean_variations: product.ean_variations || [],
      grid_data: product.grid_data || []
    });
    setView('form');
  };

  const handleAssignBarcode = () => {
    // Buscar o maior código numérico de 6 dígitos entre os produtos existentes
    const numericBarcodes = products
      .map(p => {
        const b = p.barcode || '';
        return b.match(/^\d{6}$/) ? parseInt(b) : null;
      })
      .filter((n): n is number => n !== null);

    // Se houver algum código de 6 dígitos, pega o maior. Senão, começa antes de 500850
    const maxBarcode = numericBarcodes.length > 0 ? Math.max(...numericBarcodes) : 500849;
    
    // O novo código será o maior + 1, garantindo que seja pelo menos 500850
    const nextValue = Math.max(maxBarcode + 1, 500850);
    const newBarcode = nextValue.toString().padStart(6, '0');

    // Verificar se já existe (para o caso de termos pulado algum se o max fosse menor que 500850)
    const exists = products.some(p => p.barcode === newBarcode || p.ean === newBarcode);
    if (exists) {
      let finalBarcode = nextValue;
      while (products.some(p => p.barcode === (finalBarcode + 1).toString().padStart(6, '0') || p.ean === (finalBarcode + 1).toString().padStart(6, '0'))) {
        finalBarcode++;
      }
      const guaranteedBarcode = (finalBarcode + 1).toString().padStart(6, '0');
      setFormData(prev => ({ ...prev, barcode: guaranteedBarcode }));
      addNotification({
        type: 'success',
        title: 'Código Gerado',
        message: `O código de barras ${guaranteedBarcode} foi atribuído com sucesso.`
      });
      return;
    }

    setFormData(prev => ({ ...prev, barcode: newBarcode }));
    addNotification({
      type: 'success',
      title: 'Código Gerado',
      message: `O código de barras ${newBarcode} foi atribuído com sucesso.`
    });
  };

  const handleDelete = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Excluir Produto',
      message: 'Tem certeza que deseja excluir este produto?',
      variant: 'danger',
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from('products')
            .delete()
            .eq('id', id);
          if (error) throw error;
          fetchProducts();
        } catch (err) {
          console.error('Error deleting product:', err);
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

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;

      const currentCategories = storeSettings?.categories || [];
      if (currentCategories.includes(newCategoryName.trim())) {
        addNotification({
          type: 'warning',
          title: 'Aviso',
          message: 'Esta categoria já existe.'
        });
        return;
      }

      const updatedCategories = [...currentCategories, newCategoryName.trim()];
      
      const { error } = await supabase
        .from('store_settings')
        .update({ categories: updatedCategories })
        .eq('user_id', user.id);

      if (error) throw error;

      setStoreSettings({ ...storeSettings, categories: updatedCategories });
      setFormData({ ...formData, category: newCategoryName.trim() });
      setNewCategoryName('');
      setIsAddingCategory(false);
      
      addNotification({
        type: 'success',
        title: 'Sucesso',
        message: 'Categoria adicionada com sucesso!'
      });
    } catch (err) {
      console.error('Error adding category:', err);
      addNotification({
        type: 'error',
        title: 'Erro ao adicionar categoria',
        message: formatError(err)
      });
    }
  };

  const handleAddEanVariation = () => {
    const val = eanVariationInput.trim();
    if (!val) return;
    if (formData.ean_variations.length >= 10) {
      addNotification({
        type: 'warning',
        title: 'Limite atingido',
        message: 'Limite de 10 variações atingido.'
      });
      return;
    }
    if (formData.ean_variations.includes(val)) {
      addNotification({
        type: 'warning',
        title: 'Variação duplicada',
        message: 'Esta variação já foi adicionada.'
      });
      return;
    }
    if (val === formData.ean) {
      addNotification({
        type: 'warning',
        title: 'EAN principal',
        message: 'Esta variação é igual ao EAN principal.'
      });
      return;
    }
    setFormData({
      ...formData,
      ean_variations: [...formData.ean_variations, val]
    });
    setEanVariationInput('');
  };

  const handleSave = async (e: React.FormEvent): Promise<Product | null> => {
    if (e) e.preventDefault();
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return null;

      // Filter empty image URLs and ensure at least photo_url is set if available
      const filteredImageUrls = (formData.image_urls || []).filter(url => url.trim() !== '');
      const photoUrl = filteredImageUrls[0] || formData.photo_url || '';

      // Convert empty EAN or '0' to null to avoid unique constraint violations on placeholders
      const trimmedEan = formData.ean?.trim();
      const finalEan = (trimmedEan === '' || trimmedEan === '0') ? null : trimmedEan;

      const dataToSave = {
        ...formData,
        name: sanitizeString(formData.name),
        label_name: sanitizeString(formData.label_name),
        description: sanitizeString(formData.description),
        category: sanitizeString(formData.category),
        ean: finalEan,
        barcode: formData.barcode?.trim() || null,
        photo_url: photoUrl,
        image_urls: filteredImageUrls,
        cost_price: parseMoney(formData.cost_price.toString()),
        sale_price: parseMoney(formData.sale_price.toString()),
        current_stock: formData.has_grid 
          ? formData.grid_data.reduce((sum, item) => sum + item.quantity, 0)
          : (Number(formData.current_stock.toString().replace(',', '.')) || 0)
      };

      let savedData: Product | null = null;

      if (editingProduct) {
        const { data, error } = await supabase
          .from('products')
          .update(dataToSave)
          .eq('id', editingProduct.id)
          .select()
          .single();
        if (error) throw error;
        savedData = data;
      } else {
        const { data, error } = await supabase
          .from('products')
          .insert([{ ...dataToSave, user_id: user.id, is_visible_in_store: true }])
          .select()
          .single();
        if (error) throw error;
        savedData = data;
      }

      addNotification({
        type: 'success',
        title: 'Sucesso',
        message: editingProduct ? 'Produto atualizado com sucesso!' : 'Produto cadastrado com sucesso!'
      });

      // Se for apenas o clique em "Salvar" normal (via submit do form e for um evento real do browser)
      if (e && e.type === 'submit' && (e as any).nativeEvent) {
        setView('list');
      }
      
      fetchProducts(); // Refresh the list
      return savedData;
    } catch (err: any) {
      console.error('Error saving product:', err);
      if (err.code === '23505') {
        const conflictingProduct = products.find(p => 
          p.ean === formData.ean.trim() && 
          p.id !== editingProduct?.id
        );
        
        if (conflictingProduct) {
          addNotification({
            type: 'error',
            title: 'EAN Duplicado',
            message: `O código EAN "${formData.ean}" já está cadastrado no produto "${conflictingProduct.name}". Cada produto deve ter um EAN exclusivo.`
          });
        } else {
          addNotification({
            type: 'error',
            title: 'EAN Duplicado',
            message: 'Já existe um produto com este código EAN no seu catálogo.'
          });
        }
      } else {
        addNotification({
          type: 'error',
          title: 'Erro ao salvar produto',
          message: formatError(err)
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleAddSingleFromCentral = async (centralProduct: any) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
      if (!user) return;

      const isValidEan = centralProduct.ean && centralProduct.ean !== '0' && centralProduct.ean !== '';

      const exists = products.some(p => {
        if (isValidEan && p.ean === centralProduct.ean) return true;
        return p.name.toLowerCase().trim() === centralProduct.name.toLowerCase().trim();
      });

      if (exists) {
        addNotification({
          type: 'warning',
          title: 'Aviso',
          message: 'Este produto já está no seu catálogo.'
        });
        return;
      }

      const { error } = await supabase.from('products').insert([{
        user_id: user.id,
        name: centralProduct.name,
        label_name: centralProduct.label_name,
        ean: isValidEan ? centralProduct.ean : null,
        cost_price: centralProduct.cost_price,
        sale_price: centralProduct.sale_price,
        current_stock: 0,
        photo_url: centralProduct.photo_url,
        image_urls: centralProduct.image_urls || (centralProduct.photo_url ? [centralProduct.photo_url] : []),
        has_grid: centralProduct.has_grid,
        ean_variations: centralProduct.ean_variations || [],
        is_visible_in_store: true
      }]);

      if (error) throw error;
      
      addNotification({
        type: 'success',
        title: 'Sucesso',
        message: 'Produto adicionado com sucesso!'
      });
      fetchProducts();
    } catch (err: any) {
      console.error('Error adding product from central:', err);
      addNotification({
        type: 'error',
        title: 'Erro ao adicionar produto',
        message: formatError(err)
      });
    }
  };

  const handleOpenPriceModal = async (product: any) => {
    setSelectedCentralProduct(product);
    setSuggestionForm({
      cost_price: formatMoney(product.cost_price || 0),
      sale_price: formatMoney(product.sale_price || 0)
    });
    
    // Fetch history for this product
    try {
      const { data, error } = await supabase
        .from('price_suggestions')
        .select('*')
        .eq('central_product_id', product.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setPriceHistory(data || []);
    } catch (err) {
      console.error('Error fetching price history:', err);
    }
    
    setIsPriceModalOpen(true);
  };

  const handleSavePriceSuggestion = async () => {
    if (!selectedCentralProduct) return;
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
      if (!user) return;

      const { error } = await supabase
        .from('price_suggestions')
        .insert([{
          central_product_id: selectedCentralProduct.id,
          suggested_cost_price: parseMoney(suggestionForm.cost_price.toString()),
          suggested_sale_price: parseMoney(suggestionForm.sale_price.toString()),
          created_by: user.id
        }]);

      if (error) throw error;

      // Also update the central product's current prices
      const { error: updateError } = await supabase
        .from('central_products')
        .update({
          cost_price: parseMoney(suggestionForm.cost_price.toString()),
          sale_price: parseMoney(suggestionForm.sale_price.toString())
        })
        .eq('id', selectedCentralProduct.id);

      if (updateError) throw updateError;

      // Broadcast notification
      await supabase.channel('catalog_updates').send({
        type: 'broadcast',
        event: 'catalog_updated',
        payload: { 
          message: `Preço atualizado: ${selectedCentralProduct.name}`,
          product_id: selectedCentralProduct.id
        }
      });

      // Create a persistent announcement
      await supabase.from('announcements').insert([{
        title: 'Atualização de Preço',
        message: `O administrador sugeriu novos preços para o produto: ${selectedCentralProduct.name}`,
        type: 'price_change',
        created_by: user.id
      }]);

      addNotification({
        type: 'success',
        title: 'Sucesso',
        message: 'Sugestão de preço salva e usuários notificados!'
      });
      setIsPriceModalOpen(false);
      fetchCentralProducts();
      fetchPriceSuggestions();
    } catch (err: any) {
      console.error('Error saving price suggestion:', err);
      addNotification({
        type: 'error',
        title: 'Erro ao salvar',
        message: formatError(err)
      });
    }
  };

  const getPendingSuggestion = (product: Product) => {
    const key = (product.ean && product.ean !== '0' && product.ean !== '') 
      ? product.ean 
      : product.name.toLowerCase().trim();
    
    const centralProduct = centralProducts.find(cp => {
      const cpKey = (cp.ean && cp.ean !== '0' && cp.ean !== '') ? cp.ean : cp.name.toLowerCase().trim();
      return cpKey === key;
    });

    if (!centralProduct) return null;

    const suggestion = priceSuggestions.find(s => s.central_product_id === centralProduct.id);
    if (!suggestion) return null;

    const isOutOfSync = product.cost_price !== suggestion.suggested_cost_price || 
                        product.sale_price !== suggestion.suggested_sale_price;
    
    return isOutOfSync ? suggestion : null;
  };

  const handlePrintLabel = (product: Product) => {
    setSelectedProductForLabels(product);
    setView('labels');
  };


  const handleApplyPriceSuggestion = (product: any, suggestion: PriceSuggestion) => {
    setConfirmModal({
      isOpen: true,
      title: 'Atualizar Preço',
      message: `Deseja atualizar o preço deste produto para os valores sugeridos?\n\nCusto: R$ ${suggestion.suggested_cost_price.toFixed(2)}\nVenda: R$ ${suggestion.suggested_sale_price.toFixed(2)}`,
      variant: 'info',
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from('products')
            .update({
              cost_price: suggestion.suggested_cost_price,
              sale_price: suggestion.suggested_sale_price
            })
            .eq('id', product.id);
          
          if (error) throw error;
          
          addNotification({
            type: 'success',
            title: 'Sucesso',
            message: 'Preço atualizado com sucesso!'
          });
          fetchProducts();
        } catch (err: any) {
          console.error('Error applying price suggestion:', err);
          addNotification({
            type: 'error',
            title: 'Erro ao atualizar preço',
            message: formatError(err)
          });
        } finally {
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const pendingPriceCount = useMemo(() => {
    return products.filter(p => getPendingSuggestion(p)).length;
  }, [products, priceSuggestions, centralProducts]);

  const duplicateGroups = useMemo(() => {
    return detectUserDuplicates(products);
  }, [products]);

  const handleResolveDuplicates = async () => {
    if (selectedDuplicateIds.size === 0) return;
    
    setSyncing(true);
    try {
      await resolveDuplicates(Array.from(selectedDuplicateIds));
      addNotification({
        type: 'success',
        title: 'Duplicados Resolvidos',
        message: `${selectedDuplicateIds.size} produtos removidos com sucesso.`
      });
      setIsDuplicateModalOpen(false);
      setSelectedDuplicateIds(new Set());
      fetchProducts();
    } catch (err) {
      console.error('Error resolving duplicates:', err);
      addNotification({
        type: 'error',
        title: 'Erro ao resolver duplicados',
        message: formatError(err)
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleSyncAllPrices = async () => {
    const pendingProducts = products.filter(p => getPendingSuggestion(p));
    if (pendingProducts.length === 0) {
      addNotification({
        type: 'info',
        title: 'Tudo em dia',
        message: 'Não há preços pendentes para sincronizar.'
      });
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: 'Sincronizar Todos os Preços',
      message: `Deseja atualizar os preços de ${pendingProducts.length} produtos que possuem sugestões da Central?`,
      variant: 'info',
      onConfirm: async () => {
        try {
          setSyncing(true);
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          
          let updatedCount = 0;
          for (const product of pendingProducts) {
            const suggestion = getPendingSuggestion(product);
            if (suggestion) {
              const { error } = await supabase
                .from('products')
                .update({
                  cost_price: suggestion.suggested_cost_price,
                  sale_price: suggestion.suggested_sale_price
                })
                .eq('id', product.id);
              if (!error) updatedCount++;
            }
          }
          
          addNotification({
            type: 'success',
            title: 'Sincronização Concluída',
            message: `${updatedCount} produtos atualizados com sucesso!`
          });
          fetchProducts();
        } catch (err) {
          console.error('Error syncing all prices:', err);
          addNotification({
            type: 'error',
            title: 'Erro na sincronização',
            message: formatError(err)
          });
        } finally {
          setSyncing(false);
        }
      }
    });
  };

  const addToQuickEntry = (product: Product, color?: string, size?: string, quantity: number = 1) => {
    if (product.has_grid && !color && !size) {
      setSelectedProductForQuickEntryGrid(product);
      setQuickEntryGridForm({ color: '', size: '' });
      setIsQuickEntryGridModalOpen(true);
      return;
    }

    setQuickEntryList(prev => {
      const existing = prev.find(item => 
        item.product.id === product.id && 
        item.color === color && 
        item.size === size
      );
      if (existing) {
        return prev.map(item => 
          (item.product.id === product.id && item.color === color && item.size === size)
            ? { ...item, quantity: item.quantity + quantity } 
            : item
        );
      }
      return [...prev, { product, quantity, color, size }];
    });
    setQuickEntrySearch('');
    setQuickEntryQuantity('1');
    setIsQuickEntryGridModalOpen(false);
    addNotification({
      type: 'success',
      title: 'Produto Adicionado',
      message: `${product.name}${color ? ` (${color}/${size})` : ''} adicionado à lista.`
    });
  };

  const handleQuickEntryAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const query = quickEntrySearch.trim();
    if (!query) return;

    // 1. Prioridade absoluta: correspondência estrita de código de barras
    let product = products.find(p => isStrictBarcodeMatch(p, query));

    // 2. Se não achou por código, confere se o nome bate exato
    if (!product) {
      const queryLower = query.toLowerCase();
      product = products.find(p => p.name.toLowerCase().trim() === queryLower);
    }

    const isCode = /^\d{3,}$/.test(query);

    if (product) {
      addToQuickEntry(product, undefined, undefined, Number(quickEntryQuantity.toString().replace(',', '.')) || 1);
    } else if (isCode) {
      // Se era um código numérico e não encontrou correspondência exata, NÃO deve selecionar produto aleatório!
      addNotification({
        type: 'error',
        title: 'Código Não Encontrado',
        message: `Nenhum produto com o código exato "${query}" foi encontrado.`
      });
    } else {
      // Se for busca textual por nome (não código numérico)
      const searchTerm = query.toLowerCase();
      const textMatches = products.filter(p => 
        p.name.toLowerCase().includes(searchTerm)
      );
      
      if (textMatches.length === 1) {
        addToQuickEntry(textMatches[0], undefined, undefined, Number(quickEntryQuantity.toString().replace(',', '.')) || 1);
      } else if (textMatches.length > 1) {
        const exactPrefix = textMatches.find(p => p.name.toLowerCase().startsWith(searchTerm));
        addToQuickEntry(exactPrefix || textMatches[0], undefined, undefined, Number(quickEntryQuantity.toString().replace(',', '.')) || 1);
      } else {
        addNotification({
          type: 'error',
          title: 'Não Encontrado',
          message: 'Produto não encontrado no catálogo.'
        });
      }
    }
  };

  const handleQuickEntrySave = async () => {
    if (quickEntryList.length === 0) return;
    setQuickEntryLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada');

      for (const item of quickEntryList) {
        const { data: product } = await supabase
          .from('products')
          .select('current_stock, has_grid, grid_data')
          .eq('id', item.product.id)
          .single();

        if (!product) continue;

        let updateData: any = {};

        if (product.has_grid && item.color && item.size) {
          const gridData = product.grid_data || [];
          const existingIndex = gridData.findIndex((g: any) => g.color === item.color && g.size === item.size);
          
          let newGridData;
          if (existingIndex >= 0) {
            newGridData = gridData.map((g: any, i: number) => 
              i === existingIndex ? { ...g, quantity: (g.quantity || 0) + item.quantity } : g
            );
          } else {
            newGridData = [...gridData, { color: item.color, size: item.size, quantity: item.quantity }];
          }
          
          updateData.grid_data = newGridData;
          updateData.current_stock = newGridData.reduce((sum: number, g: any) => sum + (g.quantity || 0), 0);
        } else {
          updateData.current_stock = Number(product.current_stock || 0) + item.quantity;
        }

        const { error } = await supabase
          .from('products')
          .update(updateData)
          .eq('id', item.product.id);
        if (error) throw error;
      }
      
      addNotification({
        type: 'success',
        title: 'Estoque Atualizado',
        message: `${quickEntryList.length} produtos tiveram o estoque atualizado.`
      });
      
      setQuickEntryList([]);
      setView('list');
      fetchProducts();
    } catch (err: any) {
      console.error('Error updating stock:', err);
      addNotification({
        type: 'error',
        title: 'Erro ao atualizar estoque',
        message: formatError(err)
      });
    } finally {
      setQuickEntryLoading(false);
    }
  };

  const isAdmin = profile?.role === 'admin' || 
    profile?.email === 'anderlevita@gmail.com';

  const isRestrictedPlan = profile?.status_pagamento === 'STARTER' || profile?.status_pagamento === 'TRIAL';

  const filteredProducts = products;

  const filteredCentralProducts = centralProducts.filter(product => {
    const searchLower = centralSearchTerm.toLowerCase().trim();
    return (
      product.name?.toLowerCase().includes(searchLower) ||
      (product.label_name?.toLowerCase() || '').includes(searchLower) ||
      String(product.ean || '').toLowerCase().includes(searchLower)
    );
  });

  const displayedProducts = filteredProducts;

  if (view === 'form') {
    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-bold text-zinc-800 tracking-tight">Catálogo de Produtos</h2>
            <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider">
              {totalCount} itens
            </span>
          </div>
          <button 
            onClick={() => setView('list')}
            className="text-sm font-bold text-zinc-500 hover:text-zinc-800 transition-colors flex items-center justify-center gap-2 w-full sm:w-auto bg-zinc-100 sm:bg-transparent py-3 sm:py-0 rounded-xl sm:rounded-none"
          >
            Voltar para Lista
          </button>
        </div>

        <div className="max-w-4xl mx-auto bg-white border border-zinc-200 rounded-[32px] shadow-xl overflow-hidden">
          <div className="p-8 border-b border-zinc-100">
            <h3 className="text-xl font-bold text-zinc-700 italic">{editingProduct ? 'Editar Produto' : 'Novo Produto'}</h3>
          </div>

          <form onSubmit={handleSave} className="p-8 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Nome do Produto *</label>
                <input 
                  required
                  type="text" 
                  value={formData.name}
                  maxLength={100}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-4 text-sm focus:border-emerald-500 outline-none transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Nome na Etiqueta</label>
                <input 
                  type="text" 
                  value={formData.label_name}
                  maxLength={50}
                  onChange={e => setFormData({...formData, label_name: e.target.value})}
                  className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-4 text-sm focus:border-emerald-500 outline-none transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Código EAN</label>
                <input 
                  type="text" 
                  value={formData.ean}
                  maxLength={20}
                  onChange={e => setFormData({...formData, ean: e.target.value})}
                  className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-4 text-sm focus:border-emerald-500 outline-none transition-all"
                  placeholder="Código EAN do fabricante"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Código de Barras Exclusivo</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={formData.barcode}
                    maxLength={30}
                    onChange={e => setFormData({...formData, barcode: e.target.value})}
                    className="flex-1 bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-4 text-sm focus:border-emerald-500 outline-none transition-all"
                    placeholder="Código para etiquetas internas"
                  />
                  <button
                    type="button"
                    onClick={handleAssignBarcode}
                    className="px-6 bg-zinc-900 text-white rounded-2xl font-bold text-sm hover:bg-zinc-800 transition-colors flex items-center gap-2 whitespace-nowrap"
                    title="Gerar código exclusivo"
                  >
                    <Barcode className="w-4 h-4" />
                    Atribuir
                  </button>
                </div>
                <p className="text-[10px] text-zinc-400 italic">Gere um código único para imprimir etiquetas na Central de Etiquetas.</p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Descrição do Produto</label>
              <textarea 
                value={formData.description}
                maxLength={500}
                onChange={e => setFormData({...formData, description: e.target.value})}
                placeholder="Descreva o produto para a loja virtual..."
                rows={4}
                className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-4 text-sm focus:border-emerald-500 outline-none transition-all resize-none"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Custo [R$]</label>
                <input 
                  type="text" 
                  inputMode="numeric"
                  value={formData.cost_price}
                  maxLength={15}
                  onChange={e => {
                    setFormData({...formData, cost_price: formatMoneyInput(e.target.value)});
                  }}
                  className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-4 text-sm focus:border-emerald-500 outline-none transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Venda [R$]</label>
                <input 
                  type="text" 
                  inputMode="numeric"
                  value={formData.sale_price}
                  maxLength={15}
                  onChange={e => {
                    setFormData({...formData, sale_price: formatMoneyInput(e.target.value)});
                  }}
                  className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-4 text-sm focus:border-emerald-500 outline-none transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Estoque Atual</label>
                <input 
                  type="text" 
                  inputMode="decimal"
                  value={formData.current_stock}
                  maxLength={10}
                  onChange={e => {
                    const val = e.target.value.replace(/[^0-9.,]/g, '');
                    setFormData({...formData, current_stock: val});
                  }}
                  className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-4 text-sm focus:border-emerald-500 outline-none transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Categoria</label>
                  <button
                    type="button"
                    onClick={() => setIsAddingCategory(!isAddingCategory)}
                    className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest hover:text-emerald-700"
                  >
                    {isAddingCategory ? 'Cancelar' : '+ Nova Categoria'}
                  </button>
                </div>
                
                {isAddingCategory ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newCategoryName}
                      maxLength={50}
                      onChange={e => setNewCategoryName(e.target.value)}
                      placeholder="Nome da categoria"
                      className="flex-1 bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-4 text-sm focus:border-emerald-500 outline-none transition-all"
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddCategory();
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleAddCategory}
                      disabled={!newCategoryName.trim()}
                      className="bg-emerald-600 text-white px-6 rounded-2xl font-bold text-sm hover:bg-emerald-700 transition-colors disabled:opacity-50"
                    >
                      Adicionar
                    </button>
                  </div>
                ) : (
                  <select 
                    value={formData.category}
                    onChange={e => setFormData({...formData, category: e.target.value})}
                    className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-4 text-sm focus:border-emerald-500 outline-none transition-all appearance-none"
                  >
                    <option value="">Sem Categoria</option>
                    {storeSettings?.categories?.map((cat: string) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Visível na Loja</label>
                <div className="bg-zinc-50/50 border border-zinc-100 rounded-2xl p-6 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-white border border-zinc-100 flex items-center justify-center">
                      <Eye className="w-5 h-5 text-zinc-400" />
                    </div>
                    <div>
                      <p className="font-bold text-zinc-700 text-sm">Visível na Loja</p>
                      <p className="text-[10px] text-zinc-400">Mostrar este produto na vitrine virtual</p>
                    </div>
                  </div>
                  <button 
                    type="button"
                    onClick={() => setFormData({...formData, is_visible_in_store: !formData.is_visible_in_store})}
                    className={cn(
                      "w-12 h-6 rounded-full transition-all relative",
                      formData.is_visible_in_store ? "bg-emerald-500" : "bg-zinc-200"
                    )}
                  >
                    <div className={cn(
                      "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                      formData.is_visible_in_store ? "left-7" : "left-1"
                    )} />
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-zinc-50/50 border border-zinc-100 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-white border border-zinc-100 flex items-center justify-center">
                  <PackageIcon className="w-5 h-5 text-zinc-400" />
                </div>
                <div>
                  <p className="font-bold text-zinc-700 text-sm">Configuração de Grade</p>
                  <p className="text-[10px] text-zinc-400">Solicitar cor e tamanho na montagem da sacola</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                {formData.has_grid && (
                  <button
                    type="button"
                    onClick={() => setIsGridModalOpen(true)}
                    className="text-xs font-bold text-emerald-600 hover:text-emerald-700 underline"
                  >
                    Configurar Grade ({formData.grid_data.length})
                  </button>
                )}
                <button 
                  type="button"
                  onClick={() => setFormData({...formData, has_grid: !formData.has_grid})}
                  className={cn(
                    "w-12 h-6 rounded-full transition-all relative",
                    formData.has_grid ? "bg-emerald-500" : "bg-zinc-200"
                  )}
                >
                  <div className={cn(
                    "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                    formData.has_grid ? "left-7" : "left-1"
                  )} />
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">Fotos do Produto (Máx. 3)</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[0, 1, 2].map((index) => (
                  <div key={index} className="space-y-2">
                    <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-tighter">Foto {index + 1}</p>
                    <div 
                      onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = 'image/*';
                        input.onchange = (e: any) => handleFileUpload(e, index);
                        input.click();
                      }}
                      className="aspect-square border-2 border-dashed border-zinc-100 rounded-2xl flex flex-col items-center justify-center gap-2 hover:border-emerald-500/50 transition-all cursor-pointer group bg-zinc-50/30 overflow-hidden relative"
                    >
                      {uploading ? (
                        <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
                      ) : formData.image_urls[index] ? (
                        <>
                          <img src={formData.image_urls[index]} alt={`Preview ${index}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Upload className="w-6 h-6 text-white" />
                          </div>
                          <button 
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const newUrls = [...formData.image_urls];
                              newUrls[index] = '';
                              setFormData(prev => ({ ...prev, image_urls: newUrls }));
                            }}
                            className="absolute top-2 right-2 p-1 bg-white/20 hover:bg-white/40 rounded-full backdrop-blur-md transition-all"
                          >
                            <X className="w-3 h-3 text-white" />
                          </button>
                        </>
                      ) : (
                        <>
                          <Upload className="w-6 h-6 text-zinc-300 group-hover:text-emerald-500 transition-all" />
                          <p className="text-[10px] text-zinc-400 font-medium">Carregar</p>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">Variações de EAN (Máx. 10)</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={eanVariationInput}
                  onChange={e => setEanVariationInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddEanVariation();
                    }
                  }}
                  placeholder="Digitar ou bipar variação EAN..."
                  className="flex-1 bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-4 text-sm focus:border-emerald-500 outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={handleAddEanVariation}
                  disabled={!eanVariationInput.trim() || formData.ean_variations.length >= 10}
                  className="bg-zinc-900 text-white px-6 rounded-2xl font-bold text-sm hover:bg-zinc-800 transition-colors disabled:opacity-50"
                >
                  Adicionar
                </button>
              </div>
              
              {formData.ean_variations.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {formData.ean_variations.map((v, i) => (
                    <div key={i} className="bg-zinc-100 text-zinc-700 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 border border-zinc-200">
                      <Barcode className="w-3 h-3 text-zinc-400" />
                      {v}
                      <button 
                        type="button"
                        onClick={() => setFormData({
                          ...formData,
                          ean_variations: formData.ean_variations.filter((_, idx) => idx !== i)
                        })}
                        className="text-zinc-400 hover:text-red-500 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <button 
                type="submit"
                disabled={saving}
                className="flex-1 bg-[#00a86b] hover:bg-[#008f5b] text-white py-5 rounded-2xl font-bold transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : editingProduct ? 'Salvar Alterações' : 'Cadastrar Produto'}
              </button>

              <button
                type="button"
                disabled={saving || (!formData.barcode && !formData.ean)}
                onClick={async () => {
                  const savedProduct = await handleSave(new Event('submit') as any);
                  if (savedProduct) {
                    setSelectedProductForLabels(savedProduct);
                    setView('labels');
                  }
                }}
                className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-white py-5 rounded-2xl font-bold transition-all shadow-lg shadow-zinc-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Salvar e Imprimir'}
              </button>

              {editingProduct && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedProductForLabels(editingProduct);
                    setView('labels');
                  }}
                  className="px-8 py-5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2"
                  title="Enviar para Central de Etiquetas"
                >
                  <Printer className="w-5 h-5" />
                  Imprimir Etiqueta
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Grid Configuration Modal */}
        {isGridModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsGridModalOpen(false)} />
            <div className="relative w-full max-w-lg bg-white rounded-[32px] p-8 shadow-2xl space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-zinc-800">Configurar Grade</h3>
                <button onClick={() => setIsGridModalOpen(false)} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Cor</label>
                  <input 
                    type="text"
                    value={gridForm.color}
                    maxLength={20}
                    onChange={e => setGridForm({...gridForm, color: e.target.value})}
                    placeholder="Ex: Azul"
                    className="w-full bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-3 text-sm focus:border-emerald-500 outline-none transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Tamanho</label>
                  <input 
                    type="text"
                    value={gridForm.size}
                    maxLength={10}
                    onChange={e => setGridForm({...gridForm, size: e.target.value})}
                    placeholder="Ex: M"
                    className="w-full bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-3 text-sm focus:border-emerald-500 outline-none transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Qtd</label>
                  <input 
                    type="text"
                    inputMode="decimal"
                    value={gridForm.quantity}
                    maxLength={10}
                    onChange={e => setGridForm({...gridForm, quantity: e.target.value.replace(/[^0-9.,]/g, '')})}
                    placeholder="0"
                    className="w-full bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-3 text-sm focus:border-emerald-500 outline-none transition-all"
                  />
                </div>
              </div>

              <button 
                type="button"
                onClick={() => {
                  if (!gridForm.color || !gridForm.size || !gridForm.quantity) return;
                  setFormData({
                    ...formData,
                    grid_data: [
                      ...formData.grid_data,
                      { color: gridForm.color, size: gridForm.size, quantity: Number(gridForm.quantity.toString().replace(',', '.')) || 0 }
                    ]
                  });
                  setGridForm({ color: '', size: '', quantity: '' });
                }}
                className="w-full bg-zinc-900 text-white py-4 rounded-2xl font-bold text-sm hover:bg-zinc-800 transition-all"
              >
                Adicionar à Grade
              </button>

              <div className="max-h-40 overflow-y-auto space-y-2">
                {formData.grid_data.map((item, index) => (
                  <div key={index} className="flex items-center justify-between bg-zinc-50 p-3 rounded-xl border border-zinc-100">
                    <div className="flex items-center gap-4">
                      <span className="text-xs font-bold text-zinc-700">{item.color}</span>
                      <span className="text-xs text-zinc-400">/</span>
                      <span className="text-xs font-bold text-zinc-700">{item.size}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-xs font-bold text-emerald-600">{item.quantity} un</span>
                      <button 
                        type="button"
                        onClick={() => setFormData({
                          ...formData,
                          grid_data: formData.grid_data.filter((_, i) => i !== index)
                        })}
                        className="text-zinc-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-6 border-t border-zinc-100 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-zinc-400 font-medium">Total na Grade:</p>
                  <p className="text-lg font-bold text-emerald-600">
                    {formData.grid_data.reduce((sum, item) => sum + item.quantity, 0)} un
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const total = formData.grid_data.reduce((sum, item) => sum + item.quantity, 0);
                    setFormData({ ...formData, current_stock: total.toString() });
                    setIsGridModalOpen(false);
                    addNotification({
                      type: 'info',
                      title: 'Estoque Atualizado',
                      message: `O estoque total foi atualizado para ${total} un baseado na grade.`
                    });
                  }}
                  className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold text-sm hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-500/20"
                >
                  Salvar Grade e Atualizar Estoque Total
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (view === 'quick_entry') {
    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-bold text-zinc-800 tracking-tight">Entrada Rápida de Estoque</h2>
            <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider">
              {quickEntryList.length} itens na lista
            </span>
          </div>
          <button 
            onClick={() => {
              if (quickEntryList.length > 0) {
                setConfirmModal({
                  isOpen: true,
                  title: 'Sair da Entrada Rápida',
                  message: 'Você tem itens na lista que não foram salvos. Deseja realmente sair?',
                  variant: 'warning',
                  onConfirm: () => {
                    setQuickEntryList([]);
                    setView('list');
                    setConfirmModal(prev => ({ ...prev, isOpen: false }));
                  }
                });
              } else {
                setView('list');
              }
            }}
            className="text-sm font-bold text-zinc-500 hover:text-zinc-800 transition-colors flex items-center justify-center gap-2 w-full sm:w-auto bg-zinc-100 sm:bg-transparent py-3 sm:py-0 rounded-xl sm:rounded-none"
          >
            Voltar para Lista
          </button>
        </div>

        <div className="max-w-4xl mx-auto space-y-6">
          <div className="bg-white border border-zinc-200 rounded-[32px] p-8 shadow-xl relative">
            <form onSubmit={handleQuickEntryAdd} className="space-y-4">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Bipar EAN ou Digitar Nome</label>
              <div className="flex gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                  <input 
                    autoFocus
                    type="text" 
                    value={quickEntrySearch}
                    onChange={e => setQuickEntrySearch(e.target.value)}
                    placeholder="Escaneie o código de barras ou digite o nome..."
                    className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl pl-12 pr-6 py-4 text-sm focus:border-emerald-500 outline-none transition-all"
                  />
                </div>
                <div className="w-24">
                  <input 
                    type="text"
                    inputMode="decimal"
                    value={quickEntryQuantity}
                    onChange={e => {
                      const val = e.target.value.replace(/[^0-9.,]/g, '');
                      setQuickEntryQuantity(val);
                    }}
                    className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-4 py-4 text-sm font-bold text-center focus:border-emerald-500 outline-none transition-all"
                    placeholder="Qtd"
                  />
                </div>
                <button 
                  type="submit"
                  className="bg-emerald-600 text-white px-8 rounded-2xl font-bold text-sm hover:bg-emerald-700 transition-colors"
                >
                  Adicionar
                </button>
              </div>
            </form>

            {/* Quick Entry Search Results */}
            {quickEntrySearch.trim().length >= 1 && (
              <div className="absolute left-8 right-8 top-full mt-2 bg-white border border-zinc-200 rounded-2xl shadow-2xl z-50 max-h-[400px] overflow-y-auto animate-in slide-in-from-top-2 duration-200">
                {products
                  .filter(p => {
                    const search = quickEntrySearch.toLowerCase().trim();
                    return (p.name?.toLowerCase() || '').includes(search) ||
                           (p.label_name?.toLowerCase() || '').includes(search) ||
                           (p.barcode && p.barcode.toLowerCase().includes(search)) ||
                           (p.ean && p.ean.toLowerCase().includes(search)) ||
                           (p.ean_variations || []).some(v => v.toLowerCase().includes(search));
                  })
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .slice(0, 30)
                  .map(product => (
                    <button
                      key={product.id}
                      onClick={() => addToQuickEntry(product)}
                      className="w-full px-6 py-4 flex items-center justify-between hover:bg-zinc-50 transition-colors border-b border-zinc-100 last:border-0"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-zinc-100 flex items-center justify-center overflow-hidden">
                          {product.photo_url ? (
                            <img src={product.photo_url} alt={product.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <PackageIcon className="w-5 h-5 text-zinc-400" />
                          )}
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-bold text-zinc-800">{product.name}</p>
                          <p className="text-[10px] text-zinc-400 font-mono">{product.ean || 'Sem EAN'}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-zinc-400 uppercase font-bold">Estoque</p>
                        <p className="text-xs font-bold text-zinc-700">{product.current_stock} un</p>
                      </div>
                    </button>
                  ))}
                {products.filter(p => {
                  const search = quickEntrySearch.toLowerCase().trim();
                  return p.name.toLowerCase().includes(search) ||
                         (p.ean && p.ean.includes(search)) ||
                         (p.ean_variations || []).some(v => v.toLowerCase().includes(search));
                }).length === 0 && (
                  <div className="px-6 py-8 text-center text-zinc-400 italic text-sm">
                    Nenhum produto encontrado no catálogo.
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="bg-white border border-zinc-200 rounded-[32px] overflow-hidden shadow-sm">
            <div className="p-6 border-b border-zinc-100 bg-zinc-50/50 flex items-center justify-between">
              <h3 className="font-bold text-zinc-700">Lista de Entrada</h3>
              {quickEntryList.length > 0 && (
                <button 
                  onClick={() => setQuickEntryList([])}
                  className="text-[10px] font-bold text-red-500 uppercase tracking-widest hover:text-red-600"
                >
                  Limpar Lista
                </button>
              )}
            </div>
            
            <div className="max-h-[400px] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-100 bg-zinc-50/30">
                    <th className="px-8 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Produto</th>
                    <th className="px-8 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Variação</th>
                    <th className="px-8 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">EAN</th>
                    <th className="px-8 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-center">Qtd. Entrada</th>
                    <th className="px-8 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {quickEntryList.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-8 py-12 text-center text-zinc-400 italic">Nenhum produto na lista. Comece bipando ou digitando acima.</td>
                    </tr>
                  ) : (
                    quickEntryList.map((item, index) => (
                      <tr key={`${item.product.id}-${item.color}-${item.size}`} className="hover:bg-zinc-50/50 transition-colors">
                        <td className="px-8 py-4">
                          <p className="text-sm font-bold text-zinc-800">{item.product.name}</p>
                          <p className="text-[10px] text-zinc-400">Estoque atual: {item.product.current_stock} un</p>
                        </td>
                        <td className="px-8 py-4">
                          {item.color || item.size ? (
                            <span className="text-xs font-bold text-zinc-600 bg-zinc-100 px-2 py-1 rounded-md">
                              {item.color}/{item.size}
                            </span>
                          ) : (
                            <span className="text-xs text-zinc-400 italic">Nenhuma</span>
                          )}
                        </td>
                        <td className="px-8 py-4 text-xs text-zinc-500 font-mono">{item.product.ean || '-'}</td>
                        <td className="px-8 py-4">
                          <div className="flex items-center justify-center gap-3">
                            <button 
                              onClick={() => {
                                setQuickEntryList(prev => prev.map((it, i) => 
                                  i === index ? { ...it, quantity: Math.max(1, it.quantity - 1) } : it
                                ));
                              }}
                              className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-600 hover:bg-zinc-200"
                            >
                              -
                            </button>
                            <input 
                              type="text"
                              inputMode="decimal"
                              value={item.quantity}
                              onChange={e => {
                                const val = Number(e.target.value.replace(',', '.')) || 0;
                                setQuickEntryList(prev => prev.map((it, i) => 
                                  i === index ? { ...it, quantity: val } : it
                                ));
                              }}
                              className="w-16 text-center bg-zinc-50 border border-zinc-100 rounded-lg py-1 text-sm font-bold"
                            />
                            <button 
                              onClick={() => {
                                setQuickEntryList(prev => prev.map((it, i) => 
                                  i === index ? { ...it, quantity: it.quantity + 1 } : it
                                ));
                              }}
                              className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-600 hover:bg-zinc-200"
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td className="px-8 py-4 text-right">
                          <button 
                            onClick={() => setQuickEntryList(prev => prev.filter((_, i) => i !== index))}
                            className="p-2 text-red-400 hover:bg-red-50 rounded-xl transition-colors"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-8 bg-zinc-50 border-t border-zinc-100 flex justify-end">
              <button 
                onClick={handleQuickEntrySave}
                disabled={quickEntryLoading || quickEntryList.length === 0}
                className="bg-[#00a86b] hover:bg-[#008f5b] text-white px-12 py-4 rounded-2xl font-bold transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 flex items-center gap-2"
              >
                {quickEntryLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                Confirmar Entrada de Estoque
              </button>
            </div>
          </div>
        </div>

        {/* Quick Entry Grid Modal */}
        {isQuickEntryGridModalOpen && selectedProductForQuickEntryGrid && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white rounded-3xl w-full max-w-md p-8 shadow-2xl">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-serif italic text-zinc-900">Selecionar Variação</h3>
                <button onClick={() => setIsQuickEntryGridModalOpen(false)} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <p className="text-sm font-bold text-zinc-800 mb-1">{selectedProductForQuickEntryGrid.name}</p>
                  <p className="text-xs text-zinc-400">Escolha a cor e o tamanho para a entrada de estoque.</p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-2">Cor</label>
                    <div className="flex flex-wrap gap-2">
                      {Array.from(new Set(selectedProductForQuickEntryGrid.grid_data?.map(g => g.color))).map(color => (
                        <button
                          key={color}
                          onClick={() => setQuickEntryGridForm(prev => ({ ...prev, color, size: '' }))}
                          className={cn(
                            "px-4 py-2 rounded-xl border text-xs font-bold transition-all",
                            quickEntryGridForm.color === color 
                              ? "border-emerald-500 text-emerald-600 bg-emerald-50" 
                              : "border-zinc-200 text-zinc-600 hover:border-zinc-300"
                          )}
                        >
                          {color}
                        </button>
                      ))}
                    </div>
                  </div>

                  {quickEntryGridForm.color && (
                    <div>
                      <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-2">Tamanho</label>
                      <div className="flex flex-wrap gap-2">
                        {selectedProductForQuickEntryGrid.grid_data
                          ?.filter(g => g.color === quickEntryGridForm.color)
                          .map(g => (
                            <button
                              key={g.size}
                              onClick={() => setQuickEntryGridForm(prev => ({ ...prev, size: g.size }))}
                              className={cn(
                                "w-10 h-10 rounded-xl border flex items-center justify-center text-xs font-bold transition-all",
                                quickEntryGridForm.size === g.size 
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
                  disabled={!quickEntryGridForm.color || !quickEntryGridForm.size}
                  onClick={() => addToQuickEntry(selectedProductForQuickEntryGrid, quickEntryGridForm.color, quickEntryGridForm.size, Number(quickEntryQuantity.toString().replace(',', '.')) || 1)}
                  className="w-full bg-zinc-900 text-white py-4 rounded-2xl text-sm font-bold shadow-xl hover:bg-emerald-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Adicionar à Lista
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (view === 'labels') {
    return (
      <LabelCenter 
        onClose={() => {
          setView('list');
          setSelectedProductForLabels(null);
        }} 
        initialProduct={selectedProductForLabels || undefined}
      />
    );
  }

  if (view === 'import') {
    if (isRestrictedPlan) {
      setView('list');
      return null;
    }
    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-bold text-zinc-800 tracking-tight">Central de Produtos</h2>
            <div className="flex items-center gap-2">
              <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider">
                {centralProducts.length} disponíveis
              </span>
              {isAdmin && (
                <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider">
                  Modo Admin
                </span>
              )}
            </div>
          </div>
          <button 
            onClick={() => setView('list')}
            className="text-sm font-bold text-zinc-500 hover:text-zinc-800 transition-colors flex items-center justify-center gap-2 w-full sm:w-auto bg-zinc-100 sm:bg-transparent py-3 sm:py-0 rounded-xl sm:rounded-none"
          >
            Voltar para Lista
          </button>
        </div>

        <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm space-y-6">
          {!isAdmin && priceSuggestions.length > 0 && (
            <div className="bg-purple-50 border border-purple-100 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4 text-center sm:text-left">
                <div className="w-12 h-12 rounded-2xl bg-white border border-purple-100 flex items-center justify-center text-purple-500 shadow-sm">
                  <TrendingUp className="w-6 h-6" />
                </div>
                <div>
                  <p className="font-bold text-purple-900">Novas Sugestões de Preço</p>
                  <p className="text-xs text-purple-600">Existem atualizações de preços sugeridas pelo administrador.</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setConfirmModal({
                    isOpen: true,
                    title: 'Sincronizar Todos os Preços',
                    message: 'Deseja atualizar os preços de TODOS os seus produtos que possuem sugestões da Central?',
                    variant: 'info',
                    onConfirm: async () => {
                      try {
                        setSyncing(true);
                        setConfirmModal(prev => ({ ...prev, isOpen: false }));
                        
                        let updatedCount = 0;
                        for (const suggestion of priceSuggestions) {
                          const product = products.find(p => {
                            const pKey = (p.ean && p.ean !== '0' && p.ean !== '') ? p.ean : p.name.toLowerCase().trim();
                            const cProduct = centralProducts.find(cp => cp.id === suggestion.central_product_id);
                            if (!cProduct) return false;
                            const cKey = (cProduct.ean && cProduct.ean !== '0' && cProduct.ean !== '') ? cProduct.ean : cProduct.name.toLowerCase().trim();
                            return pKey === cKey;
                          });

                          if (product) {
                            const { error } = await supabase
                              .from('products')
                              .update({
                                cost_price: suggestion.suggested_cost_price,
                                sale_price: suggestion.suggested_sale_price
                              })
                              .eq('id', product.id);
                            if (!error) updatedCount++;
                          }
                        }
                        
                        addNotification({
                          type: 'success',
                          title: 'Sincronização Concluída',
                          message: `${updatedCount} produtos atualizados com sucesso!`
                        });
                        fetchProducts();
                      } catch (err) {
                        console.error('Error syncing all prices:', err);
                        addNotification({
                          type: 'error',
                          title: 'Erro na sincronização',
                          message: formatError(err)
                        });
                      } finally {
                        setSyncing(false);
                      }
                    }
                  });
                }}
                disabled={syncing}
                className="w-full sm:w-auto bg-purple-600 hover:bg-purple-700 text-white px-8 py-3 rounded-xl font-bold transition-all shadow-lg shadow-purple-500/20 flex items-center justify-center gap-2"
              >
                {syncing ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sincronizar Tudo Agora'}
              </button>
            </div>
          )}

          {isAdmin && (
            <div className="space-y-4">
              <p className="text-sm text-zinc-500">
                Cole os dados copiados do Excel. A sequência das colunas deve ser exatamente: <br/>
                <strong className="text-zinc-800">Nome do Produto | Nome na Etiqueta | Código EAN | Custo | Valor de Venda | Variações EAN (opcional, separadas por vírgula)</strong>
              </p>
              <textarea
                value={excelData}
                onChange={(e) => setExcelData(e.target.value)}
                placeholder="Cole os dados aqui..."
                className="w-full h-32 bg-zinc-50 border border-zinc-200 rounded-xl p-4 text-sm font-mono focus:outline-none focus:border-emerald-500 transition-colors"
              />
              <div className="flex justify-end">
                <button
                  onClick={handleImportProducts}
                  disabled={importing || !excelData.trim()}
                  className="flex items-center gap-2 bg-[#00a86b] hover:bg-[#008f5b] text-white px-6 py-2.5 rounded-xl font-bold transition-all shadow-sm disabled:opacity-50"
                >
                  {importing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                  Importar Lote
                </button>
              </div>
            </div>
          )}

          <div className="border border-zinc-100 rounded-xl overflow-hidden">
            <div className="p-4 bg-zinc-50 border-b border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <h4 className="text-xs font-bold text-zinc-600 uppercase tracking-wider text-center sm:text-left">Produtos Disponíveis na Central</h4>
                {isAdmin && centralProducts.length > 0 && (
                  <button 
                    onClick={handleClearCentral}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-[10px] font-bold uppercase transition-all w-full sm:w-auto"
                  >
                    <Trash2 className="w-3 h-3" />
                    Limpar Tudo
                  </button>
                )}
              </div>

              <div className="relative flex-1 max-w-md">
                <input
                  type="text"
                  placeholder="Buscar na central..."
                  value={centralSearchTerm}
                  onChange={(e) => setCentralSearchTerm(e.target.value)}
                  className="w-full bg-white border border-zinc-200 rounded-xl pl-10 pr-4 py-2 text-sm focus:border-emerald-500 outline-none transition-all shadow-sm"
                />
                <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              </div>
            </div>
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-left border-collapse min-w-[600px]">
                <thead className="sticky top-0 bg-zinc-50 border-b border-zinc-100 z-10">
                  <tr>
                    <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Produto</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Nome Etiqueta</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">EAN</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right">Custo</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right">Venda</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {loadingCentral ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center">
                        <Loader2 className="w-6 h-6 animate-spin text-emerald-500 mx-auto" />
                      </td>
                    </tr>
                  ) : filteredCentralProducts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-zinc-400 text-sm">
                        {centralSearchTerm ? 'Nenhum produto encontrado na busca.' : 'Nenhum produto na central.'}
                      </td>
                    </tr>
                  ) : (
                    filteredCentralProducts.map((product) => {
                      const key = (product.ean && product.ean !== '0' && product.ean !== '') 
                        ? product.ean 
                        : product.name.toLowerCase().trim();
                      
                      const isAdded = products.some(p => {
                        const pKey = (p.ean && p.ean !== '0' && p.ean !== '') ? p.ean : p.name.toLowerCase().trim();
                        return pKey === key;
                      });

                      return (
                        <tr key={product.id} className="hover:bg-zinc-50/50 transition-colors">
                          <td className="px-4 py-3">
                            <p className="text-sm font-bold text-zinc-800">{product.name}</p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm text-zinc-500">{product.label_name || '-'}</p>
                          </td>
                          <td className="px-4 py-3 text-xs text-zinc-500 font-mono">
                            <div>{product.ean || '-'}</div>
                            {product.ean_variations?.length > 0 && (
                              <div className="text-[9px] text-zinc-400 mt-1">
                                +{product.ean_variations.length} variações
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-zinc-500 text-right">R$ {product.cost_price?.toFixed(2)}</td>
                          <td className="px-4 py-3 text-sm font-bold text-emerald-600 text-right">R$ {product.sale_price?.toFixed(2)}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-3">
                              {isAdmin ? (
                                <>
                                  <button 
                                    onClick={() => handleOpenPriceModal(product)}
                                    className="flex items-center gap-1.5 px-2 py-1 bg-purple-50 hover:bg-purple-100 text-purple-600 rounded-lg text-[10px] font-bold uppercase transition-all"
                                    title="Atualizar Preço / Sugerir Alteração"
                                  >
                                    <TrendingUp className="w-3 h-3" />
                                    Preço
                                  </button>
                                  <button 
                                    onClick={() => handleEditCentralProduct(product)}
                                    className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-[10px] font-bold uppercase transition-all"
                                    title="Editar Produto"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                    Editar
                                  </button>
                                  <button 
                                    onClick={() => handleDeleteCentralProduct(product.id)}
                                    className="flex items-center gap-1.5 px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-[10px] font-bold uppercase transition-all"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                    Excluir
                                  </button>
                                </>
                              ) : (
                                <>
                                  {(() => {
                                    const userProduct = products.find(p => {
                                      const pKey = (p.ean && p.ean !== '0' && p.ean !== '') ? p.ean : p.name.toLowerCase().trim();
                                      const cKey = (product.ean && product.ean !== '0' && product.ean !== '') ? product.ean : product.name.toLowerCase().trim();
                                      return pKey === cKey;
                                    });
                                    
                                    const latestSuggestion = priceSuggestions.find(s => s.central_product_id === product.id);
                                    const hasSuggestion = latestSuggestion && userProduct && (
                                      userProduct.cost_price !== latestSuggestion.suggested_cost_price ||
                                      userProduct.sale_price !== latestSuggestion.suggested_sale_price
                                    );

                                    if (userProduct) {
                                      return (
                                        <div className="flex items-center gap-2">
                                          <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest bg-emerald-50 px-2 py-1 rounded-lg">
                                            Adicionado
                                          </span>
                                          {hasSuggestion && (
                                            <button 
                                              onClick={() => handleApplyPriceSuggestion(userProduct, latestSuggestion)}
                                              className="flex items-center gap-1.5 px-2 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-[10px] font-bold uppercase transition-all shadow-sm animate-pulse"
                                            >
                                              <TrendingUp className="w-3 h-3" />
                                              Atualizar Preço
                                            </button>
                                          )}
                                        </div>
                                      );
                                    }

                                    return (
                                      <button 
                                        onClick={() => handleAddSingleFromCentral(product)}
                                        className="text-emerald-500 hover:text-emerald-700 transition-colors text-xs font-bold uppercase"
                                      >
                                        Adicionar
                                      </button>
                                    );
                                  })()}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
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

        {/* Price Suggestion Modal */}
        {isPriceModalOpen && selectedCentralProduct && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
              <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-purple-50 text-purple-500">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-zinc-800 tracking-tight">Sugerir Alteração de Preço</h3>
                    <p className="text-xs text-zinc-400">{selectedCentralProduct.name}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsPriceModalOpen(false)}
                  className="p-2 hover:bg-zinc-100 rounded-xl transition-colors text-zinc-400 hover:text-zinc-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Novo Custo [R$]</label>
                    <input 
                      type="text" 
                      inputMode="numeric"
                      value={suggestionForm.cost_price}
                      onChange={e => setSuggestionForm({...suggestionForm, cost_price: formatMoneyInput(e.target.value)})}
                      className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-4 text-sm focus:border-purple-500 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Novo Preço de Venda [R$]</label>
                    <input 
                      type="text" 
                      inputMode="numeric"
                      value={suggestionForm.sale_price}
                      onChange={e => setSuggestionForm({...suggestionForm, sale_price: formatMoneyInput(e.target.value)})}
                      className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-4 text-sm focus:border-purple-500 outline-none transition-all"
                    />
                  </div>
                  <button
                    onClick={handleSavePriceSuggestion}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white py-4 rounded-2xl font-bold transition-all shadow-lg shadow-purple-500/20 flex items-center justify-center gap-2"
                  >
                    Salvar Sugestão e Notificar
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-zinc-400">
                    <History className="w-4 h-4" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Histórico de Alterações</span>
                  </div>
                  <div className="bg-zinc-50 rounded-2xl p-4 h-[240px] overflow-y-auto space-y-3 border border-zinc-100">
                    {priceHistory.length === 0 ? (
                      <p className="text-xs text-zinc-400 text-center py-8 italic">Nenhuma alteração anterior registrada.</p>
                    ) : (
                      priceHistory.map((history) => (
                        <div key={history.id} className="bg-white p-3 rounded-xl border border-zinc-100 shadow-sm">
                          <div className="flex justify-between items-start mb-2">
                            <span className="text-[9px] text-zinc-400">{new Date(history.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <p className="text-[8px] text-zinc-400 uppercase font-bold">Custo</p>
                              <p className="text-xs font-bold text-zinc-700">R$ {history.suggested_cost_price.toFixed(2)}</p>
                            </div>
                            <div>
                              <p className="text-[8px] text-zinc-400 uppercase font-bold">Venda</p>
                              <p className="text-xs font-bold text-zinc-700">R$ {history.suggested_sale_price.toFixed(2)}</p>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {isCentralEditModalOpen && editingCentralProduct && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300 max-h-[90vh]">
              <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-2xl bg-blue-50 text-blue-500">
                    <Edit2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-zinc-800 tracking-tight">Editar Produto Central</h3>
                    <p className="text-sm text-zinc-500">Atualize as informações globais do produto.</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsCentralEditModalOpen(false)}
                  className="p-2 hover:bg-zinc-100 rounded-xl transition-colors text-zinc-400"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Nome do Produto</label>
                    <input 
                      type="text"
                      value={editingCentralProduct.name}
                      onChange={e => setEditingCentralProduct({...editingCentralProduct, name: e.target.value})}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:border-emerald-500 outline-none transition-colors"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Nome na Etiqueta</label>
                    <input 
                      type="text"
                      value={editingCentralProduct.label_name || ''}
                      onChange={e => setEditingCentralProduct({...editingCentralProduct, label_name: e.target.value})}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:border-emerald-500 outline-none transition-colors"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Código EAN Principal</label>
                  <input 
                    type="text"
                    value={editingCentralProduct.ean || ''}
                    onChange={e => setEditingCentralProduct({...editingCentralProduct, ean: e.target.value})}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:border-emerald-500 outline-none transition-colors font-mono"
                  />
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">Variações de EAN (Máx. 10)</label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={centralEanVariationInput}
                      onChange={e => setCentralEanVariationInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (centralEanVariationInput.trim() && editingCentralProduct.ean_variations.length < 10) {
                            setEditingCentralProduct({
                              ...editingCentralProduct,
                              ean_variations: [...editingCentralProduct.ean_variations, centralEanVariationInput.trim()]
                            });
                            setCentralEanVariationInput('');
                          }
                        }
                      }}
                      placeholder="Digitar ou bipar variação EAN..."
                      className="flex-1 bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:border-emerald-500 outline-none transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (centralEanVariationInput.trim() && editingCentralProduct.ean_variations.length < 10) {
                          setEditingCentralProduct({
                            ...editingCentralProduct,
                            ean_variations: [...editingCentralProduct.ean_variations, centralEanVariationInput.trim()]
                          });
                          setCentralEanVariationInput('');
                        }
                      }}
                      disabled={!centralEanVariationInput.trim() || editingCentralProduct.ean_variations.length >= 10}
                      className="bg-zinc-900 text-white px-6 rounded-xl font-bold text-xs hover:bg-zinc-800 transition-colors disabled:opacity-50"
                    >
                      Adicionar
                    </button>
                  </div>
                  
                  {editingCentralProduct.ean_variations.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {editingCentralProduct.ean_variations.map((v: string, i: number) => (
                        <div key={i} className="bg-zinc-100 text-zinc-700 px-3 py-1.5 rounded-xl text-[10px] font-bold flex items-center gap-2 border border-zinc-200">
                          <Barcode className="w-3 h-3 text-zinc-400" />
                          {v}
                          <button 
                            type="button"
                            onClick={() => setEditingCentralProduct({
                              ...editingCentralProduct,
                              ean_variations: editingCentralProduct.ean_variations.filter((_: any, idx: number) => idx !== i)
                            })}
                            className="text-zinc-400 hover:text-red-500 transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Preço de Custo</label>
                    <input 
                      type="number"
                      step="0.01"
                      value={editingCentralProduct.cost_price}
                      onChange={e => setEditingCentralProduct({...editingCentralProduct, cost_price: parseFloat(e.target.value)})}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:border-emerald-500 outline-none transition-colors"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Preço de Venda</label>
                    <input 
                      type="number"
                      step="0.01"
                      value={editingCentralProduct.sale_price}
                      onChange={e => setEditingCentralProduct({...editingCentralProduct, sale_price: parseFloat(e.target.value)})}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:border-emerald-500 outline-none transition-colors"
                    />
                  </div>
                </div>
              </div>
              
              <div className="p-6 border-t border-zinc-100 flex gap-3 bg-zinc-50/50">
                <button
                  onClick={() => setIsCentralEditModalOpen(false)}
                  className="flex-1 py-3 rounded-xl font-bold text-zinc-500 hover:bg-zinc-100 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveCentralProduct}
                  disabled={saving}
                  className="flex-[2] py-3 bg-emerald-600 text-white rounded-xl font-bold shadow-lg shadow-emerald-500/20 hover:bg-emerald-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Salvar Alterações
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-zinc-800">Catálogo de Produtos</h2>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-1">
            <p className="text-sm text-zinc-500">Gerencie seu estoque e catálogo.</p>
            <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider w-fit">
              {totalCount} Itens Cadastrados
            </span>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
          {duplicateGroups.length > 0 && (
            <button 
              onClick={() => {
                setSelectedDuplicateIds(new Set());
                setIsDuplicateModalOpen(true);
              }}
              disabled={syncing}
              className="flex items-center justify-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 px-4 py-3 sm:py-2.5 rounded-xl font-bold transition-all border border-red-100 w-full sm:w-auto disabled:opacity-50"
            >
              <AlertCircle className="w-5 h-5" />
              Limpar Duplicados ({duplicateGroups.length})
            </button>
          )}
          {pendingPriceCount > 0 && (
            <button 
              onClick={handleSyncAllPrices}
              disabled={syncing}
              className="flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-3 sm:py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-purple-500/20 w-full sm:w-auto disabled:opacity-50"
            >
              {syncing ? <Loader2 className="w-5 h-5 animate-spin" /> : <TrendingUp className="w-5 h-5" />}
              Sincronizar Preços ({pendingPriceCount})
            </button>
          )}
          <button 
            onClick={() => setView('quick_entry')}
            className="flex items-center justify-center gap-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 px-4 py-3 sm:py-2.5 rounded-xl font-bold transition-all shadow-sm w-full sm:w-auto"
          >
            <History className="w-5 h-5" />
            Entrada Rápida
          </button>
          <button 
            onClick={() => setView('labels')}
            className="flex items-center justify-center gap-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 px-4 py-3 sm:py-2.5 rounded-xl font-bold transition-all shadow-sm w-full sm:w-auto"
          >
            <Tag className="w-5 h-5" />
            Central de Etiquetas
          </button>
          <button 
            onClick={() => setView('import')}
            disabled={isRestrictedPlan}
            className={cn(
              "flex items-center justify-center gap-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 px-4 py-3 sm:py-2.5 rounded-xl font-bold transition-all shadow-sm w-full sm:w-auto",
              isRestrictedPlan && "opacity-50 cursor-not-allowed grayscale"
            )}
          >
            <Upload className="w-5 h-5" />
            Central de Produtos
            {isRestrictedPlan && <Lock className="w-3.5 h-3.5 text-zinc-400" />}
          </button>
          <button 
            onClick={handleNewProduct}
            className="flex items-center justify-center gap-2 bg-[#00a86b] hover:bg-[#008f5b] text-white px-4 py-3 sm:py-2.5 rounded-xl font-bold transition-all shadow-sm w-full sm:w-auto"
          >
            <Plus className="w-5 h-5" />
            Novo Produto
          </button>
        </div>
      </div>

      {/* Legenda de Ações */}
      <div className="bg-white border border-zinc-100 rounded-2xl p-4 flex flex-wrap gap-6 items-center shadow-sm">
        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Legenda de Ações:</span>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <div className="p-1.5 bg-zinc-50 rounded-lg text-zinc-600">
            <Edit2 className="w-3.5 h-3.5" />
          </div>
          <span>Editar Produto</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <div className="p-1.5 bg-zinc-50 rounded-lg text-zinc-600">
            <Printer className="w-3.5 h-3.5" />
          </div>
          <span>Imprimir Etiqueta</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <div className="p-1.5 bg-zinc-50 rounded-lg text-zinc-600">
            <History className="w-3.5 h-3.5" />
          </div>
          <span>Histórico de Preços</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <div className="p-1.5 bg-zinc-50 rounded-lg text-zinc-600">
            <Eye className="w-3.5 h-3.5" />
          </div>
          <span>Ver na Loja</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <div className="p-1.5 bg-red-50 rounded-lg text-red-600">
            <Trash2 className="w-3.5 h-3.5" />
          </div>
          <span>Excluir Produto</span>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
          <input 
            type="text" 
            placeholder="Buscar por nome ou EAN..." 
            className="w-full bg-white border border-zinc-200 rounded-xl pl-10 pr-4 py-3 text-zinc-800 focus:outline-none focus:border-emerald-500 transition-colors shadow-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="relative w-full sm:w-64">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full bg-white border border-zinc-200 rounded-xl pl-10 pr-4 py-3 text-zinc-800 focus:outline-none focus:border-emerald-500 transition-colors shadow-sm appearance-none"
          >
            <option value="Todos">Todas as Categorias</option>
            {storeSettings?.categories?.map((cat: string) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50">
                <th className="px-6 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Produto</th>
                <th className="px-6 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Nome Etiqueta</th>
                <th className="px-6 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Código</th>
                <th className="px-6 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Preço</th>
                <th className="px-6 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Estoque</th>
                <th className="px-6 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-zinc-400">
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                      Carregando produtos...
                    </div>
                  </td>
                </tr>
              ) : displayedProducts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <p className="text-zinc-500">Nenhum produto encontrado com os filtros atuais.</p>
                      {(searchTerm || selectedCategory !== 'Todos') && (
                        <button
                          onClick={() => {
                            setSearchTerm('');
                            setSelectedCategory('Todos');
                          }}
                          className="text-sm font-bold text-emerald-600 hover:text-emerald-700 underline"
                        >
                          Limpar todos os filtros
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                <>
                  {displayedProducts.map((product) => (
                    <tr key={product.id} className="hover:bg-zinc-50/50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-lg bg-zinc-100 border border-zinc-200 flex items-center justify-center overflow-hidden">
                            {product.photo_url ? (
                              <img src={product.photo_url} alt={product.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <PackageIcon className="w-6 h-6 text-zinc-400" />
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-zinc-800">{product.name}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-xs text-zinc-500">{product.label_name || '-'}</p>
                      </td>
                      <td className="px-6 py-4 text-xs text-zinc-500 font-mono">
                        {product.barcode ? (
                          <div className="flex flex-col">
                            <span className="text-blue-600 font-bold">EXC: {product.barcode}</span>
                            {product.ean && <span className="opacity-50 text-[10px]">EAN: {product.ean}</span>}
                          </div>
                        ) : (
                          product.ean || '-'
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-zinc-800">R$ {product.sale_price?.toFixed(2)}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "text-sm font-bold",
                            product.current_stock <= 5 ? "text-red-500" : "text-zinc-700"
                          )}>
                            {product.current_stock} un
                          </span>
                          {product.current_stock <= 5 && <AlertCircle className="w-4 h-4 text-red-500" />}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <span className={cn(
                            "inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider",
                            product.current_stock > 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                          )}>
                            {product.current_stock > 0 ? 'Em estoque' : 'Esgotado'}
                          </span>
                          <span className={cn(
                            "inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider",
                            product.is_visible_in_store !== false ? "bg-purple-50 text-purple-600" : "bg-zinc-100 text-zinc-400"
                          )}>
                            {product.is_visible_in_store !== false ? 'Visível na Loja' : 'Oculto na Loja'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {(() => {
                            const suggestion = getPendingSuggestion(product);
                            if (suggestion) {
                              return (
                                <button 
                                  onClick={() => handleApplyPriceSuggestion(product, suggestion)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-[10px] font-bold uppercase transition-all shadow-sm animate-pulse"
                                  title="Atualizar para preço sugerido"
                                >
                                  <TrendingUp className="w-3 h-3" />
                                  Preço
                                </button>
                              );
                            }
                            return null;
                          })()}
                          <button 
                            onClick={() => handlePrintLabel(product)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 rounded-lg text-[10px] font-bold uppercase transition-all"
                            title="Imprimir Etiqueta"
                          >
                            <Tag className="w-3 h-3" />
                            Etiqueta
                          </button>
                          <button 
                            onClick={() => handleEdit(product)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 rounded-lg text-[10px] font-bold uppercase transition-all"
                          >
                            <Edit2 className="w-3 h-3" />
                            Editar
                          </button>
                          <button 
                            onClick={() => handleDelete(product.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-[10px] font-bold uppercase transition-all"
                          >
                            <Trash2 className="w-3 h-3" />
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {hasMore && !searchTerm && (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center">
                        <button
                          onClick={handleLoadMore}
                          disabled={loadingMore}
                          className="px-6 py-2 bg-white border border-zinc-200 rounded-xl font-bold text-zinc-600 hover:bg-zinc-50 transition-all shadow-sm disabled:opacity-50"
                        >
                          {loadingMore ? (
                            <span className="flex items-center gap-2">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Carregando...
                            </span>
                          ) : 'Carregar Mais Produtos'}
                        </button>
                      </td>
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
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

      {/* Price Suggestion Modal */}
      {isPriceModalOpen && selectedCentralProduct && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-purple-50 text-purple-500">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-zinc-800 tracking-tight">Sugerir Alteração de Preço</h3>
                  <p className="text-xs text-zinc-400">{selectedCentralProduct.name}</p>
                </div>
              </div>
              <button 
                onClick={() => setIsPriceModalOpen(false)}
                className="p-2 hover:bg-zinc-100 rounded-xl transition-colors text-zinc-400 hover:text-zinc-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Novo Custo [R$]</label>
                  <input 
                    type="text" 
                    inputMode="numeric"
                    value={suggestionForm.cost_price}
                    onChange={e => {
                      setSuggestionForm({...suggestionForm, cost_price: formatMoneyInput(e.target.value)});
                    }}
                    className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-4 text-sm focus:border-purple-500 outline-none transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Novo Preço de Venda [R$]</label>
                  <input 
                    type="text" 
                    inputMode="numeric"
                    value={suggestionForm.sale_price}
                    onChange={e => {
                      setSuggestionForm({...suggestionForm, sale_price: formatMoneyInput(e.target.value)});
                    }}
                    className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-4 text-sm focus:border-purple-500 outline-none transition-all"
                  />
                </div>
                <button
                  onClick={handleSavePriceSuggestion}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white py-4 rounded-2xl font-bold transition-all shadow-lg shadow-purple-500/20 flex items-center justify-center gap-2"
                >
                  Salvar Sugestão e Notificar
                </button>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2 text-zinc-400">
                  <History className="w-4 h-4" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Histórico de Alterações</span>
                </div>
                <div className="bg-zinc-50 rounded-2xl p-4 h-[240px] overflow-y-auto space-y-3 border border-zinc-100">
                  {priceHistory.length === 0 ? (
                    <p className="text-xs text-zinc-400 text-center py-8 italic">Nenhuma alteração anterior registrada.</p>
                  ) : (
                    priceHistory.map((history) => (
                      <div key={history.id} className="bg-white p-3 rounded-xl border border-zinc-100 shadow-sm">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-[9px] text-zinc-400">{new Date(history.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <p className="text-[8px] text-zinc-400 uppercase font-bold">Custo</p>
                            <p className="text-xs font-bold text-zinc-700">R$ {history.suggested_cost_price.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-[8px] text-zinc-400 uppercase font-bold">Venda</p>
                            <p className="text-xs font-bold text-zinc-700">R$ {history.suggested_sale_price.toFixed(2)}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showPreview && (
        <PrintPreview 
          pdfUrl={pdfUrl} 
          tipo={previewType} 
          onClose={() => setShowPreview(false)} 
        />
      )}
      {/* Duplicate Resolution Modal */}
      {isDuplicateModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] rounded-[32px] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
            <div className="p-6 border-b border-zinc-100 flex items-center justify-between bg-white sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-red-50 text-red-500">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-zinc-800 tracking-tight">Resolver Duplicidades</h3>
                  <p className="text-sm text-zinc-500">Selecione os produtos que deseja <strong className="text-red-600">EXCLUIR</strong>.</p>
                </div>
              </div>
              <button 
                onClick={() => setIsDuplicateModalOpen(false)}
                className="p-2 hover:bg-zinc-100 rounded-xl transition-colors text-zinc-400 hover:text-zinc-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 bg-zinc-50/50 space-y-6">
              {duplicateGroups.map((group, idx) => (
                <div key={idx} className="bg-white border border-red-100 rounded-2xl overflow-hidden shadow-sm">
                  <div className="bg-red-50/50 px-4 py-2 border-b border-red-100 flex items-center justify-between">
                    <span className="text-xs font-bold text-red-700 uppercase tracking-wider">
                      {group.type === 'ean' ? 'EAN' : 'Nome'}: {group.key}
                    </span>
                    <span className="text-[10px] text-red-500 font-medium italic">
                      {group.products.length} clones detectados
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <tbody className="divide-y divide-zinc-100">
                        {group.products.map((p) => {
                          const isSelected = selectedDuplicateIds.has(p.id);
                          const isLinked = linkedProductIds.has(p.id);
                          return (
                            <tr 
                              key={`${idx}-${p.id}`} 
                              className={cn(
                                "transition-colors cursor-pointer",
                                isSelected ? "bg-red-50" : "hover:bg-zinc-50/50",
                                isLinked && "opacity-60 grayscale-[0.5]"
                              )}
                              onClick={() => {
                                if (isLinked) {
                                  addNotification({
                                    type: 'warning',
                                    title: 'Produto Vinculado',
                                    message: 'Este produto está vinculado a uma campanha ou sacola e não pode ser excluído.'
                                  });
                                  return;
                                }
                                const newSelected = new Set(selectedDuplicateIds);
                                if (isSelected) {
                                  newSelected.delete(p.id);
                                } else {
                                  // Don't allow selecting ALL products in a group
                                  const selectedInGroup = group.products.filter(gp => newSelected.has(gp.id)).length;
                                  if (selectedInGroup < group.products.length - 1) {
                                    newSelected.add(p.id);
                                  } else {
                                    addNotification({
                                      type: 'warning',
                                      title: 'Ação não permitida',
                                      message: 'Você deve manter pelo menos um produto do grupo.'
                                    });
                                  }
                                }
                                setSelectedDuplicateIds(newSelected);
                              }}
                            >
                              <td className="px-4 py-3 w-10">
                                <div className={cn(
                                  "w-5 h-5 rounded border flex items-center justify-center transition-colors",
                                  isSelected ? "bg-red-500 border-red-500 text-white" : "border-zinc-300 bg-white"
                                )}>
                                  {isSelected && <X className="w-3.5 h-3.5" />}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-col">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-zinc-800">{p.name}</span>
                                    {isLinked && (
                                      <span className="bg-amber-100 text-amber-700 text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider flex items-center gap-1">
                                        <LinkIcon className="w-2 h-2" /> Vinculado
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[10px] text-zinc-400 font-mono">ID: {p.id}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-xs text-zinc-500">
                                Estoque: {p.current_stock}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <span className={cn(
                                  "text-xs font-bold",
                                  isSelected ? "text-red-600" : "text-zinc-400"
                                )}>
                                  {isSelected ? 'EXCLUIR' : 'MANTER'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="p-6 border-t border-zinc-100 bg-white flex justify-end gap-3 sticky bottom-0">
              <button
                onClick={() => setIsDuplicateModalOpen(false)}
                className="px-6 py-3 rounded-xl font-bold text-zinc-600 hover:bg-zinc-100 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleResolveDuplicates}
                disabled={syncing || selectedDuplicateIds.size === 0}
                className="bg-red-500 hover:bg-red-600 text-white px-8 py-3 rounded-xl font-bold transition-all shadow-lg shadow-red-500/20 flex items-center gap-2 disabled:opacity-50"
              >
                {syncing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                Excluir Selecionados ({selectedDuplicateIds.size})
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    );
  }
