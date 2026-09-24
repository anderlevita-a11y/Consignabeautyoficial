import React, { useEffect, useState } from 'react';
import { 
  Users, 
  ShieldCheck, 
  Lock,
  Loader2,
  CheckCircle2,
  Upload,
  FileSpreadsheet,
  AlertCircle,
  FileText,
  Save,
  Shield,
  Lightbulb,
  Trash2,
  Calendar,
  X,
  Eye,
  Check,
  XCircle,
  Clock,
  Archive,
  ArchiveRestore,
  MessageSquare
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Profile, AppLegalSettings, DailyInsight, PaymentReceipt } from '../types';
import { cn, formatError } from '../lib/utils';
import { ConfirmationModal } from './ConfirmationModal';
import { useNotifications } from './NotificationCenter';

export function AdminPanel({ currentProfile }: { currentProfile: Profile | null }) {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [excelData, setExcelData] = useState('');
  const [centralProducts, setCentralProducts] = useState<any[]>([]);
  const [loadingCentral, setLoadingCentral] = useState(false);
  const [schemaErrors, setSchemaErrors] = useState<string[]>([]);
  const [activeSection, setActiveSection] = useState<'users' | 'legal' | 'insights' | 'receipts' | 'favorita'>('users');
  const [showArchived, setShowArchived] = useState(false);
  
  // Favorita State
  const [favoritaProducts, setFavoritaProducts] = useState<{
    novos: any[];
    alterados: any[];
  }>({ novos: [], alterados: [] });
  const [loadingFavorita, setLoadingFavorita] = useState(false);

  // Receipts State
  const [receipts, setReceipts] = useState<PaymentReceipt[]>([]);
  const [loadingReceipts, setLoadingReceipts] = useState(false);
  const [legalSettings, setLegalSettings] = useState<AppLegalSettings | null>(null);
  const [savingLegal, setSavingLegal] = useState(false);

  // Daily Insights State
  const [dailyInsights, setDailyInsights] = useState<DailyInsight[]>([]);
  const [insightText, setInsightText] = useState('');
  const [savingInsights, setSavingInsights] = useState(false);
  const [syncingFavorita, setSyncingFavorita] = useState(false);
  const [expiredUsersModal, setExpiredUsersModal] = useState<{
    isOpen: boolean;
    users: Profile[];
    selectedIds: string[];
  }>({
    isOpen: false,
    users: [],
    selectedIds: []
  });
  const [expirationModal, setExpirationModal] = useState<{
    isOpen: boolean;
    userId: string;
    userName: string;
    paymentDate: string;
  }>({
    isOpen: false,
    userId: '',
    userName: '',
    paymentDate: new Date().toISOString().split('T')[0]
  });
  const { addNotification } = useNotifications();

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

  useEffect(() => {
    fetchData();
    fetchCentralProducts();
    fetchLegalSettings();
    fetchDailyInsights();
    fetchReceipts();
    fetchFavoritaReport();

    // Real-time subscriptions for immediate updates
    const profilesSubscription = supabase
      .channel('admin-profiles')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => fetchData())
      .subscribe();

    return () => {
      profilesSubscription.unsubscribe();
    };
  }, []);

  async function fetchReceipts() {
    setLoadingReceipts(true);
    const { data, error } = await supabase
      .from('payment_receipts')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (data) setReceipts(data);
    setLoadingReceipts(false);
  }

  async function handleUpdateReceiptStatus(id: string, status: 'approved' | 'rejected', reason?: string) {
    const updates: any = { status };
    if (reason) updates.rejection_reason = reason;

    const { error } = await supabase
      .from('payment_receipts')
      .update(updates)
      .eq('id', id);

    if (error) {
      addNotification({
        type: 'error',
        title: 'Erro ao atualizar',
        message: formatError(error)
      });
    } else {
      addNotification({
        type: 'success',
        title: 'Status Atualizado',
        message: `Comprovante ${status === 'approved' ? 'aprovado' : 'reprovado'} com sucesso.`
      });
      fetchReceipts();
    }
  }

  async function fetchData() {
    const { data, error } = await supabase.from('profiles').select('*').order('nome');
    if (data) setUsers(data);
    
    // Check for schema issues
    const errors: string[] = [];
    
    // Check customers table for status column
    const { error: custError } = await supabase.from('customers').select('status').limit(1);
    if (custError && custError.message.includes('status')) {
      errors.push("A coluna 'status' está faltando na tabela 'customers'.");
    }

    // Check profiles table for pix columns and vencimento
    const { error: profError } = await supabase.from('profiles').select('pix_key, pix_beneficiary, vencimento, is_archived').limit(1);
    if (profError && (profError.message.includes('pix_key') || profError.message.includes('pix_beneficiary') || profError.message.includes('vencimento') || profError.message.includes('is_archived'))) {
      errors.push("As colunas 'pix_key', 'pix_beneficiary', 'vencimento' ou 'is_archived' estão faltando na tabela 'profiles'.");
    }

    // Check products table for photo_url, has_grid, label_name, and ean_variations
    const { error: prodError } = await supabase.from('products').select('photo_url, has_grid, label_name, ean_variations').limit(1);
    if (prodError && (prodError.message.includes('photo_url') || prodError.message.includes('has_grid') || prodError.message.includes('label_name') || prodError.message.includes('ean_variations'))) {
      errors.push("As colunas 'photo_url', 'has_grid', 'label_name' ou 'ean_variations' estão faltando na tabela 'products'.");
    }

    // Check if central_products table exists and has ean_variations
    const { error: centralError } = await supabase.from('central_products').select('id, ean_variations').limit(1);
    if (centralError) {
      if (centralError.message.includes('does not exist')) {
        errors.push("A tabela 'central_products' não existe.");
      } else if (centralError.message.includes('ean_variations')) {
        errors.push("A coluna 'ean_variations' está faltando na tabela 'central_products'.");
      }
    }

    // Check if produtos_favorita table exists
    const { error: favoritaError } = await supabase.from('produtos_favorita').select('id').limit(1);
    if (favoritaError && favoritaError.message.includes('does not exist')) {
      errors.push("A tabela 'produtos_favorita' não existe.");
    }

    // Check if payment_receipts table exists and has rejection_reason
    const { error: receiptError } = await supabase.from('payment_receipts').select('rejection_reason').limit(1);
    if (receiptError) {
      if (receiptError.message.includes('does not exist')) {
        errors.push("A tabela 'payment_receipts' não existe.");
      } else if (receiptError.message.includes('rejection_reason')) {
        errors.push("A coluna 'rejection_reason' está faltando na tabela 'payment_receipts'.");
      }
    }

    // Check if bags table has notes column
    const { error: bagColumnError } = await supabase.from('bags').select('notes, installments').limit(1);
    if (bagColumnError && !bagColumnError.message.includes('0 rows')) {
      if (bagColumnError.message.includes('notes') || bagColumnError.message.includes('reseller_name')) {
        errors.push("A tabela 'bags' precisa ser atualizada (coluna 'notes' faltando ou 'reseller_name' ainda presente).");
      }
      if (bagColumnError.message.includes('installments')) {
        errors.push("A coluna 'installments' está faltando na tabela 'bags'.");
      }
    }

    // Check if miscellaneous_charges table exists
    const { error: miscError } = await supabase.from('miscellaneous_charges').select('id').limit(1);
    if (miscError && miscError.message.includes('does not exist')) {
      errors.push("A tabela 'miscellaneous_charges' não existe.");
    }

    // Check if miscellaneous_charge_installments table exists
    const { error: instError } = await supabase.from('miscellaneous_charge_installments').select('id').limit(1);
    if (instError && instError.message.includes('does not exist')) {
      errors.push("A tabela 'miscellaneous_charge_installments' não existe.");
    }

    // Check miscellaneous_charges columns
    const { error: miscColumnError } = await supabase.from('miscellaneous_charges').select('installments_count, apply_late_fees, original_due_date').limit(1);
    if (miscColumnError) {
      if (miscColumnError.message.includes('column') && miscColumnError.message.includes('installments_count')) {
        errors.push("A coluna 'installments_count' está faltando na tabela 'miscellaneous_charges'.");
      }
      if (miscColumnError.message.includes('column') && miscColumnError.message.includes('apply_late_fees')) {
        errors.push("A coluna 'apply_late_fees' está faltando na tabela 'miscellaneous_charges'.");
      }
      if (miscColumnError.message.includes('column') && miscColumnError.message.includes('original_due_date')) {
        errors.push("A coluna 'original_due_date' está faltando na tabela 'miscellaneous_charges'.");
      }
    }

    // Check products for image_urls
    const { error: prodColError } = await supabase.from('products').select('image_urls').limit(1);
    if (prodColError && prodColError.message.includes('column') && prodColError.message.includes('image_urls')) {
      errors.push("A coluna 'image_urls' está faltando na tabela 'products'.");
    }

    setSchemaErrors(errors);
    setLoading(false);
  }

  async function fetchDailyInsights() {
    try {
      const { data, error } = await supabase
        .from('daily_insights')
        .select('*')
        .order('order_index', { ascending: true });
      
      if (error) throw error;
      setDailyInsights(data || []);
    } catch (err) {
      console.error('Error fetching daily insights:', err);
    }
  }

  const handleSaveInsights = async () => {
    if (!insightText.trim()) {
      addNotification({
        type: 'error',
        title: 'Erro',
        message: 'Por favor, insira o texto das dicas.'
      });
      return;
    }

    setSavingInsights(true);
    try {
      // Parse the text into items
      // Regex to match items starting with emoji numbers
      const items = insightText.match(/\d+️⃣[\s\S]*?(?=\d+️⃣|$)/g);
      
      if (!items || items.length === 0) {
        throw new Error('Nenhum item válido encontrado. Certifique-se de usar o formato correto (ex: 1️⃣ Título...)');
      }

      const parsedInsights = items.map((content, index) => ({
        content: content.trim(),
        order_index: index
      }));

      // Insert into database
      const { error } = await supabase
        .from('daily_insights')
        .insert(parsedInsights);

      if (error) throw error;

      addNotification({
        type: 'success',
        title: 'Sucesso',
        message: `${parsedInsights.length} dicas adicionadas com sucesso!`
      });
      setInsightText('');
      fetchDailyInsights();
    } catch (err: any) {
      console.error('Error saving insights:', err);
      addNotification({
        type: 'error',
        title: 'Erro ao salvar dicas',
        message: formatError(err)
      });
    } finally {
      setSavingInsights(false);
    }
  };

  const handleClearInsights = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Limpar Dicas',
      message: 'Deseja excluir todas as dicas do banco de dados? Esta ação não pode ser desfeita.',
      variant: 'danger',
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from('daily_insights')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

          if (error) throw error;

          addNotification({
            type: 'success',
            title: 'Sucesso',
            message: 'Banco de dicas limpo com sucesso!'
          });
          fetchDailyInsights();
        } catch (err: any) {
          console.error('Error clearing insights:', err);
          addNotification({
            type: 'error',
            title: 'Erro ao limpar dicas',
            message: formatError(err)
          });
        } finally {
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  async function initializeLegalSettings() {
    const defaultPrivacy = `Política de Privacidade | Consigna Beauty (Versão Beta)
Bem-vindo ao Consigna Beauty. Esta Política de Privacidade explica como coletamos, usamos e protegemos suas informações. Por se tratar de uma versão Beta, este documento reflete nosso compromisso com a transparência enquanto aprimoramos nossas funcionalidades.
1. Aviso de Versão Beta
O Consigna Beauty está atualmente em sua fase de testes (Beta). Isso significa que o aplicativo está em constante desenvolvimento. O usuário declara estar ciente de que:
•	Funcionalidades podem ser alteradas ou removidas sem aviso prévio.
•	Podem ocorrer instabilidades técnicas pontuais.
•	A coleta de dados visa, prioritariamente, a melhoria da experiência e correção de falhas.
2. Dados Coletados e Finalidade
Coletamos apenas os dados estritamente necessários para o funcionamento do serviço:
•	Dados de Cadastro: Nome completo, e-mail e telefone (para identificação e login).
•	Dados de Uso: Informações sobre como você interage com o app, logs de erros e performance (para melhoria técnica da versão Beta).
•	Finalidade: Prestação dos serviços de consignação, suporte ao usuário e comunicações sobre atualizações do sistema.
3. Direitos do Usuário (LGPD)
Em conformidade com a LGPD, você possui os seguintes direitos:
1.	Acesso: Confirmar se tratamos seus dados e acessá-los.
2.	Correção: Solicitar a alteração de dados incompletos ou inexatos.
3.	Exclusão: Solicitar a eliminação de seus dados pessoais (salvo obrigações legais de guarda).
4.	Revogação de Consentimento: Optar por não autorizar mais o uso de seus dados.
4. Segurança e Compartilhamento
Empregamos medidas técnicas de segurança para proteger seus dados contra acessos não autorizados. Não comercializamos seus dados pessoais. O compartilhamento ocorre apenas com parceiros essenciais (ex: serviços de hospedagem) ou por determinação judicial.
________________________________________
5. Responsabilidade Legal e Contato
O responsável pelo tratamento de dados e pelas decisões referentes à plataforma é:
•	Responsável Legal: Anderson Rodrigues de Morais
•	Canal de Atendimento: [Inserir E-mail de Suporte aqui]
6. Foro e Legislação Aplicável
Esta Política é regida pelas leis da República Federativa do Brasil. Para a solução de eventuais controvérsias decorrentes deste documento, fica eleito o Foro da Comarca de Itapema, com exclusão de qualquer outro, por mais privilegiado que seja.
________________________________________
Última atualização: 23 de fevereiro de 2026.`;

    const defaultTerms = `Termos de Uso | Consigna Beauty (Versão Beta)
Este documento estabelece as regras para o uso do aplicativo Consigna Beauty. Ao acessar ou utilizar nossa plataforma, você concorda integralmente com estes termos.
1. Objeto e Natureza do Serviço
O Consigna Beauty é uma plataforma destinada à gestão de produtos em regime de consignação para o setor de beleza.
AVISO DE VERSÃO BETA: O usuário compreende que o aplicativo está em estágio experimental. O objetivo desta fase é identificar falhas e coletar feedbacks. Portanto, o serviço é fornecido "como está", sem garantias de funcionamento ininterrupto ou livre de erros.
2. Elegibilidade e Cadastro
•	Para utilizar o app, o usuário deve realizar um cadastro fornecendo informações verídicas.
•	A segurança da senha é de responsabilidade exclusiva do usuário.
•	O acesso pode ser suspenso caso detectemos informações falsas ou uso indevido.
3. Responsabilidades do Usuário
Ao utilizar o Consigna Beauty, você se compromete a:
•	Não utilizar a plataforma para fins ilícitos.
•	Não realizar engenharia reversa ou tentar invadir os sistemas do app.
•	Reportar falhas ou "bugs" encontrados para a equipe de desenvolvimento, contribuindo com a evolução do produto.
4. Limitação de Responsabilidade
Considerando a natureza Beta do software:
•	O Consigna Beauty e seu responsável legal, Anderson Rodrigues de Morais, não se responsabilizam por eventuais perdas de dados, lucros cessantes ou interrupções de negócios decorrentes de falhas técnicas durante o período de testes.
•	Recomendamos que o usuário mantenha um backup externo de suas informações essenciais.
5. Propriedade Intelectual
Todo o conteúdo, design, código-fonte e marcas associadas ao Consigna Beauty são de propriedade exclusiva de seus desenvolvedores e do responsável legal, protegidos pelas leis de direitos autorais e propriedade industrial.
6. Modificações e Encerramento
Reservamo-nos o direito de:
1.	Alterar estes Termos a qualquer momento para refletir melhorias no app.
2.	Encerrar a fase Beta e migrar para uma versão comercial/estável.
3.	Descontinuar funcionalidades sem aviso prévio.
7. Foro de Eleição
Para dirimir quaisquer controvérsias oriundas deste Termo, as partes elegem o Foro da Comarca de Itapema/SC, com renúncia expressa a qualquer outro, por mais privilegiado que seja.
________________________________________
Data da última atualização: 09 de marco. Responsável Legal: Anderson Rodrigues de Morais.`;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('app_legal_settings')
        .upsert({
          privacy_policy: defaultPrivacy,
          terms_of_use: defaultTerms,
          version: 1,
          updated_at: new Date().toISOString()
        });
      if (error) throw error;
      addNotification({
        type: 'success',
        title: 'Sucesso',
        message: 'Configurações legais inicializadas com sucesso!'
      });
      fetchLegalSettings();
    } catch (err: any) {
      addNotification({
        type: 'error',
        title: 'Erro ao inicializar',
        message: formatError(err)
      });
    } finally {
      setLoading(false);
    }
  }

  async function fetchCentralProducts() {
    setLoadingCentral(true);
    try {
      const { data, error } = await supabase
        .from('central_products')
        .select('*')
        .order('name');
      if (error) throw error;
      setCentralProducts(data || []);
    } catch (err) {
      console.error('Error fetching central products:', err);
    } finally {
      setLoadingCentral(false);
    }
  }

  async function fetchLegalSettings() {
    try {
      const { data, error } = await supabase
        .from('app_legal_settings')
        .select('*')
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      if (data) setLegalSettings(data);
    } catch (err) {
      console.error('Error fetching legal settings:', err);
    }
  }

  const handleSaveLegal = async () => {
    if (!legalSettings) return;
    setSavingLegal(true);
    try {
      const newVersion = (legalSettings.version || 0) + 1;
      const { error } = await supabase
        .from('app_legal_settings')
        .upsert({
          ...legalSettings,
          version: newVersion,
          updated_at: new Date().toISOString()
        });
      
      if (error) throw error;
      addNotification({
        type: 'success',
        title: 'Sucesso',
        message: 'Configurações legais atualizadas com sucesso! Todos os usuários serão notificados para aceitar a nova versão.'
      });
      fetchLegalSettings();
    } catch (err: any) {
      console.error('Error saving legal settings:', err);
      addNotification({
        type: 'error',
        title: 'Erro ao salvar',
        message: formatError(err)
      });
    } finally {
      setSavingLegal(false);
    }
  };

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
        } catch (err: any) {
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

  const toggleAdminRole = async (userId: string, currentRole: string | undefined) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    
    setConfirmModal({
      isOpen: true,
      title: 'Alterar Cargo',
      message: `Deseja alterar o cargo para ${newRole.toUpperCase()}?`,
      variant: 'warning',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        setLoading(true);
        try {
          const { error } = await supabase
            .from('profiles')
            .update({ role: newRole })
            .eq('id', userId);

          if (error) throw error;
          
          addNotification({
            type: 'success',
            title: 'Sucesso',
            message: `Cargo alterado para ${newRole.toUpperCase()} com sucesso!`
          });
          await fetchData();
        } catch (err: any) {
          console.error(err);
          addNotification({
            type: 'error',
            title: 'Erro ao alterar cargo',
            message: formatError(err)
          });
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const updateUserStatus = (userId: string, status: 'PRO' | 'STARTER' | 'PAGO' | 'PENDENTE' | 'TRIAL') => {
    const selectedUser = users.find(u => u.id === userId);
    if (!selectedUser) return;

    setConfirmModal({
      isOpen: true,
      title: 'Alterar Status',
      message: `Deseja alterar o status para ${status} para ${selectedUser.nome || selectedUser.email}?`,
      variant: 'warning',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        setLoading(true);
        try {
          const updates: any = { status_pagamento: status };
          
          const getNext8th = () => {
            const now = new Date();
            let next8th = new Date(now.getFullYear(), now.getMonth(), 8, 12, 0, 0);
            if (now.getDate() >= 8) {
              next8th.setMonth(next8th.getMonth() + 1);
            }
            return next8th.toISOString();
          };

          if (status === 'PRO') {
            updates.access_key_code = selectedUser.access_key_code || `PRO-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
            updates.plan = 'Pro';
            updates.plano_tipo = 'pro';
            updates.vencimento = getNext8th();
          } else if (status === 'STARTER') {
            updates.access_key_code = selectedUser.access_key_code || `START-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
            updates.plan = 'Starter';
            updates.plano_tipo = 'starter';
            updates.vencimento = getNext8th();
          } else if (status === 'PAGO') {
            updates.access_key_code = selectedUser.access_key_code || `KEY-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
            updates.plan = 'Standard';
            updates.plano_tipo = 'standard';
            updates.vencimento = null;
          } else if (status === 'TRIAL') {
            updates.access_key_code = selectedUser.access_key_code || `TRIAL-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
            updates.plan = 'Trial';
            updates.plano_tipo = 'trial';
            const trialEnd = new Date();
            trialEnd.setDate(trialEnd.getDate() + 7);
            updates.vencimento = trialEnd.toISOString();
          } else if (status === 'PENDENTE') {
            updates.access_key_code = null;
            updates.plan = null;
            updates.plano_tipo = null;
            updates.vencimento = null;
          }

          const { error } = await supabase
            .from('profiles')
            .update(updates)
            .eq('id', userId);

          if (error) throw error;
          
          addNotification({
            type: 'success',
            title: 'Sucesso',
            message: `Status alterado para ${status} com sucesso! Acesso liberado.`
          });
          await fetchData();
        } catch (err: any) {
          console.error(err);
          addNotification({
            type: 'error',
            title: 'Erro ao alterar status',
            message: formatError(err)
          });
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const handleUpdateExpiration = async () => {
    if (!expirationModal.userId) return;
    
    setLoading(true);
    try {
      const payDate = new Date(expirationModal.paymentDate + 'T12:00:00');
      let next8th = new Date(payDate.getFullYear(), payDate.getMonth(), 8, 12, 0, 0);
      
      if (payDate.getDate() >= 8) {
        next8th.setMonth(next8th.getMonth() + 1);
      }
      
      const { error } = await supabase
        .from('profiles')
        .update({ 
          vencimento: next8th.toISOString(),
          data_pagamento: expirationModal.paymentDate,
          status_pagamento: 'PAGO' // Assume it becomes PAGO when expiration is set
        })
        .eq('id', expirationModal.userId);

      if (error) throw error;
      
      addNotification({
        type: 'success',
        title: 'Vencimento Atualizado',
        message: `Vencimento de ${expirationModal.userName} definido para ${next8th.toLocaleDateString()}.`
      });
      
      setExpirationModal(prev => ({ ...prev, isOpen: false }));
      await fetchData();
    } catch (err: any) {
      console.error(err);
      addNotification({
        type: 'error',
        title: 'Erro ao atualizar vencimento',
        message: formatError(err)
      });
    } finally {
      setLoading(false);
    }
  };

  const blockExpiredUsers = async () => {
    setLoading(true);
    try {
      const now = new Date().toISOString();
      const { data: expiredUsers, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .lt('vencimento', now)
        .eq('is_blocked', false)
        .not('vencimento', 'is', null);

      if (fetchError) throw fetchError;

      if (!expiredUsers || expiredUsers.length === 0) {
        addNotification({
          type: 'info',
          title: 'Tudo em dia',
          message: 'Não há usuários com plano vencido para bloquear.'
        });
        return;
      }

      setExpiredUsersModal({
        isOpen: true,
        users: expiredUsers,
        selectedIds: expiredUsers.map(u => u.id) // Default to all selected
      });
    } catch (err: any) {
      console.error(err);
      addNotification({
        type: 'error',
        title: 'Erro ao buscar usuários vencidos',
        message: formatError(err)
      });
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmBlockExpired = async () => {
    if (expiredUsersModal.selectedIds.length === 0) return;

    setLoading(true);
    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ is_blocked: true })
        .in('id', expiredUsersModal.selectedIds);

      if (updateError) throw updateError;

      addNotification({
        type: 'success',
        title: 'Bloqueio Concluído',
        message: `${expiredUsersModal.selectedIds.length} usuários foram bloqueados por vencimento.`
      });
      
      setExpiredUsersModal(prev => ({ ...prev, isOpen: false }));
      await fetchData();
    } catch (err: any) {
      console.error(err);
      addNotification({
        type: 'error',
        title: 'Erro ao bloquear usuários',
        message: formatError(err)
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchFavoritaReport = async () => {
    setLoadingFavorita(true);
    try {
      const { data: novos, error: errorNovos } = await supabase
        .from('produtos_favorita')
        .select('*')
        .eq('status', 'novo')
        .order('ultima_atualizacao', { ascending: false });

      const { data: alterados, error: errorAlterados } = await supabase
        .from('produtos_favorita')
        .select('*')
        .eq('status', 'alterado')
        .order('ultima_atualizacao', { ascending: false });

      if (errorNovos) throw errorNovos;
      if (errorAlterados) throw errorAlterados;

      setFavoritaProducts({ 
        novos: novos || [], 
        alterados: alterados || [] 
      });
    } catch (err: any) {
      console.error('Error fetching Favorita report:', err);
      addNotification({
        type: 'error',
        title: 'Erro ao buscar relatório',
        message: formatError(err)
      });
    } finally {
      setLoadingFavorita(false);
    }
  };

  const handleSyncFavorita = async () => {
    setConfirmModal({
      isOpen: true,
      title: 'Sincronizar Favorita',
      message: 'Deseja iniciar a sincronização de produtos do site da Favorita? Este processo pode levar alguns minutos.',
      variant: 'info',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        setSyncingFavorita(true);
        try {
          const response = await fetch('/api/sync-favorita', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            }
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Servidor retornou um erro inesperado.' }));
            throw new Error(errorData.error || `Erro do servidor (${response.status})`);
          }

          const result = await response.json();

          if (result.success) {
            addNotification({
              type: 'success',
              title: 'Sincronização Concluída',
              message: `Novos: ${result.results.new}, Alterados: ${result.results.updated}, Sem Mudança: ${result.results.normal}, Erros: ${result.results.errors}`
            });
            await fetchFavoritaReport();
          } else {
            throw new Error(result.error || 'Erro desconhecido na sincronização');
          }
        } catch (err: any) {
          console.error('Error syncing Favorita:', err);
          let errorMessage = formatError(err);
          
          if (err.message === 'Failed to fetch') {
            errorMessage = 'O servidor backend não respondeu. Isso pode acontecer se ele ainda estiver iniciando, se houver um erro de configuração das chaves do Supabase no ambiente, ou se a requisição excedeu o tempo limite (Timeout). Tente novamente em alguns instantes.';
          }

          addNotification({
            type: 'error',
            title: 'Erro na Sincronização',
            message: errorMessage
          });
        } finally {
          setSyncingFavorita(false);
        }
      }
    });
  };

  const calculateProRated = (planPrice: number, paymentDate: string) => {
    const payDate = new Date(paymentDate + 'T12:00:00');
    let next8th = new Date(payDate.getFullYear(), payDate.getMonth(), 8, 12, 0, 0);
    
    if (payDate.getDate() >= 8) {
      next8th.setMonth(next8th.getMonth() + 1);
    }
    
    const diffTime = next8th.getTime() - payDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    // Standard month is 30 days for calculation
    const dailyRate = planPrice / 30;
    return (dailyRate * diffDays).toFixed(2);
  };

  const getDaysRemaining = (vencimento: string | undefined) => {
    if (!vencimento) return null;
    const now = new Date();
    const expiry = new Date(vencimento);
    const diffTime = expiry.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const toggleBlockUser = async (userId: string, currentStatus: boolean) => {
    const { error } = await supabase
      .from('profiles')
      .update({ is_blocked: !currentStatus })
      .eq('id', userId);

    if (error) {
      addNotification({
        type: 'error',
        title: 'Erro ao alterar status',
        message: formatError(error)
      });
    } else {
      fetchData();
    }
  };

  const toggleArchiveUser = async (userId: string, currentStatus: boolean) => {
    const { error } = await supabase
      .from('profiles')
      .update({ is_archived: !currentStatus })
      .eq('id', userId);

    if (error) {
      addNotification({
        type: 'error',
        title: 'Erro ao arquivar usuário',
        message: formatError(error)
      });
    } else {
      addNotification({
        type: 'success',
        title: currentStatus ? 'Usuário Restaurado' : 'Usuário Arquivado',
        message: `Usuário ${currentStatus ? 'restaurado' : 'arquivado'} com sucesso.`
      });
      fetchData();
    }
  };

  const handleImportProducts = async () => {
    if (!excelData.trim()) {
      addNotification({
        type: 'warning',
        title: 'Dados ausentes',
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
        const name = cols[0]?.trim() || 'Produto Sem Nome';
        const label_name = cols[1]?.trim() || '';
        const ean = cols[2]?.trim() || '';
        const cost_price = parseFloat(cols[3]?.replace(',', '.') || '0');
        const sale_price = parseFloat(cols[4]?.replace(',', '.') || '0');
        const ean_variations = cols[5]?.split(',').map(v => v.trim()).filter(v => v) || [];

        return {
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
          title: 'Dados inválidos',
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

      // Broadcast update to all users
      await supabase.channel('public:catalog_updates').send({
        type: 'broadcast',
        event: 'catalog_updated',
        payload: { timestamp: Date.now() }
      });

      addNotification({
        type: 'success',
        title: 'Sucesso',
        message: `${productsToInsert.length} produtos importados com sucesso! Os usuários serão notificados.`
      });
      setExcelData('');
      fetchCentralProducts();
    } catch (err: any) {
      console.error('Error importing products:', err);
      addNotification({
        type: 'error',
        title: 'Erro na importação',
        message: formatError(err)
      });
    } finally {
      setImporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 text-[#38a89d] animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20 max-w-full overflow-x-hidden">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-zinc-100 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-[#4a1d33] uppercase tracking-tight">Gestão Administrativa</h2>
          <p className="text-xs text-zinc-500">Controle de usuários e acessos Starter.</p>
        </div>
      </div>
       {/* Schema Errors Section */}
      {schemaErrors.length > 0 && (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-3 text-red-700">
            <AlertCircle className="w-6 h-6" />
            <h3 className="font-bold">Erros de Esquema Detectados</h3>
          </div>
          <ul className="list-disc list-inside text-sm text-red-600 space-y-1">
            {schemaErrors.map((err, i) => <li key={i}>{err}</li>)}
          </ul>
          <div className="bg-white/50 p-4 rounded-xl border border-red-100">
            <p className="text-xs font-bold text-red-800 mb-2 uppercase tracking-wider">Execute este SQL no Editor do Supabase:</p>
            <pre className="text-[10px] font-mono bg-zinc-900 text-zinc-300 p-4 rounded-lg overflow-x-auto">
{`-- Ativar extensão pgcrypto se necessário
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Adicionar coluna status na tabela customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- Adicionar colunas PIX na tabela profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pix_key TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pix_beneficiary TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS accepted_terms_version INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS vencimento TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS data_pagamento TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;
ALTER TABLE profiles ALTER COLUMN status_pagamento SET DEFAULT 'TRIAL';

-- Adicionar colunas na tabela products
ALTER TABLE products ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_urls TEXT[] DEFAULT '{}';
ALTER TABLE products ADD COLUMN IF NOT EXISTS has_grid BOOLEAN DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS label_name TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS ean_variations TEXT[] DEFAULT '{}';

-- Adicionar colunas na tabela central_products
ALTER TABLE central_products ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE central_products ADD COLUMN IF NOT EXISTS image_urls TEXT[] DEFAULT '{}';
ALTER TABLE central_products ADD COLUMN IF NOT EXISTS ean_variations TEXT[] DEFAULT '{}';

-- 2. Corrigir tabela bags (renomear reseller_name para notes e adicionar parcelas)
DO $$ 
BEGIN 
  -- Renomear se existir a coluna antiga
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bags' AND column_name = 'reseller_name') THEN
    ALTER TABLE bags RENAME COLUMN reseller_name TO notes;
  END IF;

  -- Garantir que a coluna notes existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bags' AND column_name = 'notes') THEN
    ALTER TABLE bags ADD COLUMN notes TEXT;
  END IF;
  
  -- Adicionar coluna installments
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bags' AND column_name = 'installments') THEN
    ALTER TABLE bags ADD COLUMN installments INTEGER DEFAULT 1;
  END IF;
END $$;

-- Criar tabelas para cobranças avulsas
CREATE TABLE IF NOT EXISTS miscellaneous_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  customer_id UUID REFERENCES customers(id),
  description TEXT NOT NULL,
  total_value NUMERIC(15,2) NOT NULL,
  installments_count INTEGER DEFAULT 1,
  apply_late_fees BOOLEAN DEFAULT true,
  original_due_date DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Garantir colunas se a tabela já existia
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'miscellaneous_charges' AND column_name = 'installments_count') THEN
    ALTER TABLE miscellaneous_charges ADD COLUMN installments_count INTEGER DEFAULT 1;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'miscellaneous_charges' AND column_name = 'apply_late_fees') THEN
    ALTER TABLE miscellaneous_charges ADD COLUMN apply_late_fees BOOLEAN DEFAULT true;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'miscellaneous_charges' AND column_name = 'original_due_date') THEN
    ALTER TABLE miscellaneous_charges ADD COLUMN original_due_date DATE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS miscellaneous_charge_installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  charge_id UUID NOT NULL REFERENCES miscellaneous_charges(id) ON DELETE CASCADE,
  installment_number INTEGER NOT NULL,
  value NUMERIC(15,2) NOT NULL,
  due_date DATE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS para cobranças avulsas
ALTER TABLE miscellaneous_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE miscellaneous_charge_installments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários gerenciam suas próprias cobranças" ON miscellaneous_charges;
CREATE POLICY "Usuários gerenciam suas próprias cobranças" ON miscellaneous_charges FOR ALL TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários gerenciam parcelas de suas cobranças" ON miscellaneous_charge_installments;
CREATE POLICY "Usuários gerenciam parcelas de suas cobranças" ON miscellaneous_charge_installments FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM miscellaneous_charges WHERE id = charge_id AND user_id = auth.uid())
);

-- Criar tabela app_legal_settings se não existir
CREATE TABLE IF NOT EXISTS app_legal_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  privacy_policy TEXT NOT NULL,
  terms_of_use TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Criar tabela smart_notepad se não existir
CREATE TABLE IF NOT EXISTS smart_notepad (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

-- Habilitar RLS para smart_notepad
ALTER TABLE smart_notepad ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Usuários gerenciam seu próprio notepad" ON smart_notepad;
CREATE POLICY "Usuários gerenciam seu próprio notepad" ON smart_notepad FOR ALL TO authenticated USING (auth.uid() = user_id);

-- Habilitar RLS e criar políticas para app_legal_settings
ALTER TABLE app_legal_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir leitura para todos" ON app_legal_settings;
CREATE POLICY "Permitir leitura para todos" ON app_legal_settings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Permitir tudo para admins" ON app_legal_settings;
CREATE POLICY "Permitir tudo para admins" ON app_legal_settings FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'admin' OR email IN ('anderlevita@gmail.com')))
);

-- Criar tabela central_products se não existir
CREATE TABLE IF NOT EXISTS central_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  label_name TEXT,
  ean TEXT,
  ean_variations TEXT[] DEFAULT '{}',
  cost_price DECIMAL DEFAULT 0,
  sale_price DECIMAL DEFAULT 0,
  photo_url TEXT,
  has_grid BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS e criar políticas
ALTER TABLE central_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir leitura para todos" ON central_products;
CREATE POLICY "Permitir leitura para todos" ON central_products FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Permitir tudo para admins" ON central_products;
CREATE POLICY "Permitir tudo para admins" ON central_products FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'admin' OR email IN ('anderlevita@gmail.com')))
);

-- Garantir RLS na tabela products
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Usuários gerenciam seus próprios produtos" ON products;
CREATE POLICY "Usuários gerenciam seus próprios produtos" ON products FOR ALL TO authenticated USING (auth.uid() = user_id);

-- Tabela para sugestões de preços
CREATE TABLE IF NOT EXISTS price_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  central_product_id UUID REFERENCES central_products(id) ON DELETE CASCADE,
  suggested_cost_price DECIMAL(10,2),
  suggested_sale_price DECIMAL(10,2),
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Tabela para comunicados globais
CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'info',
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Tabela para produtos da Favorita (Sincronização)
CREATE TABLE IF NOT EXISTS produtos_favorita (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  preco_atual DECIMAL(10,2) NOT NULL,
  preco_anterior DECIMAL(10,2),
  categoria TEXT,
  status TEXT DEFAULT 'normal',
  ultima_atualizacao TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS e criar políticas para produtos_favorita
ALTER TABLE produtos_favorita ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir leitura para todos" ON produtos_favorita;
CREATE POLICY "Permitir leitura para todos" ON produtos_favorita FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Permitir tudo para admins" ON produtos_favorita;
CREATE POLICY "Permitir tudo para admins" ON produtos_favorita FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'admin' OR email IN ('anderlevita@gmail.com')))
);

-- Habilitar RLS e criar políticas para novas tabelas
ALTER TABLE price_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Qualquer um pode ler sugestões" ON price_suggestions;
CREATE POLICY "Qualquer um pode ler sugestões" ON price_suggestions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admins gerenciam sugestões" ON price_suggestions;
CREATE POLICY "Admins gerenciam sugestões" ON price_suggestions FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'admin' OR email IN ('anderlevita@gmail.com')))
);

DROP POLICY IF EXISTS "Qualquer um pode ler comunicados" ON announcements;
CREATE POLICY "Qualquer um pode ler comunicados" ON announcements FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admins gerenciam comunicados" ON announcements;
CREATE POLICY "Admins gerenciam comunicados" ON announcements FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'admin' OR email IN ('anderlevita@gmail.com')))
);

-- Criar tabela daily_insights se não existir
CREATE TABLE IF NOT EXISTS daily_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS e criar políticas
ALTER TABLE daily_insights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir leitura para todos" ON daily_insights;
CREATE POLICY "Permitir leitura para todos" ON daily_insights FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Permitir tudo para admins" ON daily_insights;
CREATE POLICY "Permitir tudo para admins" ON daily_insights FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'admin' OR email IN ('anderlevita@gmail.com')))
);`}
            </pre>
          </div>
        </div>
      )}

      {/* Tabs Section */}
      <div className="flex bg-white p-1 rounded-2xl border border-zinc-100 shadow-sm">
        <button
          onClick={() => setActiveSection('users')}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all",
            activeSection === 'users' ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/20" : "text-zinc-400 hover:text-zinc-600"
          )}
        >
          <Users className="w-4 h-4" />
          Usuários
        </button>
        <button
          onClick={() => setActiveSection('legal')}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all",
            activeSection === 'legal' ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/20" : "text-zinc-400 hover:text-zinc-600"
          )}
        >
          <FileText className="w-4 h-4" />
          Termos e Privacidade
        </button>
        <button
          onClick={() => setActiveSection('insights')}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all",
            activeSection === 'insights' ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/20" : "text-zinc-400 hover:text-zinc-600"
          )}
        >
          <Lightbulb className="w-4 h-4" />
          Insights
        </button>
        <button
          onClick={() => setActiveSection('receipts')}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all",
            activeSection === 'receipts' ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/20" : "text-zinc-400 hover:text-zinc-600"
          )}
        >
          <FileText className="w-4 h-4" />
          Comprovantes
        </button>
        <button
          onClick={() => setActiveSection('favorita')}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all",
            activeSection === 'favorita' ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/20" : "text-zinc-400 hover:text-zinc-600"
          )}
        >
          <Upload className="w-4 h-4" />
          Favorita
        </button>
      </div>

      {activeSection === 'favorita' && (
        <div className="space-y-8">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-emerald-600" />
              <h3 className="font-bold text-zinc-800 text-sm uppercase tracking-wider">Relatório de Sincronização Favorita</h3>
            </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={fetchFavoritaReport}
                className="p-2 hover:bg-zinc-100 rounded-lg text-zinc-400 transition-colors"
                title="Atualizar Relatório"
              >
                <Loader2 className={cn("w-4 h-4", loadingFavorita && "animate-spin")} />
              </button>
              <button
                onClick={handleSyncFavorita}
                disabled={syncingFavorita}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-bold transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
              >
                {syncingFavorita ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                SINCRONIZAR AGORA
              </button>
            </div>
          </div>

          {/* Novos Produtos */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 px-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Novos Produtos ({favoritaProducts.novos.length})</h4>
            </div>
            <div className="bg-white border border-zinc-100 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[800px]">
                  <thead>
                    <tr className="bg-zinc-50/50 border-b border-zinc-100">
                      <th className="px-6 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">SKU</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Nome</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Categoria</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Preço</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right">Data</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    {favoritaProducts.novos.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-zinc-400 text-xs italic">
                          Nenhum produto novo encontrado.
                        </td>
                      </tr>
                    ) : (
                      favoritaProducts.novos.map((prod) => (
                        <tr key={prod.id} className="hover:bg-zinc-50/30 transition-colors">
                          <td className="px-6 py-4">
                            <span className="font-mono text-[10px] font-bold text-zinc-400 bg-zinc-100 px-2 py-1 rounded">
                              {prod.sku}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-xs font-bold text-zinc-800">{prod.nome}</p>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded uppercase">
                              {prod.categoria || 'N/A'}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-xs font-black text-emerald-600">R$ {prod.preco_atual?.toFixed(2)}</p>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <p className="text-[10px] text-zinc-400">
                              {new Date(prod.ultima_atualizacao).toLocaleDateString()} {new Date(prod.ultima_atualizacao).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Preços Alterados */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 px-2">
              <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
              <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Preços Alterados ({favoritaProducts.alterados.length})</h4>
            </div>
            <div className="bg-white border border-zinc-100 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[800px]">
                  <thead>
                    <tr className="bg-zinc-50/50 border-b border-zinc-100">
                      <th className="px-6 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">SKU</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Nome</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Categoria</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Preço Anterior</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Novo Preço</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right">Data</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    {favoritaProducts.alterados.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-zinc-400 text-xs italic">
                          Nenhuma alteração de preço encontrada.
                        </td>
                      </tr>
                    ) : (
                      favoritaProducts.alterados.map((prod) => (
                        <tr key={prod.id} className="hover:bg-zinc-50/30 transition-colors">
                          <td className="px-6 py-4">
                            <span className="font-mono text-[10px] font-bold text-zinc-400 bg-zinc-100 px-2 py-1 rounded">
                              {prod.sku}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-xs font-bold text-zinc-800">{prod.nome}</p>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded uppercase">
                              {prod.categoria || 'N/A'}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-xs font-bold text-zinc-400 line-through">R$ {prod.preco_anterior?.toFixed(2)}</p>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-black text-orange-600">R$ {prod.preco_atual?.toFixed(2)}</p>
                              {prod.preco_atual < prod.preco_anterior ? (
                                <span className="text-[8px] font-bold text-emerald-600 bg-emerald-50 px-1 rounded">BAIXOU</span>
                              ) : (
                                <span className="text-[8px] font-bold text-red-600 bg-red-50 px-1 rounded">SUBIU</span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <p className="text-[10px] text-zinc-400">
                              {new Date(prod.ultima_atualizacao).toLocaleDateString()} {new Date(prod.ultima_atualizacao).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeSection === 'receipts' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-600" />
              <h3 className="font-bold text-zinc-800 text-sm uppercase tracking-wider">Central de Comprovantes</h3>
            </div>
            <button 
              onClick={fetchReceipts}
              className="p-2 hover:bg-zinc-100 rounded-lg text-zinc-400 transition-colors"
            >
              <Loader2 className={cn("w-4 h-4", loadingReceipts && "animate-spin")} />
            </button>
          </div>

          <div className="bg-white border border-zinc-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead>
                  <tr className="bg-zinc-50/50 border-b border-zinc-100">
                    <th className="px-6 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Usuário</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Data de Envio</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-center">Status</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {receipts.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center">
                        <div className="flex flex-col items-center gap-2 text-zinc-400">
                          <Clock className="w-8 h-8 opacity-20" />
                          <p className="text-xs font-medium">Nenhum comprovante recebido ainda.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    receipts.map((receipt) => (
                      <tr key={receipt.id} className="hover:bg-zinc-50/30 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-[10px] font-bold text-zinc-400">
                              {receipt.user_name?.substring(0, 2).toUpperCase() || '??'}
                            </div>
                            <span className="text-sm font-bold text-zinc-800">{receipt.user_name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs text-zinc-600">
                            {new Date(receipt.created_at).toLocaleDateString()} às {new Date(receipt.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={cn(
                            "text-[9px] px-2 py-1 rounded-lg uppercase font-bold tracking-widest",
                            receipt.status === 'approved' ? "bg-emerald-100 text-emerald-700" :
                            receipt.status === 'rejected' ? "bg-red-100 text-red-700" :
                            "bg-amber-100 text-amber-700"
                          )}>
                            {receipt.status === 'approved' ? 'Aprovado' : 
                             receipt.status === 'rejected' ? 'Reprovado' : 
                             'Pendente'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <a 
                              href={receipt.receipt_url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="p-2 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 rounded-lg transition-all"
                              title="Visualizar Comprovante"
                            >
                              <Eye className="w-4 h-4" />
                            </a>
                            {receipt.status === 'pending' && (
                              <>
                                <button
                                  onClick={() => handleUpdateReceiptStatus(receipt.id, 'approved')}
                                  className="p-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-all"
                                  title="Aprovar"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => {
                                    const reason = "seu comprovante foi recusado, alguns dos motivos pode ser: envio do comprovante com valor errado, pint. com dados incompletos, reenvie o comprovante de pix onde apareça valor, data do envio, quem enviou e quem recebeu a transferencia.";
                                    setConfirmModal({
                                      isOpen: true,
                                      title: 'Reprovar Comprovante',
                                      message: `Deseja realmente reprovar este comprovante? O usuário será avisado com o seguinte motivo: "${reason}"`,
                                      variant: 'danger',
                                      onConfirm: () => {
                                        handleUpdateReceiptStatus(receipt.id, 'rejected', reason);
                                        setConfirmModal(prev => ({ ...prev, isOpen: false }));
                                      }
                                    });
                                  }}
                                  className="p-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-all"
                                  title="Reprovar"
                                >
                                  <XCircle className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeSection === 'insights' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-emerald-600" />
              <h3 className="font-bold text-zinc-800 text-sm uppercase tracking-wider">Insights Diários</h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-zinc-500 bg-zinc-100 px-3 py-1 rounded-full">
                {dailyInsights.length} Dicas no Banco
              </span>
              {dailyInsights.length > 0 && (
                <button
                  onClick={handleClearInsights}
                  className="flex items-center gap-2 px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-[10px] font-bold transition-all"
                >
                  <Trash2 className="w-3 h-3" />
                  LIMPAR TUDO
                </button>
              )}
            </div>
          </div>

          <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Adicionar Novas Dicas</label>
              <p className="text-[10px] text-zinc-400">Cole a lista de dicas abaixo. Cada item deve começar com um número emoji (ex: 1️⃣).</p>
              <textarea
                value={insightText}
                onChange={(e) => setInsightText(e.target.value)}
                placeholder="Cole aqui a lista de dicas..."
                className="w-full h-64 bg-zinc-50 border border-zinc-100 rounded-xl p-4 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all resize-none font-mono"
              />
            </div>

            <button
              onClick={handleSaveInsights}
              disabled={savingInsights || !insightText.trim()}
              className="w-full flex items-center justify-center gap-2 py-4 bg-emerald-600 text-white rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:shadow-none"
            >
              {savingInsights ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Processar e Salvar Dicas
            </button>
          </div>

          {dailyInsights.length > 0 && (
            <div className="bg-white border border-zinc-100 rounded-2xl overflow-hidden shadow-sm">
              <div className="p-4 bg-zinc-50/50 border-b border-zinc-100">
                <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Visualização das Dicas</h4>
              </div>
              <div className="divide-y divide-zinc-50 max-h-[400px] overflow-y-auto">
                {dailyInsights.map((insight) => (
                  <div key={insight.id} className="p-4 hover:bg-zinc-50/30 transition-colors">
                    <div className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center text-[10px] font-bold">
                        {insight.order_index + 1}
                      </span>
                      <pre className="text-xs text-zinc-600 whitespace-pre-wrap font-sans">
                        {insight.content}
                      </pre>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeSection === 'users' && (
        /* Users Section */
        <div className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-600" />
              <h3 className="font-bold text-zinc-800 text-sm uppercase tracking-wider">Usuários e Status</h3>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setShowArchived(!showArchived)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-bold transition-all border shadow-sm",
                  showArchived 
                    ? "bg-zinc-800 text-white border-zinc-800" 
                    : "bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50"
                )}
              >
                {showArchived ? <ArchiveRestore className="w-3 h-3" /> : <Archive className="w-3 h-3" />}
                {showArchived ? 'VER ATIVOS' : 'VER ARQUIVADOS'}
              </button>
              <button
                onClick={blockExpiredUsers}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl text-[10px] font-bold transition-all shadow-sm"
              >
                <Lock className="w-3 h-3" />
                BLOQUEAR VENCIDOS
              </button>
              <button
                onClick={handleSyncFavorita}
                disabled={syncingFavorita}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-xl text-[10px] font-bold transition-all shadow-sm disabled:opacity-50"
              >
                {syncingFavorita ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                SINCRONIZAR FAVORITA
              </button>
            </div>
          </div>
          <div className="bg-white border border-zinc-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead>
                  <tr className="bg-zinc-50/50 border-b border-zinc-100">
                    <th className="px-6 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Usuário</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-center">Chave</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-center">Status</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {users
                    .filter(user => !!user.is_archived === showArchived)
                    .map((user) => (
                      <tr key={user.id} className={cn(
                      "hover:bg-zinc-50/30 transition-colors",
                      user.is_blocked && "bg-red-50/30"
                    )}>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-[10px] font-bold text-zinc-400">
                            {user.nome?.substring(0, 2).toUpperCase() || '??'}
                          </div>
                          {user.role === 'admin' && (
                            <Shield className="w-3 h-3 text-amber-500 fill-amber-500" />
                          )}
                          <div>
                            <p className="font-bold text-zinc-800 text-sm">{user.nome || 'Sem Nome'}</p>
                            <p className="text-[10px] text-zinc-400">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {user.access_key_code ? (
                          <span className="font-mono text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">
                            {user.access_key_code}
                          </span>
                        ) : (
                          <span className="text-xs text-zinc-300 italic">Sem chave</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={cn(
                          "px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase",
                          user.is_blocked 
                            ? "bg-red-100 text-red-700" 
                            : user.status_pagamento === 'PRO'
                              ? "bg-amber-100 text-amber-700"
                              : user.status_pagamento === 'STARTER'
                                ? "bg-purple-100 text-purple-700"
                                : user.status_pagamento === 'TRIAL'
                                ? "bg-blue-100 text-blue-700"
                                : user.status_pagamento === 'PAGO' 
                                  ? "bg-emerald-100 text-emerald-700" 
                                  : "bg-zinc-100 text-zinc-500"
                        )}>
                          {user.is_blocked ? 'BLOQUEADO' : (user.status_pagamento || 'PENDENTE')}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          {currentProfile?.email === 'anderlevita@gmail.com' && (
                            <button 
                              onClick={() => toggleAdminRole(user.id, user.role)}
                              className={cn(
                                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all",
                                user.role === 'admin' 
                                  ? "bg-amber-500 text-white" 
                                  : "bg-amber-50 text-amber-600 hover:bg-amber-100"
                              )}
                              title={user.role === 'admin' ? "Remover Admin" : "Tornar Admin"}
                            >
                              <Shield className="w-3 h-3" />
                              {user.role === 'admin' ? 'ADMIN' : 'USER'}
                            </button>
                          )}
                          {user.role !== 'admin' && (
                            <>
                              <button 
                                onClick={() => {
                                  let phone = user.whatsapp?.replace(/\D/g, '');
                                  if (!phone) {
                                    addNotification({
                                      type: 'warning',
                                      title: 'WhatsApp não cadastrado',
                                      message: 'Este usuário não possui número de WhatsApp cadastrado.'
                                    });
                                    return;
                                  }
                                  
                                  // Add country code if missing
                                  if (phone.length <= 11) {
                                    phone = `55${phone}`;
                                  }

                                  const vencimentoStr = user.vencimento 
                                    ? new Date(user.vencimento).toLocaleDateString('pt-BR') 
                                    : 'A definir';

                                  const message = `Olá ${user.nome || 'Cliente'}, tudo bem?

Passando para lembrar que seu plano no Consigna Beauty está próximo do vencimento ou já venceu.

📅 Vencimento: ${vencimentoStr}

Para manter seu acesso ativo e aproveitar todas as funcionalidades, realize o pagamento via PIX:

🔑 Chave PIX (CNPJ): 26.384.051/0001-58
👤 Beneficiário: Anderson Rodrigues de Morais

Após o pagamento, por favor, envie o comprovante diretamente pelo seu perfil no sistema:
🔗 ${window.location.origin}?tab=profile

Qualquer dúvida, estamos à disposição!`;

                                  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
                                }}
                                className="p-2 bg-[#25D366] text-white hover:bg-[#128C7E] rounded-lg transition-all shadow-sm hover:shadow-md active:scale-95 flex items-center justify-center"
                                title="Enviar Cobrança via WhatsApp"
                              >
                                <MessageSquare className="w-4 h-4" />
                              </button>
                              {user.status_pagamento !== 'PENDENTE' && (
                                <button 
                                  onClick={() => setExpirationModal({
                                    isOpen: true,
                                    userId: user.id,
                                    userName: user.nome || user.email || '',
                                    paymentDate: user.data_pagamento || new Date().toISOString().split('T')[0]
                                  })}
                                  className={cn(
                                    "flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all",
                                    getDaysRemaining(user.vencimento) !== null && getDaysRemaining(user.vencimento)! <= 3
                                      ? "bg-red-50 text-red-600 hover:bg-red-100"
                                      : "bg-zinc-50 text-zinc-400 hover:bg-zinc-100"
                                  )}
                                  title="Gerenciar Vencimento"
                                >
                                  {getDaysRemaining(user.vencimento) !== null ? (
                                    <>
                                      <Clock className="w-3 h-3" />
                                      {getDaysRemaining(user.vencimento)! <= 0 ? 'VENCIDO' : `${getDaysRemaining(user.vencimento)} DIAS`}
                                    </>
                                  ) : (
                                    'RESET'
                                  )}
                                </button>
                              )}
                              <button 
                                onClick={() => updateUserStatus(user.id, 'TRIAL')}
                                className={cn(
                                  "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                                  user.status_pagamento === 'TRIAL' 
                                    ? "bg-blue-500 text-white" 
                                    : "bg-blue-50 text-blue-600 hover:bg-blue-100"
                                )}
                              >
                                TRIAL
                              </button>
                              <button 
                                onClick={() => updateUserStatus(user.id, 'STARTER')}
                                className={cn(
                                  "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                                  user.status_pagamento === 'STARTER' 
                                    ? "bg-purple-500 text-white" 
                                    : "bg-purple-50 text-purple-600 hover:bg-purple-100"
                                )}
                              >
                                STARTER
                              </button>
                              <button 
                                onClick={() => updateUserStatus(user.id, 'PAGO')}
                                className={cn(
                                  "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                                  user.status_pagamento === 'PAGO' 
                                    ? "bg-emerald-500 text-white" 
                                    : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                                )}
                              >
                                PAGO
                              </button>
                              <button 
                                onClick={() => updateUserStatus(user.id, 'PRO')}
                                className={cn(
                                  "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                                  user.status_pagamento === 'PRO'
                                    ? "bg-orange-500 text-white" 
                                    : "bg-orange-50 text-orange-600 hover:bg-orange-100"
                                )}
                              >
                                <ShieldCheck className="w-3.5 h-3.5" />
                                PRO
                              </button>
                            </>
                          )}
                          <button 
                            onClick={() => toggleArchiveUser(user.id, !!user.is_archived)}
                            className={cn(
                              "flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all",
                              user.is_archived 
                                ? "bg-emerald-50 text-emerald-600 hover:bg-emerald-100" 
                                : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
                            )}
                            title={user.is_archived ? "Restaurar Usuário" : "Arquivar Usuário"}
                          >
                            {user.is_archived ? <ArchiveRestore className="w-3 h-3" /> : <Archive className="w-3 h-3" />}
                            {user.is_archived ? 'RESTAURAR' : 'ARQUIVAR'}
                          </button>
                          <button 
                            onClick={() => toggleBlockUser(user.id, !!user.is_blocked)}
                            className={cn(
                              "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                              user.is_blocked 
                                ? "bg-emerald-50 text-emerald-600 hover:bg-emerald-100" 
                                : "bg-red-50 text-red-600 hover:bg-red-100"
                            )}
                          >
                            {user.is_blocked ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                            {user.is_blocked ? 'Desbloquear' : 'Bloquear'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeSection === 'legal' && (
        /* Legal Section */
        <div className="space-y-6">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-600" />
              <h3 className="font-bold text-zinc-800 text-sm uppercase tracking-wider">Termos e Privacidade</h3>
            </div>
            {!legalSettings && (
              <button
                onClick={initializeLegalSettings}
                className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 uppercase tracking-widest"
              >
                Inicializar Documentos
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Privacy Policy */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest px-2">Política de Privacidade</label>
              <textarea
                value={legalSettings?.privacy_policy || ''}
                onChange={(e) => setLegalSettings(prev => prev ? { ...prev, privacy_policy: e.target.value } : null)}
                placeholder="Cole aqui a política de privacidade..."
                className="w-full h-[400px] bg-white border border-zinc-200 rounded-2xl p-4 text-sm text-zinc-600 outline-none focus:border-emerald-500 transition-all resize-none shadow-sm"
              />
            </div>

            {/* Terms of Use */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest px-2">Termos de Uso</label>
              <textarea
                value={legalSettings?.terms_of_use || ''}
                onChange={(e) => setLegalSettings(prev => prev ? { ...prev, terms_of_use: e.target.value } : null)}
                placeholder="Cole aqui os termos de uso..."
                className="w-full h-[400px] bg-white border border-zinc-200 rounded-2xl p-4 text-sm text-zinc-600 outline-none focus:border-emerald-500 transition-all resize-none shadow-sm"
              />
            </div>
          </div>

          <div className="flex justify-end px-2">
            <button
              onClick={handleSaveLegal}
              disabled={savingLegal || !legalSettings}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-xl font-bold transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
            >
              {savingLegal ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              Salvar e Notificar Usuários
            </button>
          </div>
          
          <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-4">
            <p className="text-[10px] text-zinc-400 leading-relaxed italic">
              * Ao salvar, a versão dos documentos será incrementada. Todos os usuários serão obrigados a ler e aceitar os novos termos no próximo acesso.
            </p>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        variant={confirmModal.variant}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />

      {/* Expiration Management Modal */}
      {expirationModal.isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
            <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-emerald-50 text-emerald-500">
                  <Calendar className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-zinc-800 tracking-tight">Gerenciar Vencimento</h3>
                  <p className="text-sm text-zinc-500">{expirationModal.userName}</p>
                </div>
              </div>
              <button 
                onClick={() => setExpirationModal(prev => ({ ...prev, isOpen: false }))}
                className="p-2 hover:bg-zinc-100 rounded-xl transition-colors text-zinc-400"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Data de Pagamento</label>
                <input 
                  type="date"
                  value={expirationModal.paymentDate}
                  onChange={(e) => setExpirationModal(prev => ({ ...prev, paymentDate: e.target.value }))}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-800 focus:border-emerald-500 outline-none transition-colors"
                />
              </div>

              <div className="bg-zinc-50 rounded-2xl p-4 border border-zinc-100 space-y-4">
                <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Cálculo Proporcional (Vencimento dia 08)</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white p-3 rounded-xl border border-zinc-100">
                    <p className="text-[10px] text-zinc-400 font-bold uppercase">Plano Starter</p>
                    <p className="text-lg font-black text-purple-600">R$ {calculateProRated(39.99, expirationModal.paymentDate)}</p>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-zinc-100">
                    <p className="text-[10px] text-zinc-400 font-bold uppercase">Plano Pro</p>
                    <p className="text-lg font-black text-orange-600">R$ {calculateProRated(79.99, expirationModal.paymentDate)}</p>
                  </div>
                </div>
                <p className="text-[10px] text-zinc-400 italic">
                  * O vencimento será definido automaticamente para o próximo dia 08.
                </p>
              </div>
            </div>
            
            <div className="p-6 border-t border-zinc-100 flex gap-3">
              <button
                onClick={() => setExpirationModal(prev => ({ ...prev, isOpen: false }))}
                className="flex-1 py-3 rounded-xl font-bold text-zinc-500 hover:bg-zinc-100 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleUpdateExpiration}
                className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold shadow-lg shadow-emerald-500/20 hover:bg-emerald-700 transition-all"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Expired Users Selection Modal */}
      {expiredUsersModal.isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300 max-h-[90vh]">
            <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-red-50 text-red-500">
                  <Lock className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-zinc-800 tracking-tight">Bloquear Usuários Vencidos</h3>
                  <p className="text-sm text-zinc-500">Selecione quem você deseja bloquear</p>
                </div>
              </div>
              <button 
                onClick={() => setExpiredUsersModal(prev => ({ ...prev, isOpen: false }))}
                className="p-2 hover:bg-zinc-100 rounded-xl transition-colors text-zinc-400"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-3">
                {expiredUsersModal.users.map((user) => (
                  <div 
                    key={user.id}
                    onClick={() => {
                      setExpiredUsersModal(prev => ({
                        ...prev,
                        selectedIds: prev.selectedIds.includes(user.id)
                          ? prev.selectedIds.filter(id => id !== user.id)
                          : [...prev.selectedIds, user.id]
                      }));
                    }}
                    className={cn(
                      "flex items-center justify-between p-4 rounded-2xl border transition-all cursor-pointer",
                      expiredUsersModal.selectedIds.includes(user.id)
                        ? "bg-red-50 border-red-200"
                        : "bg-zinc-50 border-zinc-100 hover:border-zinc-200"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-5 h-5 rounded-md border flex items-center justify-center transition-all",
                        expiredUsersModal.selectedIds.includes(user.id)
                          ? "bg-red-500 border-red-500 text-white"
                          : "bg-white border-zinc-300"
                      )}>
                        {expiredUsersModal.selectedIds.includes(user.id) && <Check className="w-3 h-3" />}
                      </div>
                      <div>
                        <p className="font-bold text-zinc-800 text-sm">{user.nome || 'Sem Nome'}</p>
                        <p className="text-[10px] text-zinc-400">{user.email}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-red-600 uppercase">Vencido em</p>
                      <p className="text-xs font-bold text-zinc-600">
                        {user.vencimento ? new Date(user.vencimento).toLocaleDateString() : 'N/A'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="p-6 border-t border-zinc-100 flex gap-3 bg-zinc-50/50">
              <button
                onClick={() => setExpiredUsersModal(prev => ({ ...prev, isOpen: false }))}
                className="flex-1 py-3 rounded-xl font-bold text-zinc-500 hover:bg-zinc-100 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmBlockExpired}
                disabled={expiredUsersModal.selectedIds.length === 0 || loading}
                className="flex-[2] py-3 bg-red-600 text-white rounded-xl font-bold shadow-lg shadow-red-500/20 hover:bg-red-700 transition-all disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                Bloquear Selecionados ({expiredUsersModal.selectedIds.length})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
