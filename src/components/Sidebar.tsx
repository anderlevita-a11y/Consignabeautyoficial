import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  Package, 
  Users, 
  ShoppingBag, 
  Settings, 
  Sun,
  Moon,
  LogOut,
  ChevronRight,
  UserCircle,
  Megaphone,
  BarChart3,
  Ticket,
  Calculator,
  ShieldAlert,
  Wifi,
  ChevronLeft,
  Lock,
  Map,
  StickyNote,
  DollarSign,
  RefreshCcw,
  Loader2,
  X,
  CheckCircle2,
  FileText,
  Calendar,
  Database,
  Link as LinkIcon
} from 'lucide-react';
import { cn, formatError } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { Logo } from './Logo';
import { Profile } from '../types';
import { syncCatalog, resolveDuplicates, getLinkedProductIds } from '../lib/syncCatalog';
import { useNotifications } from './NotificationCenter';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isOpen?: boolean;
  onClose?: () => void;
  profile: Profile | null;
  className?: string;
  theme?: 'light' | 'dark';
  onThemeChange?: (theme: 'light' | 'dark') => void;
}

const menuItems = [
  { id: 'profile', label: 'Meu Cadastro', icon: UserCircle, public: true },
  { id: 'notepad', label: 'Bloco de Notas', icon: StickyNote },
  { id: 'financial', label: 'Financeiro', icon: DollarSign },
  { id: 'billing', label: 'Gestão de Cobrança', icon: FileText },
  { id: 'campaigns', label: 'Campanhas', icon: Megaphone },
  { id: 'routes', label: 'Rotas', icon: Map, restrictedForStarter: true },
  { id: 'customers', label: 'Clientes', icon: Users },
  { id: 'products', label: 'Catálogo', icon: Package },
  { id: 'reports', label: 'Relatórios', icon: BarChart3 },
  { id: 'sweepstakes', label: 'Sorteios', icon: Ticket },
  { id: 'simulation', label: 'Simulação', icon: Calculator, restrictedForStarter: true },
  { id: 'virtual-store', label: 'Loja Virtual', icon: ShoppingBag },
  { id: 'backup', label: 'Backup', icon: Database },
  { id: 'store-settings', label: 'Config Loja', icon: Settings },
];

export function Sidebar({ activeTab, setActiveTab, isOpen, onClose, profile, className, theme, onThemeChange }: SidebarProps) {
  const [syncing, setSyncing] = useState(false);
  const [previewData, setPreviewData] = useState<{
    inserted: any[];
    updated: any[];
    duplicates: { key: string; type: 'ean' | 'name'; products: any[] }[];
  } | null>(null);
  const [selectedDuplicateIds, setSelectedDuplicateIds] = useState<Set<string>>(new Set());
  const [linkedProductIds, setLinkedProductIds] = useState<Set<string>>(new Set());
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const { addNotification } = useNotifications();

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const isAdmin = profile?.role === 'admin' || 
    profile?.email === 'anderlevita@gmail.com';
  const isBlocked = !!profile?.is_blocked;
  
  const isTrial = profile?.status_pagamento === 'TRIAL';
  const isStarter = profile?.status_pagamento === 'STARTER';
  const trialEnd = isTrial && profile?.vencimento ? new Date(profile.vencimento) : null;
  const isTrialExpired = isTrial && trialEnd && trialEnd.getTime() < new Date().getTime();
  
  const hasAccess = isAdmin || ((!!profile?.access_key_code || profile?.plano_tipo === 'pro') && !isBlocked && !isTrialExpired && !!profile?.whatsapp);

  const handleTabClick = (id: string, isPublic: boolean) => {
    if (!hasAccess && !isPublic) return;
    setActiveTab(id);
    if (onClose) onClose();
  };

  const handlePreviewSync = async () => {
    if (isBlocked) return;
    
    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;

      // Fetch linked product IDs
      const linkedIds = await getLinkedProductIds(user.id);
      setLinkedProductIds(linkedIds);

      const data = await syncCatalog(true);
      setPreviewData(data as any);
      setSelectedDuplicateIds(new Set());
      setIsPreviewModalOpen(true);
    } catch (err: any) {
      console.error('Error previewing catalog sync:', err);
      const errorMessage = err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err));
      addNotification({
        type: 'error',
        title: 'Erro na prévia',
        message: formatError(errorMessage)
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleConfirmSync = async () => {
    setSyncing(true);
    try {
      // Resolve duplicates first if any selected
      if (selectedDuplicateIds.size > 0) {
        await resolveDuplicates(Array.from(selectedDuplicateIds));
      }

      const { inserted, updated } = await syncCatalog(false);
      addNotification({
        type: 'success',
        title: 'Sincronização concluída',
        message: `- ${inserted.length} novos produtos adicionados\n- ${updated.length} produtos atualizados${selectedDuplicateIds.size > 0 ? `\n- ${selectedDuplicateIds.size} duplicados removidos` : ''}`
      });
      setIsPreviewModalOpen(false);
      window.dispatchEvent(new CustomEvent('catalog_synced'));
    } catch (err: any) {
      console.error('Error syncing catalog:', err);
      const errorMessage = err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err));
      addNotification({
        type: 'error',
        title: 'Erro na sincronização',
        message: formatError(errorMessage)
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm transition-opacity"
          onClick={onClose}
        />
      )}

      <div className={cn(
        "fixed inset-y-0 left-0 w-64 flex flex-col border-r z-50 transition-all duration-300 lg:translate-x-0 lg:static lg:inset-auto",
        theme === 'dark' ? "bg-zinc-900 text-zinc-300 border-zinc-800" : "bg-white text-zinc-500 border-zinc-100",
        isOpen ? "translate-x-0" : "-translate-x-full",
        className
      )}>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Logo className="w-10 h-10" />
              <div className="flex flex-col">
                <h1 className={cn(
                  "font-bold text-sm tracking-tight leading-none uppercase",
                  theme === 'dark' ? "text-zinc-100" : "text-[#4a1d33]"
                )}>Consigna</h1>
                <span className="text-[#38a89d] font-bold text-[10px] uppercase tracking-widest">Beauty</span>
              </div>
            </div>
            <button 
              onClick={onClose}
              className={cn(
                "lg:hidden p-2 rounded-lg transition-colors",
                theme === 'dark' ? "hover:bg-zinc-800 text-zinc-500" : "hover:bg-zinc-50 text-zinc-400"
              )}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          </div>
          
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-[#38a89d] rounded-full animate-pulse" />
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Sistema: Online</span>
            </div>

            <button
              onClick={() => onThemeChange?.(theme === 'dark' ? 'light' : 'dark')}
              className={cn(
                "p-1.5 rounded-lg transition-all duration-300",
                theme === 'dark' 
                  ? "bg-zinc-800 text-amber-400 hover:bg-zinc-700" 
                  : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
              )}
              title={theme === 'dark' ? "Mudar para modo claro" : "Mudar para modo escuro"}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <nav className="flex-1 px-4 py-2 space-y-1 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const isRestricted = (isStarter || isTrial) && (item as any).restrictedForStarter;
            const isLocked = (!hasAccess && !item.public) || isRestricted;
            
            return (
              <button
                key={item.id}
                onClick={() => handleTabClick(item.id, !!item.public)}
                disabled={isLocked}
                className={cn(
                  "w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 group",
                  isActive 
                    ? "bg-[#38a89d] text-white shadow-lg shadow-[#38a89d]/20" 
                    : isLocked
                      ? "opacity-50 cursor-not-allowed grayscale"
                      : theme === 'dark'
                        ? "hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100"
                        : "hover:bg-zinc-50 text-zinc-500 hover:text-[#4a1d33]"
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon className={cn(
                    "w-5 h-5 transition-colors",
                    isActive ? "text-white" : theme === 'dark' ? "text-zinc-500 group-hover:text-[#38a89d]" : "text-zinc-400 group-hover:text-[#38a89d]"
                  )} />
                  <span className="font-semibold text-sm">{item.label}</span>
                </div>
                {isLocked && <Lock className="w-3.5 h-3.5 text-zinc-400" />}
              </button>
            );
          })}

          {!isBlocked && (
            <button
              onClick={handlePreviewSync}
              disabled={syncing}
              className={cn(
                "w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 group text-zinc-500 disabled:opacity-50",
                theme === 'dark' ? "hover:bg-zinc-800 hover:text-zinc-100" : "hover:bg-zinc-50 hover:text-[#4a1d33]"
              )}
            >
              <div className="flex items-center gap-3">
                {syncing ? (
                  <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
                ) : (
                  <RefreshCcw className={cn(
                    "w-5 h-5 transition-all duration-500",
                    "text-zinc-400 group-hover:text-[#38a89d] group-hover:rotate-180"
                  )} />
                )}
                <span className="font-semibold text-sm">Sincronizar Catálogo</span>
              </div>
            </button>
          )}

          {isAdmin && (
            <button
              onClick={() => handleTabClick('admin', false)}
              className={cn(
                "w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 group",
                activeTab === 'admin'
                  ? "bg-[#38a89d] text-white shadow-lg shadow-[#38a89d]/20"
                  : theme === 'dark' ? "hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100" : "hover:bg-zinc-50 text-zinc-500 hover:text-[#4a1d33]"
              )}
            >
              <div className="flex items-center gap-3">
                <Settings className={cn(
                  "w-5 h-5 transition-colors",
                  activeTab === 'admin' ? "text-white" : "text-zinc-400 group-hover:text-[#38a89d]"
                )} />
                <span className="font-semibold text-sm">Painel Admin</span>
              </div>
            </button>
          )}
        </nav>

        <div className="p-4 space-y-2">
          <button 
            onClick={handleLogout}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-2 rounded-xl transition-all group",
              theme === 'dark' ? "hover:bg-red-500/10 text-zinc-500 hover:text-red-400" : "hover:bg-red-50 hover:text-red-500 text-zinc-400"
            )}
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium text-sm">Sair</span>
          </button>
        </div>
      </div>

      {/* Preview Modal */}
      {isPreviewModalOpen && previewData && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-[32px] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
            <div className="p-6 border-b border-zinc-100 flex items-center justify-between bg-white sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-emerald-50 text-emerald-500">
                  <RefreshCcw className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-zinc-800 tracking-tight">Prévia da Sincronização</h3>
                  <p className="text-sm text-zinc-500">Revise as alterações antes de confirmar.</p>
                </div>
              </div>
              <button 
                onClick={() => setIsPreviewModalOpen(false)}
                className="p-2 hover:bg-zinc-100 rounded-xl transition-colors text-zinc-400 hover:text-zinc-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 bg-zinc-50/50 space-y-8">
              {previewData.inserted.length === 0 && previewData.updated.length === 0 && previewData.duplicates.length === 0 ? (
                <div className="text-center py-12">
                  <Package className="w-12 h-12 text-zinc-300 mx-auto mb-4" />
                  <p className="text-lg font-bold text-zinc-700">Seu catálogo já está atualizado!</p>
                  <p className="text-sm text-zinc-500">Não há novos produtos, alterações de preço ou duplicados.</p>
                </div>
              ) : (
                <>
                  {previewData.duplicates.length > 0 && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <span className="bg-red-100 text-red-700 px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider">
                          {previewData.duplicates.length} Grupos de Duplicados Encontrados
                        </span>
                      </div>
                      <p className="text-sm text-zinc-500">Selecione os produtos que deseja <strong className="text-red-600">EXCLUIR</strong> para resolver as duplicidades.</p>
                      <div className="space-y-4">
                        {previewData.duplicates.map((group, idx) => (
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
                    </div>
                  )}

                  {previewData.inserted.length > 0 && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <span className="bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider">
                          {previewData.inserted.length} Novos Produtos
                        </span>
                      </div>
                      <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-zinc-50 border-b border-zinc-100">
                                <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Produto</th>
                                <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">EAN</th>
                                <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right">Custo</th>
                                <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right">Venda</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100">
                              {previewData.inserted.map((p, i) => (
                                <tr key={i} className="hover:bg-zinc-50/50">
                                  <td className="px-4 py-3 text-sm font-medium text-zinc-800">{p.name}</td>
                                  <td className="px-4 py-3 text-xs font-mono text-zinc-500">{p.ean || '-'}</td>
                                  <td className="px-4 py-3 text-sm text-zinc-500 text-right">R$ {p.cost_price?.toFixed(2)}</td>
                                  <td className="px-4 py-3 text-sm font-bold text-emerald-600 text-right">R$ {p.sale_price?.toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}

                  {previewData.updated.length > 0 && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <span className="bg-amber-100 text-amber-700 px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider">
                          {previewData.updated.length} Produtos Atualizados
                        </span>
                      </div>
                      <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-zinc-50 border-b border-zinc-100">
                                <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Produto</th>
                                <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right">Custo Antigo</th>
                                <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right">Custo Novo</th>
                                <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right">Venda Antiga</th>
                                <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right">Venda Nova</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100">
                              {previewData.updated.map((p, i) => (
                                <tr key={i} className="hover:bg-zinc-50/50">
                                  <td className="px-4 py-3 text-sm font-medium text-zinc-800">{p.payload.name}</td>
                                  <td className="px-4 py-3 text-sm text-zinc-400 line-through text-right">R$ {p.oldData.cost_price?.toFixed(2)}</td>
                                  <td className="px-4 py-3 text-sm text-amber-600 font-medium text-right">R$ {p.payload.cost_price?.toFixed(2)}</td>
                                  <td className="px-4 py-3 text-sm text-zinc-400 line-through text-right">R$ {p.oldData.sale_price?.toFixed(2)}</td>
                                  <td className="px-4 py-3 text-sm font-bold text-emerald-600 text-right">R$ {p.payload.sale_price?.toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            
            <div className="p-6 border-t border-zinc-100 bg-white flex justify-end gap-3 sticky bottom-0">
              <button
                onClick={() => setIsPreviewModalOpen(false)}
                className="px-6 py-3 rounded-xl font-bold text-zinc-600 hover:bg-zinc-100 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmSync}
                disabled={syncing || (previewData.inserted.length === 0 && previewData.updated.length === 0 && selectedDuplicateIds.size === 0)}
                className="bg-emerald-500 hover:bg-emerald-600 text-white px-8 py-3 rounded-xl font-bold transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2 disabled:opacity-50"
              >
                {syncing ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                {selectedDuplicateIds.size > 0 ? 'Resolver e Sincronizar' : 'Confirmar Sincronização'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
