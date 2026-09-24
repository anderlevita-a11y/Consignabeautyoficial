import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  Palette, 
  Globe, 
  MessageCircle, 
  Instagram, 
  Save, 
  Loader2, 
  Plus, 
  Pencil, 
  Trash2, 
  Image as ImageIcon,
  CheckCircle2,
  ShoppingBag,
  ShieldCheck,
  Eye,
  EyeOff,
  Search,
  Tag,
  ChevronDown,
  Copy,
  ExternalLink
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Product, ProductReview } from '../types';
import { ConfirmationModal } from './ConfirmationModal';
import { Star, Check, X as CloseIcon, Trash2 as TrashIcon } from 'lucide-react';
import { useNotifications } from './NotificationCenter';
import { sanitizeString } from '../lib/sanitizer';

interface StoreSettings {
  store_name: string;
  store_slug: string;
  primary_color: string;
  welcome_message: string;
  whatsapp_number: string;
  instagram_handle: string;
  logo_url: string;
  banner_url?: string;
  scrolling_text?: string;
  categories?: string[];
  pix_key?: string;
  instagram_post_url?: string;
  footer_text?: string;
  global_discount?: number;
  shipping_text?: string;
  instagram_feed?: string[];
}

export function StoreSettings() {
  const { addNotification } = useNotifications();
  const [settings, setSettings] = useState<StoreSettings>({
    store_name: 'Minha Loja Beauty',
    store_slug: '',
    primary_color: '#FF007F',
    welcome_message: 'Bem-vinda à nossa coleção exclusiva!',
    whatsapp_number: '',
    instagram_handle: '',
    logo_url: '',
    banner_url: '',
    scrolling_text: '✨ Frete grátis em compras acima de R$ 200! ✨ Aproveite nossas promoções exclusivas! ✨',
    categories: ['Maquiagem', 'Skincare', 'Perfumaria', 'Cabelos'],
    pix_key: '',
    instagram_post_url: '',
    footer_text: '© 2024 Consigna Beauty. Todos os direitos reservados.',
    global_discount: 0,
    shipping_text: 'Entrega em todo Brasil',
    instagram_feed: []
  });
  const [newCategory, setNewCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editingCategoryProductId, setEditingCategoryProductId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'general' | 'products' | 'reviews'>('general');
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const productFileInputRef = React.useRef<HTMLInputElement>(null);
  const logoFileInputRef = React.useRef<HTMLInputElement>(null);
  const bannerFileInputRef = React.useRef<HTMLInputElement>(null);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  useEffect(() => {
    fetchSettings();
    fetchProducts();
    fetchReviews();

    // Real-time subscription for products
    const productsSubscription = supabase
      .channel('products-realtime-settings')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'products' 
      }, () => {
        fetchProducts();
      })
      .subscribe();

    return () => {
      productsSubscription.unsubscribe();
    };
  }, []);

  async function fetchProducts() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
      if (!user) return;

      let allProducts: any[] = [];
      let from = 0;
      let to = 999;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .eq('user_id', user.id)
          .order('name')
          .range(from, to);
        
        if (error) throw error;
        
        if (data && data.length > 0) {
          allProducts = [...allProducts, ...data];
          if (data.length < 1000) {
            hasMore = false;
          } else {
            from += 1000;
            to += 1000;
          }
        } else {
          hasMore = false;
        }
      }
      
      setProducts(allProducts);
    } catch (err) {
      console.error('Error fetching products:', err);
    }
  }

  async function fetchReviews() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
      if (!user) return;

      const { data, error } = await supabase
        .from('product_reviews')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReviews(data || []);
    } catch (err) {
      console.error('Error fetching reviews:', err);
    }
  }

  async function updateReviewStatus(reviewId: string, status: 'approved' | 'rejected') {
    try {
      setSaving(true);
      const { error } = await supabase
        .from('product_reviews')
        .update({ status })
        .eq('id', reviewId);

      if (error) throw error;
      setReviews(reviews.map(r => r.id === reviewId ? { ...r, status } : r));
      setMessage({ type: 'success', text: `Avaliação ${status === 'approved' ? 'aprovada' : 'rejeitada'} com sucesso!` });
    } catch (err: any) {
      console.error('Error updating review status:', err);
      setMessage({ type: 'error', text: 'Erro ao atualizar avaliação: ' + err.message });
    } finally {
      setSaving(false);
    }
  }

  async function deleteReview(reviewId: string) {
    try {
      setSaving(true);
      const { error } = await supabase
        .from('product_reviews')
        .delete()
        .eq('id', reviewId);

      if (error) throw error;
      setReviews(reviews.filter(r => r.id !== reviewId));
      setMessage({ type: 'success', text: 'Avaliação excluída com sucesso!' });
    } catch (err: any) {
      console.error('Error deleting review:', err);
      setMessage({ type: 'error', text: 'Erro ao excluir avaliação: ' + err.message });
    } finally {
      setSaving(false);
    }
  }

  async function toggleProductVisibility(productId: string, currentVisibility: boolean) {
    try {
      const { error } = await supabase
        .from('products')
        .update({ is_visible_in_store: !currentVisibility })
        .eq('id', productId);

      if (error) throw error;
      
      setProducts(products.map(p => 
        p.id === productId ? { ...p, is_visible_in_store: !currentVisibility } : p
      ));
    } catch (err) {
      console.error('Error toggling product visibility:', err);
    }
  }

  async function updateProductCategory(productId: string, category: string) {
    try {
      const { error } = await supabase
        .from('products')
        .update({ category })
        .eq('id', productId);

      if (error) throw error;
      
      setProducts(products.map(p => 
        p.id === productId ? { ...p, category } : p
      ));
      setEditingCategoryProductId(null);
    } catch (err) {
      console.error('Error updating product category:', err);
    }
  }

  async function handleProductPhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !editingProductId) return;

    try {
      setSaving(true);
      
      // Ensure session is fresh to avoid "exp" claim errors
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada. Por favor, faça login novamente.');

      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `product-photos/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('products')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('products')
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('products')
        .update({ photo_url: publicUrl })
        .eq('id', editingProductId);

      if (updateError) throw updateError;

      setProducts(products.map(p => 
        p.id === editingProductId ? { ...p, photo_url: publicUrl } : p
      ));
      
      setMessage({ type: 'success', text: 'Foto do produto atualizada!' });
    } catch (err: any) {
      console.error('Error uploading product photo:', err);
      setMessage({ type: 'error', text: 'Erro ao carregar foto: ' + err.message });
    } finally {
      setSaving(false);
      setEditingProductId(null);
    }
  }

  async function handleStoreAssetUpload(e: React.ChangeEvent<HTMLInputElement>, type: 'logo' | 'banner') {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'O arquivo é muito grande. O tamanho máximo permitido é 2MB.' });
      return;
    }

    try {
      setSaving(true);

      // Ensure session is fresh to avoid "exp" claim errors
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada. Por favor, faça login novamente.');

      const fileExt = file.name.split('.').pop();
      const fileName = `${type}-${Math.random()}.${fileExt}`;
      const filePath = `store-settings/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('products') // Using existing bucket
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('products')
        .getPublicUrl(filePath);

      setSettings(prev => ({
        ...prev,
        [type === 'logo' ? 'logo_url' : 'banner_url']: publicUrl
      }));
      
      setMessage({ type: 'success', text: `${type === 'logo' ? 'Logo' : 'Banner'} carregado com sucesso!` });
    } catch (err: any) {
      console.error(`Error uploading ${type}:`, err);
      setMessage({ type: 'error', text: `Erro ao carregar ${type}: ` + err.message });
    } finally {
      setSaving(false);
    }
  }

  async function removeStoreAsset(type: 'logo' | 'banner') {
    try {
      setSaving(true);
      const currentUrl = type === 'logo' ? settings.logo_url : settings.banner_url;
      
      if (currentUrl && currentUrl.includes('supabase.co')) {
        // Attempt to extract path from URL to delete from storage
        const urlParts = currentUrl.split('/public/products/');
        if (urlParts.length > 1) {
          const filePath = urlParts[1];
          // We don't await here to avoid blocking the UI if delete fails
          supabase.storage.from('products').remove([filePath]).catch(console.error);
        }
      }

      setSettings(prev => ({
        ...prev,
        [type === 'logo' ? 'logo_url' : 'banner_url']: ''
      }));
      
      setMessage({ type: 'success', text: `${type === 'logo' ? 'Logo' : 'Banner'} removido com sucesso!` });
    } catch (err: any) {
      console.error(`Error removing ${type}:`, err);
      setMessage({ type: 'error', text: `Erro ao remover ${type}: ` + err.message });
    } finally {
      setSaving(false);
    }
  }

  async function fetchSettings() {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
      if (!user) return;

      const { data, error } = await supabase
        .from('store_settings')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (data) {
        setSettings({
          ...settings,
          ...data,
          store_name: data.store_name || settings.store_name,
          store_slug: data.store_slug || settings.store_slug,
          primary_color: data.primary_color || settings.primary_color,
          welcome_message: data.welcome_message || settings.welcome_message,
          whatsapp_number: data.whatsapp_number || '',
          instagram_handle: data.instagram_handle || '',
          logo_url: data.logo_url || '',
          banner_url: data.banner_url || '',
          scrolling_text: data.scrolling_text || settings.scrolling_text,
          categories: data.categories || settings.categories,
          pix_key: data.pix_key || '',
          instagram_post_url: data.instagram_post_url || '',
          footer_text: data.footer_text || settings.footer_text,
          global_discount: data.global_discount || 0,
          shipping_text: data.shipping_text || 'Entrega em todo Brasil',
          instagram_feed: data.instagram_feed || []
        });
      } else if (error && error.code === 'PGRST116') {
        // No settings found, create default
        const { data: newData } = await supabase
          .from('store_settings')
          .insert([{ 
            user_id: user.id, 
            store_slug: `loja-${user.id.substring(0, 8)}` 
          }])
          .select()
          .single();
        if (newData) setSettings(newData);
      }
    } catch (err) {
      console.error('Error fetching settings:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;

      // Sanitize string fields
      const sanitizedSettings = {
        ...settings,
        store_name: sanitizeString(settings.store_name),
        welcome_message: sanitizeString(settings.welcome_message),
        whatsapp_number: sanitizeString(settings.whatsapp_number),
        instagram_handle: sanitizeString(settings.instagram_handle),
        scrolling_text: sanitizeString(settings.scrolling_text),
        pix_key: sanitizeString(settings.pix_key),
        footer_text: sanitizeString(settings.footer_text),
        shipping_text: sanitizeString(settings.shipping_text),
        instagram_post_url: sanitizeString(settings.instagram_post_url)
      };

      const { error } = await supabase
        .from('store_settings')
        .upsert({
          user_id: user.id,
          ...sanitizedSettings,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
      setMessage({ type: 'success', text: 'Configurações salvas com sucesso!' });
    } catch (err: any) {
      console.error('Error saving settings:', err);
      setMessage({ type: 'error', text: 'Erro ao salvar configurações: ' + err.message });
    } finally {
      setSaving(false);
    }
  }

  const addCategory = () => {
    if (newCategory.trim() && !settings.categories?.includes(newCategory.trim())) {
      setSettings({
        ...settings,
        categories: [...(settings.categories || []), newCategory.trim()]
      });
      setNewCategory('');
    }
  };

  const removeCategory = (cat: string) => {
    setSettings({
      ...settings,
      categories: settings.categories?.filter(c => c !== cat)
    });
  };

  async function handleInstagramPhotoUpload(e: React.ChangeEvent<HTMLInputElement>, index: number) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setSaving(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada.');

      const fileExt = file.name.split('.').pop();
      const fileName = `insta-${index}-${Math.random()}.${fileExt}`;
      const filePath = `store-settings/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('products')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('products')
        .getPublicUrl(filePath);

      const newFeed = [...(settings.instagram_feed || [])];
      newFeed[index] = publicUrl;
      
      setSettings({ ...settings, instagram_feed: newFeed });
      setMessage({ type: 'success', text: 'Foto do Instagram atualizada!' });
    } catch (err: any) {
      console.error('Error uploading instagram photo:', err);
      setMessage({ type: 'error', text: 'Erro ao carregar foto: ' + err.message });
    } finally {
      setSaving(false);
    }
  }

  async function removeInstagramPhoto(index: number) {
    const newFeed = [...(settings.instagram_feed || [])];
    newFeed.splice(index, 1);
    setSettings({ ...settings, instagram_feed: newFeed });
  }

  const copyStoreLink = () => {
    if (!settings.store_slug) {
      setMessage({ type: 'error', text: 'Defina um slug para sua loja antes de compartilhar.' });
      return;
    }
    const url = `${window.location.origin}/?s=${settings.store_slug}`;
    navigator.clipboard.writeText(url);
    setMessage({ type: 'success', text: 'Link da loja copiado para a área de transferência!' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 text-[#FF007F] animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20">
      <div className="flex items-center justify-between bg-white p-6 rounded-3xl border border-zinc-100 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-[#FF007F]/10 rounded-2xl flex items-center justify-center">
            <Settings className="w-6 h-6 text-[#FF007F]" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-zinc-900">Configurações da Loja</h2>
            <p className="text-sm text-zinc-500">Personalize a aparência e informações da sua vitrine.</p>
          </div>
        </div>
        <button 
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-[#FF007F] text-white px-6 py-3 rounded-2xl font-bold hover:bg-[#E60072] transition-all shadow-lg shadow-[#FF007F]/20 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Salvar Alterações
        </button>
      </div>

      {message && (
        <div className={`p-4 rounded-2xl flex items-center gap-3 ${
          message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-700 border border-red-100'
        }`}>
          {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <Settings className="w-5 h-5" />}
          <p className="text-sm font-medium">{message.text}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 bg-zinc-100 p-1.5 rounded-2xl w-fit">
        <button 
          onClick={() => setActiveTab('general')}
          className={`px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'general' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
          }`}
        >
          Geral
        </button>
        <button 
          onClick={() => setActiveTab('products')}
          className={`px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'products' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
          }`}
        >
          Produtos na Vitrine
        </button>
        <button 
          onClick={() => setActiveTab('reviews')}
          className={`px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'reviews' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
          }`}
        >
          Avaliações
          {reviews.filter(r => r.status === 'pending').length > 0 && (
            <span className="ml-2 bg-[#FF007F] text-white text-[10px] px-1.5 py-0.5 rounded-full">
              {reviews.filter(r => r.status === 'pending').length}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'general' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Identidade Visual */}
        <div className="bg-white p-8 rounded-[32px] border border-zinc-100 shadow-sm space-y-6">
          <div className="flex items-center gap-3 mb-2">
            <Palette className="w-5 h-5 text-[#FF007F]" />
            <h3 className="font-bold text-zinc-800 uppercase tracking-wider text-xs">Identidade Visual</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Nome da Loja</label>
              <input 
                type="text"
                value={settings.store_name || ''}
                maxLength={100}
                onChange={(e) => setSettings({ ...settings, store_name: e.target.value })}
                className="w-full bg-zinc-50 border border-zinc-100 rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-[#FF007F]/10 focus:border-[#FF007F] outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Slug da Loja (Link Único)</label>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 text-xs">/s/</span>
                  <input 
                    type="text"
                    value={settings.store_slug || ''}
                    maxLength={50}
                    onChange={(e) => setSettings({ ...settings, store_slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                    placeholder="minha-loja"
                    className="w-full bg-zinc-50 border border-zinc-100 rounded-xl py-3 pl-10 pr-4 text-sm focus:ring-2 focus:ring-[#FF007F]/10 focus:border-[#FF007F] outline-none transition-all"
                  />
                </div>
                <button 
                  onClick={copyStoreLink}
                  className="p-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 rounded-xl transition-all"
                  title="Copiar Link da Loja"
                >
                  <Copy className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => settings.store_slug && window.open(`/?s=${settings.store_slug}`, '_blank')}
                  className="p-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 rounded-xl transition-all"
                  title="Visualizar Loja"
                >
                  <ExternalLink className="w-5 h-5" />
                </button>
              </div>
              <p className="text-[10px] text-zinc-400 mt-1 italic">Este será o link que você enviará para suas clientes.</p>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Cor Principal</label>
              <div className="flex gap-4 items-center">
                <input 
                  type="color"
                  value={settings.primary_color || '#FF007F'}
                  onChange={(e) => setSettings({ ...settings, primary_color: e.target.value })}
                  className="w-12 h-12 rounded-xl border-none cursor-pointer overflow-hidden"
                />
                <input 
                  type="text"
                  value={settings.primary_color || ''}
                  onChange={(e) => setSettings({ ...settings, primary_color: e.target.value })}
                  className="flex-1 bg-zinc-50 border border-zinc-100 rounded-xl py-3 px-4 text-sm font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Logo da Loja</label>
              <p className="text-[10px] text-zinc-400 mb-3 italic">Recomendado: 512x512px (1:1), PNG ou JPG. Máx 2MB.</p>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-zinc-50 border border-zinc-100 flex items-center justify-center overflow-hidden flex-shrink-0 relative group">
                  {settings.logo_url ? (
                    <>
                      <img src={settings.logo_url} alt="Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                      <button 
                        onClick={() => removeStoreAsset('logo')}
                        className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remover Logo"
                      >
                        <Trash2 className="w-5 h-5 text-white" />
                      </button>
                    </>
                  ) : (
                    <ImageIcon className="w-6 h-6 text-zinc-300" />
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <button 
                    onClick={() => logoFileInputRef.current?.click()}
                    className="w-full bg-zinc-50 border border-zinc-100 hover:bg-zinc-100 text-zinc-600 py-2 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
                  >
                    <ImageIcon className="w-4 h-4" />
                    {settings.logo_url ? 'Trocar Logo' : 'Carregar Logo'}
                  </button>
                  <input 
                    type="text"
                    value={settings.logo_url || ''}
                    onChange={(e) => setSettings({ ...settings, logo_url: e.target.value })}
                    placeholder="Ou cole a URL aqui..."
                    className="w-full bg-transparent border-none p-0 text-[10px] text-zinc-400 outline-none"
                  />
                </div>
              </div>
              <input 
                type="file"
                ref={logoFileInputRef}
                className="hidden"
                accept="image/*"
                onChange={(e) => handleStoreAssetUpload(e, 'logo')}
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Banner da Loja</label>
              <p className="text-[10px] text-zinc-400 mb-3 italic">Recomendado: 1200x400px (3:1), PNG ou JPG. Máx 2MB.</p>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-zinc-50 border border-zinc-100 flex items-center justify-center overflow-hidden flex-shrink-0 relative group">
                  {settings.banner_url ? (
                    <>
                      <img src={settings.banner_url} alt="Banner" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      <button 
                        onClick={() => removeStoreAsset('banner')}
                        className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remover Banner"
                      >
                        <Trash2 className="w-5 h-5 text-white" />
                      </button>
                    </>
                  ) : (
                    <ImageIcon className="w-6 h-6 text-zinc-300" />
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <button 
                    onClick={() => bannerFileInputRef.current?.click()}
                    className="w-full bg-zinc-50 border border-zinc-100 hover:bg-zinc-100 text-zinc-600 py-2 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
                  >
                    <ImageIcon className="w-4 h-4" />
                    {settings.banner_url ? 'Trocar Banner' : 'Carregar Banner'}
                  </button>
                  <input 
                    type="text"
                    value={settings.banner_url || ''}
                    onChange={(e) => setSettings({ ...settings, banner_url: e.target.value })}
                    placeholder="Ou cole a URL aqui..."
                    className="w-full bg-transparent border-none p-0 text-[10px] text-zinc-400 outline-none"
                  />
                </div>
              </div>
              <input 
                type="file"
                ref={bannerFileInputRef}
                className="hidden"
                accept="image/*"
                onChange={(e) => handleStoreAssetUpload(e, 'banner')}
              />
            </div>
          </div>
        </div>

        {/* Categorias da Loja */}
        <div className="bg-white p-8 rounded-[32px] border border-zinc-100 shadow-sm space-y-6">
          <div className="flex items-center gap-3 mb-2">
            <Plus className="w-5 h-5 text-[#FF007F]" />
            <h3 className="font-bold text-zinc-800 uppercase tracking-wider text-xs">Categorias da Loja</h3>
          </div>

          <div className="space-y-4">
            <div className="flex gap-2">
              <input 
                type="text"
                value={newCategory}
                maxLength={50}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="Nova categoria..."
                className="flex-1 bg-zinc-50 border border-zinc-100 rounded-xl py-3 px-4 text-sm outline-none"
                onKeyPress={(e) => e.key === 'Enter' && addCategory()}
              />
              <button 
                onClick={addCategory}
                className="bg-[#FF007F] text-white p-3 rounded-xl hover:bg-[#E60072] transition-all"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {settings.categories?.map((cat) => (
                <div key={cat} className="flex items-center gap-2 bg-zinc-50 border border-zinc-100 px-3 py-1.5 rounded-lg text-sm text-zinc-600">
                  {cat}
                  <button onClick={() => removeCategory(cat)} className="text-zinc-400 hover:text-red-500">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Presença Digital */}
        <div className="bg-white p-8 rounded-[32px] border border-zinc-100 shadow-sm space-y-6">
          <div className="flex items-center gap-3 mb-2">
            <Globe className="w-5 h-5 text-[#FF007F]" />
            <h3 className="font-bold text-zinc-800 uppercase tracking-wider text-xs">Presença Digital</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Link da Loja (Slug)</label>
              <div className="flex items-center bg-zinc-50 border border-zinc-100 rounded-xl overflow-hidden">
                <span className="px-4 py-3 text-xs text-zinc-400 bg-zinc-100 border-r border-zinc-100">loja.com/</span>
                <input 
                  type="text"
                  value={settings.store_slug || ''}
                  onChange={(e) => setSettings({ ...settings, store_slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                  className="flex-1 bg-transparent py-3 px-4 text-sm outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">WhatsApp (Chat)</label>
              <div className="relative">
                <MessageCircle className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input 
                  type="text"
                  value={settings.whatsapp_number || ''}
                  maxLength={20}
                  onChange={(e) => setSettings({ ...settings, whatsapp_number: e.target.value })}
                  placeholder="5511999999999"
                  className="w-full bg-zinc-50 border border-zinc-100 rounded-xl py-3 pl-11 pr-4 text-sm outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Instagram</label>
              <div className="relative">
                <Instagram className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input 
                  type="text"
                  value={settings.instagram_handle || ''}
                  maxLength={50}
                  onChange={(e) => setSettings({ ...settings, instagram_handle: e.target.value })}
                  placeholder="@sualoja"
                  className="w-full bg-zinc-50 border border-zinc-100 rounded-xl py-3 pl-11 pr-4 text-sm outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Link Post Instagram (Comentários)</label>
              <div className="relative">
                <Instagram className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input 
                  type="text"
                  value={settings.instagram_post_url || ''}
                  maxLength={255}
                  onChange={(e) => setSettings({ ...settings, instagram_post_url: e.target.value })}
                  placeholder="https://instagram.com/p/..."
                  className="w-full bg-zinc-50 border border-zinc-100 rounded-xl py-3 pl-11 pr-4 text-sm outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Texto de Entrega</label>
              <div className="relative">
                <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input 
                  type="text"
                  value={settings.shipping_text || ''}
                  maxLength={100}
                  onChange={(e) => setSettings({ ...settings, shipping_text: e.target.value })}
                  placeholder="Entrega em todo Brasil"
                  className="w-full bg-zinc-50 border border-zinc-100 rounded-xl py-3 pl-11 pr-4 text-sm outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-zinc-100 rounded-[32px] p-8 space-y-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-zinc-50 rounded-2xl flex items-center justify-center">
              <Instagram className="w-6 h-6 text-zinc-900" />
            </div>
            <div>
              <h3 className="text-lg font-serif italic text-zinc-900">Feed do Instagram</h3>
              <p className="text-xs text-zinc-400">Configure as 6 fotos que aparecerão no preview da sua loja</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <div key={index} className="relative aspect-square bg-zinc-50 rounded-2xl border border-dashed border-zinc-200 overflow-hidden group">
                {settings.instagram_feed?.[index] ? (
                  <>
                    <img src={settings.instagram_feed[index]} alt={`Insta ${index}`} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <button 
                        onClick={() => removeInstagramPhoto(index)}
                        className="p-2 bg-white text-red-500 rounded-full hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </>
                ) : (
                  <label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer hover:bg-zinc-100 transition-colors">
                    <Plus className="w-6 h-6 text-zinc-300" />
                    <span className="text-[8px] font-bold text-zinc-400 uppercase tracking-widest mt-2">Adicionar</span>
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      onChange={(e) => handleInstagramPhotoUpload(e, index)}
                    />
                  </label>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Pagamento e Descontos */}
        <div className="bg-white p-8 rounded-[32px] border border-zinc-100 shadow-sm space-y-6">
          <div className="flex items-center gap-3 mb-2">
            <ShieldCheck className="w-5 h-5 text-[#FF007F]" />
            <h3 className="font-bold text-zinc-800 uppercase tracking-wider text-xs">Pagamento e Descontos</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Chave PIX da Loja</label>
              <input 
                type="text"
                value={settings.pix_key || ''}
                maxLength={255}
                onChange={(e) => setSettings({ ...settings, pix_key: e.target.value })}
                placeholder="E-mail, CPF ou Chave Aleatória"
                className="w-full bg-zinc-50 border border-zinc-100 rounded-xl py-3 px-4 text-sm outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Desconto Global (%)</label>
              <input 
                type="number"
                value={settings.global_discount || 0}
                onChange={(e) => setSettings({ ...settings, global_discount: Number(e.target.value) })}
                className="w-full bg-zinc-50 border border-zinc-100 rounded-xl py-3 px-4 text-sm outline-none"
              />
            </div>
          </div>
        </div>

        {/* Mensagens e Conteúdo */}
        <div className="bg-white p-8 rounded-[32px] border border-zinc-100 shadow-sm space-y-6 md:col-span-2">
          <div className="flex items-center gap-3 mb-2">
            <MessageCircle className="w-5 h-5 text-[#FF007F]" />
            <h3 className="font-bold text-zinc-800 uppercase tracking-wider text-xs">Mensagens e Conteúdo</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Texto da Barra de Rolagem (Topo)</label>
              <input 
                type="text"
                value={settings.scrolling_text || ''}
                maxLength={200}
                onChange={(e) => setSettings({ ...settings, scrolling_text: e.target.value })}
                className="w-full bg-zinc-50 border border-zinc-100 rounded-xl py-3 px-4 text-sm outline-none focus:border-[#FF007F] transition-all"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Mensagem de Boas-vindas</label>
              <textarea 
                value={settings.welcome_message || ''}
                maxLength={300}
                onChange={(e) => setSettings({ ...settings, welcome_message: e.target.value })}
                rows={3}
                className="w-full bg-zinc-50 border border-zinc-100 rounded-xl py-3 px-4 text-sm outline-none focus:border-[#FF007F] transition-all resize-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Texto do Rodapé</label>
              <textarea 
                value={settings.footer_text || ''}
                maxLength={300}
                onChange={(e) => setSettings({ ...settings, footer_text: e.target.value })}
                rows={3}
                className="w-full bg-zinc-50 border border-zinc-100 rounded-xl py-3 px-4 text-sm outline-none focus:border-[#FF007F] transition-all resize-none"
              />
            </div>
          </div>
        </div>
      </div>
    )}

    {activeTab === 'products' && (
        <div className="bg-white p-8 rounded-[32px] border border-zinc-100 shadow-sm space-y-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <ShoppingBag className="w-5 h-5 text-[#FF007F]" />
              <h3 className="font-bold text-zinc-800 uppercase tracking-wider text-xs">Produtos na Vitrine</h3>
              <span className="bg-zinc-100 text-zinc-500 text-[10px] px-2 py-0.5 rounded-full font-bold">
                {products.length} produtos carregados
              </span>
            </div>
            <div className="flex items-center gap-3">
              {(products.some(p => p.is_visible_in_store)) && (
                <button 
                  onClick={() => {
                    setConfirmModal({
                      isOpen: true,
                      title: 'Limpar Vitrine',
                      message: 'Deseja remover TODOS os produtos da vitrine? Esta ação não pode ser desfeita, mas você poderá adicioná-los novamente um a um.',
                      onConfirm: async () => {
                        setConfirmModal(prev => ({ ...prev, isOpen: false }));
                        try {
                          setSaving(true);
                          const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
                          if (!user) return;

                          const { error } = await supabase
                            .from('products')
                            .update({ is_visible_in_store: false })
                            .eq('user_id', user.id);

                          if (error) throw error;
                          
                          setProducts(products.map(p => ({ ...p, is_visible_in_store: false })));
                          addNotification({ type: 'success', title: 'Sucesso', message: 'Vitrine limpa com sucesso!' });
                        } catch (err: any) {
                          console.error('Error clearing showcase:', err);
                          addNotification({ type: 'error', title: 'Erro', message: 'Erro ao limpar vitrine: ' + err.message });
                        } finally {
                          setSaving(false);
                        }
                      }
                    });
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-[10px] font-bold hover:bg-red-100 transition-all border border-red-100"
                >
                  <EyeOff className="w-3 h-3" />
                  Limpar Vitrine
                </button>
              )}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-400" />
                <input 
                  type="text"
                  placeholder="Buscar no catálogo completo..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="bg-zinc-50 border border-zinc-100 rounded-lg py-1.5 pl-8 pr-3 text-xs outline-none focus:border-[#FF007F] transition-all w-48"
                />
              </div>
            </div>
          </div>

          <div className="bg-zinc-50 rounded-xl p-3 border border-zinc-100">
            <p className="text-[10px] text-zinc-500 leading-tight">
              <b>Dica:</b> Por padrão, mostramos apenas produtos ativos na vitrine. Use a busca acima para encontrar e ativar qualquer produto do seu catálogo completo.
            </p>
          </div>

          <input 
            type="file"
            ref={productFileInputRef}
            className="hidden"
            accept="image/*"
            onChange={handleProductPhotoUpload}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[400px] overflow-y-auto pr-2 no-scrollbar">
            {(() => {
              const filtered = products.filter(p => {
                // Se estiver buscando, mostra os resultados da busca
                if (productSearch.trim() !== '') {
                  const searchLower = productSearch.toLowerCase();
                  return (
                    p.name.toLowerCase().includes(searchLower) ||
                    (p.label_name && p.label_name.toLowerCase().includes(searchLower)) ||
                    String(p.ean || '').includes(searchLower)
                  );
                }
                // Se não estiver buscando, mostra apenas os que já estão ativos na vitrine
                return p.is_visible_in_store !== false;
              });

              if (filtered.length === 0) {
                return (
                  <div className="col-span-full py-12 text-center space-y-3">
                    <div className="w-12 h-12 bg-zinc-50 rounded-2xl flex items-center justify-center mx-auto text-zinc-300">
                      <Search className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-zinc-500">
                        {productSearch.trim() !== '' 
                          ? 'Nenhum produto encontrado para esta busca.' 
                          : 'Nenhum produto ativo na vitrine.'}
                      </p>
                      <p className="text-[10px] text-zinc-400">
                        {productSearch.trim() !== '' 
                          ? 'Tente outro termo ou verifique o nome.' 
                          : 'Use a busca acima para encontrar e incluir produtos.'}
                      </p>
                    </div>
                  </div>
                );
              }

              return filtered.map((product) => (
                <div 
                  key={product.id}
                  className={`p-4 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                    product.is_visible_in_store 
                      ? 'bg-emerald-50/30 border-emerald-100' 
                      : 'bg-zinc-50 border-zinc-100 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-lg bg-white border border-zinc-100 flex-shrink-0 overflow-hidden relative group/photo">
                      {product.photo_url ? (
                        <img src={product.photo_url} alt={product.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-300">
                          <ShoppingBag className="w-5 h-5" />
                        </div>
                      )}
                      <button 
                        onClick={() => {
                          setEditingProductId(product.id);
                          productFileInputRef.current?.click();
                        }}
                        className="absolute inset-0 bg-black/40 opacity-0 group-hover/photo:opacity-100 transition-opacity flex items-center justify-center text-white"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-bold text-zinc-800 truncate">{product.name}</p>
                        <div className="relative">
                          <button 
                            onClick={() => setEditingCategoryProductId(editingCategoryProductId === product.id ? null : product.id)}
                            className="text-[#FF007F] hover:scale-110 transition-transform flex-shrink-0 flex items-center gap-1"
                            title="Selecionar categoria"
                          >
                            <Tag className="w-3 h-3" />
                            <span className="text-[8px] font-bold uppercase opacity-60">
                              {product.category || 'Sem Categoria'}
                            </span>
                          </button>
                          
                          {editingCategoryProductId === product.id && (
                            <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-zinc-100 rounded-xl shadow-xl p-2 min-w-[140px] animate-in fade-in slide-in-from-top-1">
                              <div className="space-y-1">
                                {settings.categories?.map(cat => (
                                  <button
                                    key={cat}
                                    onClick={() => updateProductCategory(product.id, cat)}
                                    className={`w-full text-left px-3 py-1.5 rounded-lg text-[10px] font-medium transition-colors ${
                                      product.category === cat 
                                        ? 'bg-[#FF007F] text-white' 
                                        : 'hover:bg-zinc-50 text-zinc-600'
                                    }`}
                                  >
                                    {cat}
                                  </button>
                                ))}
                                <button
                                  onClick={() => updateProductCategory(product.id, '')}
                                  className="w-full text-left px-3 py-1.5 rounded-lg text-[10px] font-medium text-red-500 hover:bg-red-50 transition-colors"
                                >
                                  Remover Categoria
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      <p className="text-[10px] text-zinc-400">R$ {product.sale_price.toFixed(2)}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => toggleProductVisibility(product.id, !!product.is_visible_in_store)}
                    className={`p-2 rounded-xl transition-all ${
                      product.is_visible_in_store 
                        ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' 
                        : 'bg-zinc-200 text-zinc-400 hover:bg-zinc-300'
                    }`}
                  >
                    {product.is_visible_in_store ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                </div>
              ));
            })()}
          </div>
        </div>
      )}

      {activeTab === 'reviews' && (
        <div className="bg-white p-8 rounded-[32px] border border-zinc-100 shadow-sm space-y-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <Star className="w-5 h-5 text-[#FF007F]" />
              <h3 className="font-bold text-zinc-800 uppercase tracking-wider text-xs">Gerenciar Avaliações</h3>
              <span className="bg-zinc-100 text-zinc-500 text-[10px] px-2 py-0.5 rounded-full font-bold">
                {reviews.length} avaliações
              </span>
            </div>
          </div>

          <div className="bg-zinc-50 rounded-xl p-3 border border-zinc-100">
            <p className="text-[10px] text-zinc-500 leading-tight">
              <b>Dica:</b> Avaliações enviadas por clientes aparecem aqui como "Pendentes". Você deve aprová-las para que fiquem visíveis para outros clientes na loja.
            </p>
          </div>

          <div className="space-y-4">
            {reviews.length === 0 ? (
              <div className="text-center py-12 bg-zinc-50 rounded-3xl border border-dashed border-zinc-200">
                <Star className="w-12 h-12 text-zinc-200 mx-auto mb-4" />
                <p className="text-sm text-zinc-500 italic">Nenhuma avaliação recebida ainda.</p>
              </div>
            ) : (
              reviews.map((review) => {
                const product = products.find(p => p.id.toString() === review.product_id);
                return (
                  <div 
                    key={review.id}
                    className={`p-6 rounded-3xl border transition-all ${
                      review.status === 'approved' 
                        ? 'bg-white border-emerald-100 shadow-sm' 
                        : review.status === 'rejected'
                        ? 'bg-zinc-50 border-red-100 opacity-60'
                        : 'bg-white border-amber-100 shadow-md ring-2 ring-amber-500/10'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row gap-6">
                      <div className="flex items-center gap-4 flex-shrink-0">
                        <img 
                          src={review.customer_photo_url} 
                          alt={review.customer_name} 
                          className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-sm"
                        />
                        <div>
                          <h4 className="text-sm font-bold text-zinc-800">{review.customer_name}</h4>
                          <div className="flex gap-0.5">
                            {[...Array(5)].map((_, i) => (
                              <Star 
                                key={i} 
                                className={`w-3 h-3 ${i < review.rating ? 'fill-[#FF007F] text-[#FF007F]' : 'text-zinc-200'}`}
                              />
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${
                            review.status === 'approved' ? 'bg-emerald-100 text-emerald-600' :
                            review.status === 'rejected' ? 'bg-red-100 text-red-600' :
                            'bg-amber-100 text-amber-600'
                          }`}>
                            {review.status === 'approved' ? 'Aprovada' : 
                             review.status === 'rejected' ? 'Rejeitada' : 'Pendente'}
                          </span>
                          <span className="text-[10px] text-zinc-400">
                            em {new Date(review.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        {product && (
                          <p className="text-[10px] text-zinc-500">
                            Produto: <span className="font-bold text-zinc-700">{product.name}</span>
                          </p>
                        )}
                        <p className="text-sm text-zinc-600 italic leading-relaxed">
                          "{review.comment}"
                        </p>
                      </div>

                      <div className="flex sm:flex-col gap-2 justify-center">
                        {review.status !== 'approved' && (
                          <button 
                            onClick={() => updateReviewStatus(review.id, 'approved')}
                            className="p-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-colors"
                            title="Aprovar"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        )}
                        {review.status !== 'rejected' && (
                          <button 
                            onClick={() => updateReviewStatus(review.id, 'rejected')}
                            className="p-2 bg-amber-50 text-amber-600 rounded-xl hover:bg-amber-100 transition-colors"
                            title="Rejeitar"
                          >
                            <CloseIcon className="w-4 h-4" />
                          </button>
                        )}
                        <button 
                          onClick={() => {
                            setConfirmModal({
                              isOpen: true,
                              title: 'Excluir Avaliação',
                              message: 'Deseja excluir permanentemente esta avaliação? Esta ação não pode ser desfeita.',
                              onConfirm: () => {
                                setConfirmModal(prev => ({ ...prev, isOpen: false }));
                                deleteReview(review.id);
                              }
                            });
                          }}
                          className="p-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-colors"
                          title="Excluir"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        variant="danger"
        confirmText="Limpar Tudo"
        cancelText="Manter Produtos"
      />
    </div>
  );
}
