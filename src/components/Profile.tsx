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
  Send,
  Copy,
  Check,
  QrCode
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { generatePixPayload } from '../lib/pix';
import { supabase } from '../lib/supabase';
import { compressImage } from '../lib/image-utils';
import { Profile, PaymentReceipt } from '../types';
import { cn, formatError } from '../lib/utils';
import { useNotifications } from './NotificationCenter';
import { ConfirmationModal } from './ConfirmationModal';
import { useBackButton } from '../hooks/useBackButton';
import { BackHandler } from '../lib/backHandler';

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

  const [paymentOption, setPaymentOption] = useState<'proportional' | 'full'>('proportional');
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedPayload, setCopiedPayload] = useState(false);

  // Cálculo do Pagamento Proporcional até o fechamento (dia 08)
  const proportionalInfo = (() => {
    const today = new Date();
    let next8th = new Date(today.getFullYear(), today.getMonth(), 8, 23, 59, 59);
    if (today.getDate() >= 8) {
      next8th.setMonth(next8th.getMonth() + 1);
    }
    const diffTime = next8th.getTime() - today.getTime();
    const remainingDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    // Valor diário aproximado: 39.99 / 30 = 1.333
    const calculated = (39.99 / 30) * remainingDays;
    const value = Math.min(39.99, Math.max(5.00, Number(calculated.toFixed(2))));
    return {
      days: remainingDays,
      value,
      nextDate: next8th,
      formattedDate: next8th.toLocaleDateString('pt-BR')
    };
  })();

  const currentPayAmount = paymentOption === 'proportional' ? proportionalInfo.value : 39.99;

  // Gerar QR Code e Pix Copia e Cola via padrão Banco Central
  const pixPayload = generatePixPayload(
    '26384051000158',
    'Anderson Rodrigues de morais',
    'Itapema',
    currentPayAmount,
    'ASSINATURA'
  );

  const handleCopyKey = () => {
    navigator.clipboard.writeText('26384051000158');
    setCopiedKey(true);
    addNotification({
      type: 'success',
      title: 'Chave PIX Copiada',
      message: 'Chave CNPJ 26.384.051/0001-58 copiada com sucesso!'
    });
    setTimeout(() => setCopiedKey(false), 2500);
  };

  const handleCopyPayload = () => {
    navigator.clipboard.writeText(pixPayload);
    setCopiedPayload(true);
    addNotification({
      type: 'success',
      title: 'Pix Copia e Cola Copiado',
      message: 'Código PIX Copia e Cola copiado com sucesso! Abra o app do seu banco para colar.'
    });
    setTimeout(() => setCopiedPayload(false), 2500);
  };

  const [backButtonProtection, setBackButtonProtection] = useState(() => {
    return localStorage.getItem('android_back_protection') !== 'false';
  });

  const toggleBackButtonProtection = () => {
    const nextVal = !backButtonProtection;
    setBackButtonProtection(nextVal);
    BackHandler.setEnabled(nextVal);
    localStorage.setItem('android_back_protection', String(nextVal));
    addNotification({
      type: 'info',
      title: nextVal ? 'Bloqueio do Botão Voltar Ativo' : 'Bloqueio do Botão Voltar Desativado',
      message: nextVal 
        ? 'O botão Voltar do Android agora intercepta o fechamento e fecha modais/telas primeiro.'
        : 'A proteção contra fechamento acidental foi desativada.'
    });
  };

  useBackButton(() => {
    if (showViewer) {
      setShowViewer(false);
      return true;
    }
    if (showLegalModal) {
      setShowLegalModal(false);
      return true;
    }
    return false;
  }, showViewer || showLegalModal);
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

      {/* Botão Salvar Cadastro (abaixo da sessão de cadastro, antes da sessão pagamento) */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 sm:p-6 bg-white border border-zinc-200 rounded-2xl shadow-sm">
        <div className="space-y-1">
          <h4 className="text-sm font-bold text-zinc-800">Finalizou o preenchimento dos seus dados?</h4>
          <p className="text-xs text-zinc-500">Salve suas alterações cadastrais (dados pessoais, endereço e sua chave PIX de atendimento).</p>
        </div>
        <button 
          onClick={handleSave}
          disabled={saving}
          className="w-full sm:w-auto flex items-center justify-center gap-2 bg-[#38a89d] hover:bg-[#2d8a81] text-white px-8 py-3.5 rounded-xl font-bold transition-all shadow-md shadow-emerald-500/10 disabled:opacity-50 text-sm whitespace-nowrap cursor-pointer"
        >
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          Salvar Dados do Cadastro
        </button>
      </div>

      {/* Sessão de Pagamento da Assinatura do Sistema (PIX) */}
      <section className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 sm:p-6 border-b border-zinc-100 bg-zinc-50/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-zinc-800">Pagamento da Assinatura do Sistema</h3>
              <p className="text-xs text-zinc-500">Liberação de acesso via PIX com ativação rápida</p>
            </div>
          </div>
          <span className="text-xs font-mono font-bold bg-emerald-100 text-emerald-700 px-3 py-1 rounded-lg uppercase">
            {profile?.role === 'admin' ? 'Administrador' : (isTrial ? 'Período de Teste' : 'Assinatura')}
          </span>
        </div>

        <div className="p-4 sm:p-6 space-y-6">
          {/* Status e Identificador de Acesso */}
          <div className="bg-zinc-50 rounded-2xl p-4 sm:p-5 border border-zinc-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">Status da Conta</span>
              <p className="text-base font-bold text-zinc-800 flex items-center gap-2">
                {profile?.role === 'admin' ? 'Acesso Total Administrador' : (['pro', 'starter'].includes(profile?.plano_tipo) ? 'Assinatura Mensal Ativa' : (isTrial ? 'Período de Teste Ativo' : (profile?.access_key_code ? 'Assinatura Liberada' : 'Aguardando Ativação')))}
              </p>
              {profile?.vencimento && (
                <p className="text-xs text-zinc-500">
                  Vencimento atual: <strong className="text-zinc-700">{new Date(profile.vencimento).toLocaleDateString()}</strong>
                </p>
              )}
              {isTrial && (
                <p className={cn("text-xs font-bold", diffDays > 1 ? "text-blue-600" : (diffDays === 1 ? "text-amber-600" : "text-red-600"))}>
                  {diffDays > 1 ? `Faltam ${diffDays} dias para o fim do seu teste grátis` : (diffDays === 1 ? 'Seu teste termina amanhã' : 'Teste grátis expirado')}
                </p>
              )}
            </div>

            <div className="md:w-72 space-y-1">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Identificador de Acesso
              </span>
              <input 
                type="text" 
                readOnly
                value={profile?.access_key_code || (['pro', 'starter'].includes(profile?.plano_tipo) ? 'ASSINATURA_MENSAL' : 'LIBERACAO_PENDENTE')} 
                className="w-full bg-white border border-zinc-200 rounded-xl px-3.5 py-2 text-xs font-mono text-zinc-600 outline-none shadow-sm cursor-not-allowed"
              />
              <p className="text-[10px] text-zinc-400">Liberação confirmada após envio do comprovante.</p>
            </div>
          </div>

          {/* 1. Seletor de Modalidade: Proporcional vs Completa */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-zinc-800">1. Escolha a Modalidade de Pagamento</h4>
              <span className="text-xs text-zinc-400 font-medium">Fechamento do mês: Todo dia 08</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Opção Proporcional */}
              <button
                type="button"
                onClick={() => setPaymentOption('proportional')}
                className={cn(
                  "p-4 rounded-2xl border-2 text-left transition-all relative flex flex-col justify-between cursor-pointer",
                  paymentOption === 'proportional'
                    ? "bg-emerald-50/50 border-emerald-500 shadow-sm"
                    : "bg-white border-zinc-200 hover:border-zinc-300"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
                      Novos Assinantes
                    </span>
                    <h5 className="font-bold text-zinc-800 text-sm mt-1.5">Pagamento Proporcional (Até dia 08)</h5>
                    <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                      Pague somente pelos <strong>{proportionalInfo.days} dias</strong> restantes até o fechamento fixo do sistema em {proportionalInfo.formattedDate}.
                    </p>
                  </div>
                  <div className={cn(
                    "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5",
                    paymentOption === 'proportional' ? "border-emerald-600 bg-emerald-600" : "border-zinc-300"
                  )}>
                    {paymentOption === 'proportional' && <Check className="w-3 h-3 text-white" />}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-zinc-100 flex items-baseline gap-1">
                  <span className="text-xs font-bold text-zinc-500">R$</span>
                  <span className="text-2xl font-black text-emerald-600 font-mono tabular-nums">
                    {proportionalInfo.value.toFixed(2).replace('.', ',')}
                  </span>
                  <span className="text-[11px] text-zinc-400 font-medium ml-1">proporcional até dia 08</span>
                </div>
              </button>

              {/* Opção Integral */}
              <button
                type="button"
                onClick={() => setPaymentOption('full')}
                className={cn(
                  "p-4 rounded-2xl border-2 text-left transition-all relative flex flex-col justify-between cursor-pointer",
                  paymentOption === 'full'
                    ? "bg-purple-50/50 border-purple-500 shadow-sm"
                    : "bg-white border-zinc-200 hover:border-zinc-300"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 bg-purple-100 px-2 py-0.5 rounded-md">
                      Mensalidade Completa
                    </span>
                    <h5 className="font-bold text-zinc-800 text-sm mt-1.5">Pagamento Completo (30 Dias)</h5>
                    <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                      Acesso integral por 30 dias completos para renovação regular da sua assinatura.
                    </p>
                  </div>
                  <div className={cn(
                    "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5",
                    paymentOption === 'full' ? "border-purple-600 bg-purple-600" : "border-zinc-300"
                  )}>
                    {paymentOption === 'full' && <Check className="w-3 h-3 text-white" />}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-zinc-100 flex items-baseline gap-1">
                  <span className="text-xs font-bold text-zinc-500">R$</span>
                  <span className="text-2xl font-black text-purple-600 font-mono tabular-nums">
                    39,99
                  </span>
                  <span className="text-[11px] text-zinc-400 font-medium ml-1">/mês completo</span>
                </div>
              </button>
            </div>
          </div>

          {/* 2. QR Code e Chave PIX */}
          <div className="bg-zinc-50 rounded-2xl p-4 sm:p-6 border border-zinc-100 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-200/80 pb-3">
              <div>
                <h4 className="text-sm font-bold text-zinc-800">2. Pague via PIX com QR Code ou Copia e Cola</h4>
                <p className="text-xs text-zinc-500">
                  Valor a pagar: <strong className="text-emerald-700 text-sm font-bold font-mono">R$ {currentPayAmount.toFixed(2).replace('.', ',')}</strong>
                </p>
              </div>
              <div className="text-left sm:text-right">
                <span className="text-[10px] text-zinc-400 uppercase tracking-widest block">Beneficiário da Conta</span>
                <span className="text-xs font-bold text-zinc-800">Anderson Rodrigues de morais</span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              {/* QR Code Container */}
              <div className="lg:col-span-5 flex flex-col items-center justify-center">
                <div className="p-4 bg-white rounded-2xl border border-zinc-200 shadow-sm flex flex-col items-center">
                  <QRCodeSVG 
                    value={pixPayload} 
                    size={190}
                    level="M"
                    includeMargin={false}
                  />
                  <p className="text-[10px] text-zinc-400 mt-2 font-medium flex items-center gap-1">
                    <QrCode className="w-3.5 h-3.5 text-emerald-600" /> Escaneie com o aplicativo do seu banco
                  </p>
                </div>
              </div>

              {/* Chaves e Copia e Cola */}
              <div className="lg:col-span-7 space-y-4">
                {/* Chave CNPJ */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center justify-between">
                    <span>Chave PIX (CNPJ)</span>
                    <span className="text-zinc-600 font-medium">Anderson Rodrigues de morais</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input 
                      type="text" 
                      readOnly 
                      value="26.384.051/0001-58"
                      className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-2.5 text-xs font-mono font-bold text-zinc-800 outline-none shadow-sm cursor-text"
                    />
                    <button
                      type="button"
                      onClick={handleCopyKey}
                      className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-900 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 shadow-sm cursor-pointer"
                    >
                      {copiedKey ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      {copiedKey ? 'Copiado!' : 'Copiar CNPJ'}
                    </button>
                  </div>
                </div>

                {/* Código Pix Copia e Cola */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center justify-between">
                    <span>Código PIX Copia e Cola</span>
                    <span className="text-emerald-600 font-bold font-mono">R$ {currentPayAmount.toFixed(2).replace('.', ',')}</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input 
                      type="text" 
                      readOnly 
                      value={pixPayload}
                      className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-2.5 text-xs font-mono text-zinc-500 truncate outline-none shadow-sm cursor-text"
                    />
                    <button
                      type="button"
                      onClick={handleCopyPayload}
                      className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 shadow-sm shadow-emerald-600/20 cursor-pointer"
                    >
                      {copiedPayload ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      {copiedPayload ? 'Copiado!' : 'Copiar Código'}
                    </button>
                  </div>
                  <p className="text-[10px] text-zinc-400">
                    Copie este código e use a opção <strong>"PIX Copia e Cola"</strong> no aplicativo do seu banco.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 3. Envio da Foto do Comprovante */}
          <div className="space-y-4 pt-2">
            <h4 className="text-sm font-bold text-zinc-800">3. Envie a Foto do Comprovante de Pagamento</h4>
            
            <div className="bg-white border border-zinc-200 rounded-2xl p-5 shadow-sm space-y-4">
              <label className="block cursor-pointer">
                <span className="sr-only">Escolher foto do comprovante</span>
                <div className={cn(
                  "w-full flex flex-col items-center justify-center gap-3 py-7 border-2 border-dashed rounded-2xl transition-all",
                  uploadingReceipt 
                    ? "bg-zinc-50 border-zinc-200 cursor-not-allowed" 
                    : "bg-emerald-50/30 border-emerald-300 hover:bg-emerald-50/60 hover:border-emerald-400"
                )}>
                  {uploadingReceipt ? (
                    <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 shadow-sm">
                      <Upload className="w-6 h-6" />
                    </div>
                  )}
                  <div className="text-center">
                    <p className="text-sm font-bold text-zinc-800">
                      {uploadingReceipt ? 'Enviando comprovante...' : 'Clique para selecionar a foto ou PDF do comprovante'}
                    </p>
                    <p className="text-[11px] text-zinc-400 mt-0.5">Formatos suportados: PNG, JPG ou PDF (máx. 5MB)</p>
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

              {/* Lista de Comprovantes Enviados */}
              {receipts.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-zinc-100">
                  <h5 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                    Meus Comprovantes Enviados ({receipts.length})
                  </h5>
                  <div className="grid grid-cols-1 gap-2">
                    {receipts.map((receipt) => (
                      <div key={receipt.id} className="bg-zinc-50 border border-zinc-200/80 rounded-xl p-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center",
                            receipt.status === 'approved' ? "bg-emerald-100 text-emerald-700" :
                            receipt.status === 'rejected' ? "bg-red-100 text-red-700" :
                            "bg-amber-100 text-amber-700"
                          )}>
                            <FileText className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-zinc-800">
                              Enviado em {new Date(receipt.created_at).toLocaleDateString()} às {new Date(receipt.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                            <span className={cn(
                              "text-[10px] font-bold uppercase tracking-wider inline-block",
                              receipt.status === 'approved' ? "text-emerald-600" :
                              receipt.status === 'rejected' ? "text-red-600" :
                              "text-amber-600"
                            )}>
                              {receipt.status === 'approved' ? '✓ Aprovado e Liberado' : 
                               receipt.status === 'rejected' ? '✗ Reprovado' : 
                               '⏳ Em Análise pelo Administrador'}
                            </span>
                            {receipt.status === 'rejected' && receipt.rejection_reason && (
                              <p className="text-[10px] text-red-600 mt-0.5">Motivo: {receipt.rejection_reason}</p>
                            )}
                          </div>
                        </div>

                        <a 
                          href={receipt.receipt_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 bg-white border border-zinc-200 hover:bg-zinc-100 rounded-lg text-xs font-bold text-zinc-700 transition-colors flex items-center gap-1 shadow-sm"
                        >
                          <Eye className="w-3.5 h-3.5" /> Ver
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Comportamento do Aplicativo no Celular / Android */}
      <section className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 sm:p-6 border-b border-zinc-100 bg-zinc-50/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-zinc-800">Botão Voltar & Navegação Android</h3>
              <p className="text-xs text-zinc-500">Controle do comportamento do botão físico e gestos de voltar</p>
            </div>
          </div>

          <button
            onClick={toggleBackButtonProtection}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
              backButtonProtection 
                ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/20 hover:bg-emerald-600" 
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
            )}
          >
            <span className={cn(
              "w-2 h-2 rounded-full",
              backButtonProtection ? "bg-white animate-pulse" : "bg-zinc-400"
            )} />
            {backButtonProtection ? 'Proteção Ativa' : 'Proteção Desativada'}
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-100 flex flex-col gap-1">
              <span className="text-xs font-bold text-zinc-800">1. Fechamento de Modais</span>
              <p className="text-[11px] text-zinc-500">
                Pressionar "Voltar" fecha a gaveta lateral, caixas de diálogo ou telas abertas sem sair do app.
              </p>
            </div>
            <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-100 flex flex-col gap-1">
              <span className="text-xs font-bold text-zinc-800">2. Histórico de Abas</span>
              <p className="text-[11px] text-zinc-500">
                Retorna para a tela visitada anteriormente antes de ir para a página inicial.
              </p>
            </div>
            <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-100 flex flex-col gap-1">
              <span className="text-xs font-bold text-zinc-800">3. Confirmação para Sair</span>
              <p className="text-[11px] text-zinc-500">
                Na página inicial, exige toque duplo com aviso sonoro/visual para fechar o aplicativo.
              </p>
            </div>
          </div>

          <p className="text-xs text-zinc-400">
            Dica: No Android instalado (PWA ou navegador), esta proteção impede o encerramento acidental do sistema durante o acerto de sacolas ou preenchimento de dados.
          </p>
        </div>
      </section>

      {/* Governança e Direitos do Titular (LGPD) */}
      <section className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 sm:p-6 border-b border-zinc-100 bg-zinc-50/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-zinc-800">Governança e Direitos do Titular (LGPD)</h3>
              <p className="text-xs text-zinc-500">Conformidade integral com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018)</p>
            </div>
          </div>
          <span className="text-[10px] font-bold font-mono text-zinc-400 uppercase tracking-widest bg-zinc-100 px-2.5 py-1 rounded-lg">
            LEI Nº 13.709/2018
          </span>
        </div>

        <div className="p-4 sm:p-6 space-y-6">
          {/* Destaque Explicito: Direito à Exclusão / Eliminação dos Dados (Art. 18, VI da LGPD) */}
          <div className="bg-red-50/50 rounded-2xl p-5 sm:p-6 border border-red-200 space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center text-red-600 shrink-0 mt-0.5">
                <Trash2 className="w-6 h-6" />
              </div>
              <div className="space-y-1.5 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-base font-bold text-red-900">
                    Direito à Exclusão e Eliminação Definitiva de Dados Pessoais
                  </h4>
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-700 px-2 py-0.5 rounded-md">
                    Art. 18, Inciso VI da LGPD
                  </span>
                </div>
                <p className="text-xs text-red-800/80 leading-relaxed">
                  Conforme assegurado pelo <strong>Artigo 18, inciso VI da Lei Geral de Proteção de Dados (LGPD)</strong>, você tem o direito inalienável de solicitar a <strong>eliminação total e definitiva</strong> de todos os seus dados pessoais e dados de terceiros tratados sob o seu consentimento nesta plataforma.
                </p>
              </div>
            </div>

            <div className="bg-white/90 border border-red-100 rounded-xl p-4 space-y-2 text-xs text-zinc-700">
              <p className="font-bold text-zinc-800">Garantias e escopo da exclusão:</p>
              <ul className="list-disc list-inside space-y-1 text-zinc-600 pl-1">
                <li>Eliminação do seu login de acesso, dados cadastrais, e-mail e identificadores;</li>
                <li>Exclusão permanente de todos os clientes, contatos, sacolas consignadas e acertos vinculados;</li>
                <li>Remoção definitiva de fotos de documentos pessoais e comprovantes de pagamento do armazenamento em nuvem;</li>
                <li>Operação irreversível: após confirmada, nenhum dado poderá ser recuperado.</li>
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
              <p className="text-[11px] text-zinc-500 italic">
                * Para sua segurança contra exclusões acidentais, será exigida a digitação da palavra "EXCLUIR".
              </p>
              <button 
                onClick={handleDeleteAccount}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm shadow-red-600/20 whitespace-nowrap cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                Solicitar Exclusão Definitiva dos Meus Dados (LGPD)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Canal do DPO */}
            <div className="bg-zinc-50 rounded-2xl p-5 border border-zinc-100 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-zinc-800">Encarregado de Dados (DPO)</h4>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Canal Direto de Atendimento LGPD</p>
                </div>
              </div>
              <p className="text-xs text-zinc-600 leading-relaxed">
                Para exercer seus direitos de confirmação de tratamento, acesso, correção ou revogação de consentimento, fale diretamente com nosso Encarregado de Proteção de Dados:
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <a 
                  href="tel:47997626121" 
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-zinc-200 text-zinc-700 rounded-xl text-xs font-bold hover:bg-zinc-50 transition-all"
                >
                  47 997626121
                </a>
                <a 
                  href="https://wa.me/5547997626121?text=Olá,%20gostaria%20de%20falar%20com%20o%20DPO%20sobre%20meus%20dados%20conforme%20a%20LGPD." 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-xl text-xs font-bold hover:bg-emerald-600 transition-all shadow-sm shadow-emerald-500/20"
                >
                  <Send className="w-4 h-4" />
                  WHATSAPP DO DPO
                </a>
              </div>
            </div>

            {/* Compromisso com a Privacidade */}
            <div className="bg-zinc-50 rounded-2xl p-5 border border-zinc-100 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-zinc-800">Segurança & Criptografia</h4>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Proteção Técnica de Dados</p>
                </div>
              </div>
              <p className="text-xs text-zinc-600 leading-relaxed">
                Suas informações de negócio e de clientes são tratadas com criptografia SSL/TLS, políticas rigorosas de isolamento por usuário (Row Level Security) e backups diários para garantir confidencialidade absoluta.
              </p>
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
