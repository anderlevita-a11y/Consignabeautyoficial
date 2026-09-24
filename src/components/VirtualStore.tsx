import React, { useState, useEffect, useRef } from 'react';
import { 
  ShoppingBag, 
  Search, 
  Heart, 
  MessageCircle, 
  Filter,
  ChevronRight,
  Star,
  Instagram,
  CheckCircle2,
  CreditCard,
  QrCode,
  Truck,
  ShieldCheck,
  Eye,
  X,
  Plus,
  Minus,
  Camera,
  Upload,
  Loader2,
  Copy,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '../lib/supabase';
import { compressImage } from '../lib/image-utils';
import { StoreSettings, ProductReview } from '../types';
import { cn, formatError } from '../lib/utils';
import { useNotifications } from './NotificationCenter';

interface Product {
  id: number;
  name: string;
  label_name?: string;
  ean?: string;
  ean_variations?: string[];
  price_original: number;
  price_discounted: number;
  discount_percentage: number;
  image_url: string;
  image_urls?: string[];
  category: string;
  is_best_seller: boolean;
  is_ready_to_ship: boolean;
  description?: string;
  has_grid?: boolean;
  grid_data?: any[];
  current_stock: number;
}

interface CartItem {
  product: Product;
  quantity: number;
  selectedSize?: string;
  selectedColor?: string;
}

const TESTIMONIALS = [];

export function VirtualStore({ slug }: { slug?: string }) {
  const { addNotification } = useNotifications();
  const [searchQuery, setSearchQuery] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isQuickViewOpen, setIsQuickViewOpen] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [activeCategory, setActiveCategory] = useState('Todos');
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isPixModalOpen, setIsPixModalOpen] = useState(false);
  const [pixCopied, setPixCopied] = useState(false);
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [isReviewing, setIsReviewing] = useState(false);
  const [newReview, setNewReview] = useState({
    rating: 5,
    customer_name: '',
    comment: '',
    customer_photo_url: ''
  });
  const [favorites, setFavorites] = useState<number[]>([]);
  const [isStoreReviewOpen, setIsStoreReviewOpen] = useState(false);
  const [allStoreReviews, setAllStoreReviews] = useState<ProductReview[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [selectedColor, setSelectedColor] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const storeFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchData();
    fetchAllStoreReviews();
    const savedFavorites = localStorage.getItem('beauty_favorites');
    if (savedFavorites) {
      try {
        const parsed = JSON.parse(savedFavorites);
        if (Array.isArray(parsed)) {
          setFavorites(parsed);
        } else {
          setFavorites([]);
        }
      } catch (e) {
        console.error('Error parsing favorites:', e);
        setFavorites([]);
      }
    }
  }, []);

  const toggleFavorite = (productId: number) => {
    setFavorites(prev => {
      const isFavorite = prev.includes(productId);
      const newFavorites = isFavorite 
        ? prev.filter(id => id !== productId) 
        : [...prev, productId];
      localStorage.setItem('beauty_favorites', JSON.stringify(newFavorites));
      return newFavorites;
    });
  };

  async function fetchData() {
    setLoading(true);
    try {
      let userId: string | null = null;
      let storeSettings: StoreSettings | null = null;

      if (slug) {
        // Fetch Store Settings by Slug
        const { data: storeData, error: storeError } = await supabase
          .from('store_settings')
          .select('*')
          .eq('store_slug', slug)
          .single();
        
        if (storeError) throw storeError;
        if (storeData) {
          storeSettings = storeData;
          userId = storeData.user_id;
          setSettings(storeData);
        }
      } else {
        const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
        if (user) {
          userId = user.id;
          // Fetch Store Settings
          const { data: storeData } = await supabase
            .from('store_settings')
            .select('*')
            .eq('user_id', user.id)
            .single();
          if (storeData) {
            storeSettings = storeData;
            setSettings(storeData);
          }
        }
      }
      
      if (!userId) {
        setLoading(false);
        return;
      }

      // Fetch Products from Supabase in chunks to bypass 1000 limit
      let allProductsData: any[] = [];
      let from = 0;
      let to = 999;
      let hasMore = true;

      while (hasMore) {
        const { data: productsData, error: productsError } = await supabase
          .from('products')
          .select('*')
          .eq('user_id', userId)
          .eq('is_visible_in_store', true)
          .range(from, to);

        if (productsError) throw productsError;

        if (productsData && productsData.length > 0) {
          allProductsData = [...allProductsData, ...productsData];
          from += 1000;
          to += 1000;
          if (productsData.length < 1000) hasMore = false;
        } else {
          hasMore = false;
        }
        
        // Safety break to prevent infinite loops if something goes wrong
        if (allProductsData.length >= 20000) hasMore = false;
      }

      if (allProductsData.length > 0) {
        const formattedProducts: Product[] = allProductsData.map(p => ({
          id: p.id,
          name: p.name,
          label_name: p.label_name,
          ean: p.ean,
          price_original: p.sale_price,
          price_discounted: p.sale_price, // Will apply global discount later in render
          discount_percentage: 0,
          image_url: p.photo_url || "https://images.unsplash.com/photo-1518310383802-640c2de311b2?q=80&w=800&auto=format&fit=crop",
          image_urls: p.image_urls || (p.photo_url ? [p.photo_url] : []),
          category: p.category || "Geral",
          is_best_seller: false,
          is_ready_to_ship: p.current_stock > 0,
          description: p.description || p.label_name || p.name,
          has_grid: p.has_grid,
          grid_data: p.grid_data,
          current_stock: p.current_stock || 0
        }));
        setProducts(formattedProducts);
      }
    } catch (error: any) {
      console.error("Error fetching data:", error);
      addNotification({
        type: 'error',
        title: 'Erro de Conexão',
        message: formatError(error)
      });
    } finally {
        setLoading(false);
      }
    }

  const fetchAllStoreReviews = async () => {
    try {
      let userId: string | null = null;
      
      if (slug) {
        const { data } = await supabase
          .from('store_settings')
          .select('user_id')
          .eq('store_slug', slug)
          .single();
        if (data) userId = data.user_id;
      } else {
        const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
        if (user) userId = user.id;
      }

      if (!userId) return;

      const { data, error } = await supabase
        .from('product_reviews')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'approved')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAllStoreReviews(data || []);
    } catch (err) {
      console.error('Error fetching all store reviews:', err);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>, isStore: boolean = false) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingPhoto(true);
      
      const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
      if (!user) throw new Error('Usuário não autenticado');

      const processedFile = await compressImage(file);
      const fileExt = processedFile.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;
      const filePath = `reviews/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('products')
        .upload(filePath, processedFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('products')
        .getPublicUrl(filePath);

      setNewReview(prev => ({ ...prev, customer_photo_url: publicUrl }));
    } catch (err: any) {
      console.error('Error uploading photo:', err);
      addNotification({
        type: 'error',
        title: 'Erro no upload',
        message: formatError(err)
      });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const submitStoreReview = async () => {
    if (!settings) return;
    if (!newReview.customer_name || !newReview.comment) {
      addNotification({
        type: 'warning',
        title: 'Campos obrigatórios',
        message: 'Por favor, preencha seu nome e comentário.'
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('product_reviews')
        .insert({
          product_id: 'store', // General store review
          user_id: settings.user_id,
          customer_name: newReview.customer_name,
          customer_photo_url: newReview.customer_photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(newReview.customer_name)}&background=random`,
          rating: newReview.rating,
          comment: newReview.comment,
          status: 'pending'
        });

      if (error) throw error;
      addNotification({
        type: 'success',
        title: 'Avaliação Enviada',
        message: 'Sua avaliação foi enviada e está aguardando aprovação!'
      });
      setIsStoreReviewOpen(false);
      setNewReview({ rating: 5, customer_name: '', comment: '', customer_photo_url: '' });
    } catch (err: any) {
      console.error('Error submitting store review:', err);
      addNotification({
        type: 'error',
        title: 'Erro ao enviar',
        message: formatError(err)
      });
    }
  };

  const openQuickView = (product: Product) => {
    setSelectedProduct(product);
    setIsQuickViewOpen(true);
    setSelectedSize('');
    setSelectedColor('');
    fetchReviews(product.id.toString());
  };

  const fetchReviews = async (productId: string) => {
    try {
      const { data, error } = await supabase
        .from('product_reviews')
        .select('*')
        .eq('product_id', productId)
        .eq('status', 'approved')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReviews(data || []);
    } catch (err) {
      console.error('Error fetching reviews:', err);
    }
  };

  const submitReview = async () => {
    if (!selectedProduct || !settings) return;
    if (!newReview.customer_name || !newReview.comment) {
      addNotification({
        type: 'warning',
        title: 'Campos obrigatórios',
        message: 'Por favor, preencha seu nome e comentário.'
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('product_reviews')
        .insert({
          product_id: selectedProduct.id.toString(),
          user_id: settings.user_id,
          customer_name: newReview.customer_name,
          customer_photo_url: newReview.customer_photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(newReview.customer_name)}&background=random`,
          rating: newReview.rating,
          comment: newReview.comment,
          status: 'pending'
        });

      if (error) throw error;
      addNotification({
        type: 'success',
        title: 'Avaliação Enviada',
        message: 'Sua avaliação foi enviada e está aguardando aprovação!'
      });
      setIsReviewing(false);
      setNewReview({ rating: 5, customer_name: '', comment: '', customer_photo_url: '' });
    } catch (err: any) {
      console.error('Error submitting review:', err);
      addNotification({
        type: 'error',
        title: 'Erro ao enviar',
        message: formatError(err)
      });
    }
  };

  const closeQuickView = () => {
    setIsQuickViewOpen(false);
    setTimeout(() => {
      setSelectedProduct(null);
      setActiveImageIndex(0);
    }, 300);
  };

  const filteredProducts = products.filter(p => {
    const search = searchQuery.toLowerCase().trim();
    const matchesSearch = (p.name?.toLowerCase() || '').includes(search) || 
                         (p.category?.toLowerCase() || '').includes(search) ||
                         (p.label_name?.toLowerCase() || '').includes(search) ||
                         (p.ean && p.ean.toLowerCase().includes(search)) ||
                         (p.ean_variations || []).some(v => v.toLowerCase().includes(search));
    const matchesCategory = activeCategory === 'Todos' || p.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const handleWhatsAppClick = () => {
    if (settings?.whatsapp_number) {
      const message = encodeURIComponent(`Olá! Gostaria de saber mais sobre os produtos da ${settings.store_name}.`);
      window.open(`https://wa.me/${settings.whatsapp_number}?text=${message}`, '_blank');
    }
  };

  const addToCart = (product: Product, size?: string, color?: string) => {
    if (product.current_stock <= 0) {
      addNotification({
        type: 'warning',
        title: 'Indisponível',
        message: 'Produto indisponível no momento.'
      });
      return;
    }

    if (product.has_grid && (!size || !color)) {
      openQuickView(product);
      return;
    }

    setCart(prev => {
      const existing = prev.find(item => 
        item.product.id === product.id && 
        item.selectedSize === size && 
        item.selectedColor === color
      );
      if (existing) {
        return prev.map(item => 
          (item.product.id === product.id && item.selectedSize === size && item.selectedColor === color)
            ? { ...item, quantity: item.quantity + 1 } 
            : item
        );
      }
      return [...prev, { product, quantity: 1, selectedSize: size, selectedColor: color }];
    });
    setIsCartOpen(true);
  };

  const removeFromCart = (productId: number, size?: string, color?: string) => {
    setCart(prev => prev.filter(item => 
      !(item.product.id === productId && item.selectedSize === size && item.selectedColor === color)
    ));
  };

  const updateQuantity = (productId: number, delta: number, size?: string, color?: string) => {
    setCart(prev => prev.map(item => {
      if (item.product.id === productId && item.selectedSize === size && item.selectedColor === color) {
        const newQuantity = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQuantity };
      }
      return item;
    }));
  };

  const cartTotal = cart.reduce((total, item) => {
    const price = item.product.price_discounted * (1 - (settings?.global_discount || 0) / 100);
    return total + price * item.quantity;
  }, 0);

  const cartItemCount = cart.reduce((total, item) => total + item.quantity, 0);

  const handleCheckout = () => {
    if (!settings?.whatsapp_number) {
      addNotification({
        type: 'error',
        title: 'Configuração ausente',
        message: 'Número de WhatsApp da loja não configurado.'
      });
      return;
    }

    let message = `Olá! Gostaria de finalizar minha compra na ${settings.store_name}:\n\n`;
    
    cart.forEach(item => {
      const price = item.product.price_discounted * (1 - (settings?.global_discount || 0) / 100);
      message += `${item.quantity}x ${item.product.name} - R$ ${price.toFixed(2)}\n`;
    });

    message += `\n*Total: R$ ${cartTotal.toFixed(2)}*`;

    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/${settings.whatsapp_number}?text=${encodedMessage}`, '_blank');
  };

  const copyPixKey = () => {
    if (!settings?.pix_key) return;
    navigator.clipboard.writeText(settings.pix_key);
    setPixCopied(true);
    setTimeout(() => setPixCopied(false), 2000);
  };

  const handlePixCheckout = () => {
    if (!settings?.pix_key) {
      addNotification({
        type: 'warning',
        title: 'PIX Indisponível',
        message: 'Chave PIX não configurada pela loja.'
      });
      return;
    }
    setIsPixModalOpen(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-10 h-10 text-[#FF007F] animate-spin" />
      </div>
    );
  }

  if (slug && !settings) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 p-6 text-center">
        <div className="w-20 h-20 bg-zinc-100 rounded-full flex items-center justify-center mb-6">
          <ShoppingBag className="w-10 h-10 text-zinc-300" />
        </div>
        <h1 className="text-2xl font-serif italic text-zinc-900 mb-2">Loja não encontrada</h1>
        <p className="text-zinc-500 max-w-xs mx-auto">
          O link que você acessou pode estar incorreto ou a loja não está mais disponível.
        </p>
        <button 
          onClick={() => window.location.href = '/'}
          className="mt-8 text-sm font-bold text-[#FF007F] uppercase tracking-widest hover:underline"
        >
          Voltar para o Início
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white font-sans text-zinc-900 pb-24">
      {/* Dynamic Promo Banner */}
      <div className="bg-[#FF007F] text-white py-2 px-6 text-center overflow-hidden" style={{ backgroundColor: settings?.primary_color }}>
        <motion.p 
          animate={{ x: [300, -300] }}
          transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
          className="text-[10px] font-bold uppercase tracking-[0.2em] whitespace-nowrap"
        >
          {settings?.scrolling_text || '✨ Frete Grátis em compras acima de R$ 250 • 10% OFF na primeira compra • Parcelamento em até 6x ✨'}
        </motion.p>
      </div>

      {/* Header Section */}
      <header className="px-6 pt-8 pb-4 space-y-6 sticky top-0 bg-white/90 backdrop-blur-md z-30 border-b border-zinc-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {settings?.logo_url ? (
              <img src={settings.logo_url} alt="Logo" className="h-16 w-auto object-contain" referrerPolicy="no-referrer" />
            ) : (
              <h2 className="text-3xl font-serif italic text-zinc-900 tracking-tight">
                {settings?.store_name?.split(' ')[0] || 'Consigna'} <span className="text-[#FF007F]" style={{ color: settings?.primary_color }}>{settings?.store_name?.split(' ').slice(1).join(' ') || 'Beauty'}</span>
              </h2>
            )}
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsCartOpen(true)}
              className="relative"
            >
              <ShoppingBag className="w-6 h-6 text-zinc-900" />
              {cartItemCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-[#FF007F] text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center" style={{ backgroundColor: settings?.primary_color }}>
                  {cartItemCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Intelligent Search Bar */}
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400 group-focus-within:text-[#FF007F] transition-colors" style={{ color: searchQuery ? settings?.primary_color : undefined }} />
          <input 
            type="text"
            placeholder="O que você está procurando hoje?"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl py-3.5 pl-12 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF007F]/10 focus:border-[#FF007F] transition-all"
            style={{ '--tw-ring-color': `${settings?.primary_color}1a`, borderColor: searchQuery ? settings?.primary_color : undefined } as any}
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-zinc-100 rounded-full transition-colors"
            >
              <X className="w-4 h-4 text-zinc-400" />
            </button>
          )}
        </div>

        {/* Categories Scroll */}
        <div className="flex items-center gap-4">
          <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar flex-1">
            {['Todos', ...(settings?.categories || ['Moda Fitness', 'Beleza', 'Acessórios'])].map((cat) => (
              <button 
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`whitespace-nowrap px-6 py-2 rounded-full text-sm font-medium transition-all ${
                  activeCategory === cat 
                    ? 'text-white shadow-lg' 
                    : 'bg-zinc-50 text-zinc-500 hover:bg-zinc-100'
                }`}
                style={activeCategory === cat ? { 
                  backgroundColor: settings?.primary_color || '#FF007F',
                  boxShadow: `0 10px 15px -3px ${settings?.primary_color}33`
                } : {}}
              >
                {cat}
              </button>
            ))}
          </div>
          {(activeCategory !== 'Todos' || searchQuery) && (
            <button 
              onClick={() => {
                setActiveCategory('Todos');
                setSearchQuery('');
              }}
              className="whitespace-nowrap px-4 py-2 text-[10px] font-bold text-[#FF007F] uppercase tracking-widest hover:bg-zinc-50 rounded-full transition-all"
              style={{ color: settings?.primary_color }}
            >
              Limpar tudo
            </button>
          )}
        </div>
      </header>

      {/* Hero Banner Section */}
      <section className="px-6 my-8">
        <div className="relative aspect-[3/1] md:aspect-[4/1] w-full rounded-[32px] overflow-hidden group shadow-lg">
          <img 
            src={settings?.banner_url || "https://images.unsplash.com/photo-1518310383802-640c2de311b2?q=80&w=1200&auto=format&fit=crop"} 
            alt="Hero"
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/50 to-transparent flex flex-col justify-center px-8">
            <span className="text-white/80 text-[10px] font-bold uppercase tracking-[0.3em] mb-2">Lançamento Exclusivo</span>
            <h3 className="text-white text-4xl font-serif italic mb-6 leading-tight">
              {settings?.welcome_message || 'Power Pink Collection'}
            </h3>
            <button 
              onClick={() => addToCart(filteredProducts[0])} // Just a fallback if needed, but we should probably find the first featured product if this is a general banner
              className="bg-white text-zinc-900 px-8 py-3 rounded-full text-xs font-bold w-fit hover:bg-[#FF007F] hover:text-white transition-all shadow-xl"
              style={{ '--hover-bg': settings?.primary_color } as any}
            >
              Comprar Agora
            </button>
          </div>
        </div>
      </section>

      {/* Filters Section */}
      <section className="px-6 mb-8">
        <div className="flex items-center gap-3 overflow-x-auto no-scrollbar pb-2">
          <button className="flex items-center gap-2 bg-zinc-900 text-white px-4 py-2 rounded-xl text-xs font-bold">
            <Filter className="w-4 h-4" /> Filtros
          </button>
          <button className="bg-zinc-50 text-zinc-600 px-4 py-2 rounded-xl text-xs font-bold border border-zinc-100">Coleção</button>
          <button className="bg-zinc-50 text-zinc-600 px-4 py-2 rounded-xl text-xs font-bold border border-zinc-100">Tamanho</button>
          <button className="bg-zinc-50 text-zinc-600 px-4 py-2 rounded-xl text-xs font-bold border border-zinc-100">Cor</button>
        </div>
      </section>

      {/* Product Grid */}
      <section className="px-6">
        <div className="flex items-center justify-between mb-8">
          <h4 className="text-2xl font-serif italic">Nossos Queridinhos</h4>
          <button className="flex items-center gap-1 text-[10px] font-bold text-[#FF007F] uppercase tracking-[0.2em]">
            Ver Todos <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-10">
          {filteredProducts.map((product) => (
            <motion.div 
              key={product.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="group cursor-pointer text-center"
            >
              <div className="relative aspect-[3/4] rounded-[32px] overflow-hidden bg-zinc-100 mb-4">
                <img 
                  src={product.image_url} 
                  alt={product.name}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                  referrerPolicy="no-referrer"
                />
                
                {/* Badges */}
                <div className="absolute top-4 left-4 flex flex-col gap-2">
                  {product.is_best_seller && (
                    <div className="bg-zinc-900 text-white text-[8px] font-bold px-2 py-1 rounded-full uppercase tracking-widest shadow-lg">
                      Mais Vendido
                    </div>
                  )}
                  {product.is_ready_to_ship && (
                    <div className="bg-emerald-500 text-white text-[8px] font-bold px-2 py-1 rounded-full uppercase tracking-widest shadow-lg flex items-center gap-1">
                      <Truck className="w-2 h-2" /> Pronta Entrega
                    </div>
                  )}
                </div>

                {/* Quick View Icon */}
                <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      openQuickView(product);
                    }}
                    className="p-2.5 bg-white/80 backdrop-blur-md rounded-full shadow-sm hover:bg-white transition-colors"
                  >
                    <Eye className="w-4 h-4 text-zinc-400 group-hover:text-[#FF007F] transition-colors" style={{ color: isQuickViewOpen ? settings?.primary_color : undefined }} />
                  </button>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(product.id);
                    }}
                    className="p-2.5 bg-white/80 backdrop-blur-md rounded-full shadow-sm hover:bg-white transition-colors"
                  >
                    <Heart 
                      className={`w-4 h-4 transition-colors ${favorites.includes(product.id) ? 'fill-[#FF007F] text-[#FF007F]' : 'text-zinc-400'}`} 
                      style={{ 
                        color: favorites.includes(product.id) ? settings?.primary_color : undefined,
                        fill: favorites.includes(product.id) ? settings?.primary_color : undefined
                      }} 
                    />
                  </button>
                </div>

                {(product.discount_percentage > 0 || (settings?.global_discount > 0)) && (
                  <div className="absolute bottom-4 left-4 bg-[#FF007F] text-white text-[10px] font-bold px-3 py-1.5 rounded-2xl shadow-lg" style={{ backgroundColor: settings?.primary_color }}>
                    -{Math.max(product.discount_percentage, settings?.global_discount || 0)}% OFF
                  </div>
                )}
                
                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                  {product.current_stock > 0 ? (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        addToCart(product);
                      }}
                      className="w-full bg-white text-zinc-900 py-3 rounded-2xl text-xs font-bold shadow-2xl transform translate-y-4 group-hover:translate-y-0 transition-transform"
                    >
                      Comprar Agora
                    </button>
                  ) : (
                    <div className="w-full bg-zinc-800/80 backdrop-blur-md text-white py-3 rounded-2xl text-[10px] font-bold uppercase tracking-widest transform translate-y-4 group-hover:translate-y-0 transition-transform">
                      Produto Indisponível
                    </div>
                  )}
                </div>
              </div>
              
              <div className="space-y-1 px-1">
                <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-[0.2em]">{product.category}</p>
                <h5 
                  onClick={() => openQuickView(product)}
                  className="text-sm font-serif text-zinc-800 leading-tight group-hover:text-[#FF007F] transition-colors cursor-pointer" 
                  style={{ '--hover-color': settings?.primary_color } as any}
                >
                  {product.name}
                </h5>
                <div className="flex flex-col items-center gap-0.5">
                  <div 
                    className="flex gap-0.5 mb-1 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      openQuickView(product);
                      setTimeout(() => setIsReviewing(true), 500);
                    }}
                  >
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="w-2.5 h-2.5 fill-[#FF007F] text-[#FF007F]" style={{ color: settings?.primary_color, fill: settings?.primary_color }} />
                    ))}
                  </div>
                  {(product.discount_percentage > 0 || (settings?.global_discount > 0)) && (
                    <span className="text-[10px] text-zinc-400 line-through">
                      R$ {product.price_original.toFixed(2)}
                    </span>
                  )}
                  <span className="text-base font-bold text-[#FF007F]" style={{ color: settings?.primary_color }}>
                    R$ {(product.price_discounted * (1 - (settings?.global_discount || 0) / 100)).toFixed(2)}
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {filteredProducts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Search className="w-12 h-12 text-zinc-200 mb-4" />
            <h3 className="text-lg font-serif italic text-zinc-900 mb-2">Nenhum produto encontrado</h3>
            <p className="text-sm text-zinc-500 mb-6">Tente ajustar sua busca ou filtros para encontrar o que procura.</p>
            <button 
              onClick={() => {
                setSearchQuery('');
                setActiveCategory('Todos');
              }}
              className="bg-zinc-900 text-white px-8 py-3 rounded-full text-xs font-bold shadow-xl hover:bg-[#FF007F] transition-all"
              style={{ backgroundColor: settings?.primary_color }}
            >
              Limpar todos os filtros
            </button>
          </div>
        )}
      </section>

      {/* Quick View Modal */}
      <AnimatePresence>
        {isQuickViewOpen && selectedProduct && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeQuickView}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-[40px] overflow-hidden shadow-2xl flex flex-col md:flex-row max-h-[90vh]"
            >
              <button 
                onClick={closeQuickView}
                className="absolute top-6 right-6 p-2 bg-zinc-100 hover:bg-zinc-200 rounded-full transition-colors z-10"
              >
                <X className="w-5 h-5 text-zinc-500" />
              </button>

              <div className="w-full md:w-1/2 flex flex-col">
                <div className="relative aspect-[3/4] md:aspect-auto md:flex-1 overflow-hidden group/modal">
                  <AnimatePresence mode="wait">
                    <motion.img 
                      key={activeImageIndex}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      src={selectedProduct.image_urls && selectedProduct.image_urls.length > 0 ? selectedProduct.image_urls[activeImageIndex] : selectedProduct.image_url} 
                      alt={selectedProduct.name}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </AnimatePresence>
                  
                  {selectedProduct.image_urls && selectedProduct.image_urls.length > 1 && (
                    <div className="absolute inset-x-4 bottom-6 flex justify-center gap-2">
                      {selectedProduct.image_urls.map((_, idx) => (
                        <button
                          key={idx}
                          onClick={() => setActiveImageIndex(idx)}
                          className={`w-2 h-2 rounded-full transition-all ${idx === activeImageIndex ? 'bg-white w-6' : 'bg-white/40'}`}
                        />
                      ))}
                    </div>
                  )}

                  {selectedProduct.image_urls && selectedProduct.image_urls.length > 1 && (
                    <div className="absolute inset-y-0 inset-x-2 flex items-center justify-between opacity-0 group-hover/modal:opacity-100 transition-opacity">
                      <button 
                        onClick={() => setActiveImageIndex(prev => (prev > 0 ? prev - 1 : selectedProduct.image_urls!.length - 1))}
                        className="p-2 bg-white/20 backdrop-blur-md hover:bg-white/40 rounded-full text-white transition-all transform -translate-x-4 group-hover/modal:translate-x-0"
                      >
                        <ChevronRight className="w-5 h-5 rotate-180" />
                      </button>
                      <button 
                        onClick={() => setActiveImageIndex(prev => (prev < selectedProduct.image_urls!.length - 1 ? prev + 1 : 0))}
                        className="p-2 bg-white/20 backdrop-blur-md hover:bg-white/40 rounded-full text-white transition-all transform translate-x-4 group-hover/modal:translate-x-0"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="w-full md:w-1/2 p-8 flex flex-col justify-center overflow-y-auto">
                <div className="space-y-6">
                  <div>
                    <p className="text-xs font-bold text-[#FF007F] uppercase tracking-[0.2em] mb-2">{selectedProduct.category}</p>
                    <h3 className="text-2xl font-serif italic text-zinc-900 leading-tight">{selectedProduct.name}</h3>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex flex-col">
                      {selectedProduct.discount_percentage > 0 && (
                        <span className="text-sm text-zinc-400 line-through">R$ {selectedProduct.price_original.toFixed(2)}</span>
                      )}
                      <span className="text-3xl font-bold text-[#FF007F]" style={{ color: settings?.primary_color }}>R$ {selectedProduct.price_discounted.toFixed(2)}</span>
                    </div>
                    {selectedProduct.discount_percentage > 0 && (
                      <span className="bg-[#FF007F]/10 text-[#FF007F] text-xs font-bold px-3 py-1 rounded-full" style={{ color: settings?.primary_color, backgroundColor: `${settings?.primary_color}1a` }}>
                        {selectedProduct.discount_percentage}% OFF
                      </span>
                    )}
                    <button 
                      onClick={() => toggleFavorite(selectedProduct.id)}
                      className="ml-auto p-3 bg-zinc-50 rounded-2xl hover:bg-zinc-100 transition-colors"
                    >
                      <Heart 
                        className={`w-6 h-6 transition-colors ${favorites.includes(selectedProduct.id) ? 'fill-[#FF007F] text-[#FF007F]' : 'text-zinc-400'}`} 
                        style={{ 
                          color: favorites.includes(selectedProduct.id) ? settings?.primary_color : undefined,
                          fill: favorites.includes(selectedProduct.id) ? settings?.primary_color : undefined
                        }} 
                      />
                    </button>
                  </div>

                  <p className="text-sm text-zinc-600 leading-relaxed whitespace-pre-wrap">
                    {selectedProduct.description}
                  </p>

                  {selectedProduct.has_grid && selectedProduct.grid_data && selectedProduct.grid_data.length > 0 && (
                    <>
                      <div className="space-y-4">
                        <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">Cor</p>
                        <div className="flex flex-wrap gap-3">
                          {Array.from(new Set(selectedProduct.grid_data.map(item => item.color))).map(color => (
                            <button 
                              key={color} 
                              onClick={() => setSelectedColor(color)}
                              className={`px-4 py-2 rounded-xl border text-xs font-bold transition-all ${selectedColor === color ? 'border-[#FF007F] text-[#FF007F] bg-[#FF007F]/5' : 'border-zinc-200 text-zinc-600 hover:border-zinc-300'}`}
                              style={{ 
                                borderColor: selectedColor === color ? settings?.primary_color : undefined,
                                color: selectedColor === color ? settings?.primary_color : undefined,
                                backgroundColor: selectedColor === color ? `${settings?.primary_color}0d` : undefined
                              }}
                            >
                              {color}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-4">
                        <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">Tamanho</p>
                        <div className="flex flex-wrap gap-3">
                          {Array.from(new Set(selectedProduct.grid_data
                            .filter(item => !selectedColor || item.color === selectedColor)
                            .map(item => item.size)
                          )).map(size => {
                            const gridItem = selectedProduct.grid_data?.find(item => item.size === size && (!selectedColor || item.color === selectedColor));
                            const isOutOfStock = gridItem ? gridItem.quantity <= 0 : true;

                            return (
                              <button 
                                key={size} 
                                disabled={isOutOfStock}
                                onClick={() => setSelectedSize(size)}
                                className={`w-10 h-10 rounded-xl border flex items-center justify-center text-sm font-bold transition-all ${isOutOfStock ? 'opacity-30 cursor-not-allowed bg-zinc-50' : selectedSize === size ? 'border-[#FF007F] text-[#FF007F] bg-[#FF007F]/5' : 'border-zinc-200 text-zinc-600 hover:border-zinc-300'}`}
                                style={{ 
                                  borderColor: selectedSize === size ? settings?.primary_color : undefined,
                                  color: selectedSize === size ? settings?.primary_color : undefined,
                                  backgroundColor: selectedSize === size ? `${settings?.primary_color}0d` : undefined
                                }}
                              >
                                {size}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}

                  <div className="pt-4 flex gap-4">
                    <div className="flex items-center bg-zinc-100 rounded-2xl px-4 py-3 gap-4">
                      <button className="text-zinc-400 hover:text-zinc-900"><Minus className="w-4 h-4" /></button>
                      <span className="font-bold text-sm">1</span>
                      <button className="text-zinc-400 hover:text-zinc-900"><Plus className="w-4 h-4" /></button>
                    </div>
                    <button 
                      onClick={() => {
                        if (selectedProduct.has_grid && (!selectedSize || !selectedColor)) {
                          addNotification({
                            type: 'warning',
                            title: 'Seleção incompleta',
                            message: 'Por favor, selecione cor e tamanho.'
                          });
                          return;
                        }
                        addToCart(selectedProduct, selectedSize, selectedColor);
                        closeQuickView();
                      }}
                      disabled={selectedProduct.current_stock <= 0}
                      className={`flex-1 font-bold rounded-2xl py-4 shadow-lg transition-colors ${selectedProduct.current_stock <= 0 ? 'bg-zinc-400 cursor-not-allowed' : 'bg-[#FF007F] text-white hover:bg-[#E60072]'}`}
                      style={{ 
                        backgroundColor: selectedProduct.current_stock <= 0 ? undefined : settings?.primary_color, 
                        boxShadow: selectedProduct.current_stock <= 0 ? 'none' : `0 10px 15px -3px ${settings?.primary_color}33` 
                      }}
                    >
                      {selectedProduct.current_stock > 0 ? 'Comprar Agora' : 'Indisponível'}
                    </button>
                  </div>

                  <div className="flex items-center gap-6 pt-4 border-t border-zinc-100">
                    <div className="flex items-center gap-2">
                      <Truck className="w-4 h-4 text-zinc-400" />
                      <span className="text-[10px] font-bold uppercase text-zinc-400">Entrega Rápida</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-zinc-400" />
                      <span className="text-[10px] font-bold uppercase text-zinc-400">Garantia Original</span>
                    </div>
                  </div>

                  {/* Product Reviews Section */}
                  <div className="pt-8 border-t border-zinc-100">
                    <div className="flex items-center justify-between mb-6">
                      <h4 className="text-lg font-serif italic text-zinc-900">Avaliações</h4>
                      <button 
                        onClick={() => setIsReviewing(!isReviewing)}
                        className="text-[10px] font-bold text-[#FF007F] uppercase tracking-widest hover:underline"
                        style={{ color: settings?.primary_color }}
                      >
                        {isReviewing ? 'Cancelar' : 'Escrever Avaliação'}
                      </button>
                    </div>

                    {isReviewing ? (
                      <div className="bg-zinc-50 p-6 rounded-3xl space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
                        <div className="flex items-center gap-2 mb-2">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button 
                              key={star}
                              onClick={() => setNewReview(prev => ({ ...prev, rating: star }))}
                              className="focus:outline-none transition-transform hover:scale-110"
                            >
                              <Star 
                                className={`w-6 h-6 ${star <= newReview.rating ? 'fill-[#FF007F] text-[#FF007F]' : 'text-zinc-300'}`}
                                style={{ color: star <= newReview.rating ? settings?.primary_color : undefined, fill: star <= newReview.rating ? settings?.primary_color : undefined }}
                              />
                            </button>
                          ))}
                        </div>
                        <input 
                          type="text"
                          placeholder="Seu nome"
                          value={newReview.customer_name}
                          maxLength={50}
                          onChange={(e) => setNewReview(prev => ({ ...prev, customer_name: e.target.value }))}
                          className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF007F]/10 focus:border-[#FF007F] transition-all"
                        />
                        
                        <div className="flex items-center gap-4">
                          <button 
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploadingPhoto}
                            className="flex items-center gap-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 px-4 py-3 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                          >
                            {uploadingPhoto ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                            {newReview.customer_photo_url ? 'Trocar Foto' : 'Sua Foto'}
                          </button>
                          <input 
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={(e) => handlePhotoUpload(e)}
                            className="hidden"
                          />
                          {newReview.customer_photo_url && (
                            <div className="relative w-10 h-10 rounded-full overflow-hidden border-2 border-white shadow-sm">
                              <img src={newReview.customer_photo_url} alt="Preview" className="w-full h-full object-cover" />
                              <button 
                                onClick={() => setNewReview(prev => ({ ...prev, customer_photo_url: '' }))}
                                className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                              >
                                <X className="w-3 h-3 text-white" />
                              </button>
                            </div>
                          )}
                          {!newReview.customer_photo_url && (
                            <p className="text-[10px] text-zinc-400 italic">Opcional: Adicione uma foto para sua avaliação</p>
                          )}
                        </div>

                        <textarea 
                          placeholder="O que você achou deste produto?"
                          rows={3}
                          value={newReview.comment}
                          maxLength={500}
                          onChange={(e) => setNewReview(prev => ({ ...prev, comment: e.target.value }))}
                          className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF007F]/10 focus:border-[#FF007F] transition-all resize-none"
                        />
                        <button 
                          onClick={submitReview}
                          className="w-full bg-zinc-900 text-white py-3 rounded-xl text-xs font-bold shadow-lg hover:bg-[#FF007F] transition-all"
                          style={{ backgroundColor: settings?.primary_color }}
                        >
                          Enviar Avaliação
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {reviews.length === 0 ? (
                          <p className="text-xs text-zinc-400 italic text-center py-4">Este produto ainda não possui avaliações. Seja a primeira a avaliar!</p>
                        ) : (
                          reviews.map((review) => (
                            <div key={review.id} className="space-y-2">
                              <div className="flex items-center gap-3">
                                <img 
                                  src={review.customer_photo_url} 
                                  alt={review.customer_name} 
                                  className="w-8 h-8 rounded-full object-cover border border-zinc-100"
                                />
                                <div>
                                  <p className="text-xs font-bold text-zinc-800">{review.customer_name}</p>
                                  <div className="flex gap-0.5">
                                    {[...Array(5)].map((_, i) => (
                                      <Star 
                                        key={i} 
                                        className={`w-2.5 h-2.5 ${i < review.rating ? 'fill-[#FF007F] text-[#FF007F]' : 'text-zinc-200'}`}
                                        style={{ color: i < review.rating ? settings?.primary_color : undefined, fill: i < review.rating ? settings?.primary_color : undefined }}
                                      />
                                    ))}
                                  </div>
                                </div>
                              </div>
                              <p className="text-xs text-zinc-600 leading-relaxed pl-11">"{review.comment}"</p>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Social Proof Section (Real Reviews) */}
      <section className="mt-20 px-6 py-16 bg-zinc-50 rounded-[48px]">
        <div className="text-center mb-12">
          <h4 className="text-2xl font-serif italic mb-2">O que dizem nossas <span className="text-[#FF007F]" style={{ color: settings?.primary_color }}>Beauties</span></h4>
          <p className="text-xs text-zinc-500 font-medium tracking-wide">Veja o que dizem nossas clientes</p>
        </div>

        <div className="space-y-6">
          {allStoreReviews.length === 0 ? (
            <div className="text-center py-10 bg-white rounded-[32px] border border-dashed border-zinc-200">
              <Star className="w-8 h-8 text-zinc-200 mx-auto mb-2" />
              <p className="text-xs text-zinc-400 italic">Ainda não há avaliações aprovadas.</p>
            </div>
          ) : (
            allStoreReviews.slice(0, 5).map((review) => (
              <div key={review.id} className="bg-white p-6 rounded-[32px] shadow-sm border border-zinc-100">
                <div className="flex items-center gap-4 mb-4">
                  <img 
                    src={review.customer_photo_url} 
                    alt={review.customer_name} 
                    className="w-12 h-12 rounded-full object-cover border-2 border-zinc-50" 
                  />
                  <div>
                    <p className="text-sm font-bold text-zinc-900">{review.customer_name}</p>
                    <div className="flex gap-0.5">
                      {[...Array(5)].map((_, i) => (
                        <Star 
                          key={i} 
                          className={`w-3 h-3 ${i < review.rating ? 'fill-[#FF007F] text-[#FF007F]' : 'text-zinc-200'}`}
                          style={{ color: i < review.rating ? settings?.primary_color : undefined, fill: i < review.rating ? settings?.primary_color : undefined }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <p className="text-sm text-zinc-600 italic leading-relaxed">"{review.comment}"</p>
              </div>
            ))
          )}
        </div>

        {/* Instagram Integration Simulation */}
        <div className="mt-16">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-2">
              <Instagram className="w-5 h-5 text-[#FF007F]" style={{ color: settings?.primary_color }} />
              <span className="text-sm font-bold tracking-tight">@{settings?.instagram_handle || 'consignabeauty'}</span>
            </div>
            <button 
              onClick={() => settings?.instagram_handle && window.open(`https://instagram.com/${settings.instagram_handle.replace('@', '')}`, '_blank')}
              className="text-[10px] font-bold text-[#FF007F] uppercase tracking-widest"
              style={{ color: settings?.primary_color }}
            >
              Seguir
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(settings?.instagram_feed && settings.instagram_feed.length > 0) ? (
              settings.instagram_feed.map((url, i) => (
                <div 
                  key={i} 
                  className="aspect-square rounded-2xl overflow-hidden bg-zinc-200 cursor-pointer"
                  onClick={() => settings?.instagram_post_url && window.open(settings.instagram_post_url, '_blank')}
                >
                  <img 
                    src={url} 
                    alt={`Instagram ${i}`} 
                    className="w-full h-full object-cover hover:scale-110 transition-transform duration-500"
                  />
                </div>
              ))
            ) : (
              [1, 2, 3, 4, 5, 6].map((i) => (
                <div 
                  key={i} 
                  className="aspect-square rounded-2xl overflow-hidden bg-zinc-200 cursor-pointer"
                  onClick={() => settings?.instagram_post_url && window.open(settings.instagram_post_url, '_blank')}
                >
                  <img 
                    src={`https://picsum.photos/seed/beauty${i}/300/300`} 
                    alt="Instagram" 
                    className="w-full h-full object-cover hover:scale-110 transition-transform duration-500"
                  />
                </div>
              ))
            )}
          </div>
          {settings?.instagram_post_url && (
            <button 
              onClick={() => window.open(settings.instagram_post_url, '_blank')}
              className="w-full mt-6 py-4 border border-zinc-200 rounded-2xl text-xs font-bold text-zinc-500 hover:bg-zinc-50 transition-all flex items-center justify-center gap-2"
            >
              <MessageCircle className="w-4 h-4" /> Ver Comentários no Instagram
            </button>
          )}
        </div>
      </section>

      {/* Trust Badges */}
      <section className="px-6 py-12 grid grid-cols-2 gap-8">
        <div className="flex flex-col items-center text-center gap-3">
          <div className="w-12 h-12 bg-zinc-50 rounded-full flex items-center justify-center">
            <ShieldCheck className="w-6 h-6 text-[#FF007F]" />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-widest">Compra 100% Segura</p>
        </div>
        <div className="flex flex-col items-center text-center gap-3">
          <div className="w-12 h-12 bg-zinc-50 rounded-full flex items-center justify-center">
            <Truck className="w-6 h-6 text-[#FF007F]" style={{ color: settings?.primary_color }} />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-widest">{settings?.shipping_text || 'Entrega em todo Brasil'}</p>
        </div>
      </section>

      {/* Footer Section */}
      <footer className="px-6 pt-12 pb-32 bg-zinc-900 text-white rounded-t-[48px]">
        <div className="space-y-10">
          <div>
            <h2 className="text-2xl font-serif italic mb-4">
              {settings?.store_name?.split(' ')[0] || 'Consigna'} <span className="text-[#FF007F]" style={{ color: settings?.primary_color }}>{settings?.store_name?.split(' ').slice(1).join(' ') || 'Beauty'}</span>
            </h2>
            <p className="text-zinc-400 text-sm leading-relaxed">
              {settings?.footer_text || 'Sua dose diária de autoestima e performance. Moda fitness e beleza pensada para a mulher real.'}
            </p>
          </div>

          <div className="space-y-4">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#FF007F]" style={{ color: settings?.primary_color }}>Pagamento Seguro</p>
            <div className="flex gap-4">
              <div className="bg-white/10 p-2 rounded-lg"><QrCode className="w-6 h-6" /></div>
              <div className="bg-white/10 p-2 rounded-lg"><CreditCard className="w-6 h-6" /></div>
              <div className="bg-white/10 p-2 rounded-lg flex items-center justify-center font-bold text-[10px]">PIX</div>
            </div>
            {settings?.pix_key && (
              <p className="text-[10px] text-zinc-500 font-mono">Chave PIX: {settings.pix_key}</p>
            )}
          </div>

          <div className="pt-10 border-t border-white/10 text-center">
            <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-widest">
              © 2026 {settings?.store_name || 'Consigna Beauty'}. Todos os direitos reservados.
            </p>
          </div>
        </div>
      </footer>

      {/* Floating Chat Button (Humanized Support) */}
      <motion.button 
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={handleWhatsAppClick}
        className="fixed bottom-8 right-8 w-16 h-16 bg-white/40 backdrop-blur-xl border border-white/40 rounded-full shadow-[0_8px_32px_rgba(255,0,127,0.2)] flex items-center justify-center z-50 group overflow-hidden"
        style={{ boxShadow: `0 8px 32px ${settings?.primary_color}33` }}
      >
        <div className="absolute inset-0 bg-[#FF007F]/10 group-hover:bg-[#FF007F]/20 transition-colors" style={{ backgroundColor: `${settings?.primary_color}1a` }} />
        <MessageCircle className="w-8 h-8 text-[#FF007F]" style={{ color: settings?.primary_color }} />
        <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-white rounded-full" />
      </motion.button>

      {/* Bottom Nav Simulation (Mobile Feel) */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-md border-t border-zinc-100 px-8 py-4 flex justify-between items-center z-40 lg:hidden">
        <button 
          onClick={() => setIsStoreReviewOpen(true)}
          className="text-[#FF007F]"
          style={{ color: settings?.primary_color }}
        >
          <Star className="w-6 h-6" />
        </button>
        <button className="text-zinc-300"><Search className="w-6 h-6" /></button>
        <button onClick={() => setIsCartOpen(true)} className="text-zinc-300 relative">
          <ShoppingBag className="w-6 h-6" />
          {cartItemCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-[#FF007F] text-white text-[8px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center" style={{ backgroundColor: settings?.primary_color }}>
              {cartItemCount}
            </span>
          )}
        </button>
        <button className="text-zinc-300"><Heart className="w-6 h-6" /></button>
      </div>

      {/* Store Review Modal */}
      <AnimatePresence>
        {isStoreReviewOpen && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsStoreReviewOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-[40px] p-8 shadow-2xl space-y-6"
            >
              <div className="text-center">
                <h3 className="text-2xl font-serif italic text-zinc-900">Avaliar Loja</h3>
                <p className="text-sm text-zinc-500 mt-2">Sua opinião é muito importante para nós!</p>
              </div>

              <div className="space-y-4">
                <div className="flex justify-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button 
                      key={star}
                      onClick={() => setNewReview(prev => ({ ...prev, rating: star }))}
                      className="focus:outline-none transition-transform hover:scale-110"
                    >
                      <Star 
                        className={`w-8 h-8 ${star <= newReview.rating ? 'fill-[#FF007F] text-[#FF007F]' : 'text-zinc-200'}`}
                        style={{ color: star <= newReview.rating ? settings?.primary_color : undefined, fill: star <= newReview.rating ? settings?.primary_color : undefined }}
                      />
                    </button>
                  ))}
                </div>

                <input 
                  type="text"
                  placeholder="Seu nome"
                  value={newReview.customer_name}
                  maxLength={100}
                  onChange={(e) => setNewReview(prev => ({ ...prev, customer_name: e.target.value }))}
                  className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF007F]/10 focus:border-[#FF007F] transition-all"
                />

                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => storeFileInputRef.current?.click()}
                    disabled={uploadingPhoto}
                    className="flex-1 flex items-center justify-center gap-2 bg-zinc-50 hover:bg-zinc-100 text-zinc-600 py-3.5 rounded-2xl text-sm font-medium border border-zinc-100 transition-all disabled:opacity-50"
                  >
                    {uploadingPhoto ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {newReview.customer_photo_url ? 'Foto Carregada' : 'Carregar Minha Foto'}
                  </button>
                  <input 
                    ref={storeFileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => handlePhotoUpload(e, true)}
                    className="hidden"
                  />
                  {newReview.customer_photo_url && (
                    <div className="relative w-12 h-12 rounded-2xl overflow-hidden border-2 border-white shadow-md">
                      <img src={newReview.customer_photo_url} alt="Preview" className="w-full h-full object-cover" />
                      <button 
                        onClick={() => setNewReview(prev => ({ ...prev, customer_photo_url: '' }))}
                        className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                      >
                        <X className="w-4 h-4 text-white" />
                      </button>
                    </div>
                  )}
                </div>

                <textarea 
                  placeholder="Conte-nos sua experiência..."
                  rows={4}
                  value={newReview.comment}
                  maxLength={200}
                  onChange={(e) => setNewReview(prev => ({ ...prev, comment: e.target.value }))}
                  className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF007F]/10 focus:border-[#FF007F] transition-all resize-none"
                />

                <button 
                  onClick={submitStoreReview}
                  className="w-full bg-zinc-900 text-white py-4 rounded-2xl text-sm font-bold shadow-xl hover:bg-[#FF007F] transition-all"
                  style={{ backgroundColor: settings?.primary_color }}
                >
                  Enviar Avaliação
                </button>
                
                <button 
                  onClick={() => setIsStoreReviewOpen(false)}
                  className="w-full text-zinc-400 text-xs font-bold uppercase tracking-widest hover:text-zinc-600 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Cart Sidebar */}
      <AnimatePresence>
        {isCartOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCartOpen(false)}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[110]"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-white shadow-2xl z-[120] flex flex-col"
            >
              <div className="p-6 border-b border-zinc-100 flex items-center justify-between bg-white">
                <div className="flex items-center gap-3">
                  <ShoppingBag className="w-5 h-5 text-zinc-900" />
                  <h2 className="text-lg font-bold text-zinc-900">Seu Carrinho</h2>
                  <span className="bg-zinc-100 text-zinc-500 text-xs px-2 py-0.5 rounded-full font-bold">
                    {cartItemCount} itens
                  </span>
                </div>
                <button 
                  onClick={() => setIsCartOpen(false)}
                  className="p-2 hover:bg-zinc-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {cart.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
                    <div className="w-16 h-16 bg-zinc-50 rounded-full flex items-center justify-center">
                      <ShoppingBag className="w-8 h-8 text-zinc-300" />
                    </div>
                    <div>
                      <p className="text-zinc-500 font-medium">Seu carrinho está vazio</p>
                      <p className="text-xs text-zinc-400 mt-1">Que tal adicionar alguns produtos?</p>
                    </div>
                    <button 
                      onClick={() => setIsCartOpen(false)}
                      className="mt-4 px-6 py-2 bg-zinc-900 text-white rounded-full text-xs font-bold hover:bg-zinc-800 transition-colors"
                    >
                      Continuar Comprando
                    </button>
                  </div>
                ) : (
                  cart.map((item) => {
                    const price = item.product.price_discounted * (1 - (settings?.global_discount || 0) / 100);
                    return (
                      <div key={item.product.id} className="flex gap-4 bg-white border border-zinc-100 p-4 rounded-2xl">
                        <div className="w-20 h-24 rounded-xl overflow-hidden bg-zinc-50 flex-shrink-0">
                          <img 
                            src={item.product.image_url} 
                            alt={item.product.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex-1 flex flex-col justify-between">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">{item.product.category}</p>
                              <h4 className="text-sm font-bold text-zinc-800 leading-tight mt-0.5">{item.product.name}</h4>
                              {(item.selectedSize || item.selectedColor) && (
                                <p className="text-[10px] text-zinc-500 mt-1">
                                  {item.selectedColor && `Cor: ${item.selectedColor}`}
                                  {item.selectedColor && item.selectedSize && ' | '}
                                  {item.selectedSize && `Tam: ${item.selectedSize}`}
                                </p>
                              )}
                            </div>
                            <button 
                              onClick={() => removeFromCart(item.product.id, item.selectedSize, item.selectedColor)}
                              className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="flex items-center justify-between mt-4">
                            <div className="flex items-center gap-3 bg-zinc-50 rounded-lg p-1">
                              <button 
                                onClick={() => updateQuantity(item.product.id, -1, item.selectedSize, item.selectedColor)}
                                className="w-6 h-6 flex items-center justify-center text-zinc-500 hover:bg-white hover:shadow-sm rounded-md transition-all"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="text-xs font-bold w-4 text-center">{item.quantity}</span>
                              <button 
                                onClick={() => updateQuantity(item.product.id, 1, item.selectedSize, item.selectedColor)}
                                className="w-6 h-6 flex items-center justify-center text-zinc-500 hover:bg-white hover:shadow-sm rounded-md transition-all"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                            <p className="font-bold text-zinc-900">
                              R$ {(price * item.quantity).toFixed(2)}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {cart.length > 0 && (
                <div className="p-6 bg-zinc-50 border-t border-zinc-100">
                  <div className="space-y-3 mb-6">
                    <div className="flex justify-between text-sm text-zinc-500">
                      <span>Subtotal</span>
                      <span>R$ {cartTotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-zinc-500">
                      <span>Frete</span>
                      <span className="text-emerald-500 font-medium">A calcular</span>
                    </div>
                    <div className="h-px bg-zinc-200 my-2" />
                    <div className="flex justify-between items-end">
                      <span className="font-bold text-zinc-900">Total</span>
                      <div className="text-right">
                        <span className="text-2xl font-bold text-zinc-900">R$ {cartTotal.toFixed(2)}</span>
                        <p className="text-[10px] text-zinc-500">em até 6x sem juros</p>
                      </div>
                    </div>
                  </div>
                  <div className="pt-6 border-t border-zinc-100 flex flex-col gap-3">
                    <button 
                      onClick={handleCheckout}
                      className="w-full bg-zinc-900 text-white py-4 rounded-2xl text-sm font-bold shadow-xl hover:bg-[#FF007F] transition-all flex items-center justify-center gap-2"
                      style={{ backgroundColor: settings?.primary_color }}
                    >
                      <MessageCircle className="w-5 h-5" />
                      Finalizar no WhatsApp
                    </button>
                    {settings?.pix_key && (
                      <button 
                        onClick={handlePixCheckout}
                        className="w-full bg-white border-2 border-zinc-900 text-zinc-900 py-4 rounded-2xl text-sm font-bold hover:bg-zinc-50 transition-all flex items-center justify-center gap-2"
                        style={{ borderColor: settings?.primary_color, color: settings?.primary_color }}
                      >
                        <QrCode className="w-5 h-5" />
                        Pagar com PIX
                      </button>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* PIX Modal */}
      <AnimatePresence>
        {isPixModalOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsPixModalOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-[40px] p-8 shadow-2xl flex flex-col items-center text-center space-y-6"
            >
              <button 
                onClick={() => setIsPixModalOpen(false)}
                className="absolute top-6 right-6 p-2 bg-zinc-100 hover:bg-zinc-200 rounded-full transition-colors"
              >
                <X className="w-4 h-4 text-zinc-500" />
              </button>

              <div className="w-16 h-16 bg-zinc-50 rounded-full flex items-center justify-center">
                <QrCode className="w-8 h-8 text-[#FF007F]" style={{ color: settings?.primary_color }} />
              </div>

              <div>
                <h3 className="text-xl font-serif italic text-zinc-900">Pagamento PIX</h3>
                <p className="text-sm text-zinc-500 mt-2">Escaneie o código ou copie a chave abaixo</p>
              </div>

              <div className="bg-white p-4 rounded-3xl border-2 border-zinc-50 shadow-sm">
                <QRCodeSVG 
                  value={settings?.pix_key || ''} 
                  size={200}
                  level="H"
                  includeMargin={true}
                />
              </div>

              <div className="w-full space-y-4">
                <div className="flex justify-between items-center px-4 py-2 bg-zinc-50 rounded-2xl border border-zinc-100">
                  <div className="text-left overflow-hidden">
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Valor Total</p>
                    <p className="text-lg font-bold text-zinc-900 truncate">R$ {cartTotal.toFixed(2)}</p>
                  </div>
                  {settings?.global_discount && settings.global_discount > 0 && (
                    <span className="bg-emerald-50 text-emerald-600 text-[10px] font-bold px-2 py-1 rounded-full border border-emerald-100">
                      -{settings.global_discount}% OFF
                    </span>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Chave PIX</p>
                  <div className="flex items-center gap-2 p-3 bg-zinc-50 rounded-2xl border border-zinc-100 group">
                    <p className="flex-1 text-xs font-mono text-zinc-600 break-all text-left px-2">
                      {settings?.pix_key}
                    </p>
                    <button 
                      onClick={copyPixKey}
                      className="p-2 bg-white text-zinc-500 hover:text-[#FF007F] rounded-xl shadow-sm transition-all active:scale-95"
                      style={{ color: pixCopied ? '#10b981' : undefined }}
                    >
                      {pixCopied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="w-full space-y-3">
                <button 
                  onClick={() => {
                    setIsPixModalOpen(false);
                    handleCheckout();
                  }}
                  className="w-full bg-zinc-900 text-white py-4 rounded-2xl text-sm font-bold shadow-xl hover:shadow-[#FF007F]/20 transition-all"
                  style={{ backgroundColor: settings?.primary_color }}
                >
                  Confirmar e Avisar no WhatsApp
                </button>
                <p className="text-[10px] text-zinc-400 font-medium italic">
                  Após o pagamento, envie o comprovante para agilizar o envio.
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Disclaimer */}
      <div className="max-w-3xl mx-auto px-6 py-12 border-t border-zinc-50 mt-12">
        <p className="text-[10px] text-zinc-400 text-center uppercase tracking-widest leading-relaxed max-w-2xl mx-auto">
          A plataforma da Consigna Beauty não se responsabiliza pela criação, distribuição ou eventuais ressarcimentos de produtos, brindes ou serviços disponibilizados através dos seus usuários.
        </p>
      </div>
    </div>
  );
}
