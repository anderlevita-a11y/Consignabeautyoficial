/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Products } from './components/Products';
import { Bags } from './components/Bags';
import { Customers } from './components/Customers';
import { Campaigns } from './components/Campaigns';
import { Routes } from './components/Routes';
import { Reports } from './components/Reports';
import { SweepstakesManager } from './components/Sweepstakes';
import { Simulation } from './components/Simulation';
import { ProfileScreen } from './components/Profile';
import { Login } from './components/Login';
import { AdminPanel } from './components/AdminPanel';
import { VirtualStore } from './components/VirtualStore';
import { StoreSettings } from './components/StoreSettings';
import { SmartNotepad } from './components/SmartNotepad';
import { FinancialControl } from './components/FinancialControl';
import { BillingManagement } from './components/BillingManagement';
import { Backup } from './components/Backup';
import { LegalConfirmationModal } from './components/LegalConfirmationModal';
import { ResetPasswordModal } from './components/ResetPasswordModal';
import { PublicRaffle } from './components/PublicRaffle';
import { PublicMysteryBag } from './components/PublicMysteryBag';
import { PublicGoals } from './components/PublicGoals';
import { PublicSweepstakes } from './components/PublicSweepstakes';
import { Settings, Loader2, Megaphone, BarChart3, Ticket, Calculator, ShieldAlert, Menu, StickyNote, DollarSign } from 'lucide-react';
import { cn } from './lib/utils';
import { supabase, isConfigured } from './lib/supabase';
import { Session } from '@supabase/supabase-js';
import { StoreSettings as StoreSettingsType, ProductReview, Profile, AppLegalSettings } from './types';
import { CookieBanner } from './components/CookieBanner';
import { loadConditionalScript } from './lib/cookieConsent';

import { NotificationProvider, NotificationCenter, SystemAlert, useNotifications } from './components/NotificationCenter';

export default function App() {
  const [storeSlug, setStoreSlug] = useState<string | null>(null);
  const [raffleId, setRaffleId] = useState<string | null>(null);
  const [mysteryBagId, setMysteryBagId] = useState<string | null>(null);
  const [goalId, setGoalId] = useState<string | null>(null);
  const [sweepstakesId, setSweepstakesId] = useState<string | null>(null);
  const [showAllGoals, setShowAllGoals] = useState(false);

  useEffect(() => {
    // Load Stripe script only after consent
    loadConditionalScript('stripe-buy-button', 'https://js.stripe.com/v3/buy-button.js');

    const params = new URLSearchParams(window.location.search);
    const s = params.get('s') || params.get('store');
    if (s) {
      setStoreSlug(s);
    }

    const path = window.location.pathname;
    
    // Check query parameters first (better for static hosting)
    const rifaParam = params.get('rifa');
    const sacolaParam = params.get('sacola');
    const metasParam = params.get('metas');
    const sorteioParam = params.get('sorteio');
    const metasEBrindesParam = params.get('metas-e-brindes');

    if (rifaParam) {
      setRaffleId(rifaParam);
    } else if (path.startsWith('/rifa/')) {
      const id = path.split('/rifa/')[1];
      if (id) {
        setRaffleId(id);
      }
    } else if (sacolaParam) {
      setMysteryBagId(sacolaParam);
    } else if (path.startsWith('/sacola/')) {
      const id = path.split('/sacola/')[1];
      if (id) {
        setMysteryBagId(id);
      }
    } else if (metasParam) {
      setGoalId(metasParam);
    } else if (path.startsWith('/metas/')) {
      const id = path.split('/metas/')[1];
      if (id) {
        setGoalId(id);
      }
    } else if (sorteioParam) {
      setSweepstakesId(sorteioParam);
    } else if (path.startsWith('/sorteio/')) {
      const id = path.split('/sorteio/')[1];
      if (id) {
        setSweepstakesId(id);
      }
    } else if (metasEBrindesParam === 'true' || path === '/metas-e-brindes') {
      setShowAllGoals(true);
    }
  }, []);

  if (raffleId) {
    return (
      <NotificationProvider>
        <PublicRaffle />
        <CookieBanner />
        <NotificationCenter />
      </NotificationProvider>
    );
  }

  if (mysteryBagId) {
    return (
      <NotificationProvider>
        <PublicMysteryBag />
        <CookieBanner />
        <NotificationCenter />
      </NotificationProvider>
    );
  }

  if (goalId || showAllGoals) {
    return (
      <NotificationProvider>
        <PublicGoals />
        <CookieBanner />
        <NotificationCenter />
      </NotificationProvider>
    );
  }

  if (sweepstakesId) {
    return (
      <NotificationProvider>
        <PublicSweepstakes />
        <CookieBanner />
        <NotificationCenter />
      </NotificationProvider>
    );
  }

  if (storeSlug) {
    return (
      <NotificationProvider>
        <div className="min-h-screen bg-white">
          <VirtualStore slug={storeSlug} />
        </div>
        <CookieBanner />
        <NotificationCenter />
      </NotificationProvider>
    );
  }

  return (
    <NotificationProvider>
      <AppContent />
      <CookieBanner />
    </NotificationProvider>
  );
}

import { CatalogSyncPrompt } from './components/CatalogSyncPrompt';

function AppContent() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('profile');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [legalSettings, setLegalSettings] = useState<AppLegalSettings | null>(null);
  const [showLegalModal, setShowLegalModal] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [rejectedReceipt, setRejectedReceipt] = useState<any>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme');
    return (saved as 'light' | 'dark') || 'light';
  });

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    if (!session || !isConfigured) return;

    const checkRejectedReceipt = async () => {
      try {
        const { data, error } = await supabase
          .from('payment_receipts')
          .select('*')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        
        if (data && data.status === 'rejected') {
          setRejectedReceipt(data);
        } else {
          setRejectedReceipt(null);
        }
      } catch (err) {
        // Silently handle fetch errors
      }
    };

    checkRejectedReceipt();

    // Subscribe to receipt changes
    const channel = supabase
      .channel('receipt-status-changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'payment_receipts',
        filter: `user_id=eq.${session.user.id}`
      }, () => checkRejectedReceipt())
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [session]);

  useEffect(() => {
    // Check URL hash for recovery token on initial load
    const hash = window.location.hash;
    if (hash && hash.includes('type=recovery')) {
      setShowResetPassword(true);
    }

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error('Session error:', error.message);
        if (
          error.message.includes('Refresh Token Not Found') || 
          error.message.includes('Invalid Refresh Token') ||
          error.message.includes('refresh_token_not_found')
        ) {
          // Force clear session if token is invalid
          supabase.auth.signOut().then(() => {
            localStorage.removeItem('supabase.auth.token'); // Fallback for older versions
            setSession(null);
            setLoading(false);
          });
          return;
        }
      }
      setSession(session);
      if (!session) setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setShowResetPassword(true);
      }
      
      if (event === 'SIGNED_OUT') {
        setSession(null);
        setProfile(null);
        setLoading(false);
      } else {
        setSession(session);
        if (!session) {
          setProfile(null);
          setLoading(false);
        }
      }
    });

    // Handle global auth refresh errors
    const handleError = (event: PromiseRejectionEvent) => {
      const msg = event.reason?.message;
      if (typeof msg === 'string' && (
          msg.includes('Refresh Token Not Found') || 
          msg.includes('Invalid Refresh Token') ||
          msg.includes('refresh_token_not_found')
      )) {
        event.preventDefault(); // Prevent the error from showing in the console
        console.warn('Auth refresh failed, signing out...');
        supabase.auth.signOut().catch(() => {});
        localStorage.removeItem('supabase.auth.token');
        setSession(null);
        setLoading(false);
      }
    };

    window.addEventListener('unhandledrejection', handleError);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('unhandledrejection', handleError);
    };
  }, []);

  const { addNotification } = useNotifications();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab) {
      setActiveTab(tab);
      // Clean up the URL
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success') {
      addNotification({
        type: 'success',
        title: 'Pagamento Confirmado!',
        message: 'Sua assinatura Starter foi processada com sucesso. Em instantes seu acesso será liberado.'
      });
      // Clear the param
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (!session) return;

    // Listen for new route assignments
    const routesSubscription = supabase
      .channel('public:routes')
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'routes',
        filter: `user_id=eq.${session.user.id}`
      }, (payload) => {
        addNotification({
          type: 'route',
          title: 'Nova Rota Atribuída',
          message: `Você tem uma nova rota: ${payload.new.name}`
        });
      })
      .subscribe();

    // Listen for bag status changes
    const bagsSubscription = supabase
      .channel('public:bags')
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'bags',
        filter: `user_id=eq.${session.user.id}`
      }, (payload) => {
        if (payload.old.status !== payload.new.status) {
          addNotification({
            type: 'sale',
            title: 'Status de Venda Alterado',
            message: `A sacola #${payload.new.bag_number.replace(/\D/g, '')} agora está ${payload.new.status === 'closed' ? 'Acertada' : 'Aberta'}.`
          });
        }
      })
      .subscribe();

    // Listen for catalog updates
    const catalogSubscription = supabase
      .channel('public:catalog_updates')
      .on('broadcast', { event: 'catalog_updated' }, (payload) => {
        addNotification({
          type: 'price_change',
          title: 'Catálogo Atualizado',
          message: payload.payload?.message || 'O administrador adicionou novos produtos ou atualizou preços. Clique para conferir.',
          onClick: () => setActiveTab('products')
        });
      })
      .subscribe();

    // Listen for new product reviews
    const reviewsSubscription = supabase
      .channel('public:product_reviews')
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'product_reviews',
        filter: `user_id=eq.${session.user.id}`
      }, (payload) => {
        addNotification({
          type: 'review',
          title: 'Nova Avaliação Recebida',
          message: `Você recebeu uma nova avaliação de ${payload.new.customer_name}.`,
          onClick: () => setActiveTab('store-settings')
        });
      })
      .subscribe();

    return () => {
      routesSubscription.unsubscribe();
      bagsSubscription.unsubscribe();
      catalogSubscription.unsubscribe();
      reviewsSubscription.unsubscribe();
    };
  }, [session]);

  useEffect(() => {
    if (!session || !isConfigured) return;

    const checkFinancialReminders = async () => {
      try {
        const todayStr = new Date().toISOString().split('T')[0];
        const tomorrowDate = new Date();
        tomorrowDate.setDate(tomorrowDate.getDate() + 1);
        const tomorrowStr = tomorrowDate.toISOString().split('T')[0];

        const { data, error } = await supabase
          .from('financial_transactions')
          .select('*')
          .eq('user_id', session.user.id)
          .eq('type', 'expense')
          .eq('status', 'pending')
          .eq('reminder_enabled', true)
          .lte('due_date', tomorrowStr);

        if (error) {
          if (error.message?.includes('Failed to fetch') || error.code === 'PGRST116' || error.code === '42P01') return;
          console.warn('Financial reminders notice:', error.message);
          return;
        }

        data?.forEach(t => {
          const isToday = t.due_date === todayStr;
          const isTomorrow = t.due_date === tomorrowStr;
          const isOverdue = t.due_date < todayStr;

          let title = '';
          let type: any = 'info';
          let message = '';

          if (isOverdue) {
            title = 'Conta Atrasada';
            type = 'error';
            message = `A conta "${t.description}" está atrasada! Venceu em ${new Date(t.due_date).toLocaleDateString('pt-BR')}. Valor: R$ ${t.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
          } else if (isToday) {
            title = 'Vencimento Hoje';
            type = 'warning';
            message = `A conta "${t.description}" vence hoje! Valor: R$ ${t.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
          } else if (isTomorrow) {
            title = 'Vencimento Amanhã';
            type = 'info';
            message = `A conta "${t.description}" vence amanhã. Valor: R$ ${t.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
          }

          if (title) {
            addNotification({
              type,
              title,
              message,
              onClick: () => setActiveTab('financial')
            });
          }
        });
      } catch (err: any) {
        if (!err?.message?.includes?.('Failed to fetch')) {
          console.warn('Financial reminders notice:', err);
        }
      }
    };

    checkFinancialReminders();
  }, [session]);

  useEffect(() => {
    if (!profile) return;

    const checkPlanExpiration = () => {
      if (!profile.vencimento) return;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const expiry = new Date(profile.vencimento);
      expiry.setHours(0, 0, 0, 0);

      const diffTime = expiry.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays === 7) {
        addNotification({
          type: 'warning',
          title: 'Vencimento Próximo',
          message: 'Seu plano vence em 7 dias. Realize o pagamento para evitar interrupções.',
          onClick: () => setActiveTab('profile')
        });
      } else if (diffDays === 0) {
        addNotification({
          type: 'error',
          title: 'Vencimento Hoje',
          message: 'Seu plano vence hoje! Realize o pagamento para manter seu acesso.',
          onClick: () => setActiveTab('profile')
        });
      } else if (diffDays < 0) {
         addNotification({
          type: 'error',
          title: 'Plano Vencido',
          message: 'Seu plano está vencido. Realize o pagamento para reativar seu acesso.',
          onClick: () => setActiveTab('profile')
        });
      }
    };

    checkPlanExpiration();
  }, [profile]);

  useEffect(() => {
    if (!session || !isConfigured) return;
    fetchLegalSettings();
  }, [session]);

  async function fetchLegalSettings() {
    try {
      const { data, error } = await supabase
        .from('app_legal_settings')
        .select('*')
        .single();
      
      if (error) {
        if (error.code === 'PGRST116' || error.code === '42P01' || error.message?.includes('Failed to fetch')) return;
        console.warn('Legal settings notice:', error.message);
        return;
      }
      if (data) setLegalSettings(data);
    } catch (err: any) {
      if (!err?.message?.includes?.('Failed to fetch')) {
        console.warn('Legal settings notice:', err);
      }
    }
  }

  useEffect(() => {
    if (profile && legalSettings) {
      const userAcceptedVersion = profile.accepted_terms_version || 0;
      const currentVersion = legalSettings.version || 0;
      
      if (userAcceptedVersion < currentVersion) {
        setShowLegalModal(true);
      } else {
        setShowLegalModal(false);
      }
    }
  }, [profile, legalSettings]);

  const handleConfirmLegal = async () => {
    if (!session || !legalSettings) return;
    
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ accepted_terms_version: legalSettings.version })
        .eq('id', session.user.id);
      
      if (error) throw error;
      
      // Update local profile state
      setProfile(prev => prev ? { ...prev, accepted_terms_version: legalSettings.version } : null);
      setShowLegalModal(false);
    } catch (err) {
      console.error('Error confirming legal terms:', err);
      throw err;
    }
  };

  useEffect(() => {
    if (!session) return;

    // Listen for profile updates (e.g. admin assigning a key)
    const profileSubscription = supabase
      .channel('profile-updates')
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'profiles',
        filter: `id=eq.${session.user.id}`
      }, (payload) => {
        setProfile(payload.new as Profile);
        
        // If access was just granted, notify and switch tab
        if (!payload.old.access_key_code && payload.new.access_key_code) {
          addNotification({
            type: 'success',
            title: 'Acesso Liberado!',
            message: 'Sua chave de acesso foi ativada. Agora você tem acesso total ao painel.'
          });
          setActiveTab('campaigns');
        }
      })
      .subscribe();

    return () => {
      profileSubscription.unsubscribe();
    };
  }, [session]);

  useEffect(() => {
    const handleSetTab = (e: any) => {
      if (e.detail) setActiveTab(e.detail);
    };
    window.addEventListener('setTab', handleSetTab);
    return () => window.removeEventListener('setTab', handleSetTab);
  }, []);

  useEffect(() => {
    if (session) {
      fetchProfile();
    }
  }, [session]);

  async function fetchProfile() {
    if (!session?.user) return;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();
    
    if (error && error.code === 'PGRST116') {
      // Profile not found, create it
      const trialExpiration = new Date();
      trialExpiration.setDate(trialExpiration.getDate() + 7);

      const { data: newProfile, error: createError } = await supabase
        .from('profiles')
        .insert([{
          id: session.user.id,
          email: session.user.email,
          nome: session.user.user_metadata?.full_name || '',
          role: 'user',
          status_pagamento: 'PENDENTE',
          vencimento: null,
          accepted_terms_version: session.user.user_metadata?.accepted_terms_version || 0
        }])
        .select()
        .single();
      
      if (newProfile) {
        setProfile(newProfile);
        setActiveTab('profile');
      }
    } else if (data) {
      setProfile(data);
      // If not admin and no access key, force profile tab
      if (data.role !== 'admin' && (!data.access_key_code || !data.whatsapp)) {
        setActiveTab('profile');
      } else if (activeTab === 'profile' && (data.role === 'admin' || (data.access_key_code && data.whatsapp))) {
        // Default to campaigns if access is granted and on profile
        setActiveTab('campaigns');
      }
    }
    setLoading(false);
  }

  useEffect(() => {
    if (!session || !isConfigured) return;

    const checkInstallmentReminders = async () => {
      try {
        const today = new Date().toISOString().split('T')[0];
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().split('T')[0];

        const { data, error } = await supabase
          .from('miscellaneous_charge_installments')
          .select('*, charge:miscellaneous_charges(description, customer:customers(nome))')
          .eq('status', 'pending')
          .or(`due_date.eq.${today},due_date.eq.${tomorrowStr}`);

        if (error) {
          if (error.code === 'PGRST116' || error.code === '42P01' || error.message?.includes('Failed to fetch')) return;
          console.warn('Installment reminders notice:', error.message);
          return;
        }

        data?.forEach(inst => {
          const chargeDesc = (inst as any).charge?.description || 'Cobrança Avulsa';
          const customerName = (inst as any).charge?.customer?.nome || 'Cliente';
          const type = inst.due_date === today ? 'warning' : 'info';
          const title = inst.due_date === today ? 'Vencimento Hoje' : 'Vencimento Amanhã';
          
          addNotification({
            type,
            title,
            message: `A parcela ${inst.installment_number} de "${chargeDesc}" (${customerName}) vence ${inst.due_date === today ? 'hoje' : 'amanhã'}! Valor: R$ ${inst.value.toFixed(2)}`
          });
        });
      } catch (err: any) {
        if (!err?.message?.includes?.('Failed to fetch')) {
          console.warn('Installment reminders notice:', err);
        }
      }
    };

    // Delay a bit to not conflict with other notifications on start
    const timer = setTimeout(checkInstallmentReminders, 2000);
    return () => clearTimeout(timer);
  }, [session]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <Login />;
  }

  const renderContent = () => {
    // Access control check
    const isAdmin = profile?.role === 'admin' || 
      session?.user.email === 'anderlevita@gmail.com';
    const isBlocked = !!profile?.is_blocked;
    
    const isTrial = profile?.status_pagamento === 'TRIAL';
    const isStarter = profile?.status_pagamento === 'STARTER';
    const vencimentoDate = profile?.vencimento ? new Date(profile.vencimento) : null;
    const isExpired = vencimentoDate && vencimentoDate.getTime() < new Date().getTime();
    
    const hasAccess = isAdmin || ((!!profile?.access_key_code || ['pro', 'starter', 'trial'].includes(profile?.plano_tipo)) && !isBlocked && !isExpired);
    
    if (!hasAccess && activeTab !== 'profile') {
      return <ProfileScreen />;
    }

    // Starter/Trial plan restrictions
    if ((isStarter || isTrial) && (activeTab === 'routes' || activeTab === 'simulation')) {
      return <Campaigns />;
    }

    switch (activeTab) {
      case 'profile':
        return <ProfileScreen />;
      case 'campaigns':
        return <Campaigns />;
      case 'routes':
        return <Routes />;
      case 'customers':
        return <Customers />;
      case 'products':
        return <Products />;
      case 'reports':
        return <Reports />;
      case 'sweepstakes':
        return <SweepstakesManager />;
      case 'simulation':
        return <Simulation />;
      case 'virtual-store':
        return <VirtualStore />;
      case 'backup':
        return <Backup />;
      case 'store-settings':
        return <StoreSettings />;
      case 'notepad':
        return <SmartNotepad />;
      case 'financial':
        return <FinancialControl profile={profile} />;
      case 'billing':
        return <BillingManagement profile={profile} />;
      case 'admin':
        return isAdmin ? <AdminPanel currentProfile={profile} /> : <Campaigns />;
      default:
        return <Campaigns />;
    }
  };

  return (
    <div className={cn(
      "flex min-h-screen font-sans selection:bg-emerald-500/30 selection:text-emerald-900 transition-colors duration-300",
      theme === 'dark' ? "bg-zinc-950 text-zinc-100" : "bg-[#f8f9fa] text-zinc-800"
    )}>
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        profile={profile}
        className="no-print"
        theme={theme}
        onThemeChange={setTheme}
      />
      
      <CatalogSyncPrompt />
      
      <main className="flex-1 overflow-y-auto h-screen">
        <header className={cn(
          "h-16 border-b flex items-center justify-between px-4 sm:px-8 backdrop-blur-sm sticky top-0 z-10 no-print transition-colors",
          theme === 'dark' ? "bg-zinc-900/80 border-zinc-800" : "bg-white/80 border-zinc-100"
        )}>
          <div className="flex items-center gap-3 sm:gap-4">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className={cn(
                "lg:hidden p-2 rounded-lg transition-colors",
                theme === 'dark' ? "hover:bg-zinc-800 text-zinc-400" : "hover:bg-zinc-50 text-zinc-500"
              )}
            >
              <Menu className="w-6 h-6" />
            </button>
            <span className="text-zinc-300 dark:text-zinc-700 hidden sm:inline">/</span>
            <span className={cn(
              "text-xs font-bold uppercase tracking-widest",
              theme === 'dark' ? "text-zinc-100" : "text-[#4a1d33]"
            )}>{activeTab}</span>
          </div>
          
          <div className="flex items-center gap-4">
            <NotificationCenter />
            <div className={cn(
              "w-8 h-8 rounded-lg border flex items-center justify-center",
              theme === 'dark' ? "bg-zinc-800 border-zinc-700" : "bg-[#fdf8e1] border-[#4a1d33]/10"
            )}>
              <span className="text-xs font-bold text-[#38a89d]">
                {session.user.email ? session.user.email.substring(0, 2).toUpperCase() : '??'}
              </span>
            </div>
          </div>
        </header>

        <div className="p-4 sm:p-8 max-w-7xl mx-auto">
          {rejectedReceipt && activeTab !== 'profile' && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3 animate-in slide-in-from-top duration-500">
              <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="text-sm font-bold text-red-800">Comprovante Recusado</h4>
                <p className="text-xs text-red-700 mt-1">
                  Seu último comprovante de pagamento foi recusado pelo administrador. 
                  {rejectedReceipt.rejection_reason && (
                    <span className="block mt-1 font-medium italic">Motivo: "{rejectedReceipt.rejection_reason}"</span>
                  )}
                </p>
                <button 
                  onClick={() => setActiveTab('profile')}
                  className="mt-3 text-[10px] font-bold text-red-600 uppercase tracking-widest hover:underline"
                >
                  Ir para Perfil e Enviar Novo Comprovante
                </button>
              </div>
            </div>
          )}
          {renderContent()}
        </div>
      </main>

      {legalSettings && (
        <LegalConfirmationModal
          isOpen={showLegalModal}
          privacyPolicy={legalSettings.privacy_policy}
          termsOfUse={legalSettings.terms_of_use}
          onConfirm={handleConfirmLegal}
        />
      )}

      {showResetPassword && (
        <ResetPasswordModal onClose={() => setShowResetPassword(false)} />
      )}
    </div>
  );
}
