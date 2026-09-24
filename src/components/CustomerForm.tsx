import React, { useState, useRef, useEffect } from 'react';
import { 
  X, 
  Save, 
  MapPin, 
  RotateCcw,
  Camera, 
  Upload, 
  Loader2,
  ChevronLeft,
  CheckCircle2,
  History,
  ShoppingBag,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Customer, Bag, BagItem } from '../types';
import { cn } from '../lib/utils';
import { useNotifications } from './NotificationCenter';
import { sanitizeString, isValidCPF, isValidPhone } from '../lib/sanitizer';

interface CustomerFormProps {
  customer?: Customer;
  onClose: () => void;
  onSave: () => void;
}

export function CustomerForm({ customer, onClose, onSave }: CustomerFormProps) {
  const { addNotification } = useNotifications();
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [history, setHistory] = useState<(Bag & { campaign?: { name: string }, items?: BagItem[] })[]>([]);
  const [expandedBag, setExpandedBag] = useState<string | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [uploadingProof, setUploadingProof] = useState(false);
  const docInputRef = useRef<HTMLInputElement>(null);
  const proofInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (customer?.id) {
      fetchHistory();
    }
  }, [customer?.id]);

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('bags')
        .select(`
          *,
          campaign:campaigns(name),
          items:bag_items(*)
        `)
        .eq('customer_id', customer?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setHistory(data || []);
    } catch (err) {
      console.error('Error fetching customer history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const [creditLimitInput, setCreditLimitInput] = useState(customer?.credit_limit?.toString() || '0');
  const [formData, setFormData] = useState<Partial<Customer>>(customer || {
    nome: '',
    cpf: '',
    birth_date: '',
    gender: '',
    nationality: '',
    naturalness: '',
    instagram: '',
    whatsapp: '',
    cep: '',
    bairro: '',
    logradouro: '',
    address_number: '',
    cidade: '',
    estado: '',
    document_photo_url: '',
    residence_proof_url: '',
    status: 'active'
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'document' | 'proof') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isDoc = type === 'document';
    if (isDoc) setUploadingDoc(true);
    else setUploadingProof(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
      if (!user) throw new Error('Usuário não autenticado');

      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;
      const bucket = isDoc ? 'documents' : 'residence_proofs';

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(fileName);

      setFormData(prev => ({
        ...prev,
        [isDoc ? 'document_photo_url' : 'residence_proof_url']: publicUrl
      }));

    } catch (err) {
      console.error(`Error uploading ${type}:`, err);
      addNotification({
        type: 'error',
        title: 'Erro no upload',
        message: `Erro ao carregar ${isDoc ? 'documento' : 'comprovante'}.`
      });
    } finally {
      if (isDoc) setUploadingDoc(false);
      else setUploadingProof(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) throw new Error('Usuário não autenticado');

      // Validation
      if (formData.cpf && !isValidCPF(formData.cpf)) {
        addNotification({ type: 'warning', title: 'Validação', message: 'CPF informado é inválido.' });
        setLoading(false);
        return;
      }

      // Check for existing customer with same CPF
      if (formData.cpf) {
        const { data: existing, error: checkError } = await supabase
          .from('customers')
          .select('id, nome')
          .eq('cpf', formData.cpf)
          .eq('user_id', user.id)
          .neq('id', customer?.id || '00000000-0000-0000-0000-000000000000')
          .maybeSingle();

        if (checkError) throw checkError;

        if (existing) {
          addNotification({ 
            type: 'error', 
            title: 'Cliente já cadastrado', 
            message: `Este CPF já está vinculado ao cliente: ${existing.nome}` 
          });
          setLoading(false);
          return;
        }
      }

      if (formData.whatsapp && !isValidPhone(formData.whatsapp)) {
        addNotification({ type: 'warning', title: 'Validação', message: 'WhatsApp informado é inválido.' });
        setLoading(false);
        return;
      }

      // Remove immutable fields from formData and Sanitize
      const { id, created_at, ...saveData } = formData as any;
      
      // Basic string sanitization for all string fields
      Object.keys(saveData).forEach(key => {
        if (typeof saveData[key] === 'string') {
          saveData[key] = sanitizeString(saveData[key]);
        }
      });

      saveData.credit_limit = Number(creditLimitInput.replace(',', '.')) || 0;

      // Ensure empty strings are sent as null to avoid Supabase errors (especially for dates and numbers)
      Object.keys(saveData).forEach(key => {
        if (saveData[key] === '') {
          saveData[key] = null;
        }
      });

      if (customer?.id) {
        const { error } = await supabase
          .from('customers')
          .update({
            ...saveData,
            user_id: user.id
          })
          .eq('id', customer.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('customers')
          .insert([{
            ...saveData,
            user_id: user.id,
            status: formData.status || 'active'
          }]);
        if (error) throw error;
      }

      onSave();
    } catch (err: any) {
      console.error('Error saving customer:', err);
      addNotification({ type: 'error', title: 'Erro ao salvar', message: 'Erro ao salvar cliente: ' + (err.message || 'Verifique os dados e tente novamente.') });
    } finally {
      setLoading(false);
    }
  };

  const handleGetLocation = () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition((position) => {
        setFormData(prev => ({
          ...prev,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        }));
        addNotification({ type: 'success', title: 'GPS', message: 'Localização GPS capturada com sucesso!' });
      }, (error) => {
        console.error('Error getting location:', error);
        addNotification({ type: 'error', title: 'GPS', message: 'Erro ao capturar localização GPS.' });
      });
    } else {
      addNotification({ type: 'warning', title: 'GPS', message: 'Geolocalização não suportada pelo seu navegador.' });
    }
  };

  const handleResetLocation = () => {
    setFormData(prev => ({
      ...prev,
      latitude: undefined,
      longitude: undefined
    }));
    addNotification({ type: 'info', title: 'GPS', message: 'Localização GPS removida.' });
  };

  return (
    <div className="bg-zinc-50/50 min-h-screen p-4 sm:p-8 animate-in fade-in duration-300">
      <div className="max-w-6xl mx-auto">
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <h2 className="text-xl font-bold text-zinc-800 text-center sm:text-left">Gestão de Clientes</h2>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
              <button 
                type="button"
                onClick={onClose}
                className="text-zinc-500 hover:text-zinc-800 font-medium transition-colors bg-zinc-100 sm:bg-transparent py-3 sm:py-0 rounded-xl sm:rounded-none w-full sm:w-auto text-center"
              >
                Cancelar
              </button>
              <button 
                type="submit"
                disabled={loading || uploadingDoc || uploadingProof}
                className="flex items-center justify-center gap-2 bg-[#00a86b] hover:bg-[#008f5b] text-white px-6 py-3 sm:py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 w-full sm:w-auto"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                Salvar
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Dados Pessoais */}
            <div className="space-y-6">
              <h3 className="text-lg font-serif italic text-zinc-700">Dados Pessoais</h3>
              
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Nome Completo *</label>
                  <input 
                    required
                    name="nome"
                    value={formData.nome || ''}
                    maxLength={100}
                    onChange={handleChange}
                    className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">CPF *</label>
                  <input 
                    required
                    name="cpf"
                    placeholder="000.000.000-00"
                    value={formData.cpf || ''}
                    maxLength={14}
                    onChange={handleChange}
                    className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Data de Nascimento</label>
                    <input 
                      type="date"
                      name="birth_date"
                      value={formData.birth_date || ''}
                      onChange={handleChange}
                      className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Gênero</label>
                    <input 
                      name="gender"
                      placeholder="Ex: Feminino"
                      value={formData.gender || ''}
                      maxLength={20}
                      onChange={handleChange}
                      className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Nacionalidade</label>
                    <input 
                      name="nationality"
                      placeholder="Ex: Brasileira"
                      value={formData.nationality || ''}
                      maxLength={30}
                      onChange={handleChange}
                      className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Naturalidade</label>
                    <input 
                      name="naturalness"
                      placeholder="Ex: São Paulo"
                      value={formData.naturalness || ''}
                      maxLength={50}
                      onChange={handleChange}
                      className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">@Instagram</label>
                    <input 
                      name="instagram"
                      placeholder="@usuario"
                      value={formData.instagram || ''}
                      maxLength={50}
                      onChange={handleChange}
                      className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">WhatsApp *</label>
                    <input 
                      required
                      name="whatsapp"
                      placeholder="(00) 00000-0000"
                      value={formData.whatsapp || ''}
                      maxLength={20}
                      onChange={handleChange}
                      className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Status da Cliente</label>
                    <div className="flex items-center gap-4 bg-white border border-zinc-200 rounded-xl px-4 py-3">
                      <span className={cn(
                        "text-xs font-bold uppercase tracking-wider",
                        formData.status === 'active' ? "text-emerald-600" : "text-zinc-400"
                      )}>
                        {formData.status === 'active' ? 'Ativa' : 'Inativa'}
                      </span>
                      <button 
                        type="button"
                        onClick={() => setFormData({...formData, status: formData.status === 'active' ? 'inactive' : 'active'})}
                        className={cn(
                          "w-12 h-6 rounded-full transition-all relative ml-auto",
                          formData.status === 'active' ? "bg-emerald-500" : "bg-zinc-200"
                        )}
                      >
                        <div className={cn(
                          "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                          formData.status === 'active' ? "left-7" : "left-1"
                        )} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Limite de Crédito (R$)</label>
                    <input 
                      type="text" 
                      inputMode="decimal"
                      name="credit_limit"
                      placeholder="0,00"
                      value={creditLimitInput === '0' ? '' : creditLimitInput}
                      onChange={e => {
                        const val = e.target.value;
                        if (val === '' || /^\d*([.,]\d*)?$/.test(val)) {
                          setCreditLimitInput(val);
                        }
                      }}
                      className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 transition-all"
                    />
                  </div>
                </div>

                  <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Foto do Documento (Opcional)</label>
                  <input 
                    type="file" 
                    ref={docInputRef}
                    className="hidden" 
                    accept="image/*"
                    onChange={(e) => handleFileUpload(e, 'document')}
                  />
                  {formData.document_photo_url ? (
                    <div className="border border-zinc-200 rounded-3xl p-6 flex flex-col items-center justify-center gap-4 bg-white relative">
                      <button 
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, document_photo_url: '' }))}
                        className="absolute top-4 right-4 p-2 bg-red-50 text-red-500 rounded-full hover:bg-red-100 transition-colors"
                        title="Excluir foto"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                      <p className="text-sm font-bold text-emerald-600">Documento Carregado</p>
                    </div>
                  ) : (
                    <div 
                      onClick={() => docInputRef.current?.click()}
                      className="border-2 border-dashed border-zinc-200 rounded-3xl p-8 flex flex-col items-center justify-center gap-4 bg-white/50 hover:bg-white hover:border-emerald-500/50 transition-all cursor-pointer group"
                    >
                      {uploadingDoc ? (
                        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                      ) : (
                        <>
                          <div className="w-12 h-12 rounded-full bg-zinc-50 flex items-center justify-center group-hover:bg-emerald-50 transition-colors">
                            <Camera className="w-6 h-6 text-zinc-400 group-hover:text-emerald-500" />
                          </div>
                          <p className="text-sm text-zinc-500">Clique para carregar foto do RG ou CNH</p>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Endereço Residencial */}
            <div className="space-y-6">
              <h3 className="text-lg font-serif italic text-zinc-700">Endereço Residencial</h3>
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">CEP</label>
                    <input 
                      name="cep"
                      placeholder="00000-000"
                      value={formData.cep || ''}
                      maxLength={9}
                      onChange={handleChange}
                      className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Bairro</label>
                    <input 
                      name="bairro"
                      value={formData.bairro || ''}
                      maxLength={100}
                      onChange={handleChange}
                      className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Logradouro</label>
                  <input 
                    name="logradouro"
                    placeholder="Rua, Avenida..."
                    value={formData.logradouro || ''}
                    maxLength={150}
                    onChange={handleChange}
                    className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Número / Complemento</label>
                  <input 
                    name="address_number"
                    value={formData.address_number || ''}
                    maxLength={50}
                    onChange={handleChange}
                    className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Cidade</label>
                    <input 
                      name="cidade"
                      value={formData.cidade || ''}
                      maxLength={50}
                      onChange={handleChange}
                      className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Estado</label>
                    <input 
                      name="estado"
                      value={formData.estado || ''}
                      maxLength={2}
                      onChange={handleChange}
                      className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Comprovante de Residência</label>
                  <input 
                    type="file" 
                    ref={proofInputRef}
                    className="hidden" 
                    accept="image/*,application/pdf"
                    onChange={(e) => handleFileUpload(e, 'proof')}
                  />
                  {formData.residence_proof_url ? (
                    <div className="border border-zinc-200 rounded-3xl p-6 flex flex-col items-center justify-center gap-4 bg-white relative">
                      <button 
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, residence_proof_url: '' }))}
                        className="absolute top-4 right-4 p-2 bg-red-50 text-red-500 rounded-full hover:bg-red-100 transition-colors"
                        title="Excluir comprovante"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                      <p className="text-sm font-bold text-emerald-600">Comprovante Carregado</p>
                    </div>
                  ) : (
                    <div 
                      onClick={() => proofInputRef.current?.click()}
                      className="border-2 border-dashed border-zinc-200 rounded-3xl p-8 flex flex-col items-center justify-center gap-4 bg-white/50 hover:bg-white hover:border-emerald-500/50 transition-all cursor-pointer group"
                    >
                      {uploadingProof ? (
                        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                      ) : (
                        <>
                          <div className="w-12 h-12 rounded-full bg-zinc-50 flex items-center justify-center group-hover:bg-emerald-50 transition-colors">
                            <Upload className="w-6 h-6 text-zinc-400 group-hover:text-emerald-500" />
                          </div>
                          <p className="text-sm text-zinc-500">Carregar comprovante (luz, água...)</p>
                        </>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <button 
                    type="button"
                    onClick={handleGetLocation}
                    className="flex-1 bg-zinc-900 text-white py-4 rounded-2xl font-bold flex flex-col items-center justify-center gap-1 hover:bg-zinc-800 transition-all shadow-lg shadow-zinc-900/10"
                  >
                    <div className="flex items-center gap-3">
                      <MapPin className="w-5 h-5" />
                      {formData.latitude && formData.longitude ? 'Atualizar Localização GPS' : 'Indicar Localização GPS'}
                    </div>
                    {formData.latitude && formData.longitude && (
                      <span className="text-xs text-zinc-400 font-normal">
                        Lat: {formData.latitude.toFixed(6)}, Lng: {formData.longitude.toFixed(6)}
                      </span>
                    )}
                  </button>
                  {formData.latitude && formData.longitude && (
                    <button 
                      type="button"
                      onClick={handleResetLocation}
                      className="p-4 bg-red-50 text-red-500 rounded-2xl hover:bg-red-100 transition-colors border border-red-100 flex items-center justify-center"
                      title="Resetar Localização"
                    >
                      <RotateCcw className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Histórico do Cliente */}
          {customer?.id && (
            <div className="mt-12 pt-12 border-t border-zinc-200 space-y-8">
              <div className="flex items-center gap-3">
                <History className="w-6 h-6 text-emerald-600" />
                <h3 className="text-lg font-serif italic text-zinc-700">Histórico de Movimentações</h3>
              </div>

              {loadingHistory ? (
                <div className="flex items-center justify-center py-12 text-zinc-400 gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
                  Carregando histórico...
                </div>
              ) : history.length === 0 ? (
                <div className="bg-white border border-dashed border-zinc-200 rounded-3xl p-12 text-center text-zinc-500">
                  Nenhuma sacola ou movimentação encontrada para este cliente.
                </div>
              ) : (
                <div className="space-y-4">
                  {history.map((bag) => (
                    <div key={bag.id} className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm hover:border-emerald-500/30 transition-all">
                      <button 
                        type="button"
                        onClick={() => setExpandedBag(expandedBag === bag.id ? null : bag.id)}
                        className="w-full px-6 py-4 flex items-center justify-between hover:bg-zinc-50 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
                            <ShoppingBag className="w-5 h-5 text-emerald-600" />
                          </div>
                          <div className="text-left">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-zinc-800">Sacola #{bag.bag_number}</span>
                              <span className={cn(
                                "text-[10px] font-bold uppercase px-2 py-0.5 rounded",
                                bag.status === 'closed' ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                              )}>
                                {bag.status === 'closed' ? 'Finalizada' : 'Aberta'}
                              </span>
                            </div>
                            <p className="text-xs text-zinc-500">
                              {bag.campaign?.name || 'Sem Campanha'} • {new Date(bag.created_at).toLocaleDateString('pt-BR')}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-6">
                          <div className="text-right hidden sm:block">
                            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Total</p>
                            <p className="font-bold text-zinc-800">R$ {bag.total_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                          </div>
                          {expandedBag === bag.id ? <ChevronUp className="w-5 h-5 text-zinc-400" /> : <ChevronDown className="w-5 h-5 text-zinc-400" />}
                        </div>
                      </button>

                      {expandedBag === bag.id && (
                        <div className="px-6 pb-6 pt-2 border-t border-zinc-50 animate-in slide-in-from-top-2 duration-200">
                          <div className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                              <div className="bg-zinc-50 rounded-xl p-3">
                                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Status Pagamento</p>
                                <span className={cn(
                                  "text-xs font-bold uppercase",
                                  bag.payment_status === 'paid' ? "text-emerald-600" : "text-amber-600"
                                )}>
                                  {bag.payment_status === 'paid' ? 'Pago' : 'Pendente'}
                                </span>
                              </div>
                              <div className="bg-zinc-50 rounded-xl p-3">
                                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Valor Recebido</p>
                                <p className="text-xs font-bold text-zinc-800">R$ {(bag.received_amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                              </div>
                              <div className="bg-zinc-50 rounded-xl p-3">
                                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Data Fechamento</p>
                                <p className="text-xs font-bold text-zinc-800">{bag.closed_at ? new Date(bag.closed_at).toLocaleDateString('pt-BR') : '-'}</p>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Produtos na Sacola</p>
                              <div className="border border-zinc-100 rounded-xl overflow-hidden">
                                <table className="w-full text-xs text-left">
                                  <thead className="bg-zinc-50 text-zinc-500 font-bold uppercase tracking-wider">
                                    <tr>
                                      <th className="px-4 py-2">Produto</th>
                                      <th className="px-4 py-2 text-center">Qtd</th>
                                      <th className="px-4 py-2 text-center">Ret</th>
                                      <th className="px-4 py-2 text-right">Preço</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-zinc-50">
                                    {bag.items?.map((item: any) => (
                                      <tr key={item.id}>
                                        <td className="px-4 py-2 font-medium text-zinc-700">{item.product_name}</td>
                                        <td className="px-4 py-2 text-center">{item.quantity}</td>
                                        <td className="px-4 py-2 text-center text-rose-500 font-bold">{item.returned_quantity}</td>
                                        <td className="px-4 py-2 text-right font-bold">R$ {item.unit_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
