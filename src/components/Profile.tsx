import React, { useEffect, useState } from 'react';
import { 
  User, 
  Save, 
  MapPin, 
  CreditCard, 
  ShieldCheck, 
  Smartphone, 
  Instagram,
  FileText,
  Upload,
  CheckCircle2,
  Crown,
  Key,
  Loader2,
  Eye,
  Trash2,
  X,
  ShieldAlert,
  Sparkles,
  Send
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { compressImage } from '../lib/image-utils';
import { Profile, PaymentReceipt } from '../types';
import { cn, formatError } from '../lib/utils';
import { useNotifications } from './NotificationCenter';
import { ConfirmationModal } from './ConfirmationModal';

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "stripe-buy-button": any;
    }
  }
}

export function ProfileScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showViewer, setShowViewer] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [receipts, setReceipts] = useState<PaymentReceipt[]>([]);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [legalSettings, setLegalSettings] = useState<any>(null);
  const [showLegalModal, setShowLegalModal] = useState(false);
  const [legalTab, setLegalTab] = useState<'privacy' | 'terms'>('privacy');
  const { addNotification } = useNotifications();
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    variant: 'danger' | 'warning' | 'info';
    requiredText?: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    variant: 'info',
    onConfirm: () => {}
  });
  const [creatingPayment, setCreatingPayment] = useState(false);

  useEffect(() => {
    async function fetchReceipts(userId: string) {
      const { data, error } = await supabase
        .from('payment_receipts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      
      if (data) setReceipts(data);
    }

    async function fetchProfile() {
      const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
      if (user) {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        
        if (data) {
          setProfile(data);
          fetchReceipts(user.id);
        }

        // Fetch legal settings for the footer links
        const { data: legalData } = await supabase
          .from('app_legal_settings')
          .select('*')
          .single();
        if (legalData) setLegalSettings(legalData);
      }
      setLoading(false);
    }
    fetchProfile();
  }, []);

  const handleAbacatePay = async (planId: string) => {
    setCreatingPayment(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('Usuário não autenticado');

      const response = await fetch('/api/abacate-pay/create-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          frequency: "MULTIPLE_PAYMENTS",
          items: [
            {
              id: planId,
              quantity: 1
            }
          ],
          methods: ["PIX", "CARD"]
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erro ao criar link de pagamento');

      if (data.data?.url) {
        window.open(data.data.url, '_blank');
        addNotification({
          type: 'success',
          title: 'Link Gerado',
          message: 'O link de pagamento foi aberto em uma nova aba.'
        });
      } else {
        throw new Error('URL de pagamento não retornada');
      }
    } catch (err: any) {
      console.error(err);
      addNotification({
        type: 'error',
        title: 'Erro no Pagamento',
        message: formatError(err)
      });
    } finally {
      setCreatingPayment(false);
    }
  };

  const handleUploadReceipt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    setUploadingReceipt(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${profile.id}/${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('receipts')
        .getPublicUrl(fileName);

      const { error: insertError } = await supabase
        .from('payment_receipts')
        .insert({
          user_id: profile.id,
          user_name: profile.nome || profile.email,
          receipt_url: publicUrl,
          status: 'pending'
        });

      if (insertError) throw insertError;

      addNotification({
        type: 'success',
        title: 'Comprovante Enviado',
        message: 'Seu comprovante foi enviado com sucesso e será analisado pelo administrador.'
      });

      // Refresh receipts
      const { data } = await supabase
        .from('payment_receipts')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false });
      if (data) setReceipts(data);
    } catch (err: any) {
      console.error('Error uploading receipt:', err);
      addNotification({
        type: 'error',
        title: 'Erro no upload',
        message: formatError(err)
      });
    } finally {
      setUploadingReceipt(false);
    }
  };

  const handleSave = async () => {
    if (!profile?.nome || !profile?.whatsapp || !profile?.cpf) {
      addNotification({
        type: 'error',
        title: 'Campos Obrigatórios',
        message: 'Por favor, preencha Nome, CPF e WhatsApp.'
      });
      return;
    }

    setSaving(true);
    try {
      // Remove immutable fields from profile
      const { id, email, role, created_at, ...updateData } = profile;

      // Ensure empty strings are sent as null to avoid Supabase errors
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === '') {
          updateData[key] = null;
        }
      });

      const { error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', profile.id);
      
      if (error) throw error;
      addNotification({
        type: 'success',
        title: 'Sucesso',
        message: 'Cadastro salvo com sucesso!'
      });
    } catch (err: any) {
      console.error(err);
      addNotification({
        type: 'error',
        title: 'Erro ao salvar',
        message: formatError(err)
      });
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
      if (!user) throw new Error('Usuário não autenticado');

      const processedFile = await compressImage(file);
      const fileExt = processedFile.name.split('.').pop();
      const fileName = `${user.id}/${Math.random()}.${fileExt}`;
      const filePath = `documents/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, processedFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('documents')
        .getPublicUrl(filePath);

      setProfile({ ...profile, documento_url: publicUrl });
      addNotification({
        type: 'success',
        title: 'Sucesso',
        message: 'Documento carregado com sucesso! Não esqueça de salvar o cadastro.'
      });
    } catch (err: any) {
      console.error(err);
      addNotification({
        type: 'error',
        title: 'Erro no upload',
        message: formatError(err)
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDocument = async () => {
    if (!profile?.documento_url) return;
    
    setConfirmModal({
      isOpen: true,
      title: 'Excluir Documento',
      message: 'Deseja realmente excluir a foto do documento?',
      variant: 'danger',
      onConfirm: async () => {
        try {
          // Extract path from public URL
          // Example URL: https://.../storage/v1/object/public/documents/documents/user_id/random.jpg
          const urlParts = profile.documento_url.split('/object/public/documents/');
          if (urlParts.length < 2) throw new Error('URL de documento inválida');
          const filePath = urlParts[1];

          const { error } = await supabase.storage
            .from('documents')
            .remove([filePath]);

          if (error) throw error;

          setProfile({ ...profile, documento_url: null });
          addNotification({
            type: 'success',
            title: 'Sucesso',
            message: 'Documento removido. Salve o cadastro para confirmar.'
          });
        } catch (err: any) {
          console.error(err);
          addNotification({
            type: 'error',
            title: 'Erro ao remover',
            message: formatError(err)
          });
        } finally {
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const handleDeleteAccount = async () => {
    setConfirmModal({
      isOpen: true,
      title: 'EXCLUSÃO TOTAL DE DADOS',
      message: 'Esta ação é IRREVERSÍVEL. Todos os seus dados, documentos, históricos de pagamento e configurações serão excluídos permanentemente de nossos servidores em conformidade com a LGPD. Deseja continuar?',
      variant: 'danger',
      requiredText: 'EXCLUIR',
      onConfirm: async () => {
        setSaving(true);
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session?.user) throw new Error('Usuário não autenticado');

          const userId = session.user.id;

          // 1. Delete associated data (Cascade)
          // List of tables that might have user_id
          const tables = [
            'payment_receipts',
            'bags',
            'mystery_bags',
            'customers',
            'products',
            'campaigns',
            'routes',
            'raffles',
            'sweepstakes',
            'goals',
            'miscellaneous_charges',
            'financial_transactions'
          ];

          for (const table of tables) {
            await supabase.from(table).delete().eq('user_id', userId);
          }

          // 2. Delete storage files
          // We don't have a list of all files, but we can try to delete the user folders
          await supabase.storage.from('documents').remove([`${userId}/`]);
          await supabase.storage.from('receipts').remove([`${userId}/`]);
          await supabase.storage.from('products').remove([`${userId}/`]);

          // 3. Delete Profile record
          const { error: profileError } = await supabase
            .from('profiles')
            .delete()
            .eq('id', userId);

          if (profileError) throw profileError;

          // 4. Sign Out
          await supabase.auth.signOut();
          
          addNotification({
            type: 'success',
            title: 'Conta Excluída',
            message: 'Todos os seus dados foram removidos com sucesso. A sessão será encerrada.'
          });

          // Redirect after a short delay
          setTimeout(() => {
            window.location.href = '/';
          }, 2000);

        } catch (err: any) {
          console.error('Error deleting account:', err);
          addNotification({
            type: 'error',
            title: 'Erro na Exclusão',
            message: 'Não foi possível completar a exclusão. Por favor, contate o DPO.'
          });
        } finally {
          setSaving(false);
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const isTrial = profile?.status_pagamento === 'TRIAL';
  const trialEnd = isTrial && profile?.vencimento ? new Date(profile.vencimento) : null;
  const now = new Date();
  const diffTime = trialEnd ? trialEnd.getTime() - now.getTime() : 0;
  const diffDays = trialEnd ? Math.ceil(diffTime / (1000 * 60 * 60 * 24)) : 0;
  const isTrialExpiringSoon = isTrial && diffDays === 1;
  const isTrialExpired = isTrial && diffDays <= 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 text-[#38a89d] animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8 pb-12">
      {/* Aviso de Liberação Trial */}
      {profile?.role !== 'admin' && !profile?.access_key_code && !['pro', 'starter', 'trial'].includes(profile?.plano_tipo) && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6 flex flex-col sm:flex-row items-center gap-4 shadow-sm animate-pulse">
          <div className="bg-blue-100 p-3 rounded-full">
            <ShieldAlert className="w-8 h-8 text-blue-600" />
          </div>
          <div className="text-center sm:text-left flex-1">
            <h4 className="text-lg font-bold text-blue-900">Aguardando Liberação de Acesso</h4>
            <p className="text-sm text-blue-800 mt-1">
              Para iniciar seus <strong>7 dias gratuitos</strong>, informe seu e-mail cadastrado (<span className="font-bold">{profile?.email}</span>) 
              e solicite a liberação ao administrador pelo fone: <a href="tel:47997626121" className="font-bold underline">47 997626121</a>.
              <a 
                href="https://wa.me/5547997626121" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 ml-2 px-3 py-1 bg-emerald-500 text-white rounded-lg text-[10px] font-bold hover:bg-emerald-600 transition-all shadow-sm"
              >
                <Send className="w-3 h-3" />
                WHATSAPP
              </a>
            </p>
          </div>
        </div>
      )}

      {isTrialExpiringSoon && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-bold text-amber-800">Seu período de teste grátis termina amanhã!</h4>
            <p className="text-xs text-amber-700 mt-1">Prepare-se para fazer o upgrade e continuar aproveitando todos os recursos do sistema sem interrupções.</p>
          </div>
        </div>
      )}

      {isTrialExpired && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-bold text-red-800">Seu período de teste grátis expirou.</h4>
            <p className="text-xs text-red-700 mt-1">Faça o upgrade agora para continuar usando o sistema.</p>
          </div>
        </div>
      )}

      {profile?.is_blocked && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3 text-red-700">
          <ShieldCheck className="w-6 h-6 shrink-0" />
          <div>
            <p className="font-bold text-sm">Acesso Restrito</p>
            <p className="text-xs opacity-80">
              Seu cadastro está bloqueado por inadimplência. Entre em contato com o administrador pelo fone: <a href="tel:47997626121" className="font-bold underline">47 997626121</a>.
              <a 
                href="https://wa.me/5547997626121" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 ml-2 px-3 py-1 bg-emerald-500 text-white rounded-lg text-[10px] font-bold hover:bg-emerald-600 transition-all shadow-sm"
              >
                <Send className="w-3 h-3" />
                WHATSAPP
              </a>
            </p>
          </div>
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-[#4a1d33]">Meu Cadastro</h2>
          <p className="text-sm text-zinc-500">Mantenha seus dados atualizados para melhor experiência.</p>
        </div>
        <button 
          onClick={handleSave}
          disabled={saving}
          className="flex items-center justify-center gap-2 bg-[#38a89d] hover:bg-[#2d8a81] text-white px-8 py-3 rounded-xl font-bold transition-all shadow-sm disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          Salvar
        </button>
      </div>

      {/* Dados Pessoais */}
      <section className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 sm:p-6 border-b border-zinc-100 bg-zinc-50/50 flex items-center gap-3">
          <User className="w-5 h-5 text-emerald-600" />
          <h3 className="font-bold text-zinc-800">Dados Pessoais</h3>
        </div>
        <div className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Nome Completo *</label>
            <input 
              type="text" 
              value={profile?.nome || ''} 
              onChange={(e) => setProfile({...profile, nome: e.target.value})}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-800 focus:border-emerald-500 outline-none transition-colors"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">E-mail (Login)</label>
            <input 
              type="email" 
              readOnly
              value={profile?.email || ''} 
              className="w-full bg-zinc-100 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-500 cursor-not-allowed outline-none"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">CPF *</label>
            <input 
              type="text" 
              value={profile?.cpf || ''} 
              onChange={(e) => setProfile({...profile, cpf: e.target.value})}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-800 focus:border-emerald-500 outline-none transition-colors"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Nascimento</label>
              <input 
                type="date" 
                value={profile?.data_nascimento || ''} 
                onChange={(e) => setProfile({...profile, data_nascimento: e.target.value})}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-800 focus:border-emerald-500 outline-none transition-colors text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Gênero</label>
              <select 
                value={profile?.genero || ''} 
                onChange={(e) => setProfile({...profile, genero: e.target.value})}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-800 focus:border-emerald-500 outline-none transition-colors text-sm"
              >
                <option value="">Selecionar</option>
                <option value="masculino">Masculino</option>
                <option value="feminino">Feminino</option>
                <option value="outro">Outro</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">WhatsApp *</label>
            <input 
              type="text" 
              value={profile?.whatsapp || ''} 
              onChange={(e) => setProfile({...profile, whatsapp: e.target.value})}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-800 focus:border-emerald-500 outline-none transition-colors"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Instagram</label>
            <div className="relative">
              <Instagram className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input 
                type="text" 
                placeholder="@seu.perfil"
                value={profile?.instagram || ''} 
                onChange={(e) => setProfile({...profile, instagram: e.target.value})}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl pl-10 pr-4 py-3 text-zinc-800 focus:border-emerald-500 outline-none transition-colors"
              />
            </div>
          </div>
          <div className="md:col-span-2 space-y-2">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Foto do Documento (Opcional)</label>
            <div className="relative">
              <input 
                type="file" 
                id="doc-upload"
                accept="image/*"
                className="hidden"
                onChange={handleFileUpload}
                disabled={uploading}
              />
              
              {profile?.documento_url ? (
                <div className="border-2 border-dashed border-emerald-500/30 rounded-2xl p-6 sm:p-8 flex flex-col items-center justify-center gap-4 bg-emerald-50/30">
                  <div className="flex items-center gap-2 text-emerald-600 font-bold">
                    <CheckCircle2 className="w-6 h-6" />
                    Documento Carregado
                  </div>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => setShowViewer(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-white border border-emerald-200 text-emerald-600 rounded-xl text-xs font-bold hover:bg-emerald-50 transition-all"
                    >
                      <Eye className="w-4 h-4" />
                      Visualizar
                    </button>
                    <button 
                      onClick={handleDeleteDocument}
                      className="flex items-center gap-2 px-4 py-2 bg-white border border-red-200 text-red-600 rounded-xl text-xs font-bold hover:bg-red-50 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                      Excluir
                    </button>
                  </div>
                </div>
              ) : (
                <label 
                  htmlFor="doc-upload"
                  className={cn(
                    "border-2 border-dashed border-zinc-100 rounded-2xl p-6 sm:p-8 flex flex-col items-center justify-center gap-3 hover:border-emerald-500/50 transition-colors cursor-pointer group bg-zinc-50/50",
                    uploading && "opacity-50 cursor-wait"
                  )}
                >
                  {uploading ? (
                    <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                  ) : (
                    <Upload className="w-8 h-8 text-zinc-300 group-hover:text-emerald-500 transition-colors" />
                  )}
                  <span className="text-zinc-400 group-hover:text-zinc-600 transition-colors text-sm font-medium">
                    {uploading ? 'Carregando...' : 'Clique para anexar foto do documento'}
                  </span>
                </label>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Endereço */}
      <section className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 sm:p-6 border-b border-zinc-100 bg-zinc-50/50 flex items-center gap-3">
          <MapPin className="w-5 h-5 text-emerald-600" />
          <h3 className="font-bold text-zinc-800">Endereço Residencial</h3>
        </div>
        <div className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">CEP</label>
            <input 
              type="text" 
              value={profile?.cep || ''} 
              onChange={(e) => setProfile({...profile, cep: e.target.value})}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-800 focus:border-emerald-500 outline-none transition-colors"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Cidade</label>
            <input 
              type="text" 
              value={profile?.cidade || ''} 
              onChange={(e) => setProfile({...profile, cidade: e.target.value})}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-800 focus:border-emerald-500 outline-none transition-colors"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Estado</label>
            <input 
              type="text" 
              value={profile?.estado || ''} 
              onChange={(e) => setProfile({...profile, estado: e.target.value})}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-800 focus:border-emerald-500 outline-none transition-colors"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Bairro</label>
            <input 
              type="text" 
              value={profile?.bairro || ''} 
              onChange={(e) => setProfile({...profile, bairro: e.target.value})}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-800 focus:border-emerald-500 outline-none transition-colors"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Logradouro</label>
            <input 
              type="text" 
              value={profile?.logradouro || ''} 
              onChange={(e) => setProfile({...profile, logradouro: e.target.value})}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-800 focus:border-emerald-500 outline-none transition-colors"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Número / Complemento</label>
            <input 
              type="text" 
              value={profile?.numero_complemento || ''} 
              onChange={(e) => setProfile({...profile, numero_complemento: e.target.value})}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-800 focus:border-emerald-500 outline-none transition-colors"
            />
          </div>
          <div className="md:col-span-3 space-y-4">
            <div className="bg-zinc-50 border border-zinc-100 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <MapPin className="w-5 h-5 text-emerald-600" />
                <span className="text-sm font-bold text-zinc-700">Localização GPS</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-zinc-400 bg-white px-3 py-1 rounded-lg border border-zinc-100">
                  Lat: {profile?.latitude || 'N/A'} | Lng: {profile?.longitude || 'N/A'}
                </span>
                {profile?.latitude && (
                  <button 
                    onClick={() => setProfile({ ...profile, latitude: null, longitude: null })}
                    className="p-1 px-2 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition-all text-[10px] font-bold"
                    title="Resetar Localização"
                  >
                    RESET
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Configurações de Pagamento (PIX) */}
      <section className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 sm:p-6 border-b border-zinc-100 bg-zinc-50/50 flex items-center gap-3">
          <CreditCard className="w-5 h-5 text-emerald-600" />
          <h3 className="font-bold text-zinc-800">Configurações de Pagamento (PIX)</h3>
        </div>
        <div className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Chave PIX</label>
            <input 
              type="text" 
              placeholder="E-mail, CPF, Celular ou Chave Aleatória"
              value={profile?.pix_key || ''} 
              onChange={(e) => setProfile({...profile, pix_key: e.target.value})}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-800 focus:border-emerald-500 outline-none transition-colors"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Nome do Beneficiário</label>
            <input 
              type="text" 
              placeholder="Nome completo do titular da conta"
              value={profile?.pix_beneficiary || ''} 
              onChange={(e) => setProfile({...profile, pix_beneficiary: e.target.value})}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-800 focus:border-emerald-500 outline-none transition-colors"
            />
          </div>
          <div className="md:col-span-2">
            <p className="text-[10px] text-zinc-400 italic">
              * Estes dados serão utilizados para gerar o QR Code de pagamento durante o acerto das sacolas.
            </p>
          </div>
        </div>
      </section>

      {/* Status de Acesso */}
      <section className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 sm:p-6 border-b border-zinc-100 bg-zinc-50/50 flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-emerald-600" />
          <h3 className="font-bold text-zinc-800">Status de Acesso</h3>
        </div>
        <div className="p-4 sm:p-6 space-y-6">
          <div className="bg-zinc-50 rounded-2xl p-4 sm:p-6 border border-zinc-100 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Status do Acesso</p>
              <h4 className="text-lg font-bold text-zinc-800 flex items-center gap-2">
                {profile?.role === 'admin' ? 'Administrador' : (['pro', 'starter'].includes(profile?.plano_tipo) ? 'Assinatura Mensal' : (isTrial ? 'Período de Teste' : (profile?.access_key_code ? 'Assinatura Mensal Liberada' : 'Aguardando Liberação')))}
                {(profile?.role === 'admin' || profile?.access_key_code || ['pro', 'starter'].includes(profile?.plano_tipo)) && (
                  <span className={cn("text-[10px] px-2 py-0.5 rounded-lg uppercase font-bold", isTrial ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700")}>
                    {isTrial ? 'Trial' : 'Ativo'}
                  </span>
                )}
              </h4>
              {profile?.vencimento && (
                <div className="mt-2 p-3 bg-white border border-zinc-100 rounded-xl shadow-sm">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Data de Vencimento</p>
                  <p className="text-sm font-bold text-zinc-800">{new Date(profile.vencimento).toLocaleDateString()}</p>
                </div>
              )}

              {/* Pro-rated Table */}
              <div className="mt-4 p-4 bg-white border border-zinc-100 rounded-2xl shadow-sm space-y-3">
                <h5 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Valor Proporcional (Até dia 08)</h5>
                <div className="grid grid-cols-1 gap-3">
                  <div className="p-2 bg-purple-50 rounded-lg border border-purple-100">
                    <p className="text-[9px] text-purple-600 font-bold uppercase">Assinatura Mensal</p>
                    <p className="text-sm font-black text-purple-900">R$ {(() => {
                      const payDate = new Date();
                      let next8th = new Date(payDate.getFullYear(), payDate.getMonth(), 8, 12, 0, 0);
                      if (payDate.getDate() >= 8) next8th.setMonth(next8th.getMonth() + 1);
                      const diffTime = next8th.getTime() - payDate.getTime();
                      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                      return ((39.99 / 30) * diffDays).toFixed(2);
                    })()}</p>
                  </div>
                </div>
                <p className="text-[9px] text-zinc-400 italic">
                  * Valores calculados com base no uso proporcional até o próximo fechamento (dia 08).
                </p>
              </div>

              {/* Receipt Upload Section */}
              <div className="mt-6 space-y-4">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-zinc-200"></div>
                  </div>
                  <div className="relative flex justify-center text-[10px] uppercase tracking-widest font-bold">
                    <span className="bg-zinc-50 px-4 text-zinc-400">Pagamento e Comprovante</span>
                  </div>
                </div>

                <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm space-y-6">
                  <div className="flex flex-col items-center text-center space-y-4">
                    <div className="w-full max-w-[280px] aspect-[3/4] bg-zinc-50 rounded-2xl border border-zinc-100 overflow-hidden flex items-center justify-center relative group">
                      <img 
                        src="https://hxvgjlyibrksarogqoge.supabase.co/storage/v1/object/public/receipts/pague%20pix.png" 
                        alt="QR Code PIX NuBank" 
                        className="w-full h-full object-contain p-4"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <p className="text-[10px] font-bold text-zinc-500 bg-white/90 px-3 py-1.5 rounded-full shadow-sm">Escaneie para Pagar</p>
                      </div>
                    </div>
                    
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-zinc-800">Pague via PIX</p>
                      <p className="text-[10px] text-zinc-500 uppercase tracking-widest leading-relaxed">
                        Escaneie o código acima ou use a chave CNPJ:<br/>
                        <strong className="text-zinc-800">26.384.051/0001-58</strong>
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="block">
                      <span className="sr-only">Escolher arquivo</span>
                      <div className={cn(
                        "w-full flex flex-col items-center justify-center gap-3 py-8 border-2 border-dashed rounded-2xl transition-all cursor-pointer",
                        uploadingReceipt ? "bg-zinc-50 border-zinc-200" : "bg-emerald-50/30 border-emerald-200 hover:bg-emerald-50/50 hover:border-emerald-300"
                      )}>
                        {uploadingReceipt ? (
                          <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                        ) : (
                          <Upload className="w-8 h-8 text-emerald-500" />
                        )}
                        <div className="text-center">
                          <p className="text-sm font-bold text-emerald-700">
                            {uploadingReceipt ? 'Enviando...' : 'Enviar Comprovante'}
                          </p>
                          <p className="text-[10px] text-emerald-600 font-medium">PNG, JPG ou PDF até 5MB</p>
                        </div>
                        <input 
                          type="file" 
                          className="hidden" 
                          accept="image/*,.pdf"
                          onChange={handleUploadReceipt}
                          disabled={uploadingReceipt}
                        />
                      </div>
                    </label>
                  </div>
                </div>

                {/* List of Receipts */}
                {receipts.length > 0 && (
                  <div className="space-y-3">
                    <h5 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest px-2">Meus Comprovantes Enviados</h5>
                    <div className="grid grid-cols-1 gap-2">
                      {receipts.map((receipt) => (
                        <div key={receipt.id} className="bg-white border border-zinc-100 rounded-xl p-3 flex items-center justify-between shadow-sm">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-8 h-8 rounded-lg flex items-center justify-center",
                              receipt.status === 'approved' ? "bg-emerald-50 text-emerald-600" :
                              receipt.status === 'rejected' ? "bg-red-50 text-red-600" :
                              "bg-amber-50 text-amber-600"
                            )}>
                              <FileText className="w-4 h-4" />
                            </div>
                            <div>
                              <p className="text-xs font-bold text-zinc-800">
                                {new Date(receipt.created_at).toLocaleDateString()} às {new Date(receipt.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </p>
                              <p className={cn(
                                "text-[9px] font-bold uppercase tracking-widest",
                                receipt.status === 'approved' ? "text-emerald-500" :
                                receipt.status === 'rejected' ? "text-red-500" :
                                "text-amber-500"
                              )}>
                                {receipt.status === 'approved' ? 'Aprovado' : 
                                 receipt.status === 'rejected' ? 'Reprovado' : 
                                 'Em Análise'}
                              </p>
                              {receipt.status === 'rejected' && receipt.rejection_reason && (
                                <p className="text-[10px] text-red-600 mt-1 leading-tight max-w-[200px]">
                                  {receipt.rejection_reason}
                                </p>
                              )}
                            </div>
                          </div>
                          <a 
                            href={receipt.receipt_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="p-2 hover:bg-zinc-50 rounded-lg text-zinc-400 transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {isTrial && (
                <p className={cn("text-xs font-bold mt-1", diffDays > 1 ? "text-blue-600" : (diffDays === 1 ? "text-amber-600" : "text-red-600"))}>
                  {diffDays > 1 ? `Faltam ${diffDays} dias para o fim do teste` : (diffDays === 1 ? 'Termina amanhã' : 'Teste expirado')}
                </p>
              )}
              {['pro', 'starter'].includes(profile?.plano_tipo) && <p className="text-xs text-emerald-600 font-bold">Assinatura Mensal Ativa</p>}
            </div>
            <div className="flex-1 max-w-md space-y-2">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                <ShieldCheck className="w-3 h-3" /> Identificador de Acesso
              </label>
              <input 
                type="text" 
                readOnly
                value={profile?.access_key_code || (['pro', 'starter'].includes(profile?.plano_tipo) ? 'ASSINATURA_MENSAL' : 'Acesso não liberado')} 
                className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-3 text-sm text-zinc-500 font-mono outline-none shadow-sm cursor-not-allowed"
              />
              <p className="text-[10px] text-zinc-400">O seu acesso é liberado manualmente pelo administrador ou via Assinatura Mensal (R$ 39,99/mês).</p>
              
              {(profile?.role === 'admin' || !['pro', 'starter'].includes(profile?.plano_tipo)) && (
                <div className="mt-8 space-y-8">
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-zinc-200"></div>
                    </div>
                    <div className="relative flex justify-center text-[10px] uppercase tracking-widest font-bold">
                      <span className="bg-zinc-50 px-4 text-zinc-400">Escolha seu Plano</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-6">
                    {/* Plano Starter - AbacatePay */}
                    <div className="bg-purple-50 border border-purple-100 rounded-[32px] p-8 space-y-6 shadow-sm transition-all hover:shadow-md">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-2xl bg-purple-100 flex items-center justify-center text-purple-600">
                            <Sparkles className="w-6 h-6" />
                          </div>
                          <div>
                            <h4 className="font-bold text-purple-900">Assinatura Mensal</h4>
                            <p className="text-xs text-purple-600">Pagamento via AbacatePay</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="flex items-baseline justify-end gap-1">
                            <span className="text-sm font-bold text-purple-900">R$</span>
                            <span className="text-3xl font-black text-purple-900 tracking-tight">39,99</span>
                          </div>
                          <span className="text-[10px] text-purple-500 font-bold uppercase tracking-widest">/mês</span>
                        </div>
                      </div>

                      <button 
                        onClick={() => window.open('https://app.abacatepay.com/pay/bill_gDcujhxNTcxyw0FQ1ZDaWpn2', '_blank')}
                        className="flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white w-full py-4 rounded-2xl font-bold transition-all shadow-lg shadow-purple-500/20"
                      >
                        <CreditCard className="w-5 h-5" />
                        Assinar com AbacatePay
                      </button>
                      
                      <p className="text-[10px] text-purple-700 text-center font-medium">
                        Liberação via PIX ou Cartão usando AbacatePay.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Governança e Direitos do Titular (LGPD) */}
      <section className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 sm:p-6 border-b border-zinc-100 bg-zinc-50/50 flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-emerald-600" />
          <h3 className="font-bold text-zinc-800">Governança e Direitos do Titular (LGPD)</h3>
        </div>
        <div className="p-4 sm:p-6 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* DPO Channel */}
            <div className="bg-zinc-50 rounded-2xl p-6 border border-zinc-100 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-zinc-800">Encarregado de Dados (DPO)</h4>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Canal Direto LGPD</p>
                </div>
              </div>
              <p className="text-xs text-zinc-600 leading-relaxed">
                Para exercer seus direitos de acesso, retificação ou dúvidas sobre como tratamos seus dados, entre em contato com nosso Encarregado.
              </p>
              <div className="flex flex-wrap gap-2">
                <a 
                  href="tel:47997626121" 
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-zinc-200 text-zinc-700 rounded-xl text-xs font-bold hover:bg-zinc-50 transition-all"
                >
                  47 997626121
                </a>
                <a 
                  href="https://wa.me/5547997626121?text=Olá,%20gostaria%20de%20falar%20com%20o%20DPO%20sobre%20meus%20dados." 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-xl text-xs font-bold hover:bg-emerald-600 transition-all shadow-sm shadow-emerald-500/20"
                >
                  <Send className="w-4 h-4" />
                  WHATSAPP
                </a>
              </div>
            </div>

            {/* Deletion Rights */}
            <div className="bg-red-50/30 rounded-2xl p-6 border border-red-100 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center text-red-600">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-red-800">Direito ao Esquecimento</h4>
                  <p className="text-[10px] text-red-500 uppercase tracking-widest">Exclusão de Conta</p>
                </div>
              </div>
              <p className="text-xs text-red-700/70 leading-relaxed">
                Solicite a exclusão total e definitiva de todos os seus dados pessoais, históricos e documentos de nossos servidores. <strong>Esta ação não pode ser desfeita.</strong>
              </p>
              <button 
                onClick={handleDeleteAccount}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white border border-red-200 text-red-600 rounded-xl text-xs font-bold hover:bg-red-50 transition-all shadow-sm"
              >
                EXCLUIR TODOS OS MEUS DADOS
              </button>
            </div>
          </div>

          <div className="bg-zinc-50 rounded-2xl p-4 border border-blue-100">
            <div className="flex items-start gap-3">
              <ShieldAlert className="w-4 h-4 text-blue-600 mt-0.5" />
              <div className="space-y-1">
                <h5 className="text-[10px] font-black text-blue-900 uppercase tracking-widest">Compromisso com a Privacidade</h5>
                <p className="text-[10px] text-blue-800/70 leading-relaxed">
                  Nossa política de governança de dados assegura que suas informações são utilizadas exclusivamente para o funcionamento do sistema, 
                  com criptografia e backups seguros. Você possui total controle e transparência sobre o ciclo de vida dos seus dados.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="flex items-center justify-center gap-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
        <button 
          onClick={() => { setLegalTab('privacy'); setShowLegalModal(true); }}
          className="hover:text-zinc-600 transition-colors"
        >
          Privacidade
        </button>
        <span>•</span>
        <button 
          onClick={() => { setLegalTab('terms'); setShowLegalModal(true); }}
          className="hover:text-zinc-600 transition-colors"
        >
          Termos
        </button>
      </div>

      {/* Legal Modal for re-reading */}
      {showLegalModal && legalSettings && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] rounded-3xl overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95 duration-300">
            <div className="p-6 border-b border-zinc-100 bg-zinc-50/50 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-800 uppercase tracking-wider">
                    {legalTab === 'privacy' ? 'Política de Privacidade' : 'Termos de Uso'}
                  </h3>
                  <p className="text-[10px] text-zinc-500">Versão {legalSettings.version} • Atualizado em {new Date(legalSettings.updated_at).toLocaleDateString()}</p>
                </div>
              </div>
              <button 
                onClick={() => setShowLegalModal(false)}
                className="p-2 hover:bg-zinc-100 rounded-full text-zinc-400 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 bg-zinc-50/30">
              <div className="prose prose-sm max-w-none text-zinc-600">
                {/* We use a simple pre-wrap for now or could import ReactMarkdown if needed, 
                    but since it's already used in LegalConfirmationModal, we'll just show it simply here 
                    to avoid adding more dependencies if not needed, but wait, we already have react-markdown */}
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                  {legalTab === 'privacy' ? legalSettings.privacy_policy : legalSettings.terms_of_use}
                </pre>
              </div>
            </div>
            <div className="p-4 border-t border-zinc-100 bg-white flex justify-end">
              <button 
                onClick={() => setShowLegalModal(false)}
                className="px-6 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 rounded-xl text-xs font-bold transition-all"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Viewer Modal */}
      {showViewer && profile?.documento_url && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="relative max-w-4xl w-full h-full flex flex-col items-center justify-center gap-4">
            <button 
              onClick={() => setShowViewer(false)}
              className="absolute top-0 right-0 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all"
            >
              <X className="w-6 h-6" />
            </button>
            <img 
              src={profile.documento_url} 
              alt="Documento" 
              className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl"
              referrerPolicy="no-referrer"
            />
            <p className="text-white font-bold text-sm tracking-widest uppercase">Visualização do Documento</p>
          </div>
        </div>
      )}
      
      <ConfirmationModal 
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        variant={confirmModal.variant}
        requiredText={confirmModal.requiredText}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
