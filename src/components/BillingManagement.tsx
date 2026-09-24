import React, { useState, useEffect } from 'react';
import { FileText, Copy, CheckCircle2, Search, Loader2, Send, Printer, Gavel, AlertTriangle, FileJson, Sparkles, Paperclip, X, Scale } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Profile, Customer } from '../types';
import { differenceInDays, parseISO } from 'date-fns';
import { useNotifications } from './NotificationCenter';
import { GoogleGenAI, Type } from "@google/genai";
import ReactMarkdown from 'react-markdown';
import { cn } from '../lib/utils';

interface BillingManagementProps {
  profile: Profile | null;
}

const getInitialContactInfo = (p: Profile | null) => {
  if (!p) return '';
  const contacts = [];
  if (p.whatsapp) contacts.push(`WhatsApp: ${p.whatsapp}`);
  if (p.email) contacts.push(`E-mail: ${p.email}`);
  if (p.instagram) contacts.push(`Instagram: ${p.instagram}`);
  return contacts.join(' / ');
};

const getInitialPaymentInfo = (p: Profile | null) => {
  if (!p) return '';
  const payments = [];
  if (p.pix_key) {
    payments.push(`Chave PIX: ${p.pix_key}`);
    if (p.pix_beneficiary) payments.push(`Beneficiário: ${p.pix_beneficiary}`);
  }
  return payments.join('\n');
};

export function BillingManagement({ profile }: BillingManagementProps) {
  const { addNotification } = useNotifications();
  const [activeTab, setActiveTab] = useState<'notificacao' | 'cobranca' | 'execucao'>('notificacao');
  
  // Notificação Extrajudicial State
  const [creditorName, setCreditorName] = useState(profile?.nome || '');
  const [debtorName, setDebtorName] = useState('');
  const [debtorPhone, setDebtorPhone] = useState('');
  const [debtOrigin, setDebtOrigin] = useState('');
  const [originalValue, setOriginalValue] = useState('');
  const [originalDueDate, setOriginalDueDate] = useState('');
  const [dueDate, setDueDate] = useState('5 (cinco) dias úteis');
  const [contactInfo, setContactInfo] = useState(getInitialContactInfo(profile));
  const [paymentInfo, setPaymentInfo] = useState(getInitialPaymentInfo(profile));
  const [installments, setInstallments] = useState('');
  const [copied, setCopied] = useState(false);

  // Ação de Cobrança State
  const [acaoData, setAcaoData] = useState({
    requerente: {
      nome: profile?.nome || '',
      cpf_cnpj: profile?.cpf || '',
      estado_civil: '',
      profissao: '',
      endereco: `${profile?.logradouro || ''}, ${profile?.numero_complemento || ''}, ${profile?.bairro || ''}, ${profile?.cidade || ''} - ${profile?.estado || ''}, CEP: ${profile?.cep || ''}`.replace(/^, , ,  - , CEP: $/, ''),
      email: profile?.email || '',
      telefone: profile?.whatsapp || ''
    },
    requerida: {
      nome: '',
      cpf_cnpj: '',
      estado_civil: '',
      profissao: '',
      endereco: '',
      email: '',
      telefone: ''
    },
    divida: {
      origem: '',
      valor: '',
      vencimento: '',
      documentos: '',
      numero_np: 'S/N',
      data_emissao_np: ''
    },
    foro: profile?.cidade || '',
    estado_foro: profile?.estado || '',
    anexos: [] as { name: string, url: string }[]
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [legalDraft, setLegalDraft] = useState<{ json: any, text: string } | null>(null);
  const [uploading, setUploading] = useState(false);

  const isAddressIncomplete = !profile?.logradouro || !profile?.bairro || !profile?.cidade || !profile?.estado || !profile?.cep;

  // Customer search
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    if (profile) {
      if (profile.nome && !creditorName) setCreditorName(profile.nome);
      if (!contactInfo) setContactInfo(getInitialContactInfo(profile));
      if (!paymentInfo) setPaymentInfo(getInitialPaymentInfo(profile));
      
      // Update Ação de Cobrança Requerente
      setAcaoData(prev => ({
        ...prev,
        requerente: {
          ...prev.requerente,
          nome: profile.nome || prev.requerente.nome,
          cpf_cnpj: profile.cpf || prev.requerente.cpf_cnpj,
          endereco: `${profile.logradouro || ''}, ${profile.numero_complemento || ''}, ${profile.bairro || ''}, ${profile.cidade || ''} - ${profile.estado || ''}, CEP: ${profile.cep || ''}`.replace(/^, , ,  - , CEP: $/, '') || prev.requerente.endereco,
          email: profile.email || prev.requerente.email,
          telefone: profile.whatsapp || prev.requerente.telefone
        },
        foro: profile.cidade || prev.foro,
        estado_foro: profile.estado || prev.estado_foro
      }));
    }
  }, [profile]);

  useEffect(() => {
    const searchCustomers = async () => {
      if (!searchQuery.trim()) {
        setCustomers([]);
        return;
      }
      
      setSearching(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const { data, error } = await supabase
          .from('customers')
          .select('*')
          .eq('user_id', session.user.id)
          .ilike('nome', `%${searchQuery}%`)
          .limit(5);

        if (error) throw error;
        setCustomers(data || []);
      } catch (err) {
        console.error('Error searching customers:', err);
      } finally {
        setSearching(false);
      }
    };

    const debounce = setTimeout(searchCustomers, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery]);

  const handleSelectCustomer = (customer: Customer) => {
    if (activeTab === 'notificacao') {
      setDebtorName(customer.nome);
      if (customer.whatsapp) {
        setDebtorPhone(customer.whatsapp);
      }
    } else {
      setAcaoData(prev => ({
        ...prev,
        requerida: {
          ...prev.requerida,
          nome: customer.nome,
          cpf_cnpj: customer.cpf || '',
          endereco: `${customer.logradouro || ''}, ${customer.address_number || ''}, ${customer.bairro || ''}, ${customer.cidade || ''} - ${customer.estado || ''}, CEP: ${customer.cep || ''}`.replace(/^, , ,  - , CEP: $/, ''),
          email: '', // Customer type doesn't have email in the provided interface
          telefone: customer.whatsapp || ''
        }
      }));
    }
    setSearchQuery('');
    setShowDropdown(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Não autenticado');

      const newAnexos = [...acaoData.anexos];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `${session.user.id}/legal_docs/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('receipts')
          .getPublicUrl(filePath);

        newAnexos.push({ name: file.name, url: publicUrl });
      }

      setAcaoData(prev => ({ ...prev, anexos: newAnexos }));
      addNotification({
        type: 'success',
        title: 'Upload concluído',
        message: `${files.length} arquivo(s) enviado(s) com sucesso.`
      });
    } catch (err) {
      console.error('Error uploading file:', err);
      addNotification({
        type: 'error',
        title: 'Erro no upload',
        message: 'Não foi possível enviar os arquivos.'
      });
    } finally {
      setUploading(false);
    }
  };

  const removeAnexo = (index: number) => {
    setAcaoData(prev => ({
      ...prev,
      anexos: prev.anexos.filter((_, i) => i !== index)
    }));
  };

  const handleGenerateAcao = async () => {
    setIsGenerating(true);
    try {
      const valueNum = parseFloat(acaoData.divida.valor.replace(',', '.'));
      const due = new Date(acaoData.divida.vencimento);
      const today = new Date();
      
      due.setHours(0, 0, 0, 0);
      today.setHours(0, 0, 0, 0);

      const daysOfDelay = differenceInDays(today, due);
      let updatedValue = valueNum;
      
      if (daysOfDelay > 0 && (activeTab === 'cobranca' || activeTab === 'execucao')) {
        const fine = valueNum * 0.02; // 2% fine
        const monthsOfDelay = daysOfDelay / 30;
        const interest = valueNum * 0.01 * monthsOfDelay; // 1% per month
        updatedValue = valueNum + fine + interest;
      }

      const formattedValue = updatedValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      
      // Helper to format currency to words (simplified)
      const formatCurrencyToWords = (val: number) => {
        const units = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
        const teens = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
        const tens = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
        const hundreds = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

        const toWords = (n: number): string => {
          if (n === 0) return '';
          if (n === 100) return 'cem';
          let w = '';
          if (n >= 1000) {
            const th = Math.floor(n / 1000);
            w += (th === 1 ? '' : toWords(th) + ' ') + 'mil ';
            n %= 1000;
            if (n > 0) w += 'e ';
          }
          if (n >= 100) {
            w += hundreds[Math.floor(n / 100)] + ' ';
            n %= 100;
            if (n > 0) w += 'e ';
          }
          if (n >= 20) {
            w += tens[Math.floor(n / 10)] + ' ';
            n %= 10;
            if (n > 0) w += 'e ';
          } else if (n >= 10) {
            w += teens[n - 10] + ' ';
            n = 0;
          }
          if (n > 0) w += units[n] + ' ';
          return w.trim();
        };

        const integerPart = Math.floor(val);
        const decimalPart = Math.round((val - integerPart) * 100);

        let result = toWords(integerPart);
        if (integerPart === 0) result = 'zero';
        result += integerPart === 1 ? ' real' : ' reais';

        if (decimalPart > 0) {
          result += ' e ' + toWords(decimalPart);
          result += decimalPart === 1 ? ' centavo' : ' centavos';
        }

        return result;
      };

      let template = '';

      if (activeTab === 'cobranca') {
        template = `# AO JUIZADO ESPECIAL CÍVEL DE ${acaoData.foro.toUpperCase() || '[FORO]'} ${acaoData.estado_foro.toUpperCase() || '[UF]'}

**PARTE REQUERENTE:** ${acaoData.requerente.nome || '[NOME]'}, ${acaoData.requerente.estado_civil || '[ESTADO CIVIL]'}, ${acaoData.requerente.profissao || '[PROFISSÃO]'}, inscrito(a) no CPF sob o nº ${acaoData.requerente.cpf_cnpj || '[CPF]'}, residente e domiciliado(a) em ${acaoData.requerente.endereco || '[ENDEREÇO]'}, e-mail: ${acaoData.requerente.email || '[EMAIL]'}, telefone: ${acaoData.requerente.telefone || '[TELEFONE]'}.

## AÇÃO DE COBRANÇA DE DÍVIDA

em face da **PARTE REQUERIDA:** ${acaoData.requerida.nome || '[NOME]'}, ${acaoData.requerida.estado_civil || '[ESTADO CIVIL]'}, ${acaoData.requerida.profissao || '[PROFISSÃO]'}, inscrito(a) no CPF sob o nº ${acaoData.requerida.cpf_cnpj || '[CPF]'}, residente e domiciliado(a) em ${acaoData.requerida.endereco || '[ENDEREÇO]'}, e-mail: ${acaoData.requerida.email || '[EMAIL]'}, telefone: ${acaoData.requerida.telefone || '[TELEFONE]'}, pelas razões de fato e de direito a seguir aduzidas.

### DOS FATOS
A parte requerente é credora da parte requerida da importância de **${parseFloat(acaoData.divida.valor.replace(',', '.') || '0').toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}**, originária de **${acaoData.divida.origem || '[ORIGEM DA DÍVIDA]'}**, com vencimento em ${acaoData.divida.vencimento ? new Date(acaoData.divida.vencimento).toLocaleDateString('pt-BR', {timeZone: 'UTC'}) : '[DATA]'}. 
Apesar das diversas tentativas de recebimento amigável, a parte requerida permanece inadimplente, não restando outra alternativa senão a via judicial.

### DOS PEDIDOS
Com base no exposto, requer:
a) que a parte requerida seja citada da presente ação e intimada para comparecer pessoalmente ou virtualmente se houver disponibilidade à Audiência de Conciliação, a ser designada no ato da distribuição, sendo que o não comparecimento importará a pena de revelia;
b) No mérito, que seja julgado procedente o pedido para condenar a parte requerida a pagar a quantia de **${formattedValue}** mais juros de atraso de 2% e mora de 1% ao mês conforme estipulado no contrato.

Atribui à causa o valor de **${formattedValue}** (${formatCurrencyToWords(updatedValue)}).

Pretende demonstrar o alegado por todos os meios de prova admitidos em Direito.

Nestes termos, pede deferimento.

(${acaoData.foro.toUpperCase() || 'ITAPEMA'}/${acaoData.estado_foro.toUpperCase() || 'SC'}, ${new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}.)

---
**ASSINATURA DA PARTE REQUERENTE**

**ANEXOS:**
${acaoData.anexos.map(a => `* ${a.name}`).join('\n') || '[NENHUM ANEXO ADICIONADO]'}`;
      } else {
        // Execução de Nota Promissória
        template = `# AO JUIZADO ESPECIAL CÍVEL DE (a) ${acaoData.foro.toUpperCase() || 'ITAPEMA'}-${acaoData.estado_foro.toUpperCase() || 'SC'}

**PARTE EXEQUENTE:** ${acaoData.requerente.nome || '[NOME]'}, ${acaoData.requerente.estado_civil || '[ESTADO CIVIL]'}, ${acaoData.requerente.profissao || '[PROFISSÃO]'}, inscrito(a) no CPF sob o nº ${acaoData.requerente.cpf_cnpj || '[CPF]'}, residente e domiciliado(a) em ${acaoData.requerente.endereco || '[ENDEREÇO]'}, e-mail: ${acaoData.requerente.email || '[EMAIL]'}, telefone: ${acaoData.requerente.telefone || '[TELEFONE]'}.

## AÇÃO de EXECUÇÃO DE TÍTULO EXTRAJUDICIAL
**(NOTA PROMISSÓRIA – inadimplemento)**

em face da **PARTE EXECUTADA:** ${acaoData.requerida.nome || '[NOME]'}, ${acaoData.requerida.estado_civil || '[ESTADO CIVIL]'}, ${acaoData.requerida.profissao || '[PROFISSÃO]'}, inscrito(a) no CPF sob o nº ${acaoData.requerida.cpf_cnpj || '[CPF]'}, residente e domiciliado(a) em ${acaoData.requerida.endereco || '[ENDEREÇO]'}, e-mail: ${acaoData.requerida.email || '[EMAIL]'}, telefone: ${acaoData.requerida.telefone || '[TELEFONE]'}, pelas razões de fato e de direito a seguir aduzidas.

### DOS FATOS
A parte exequente aduz que é credora da parte executada na quantia nominal de **${formattedValue}** (${formatCurrencyToWords(updatedValue)}), fundada em título de crédito certo, líquido e exigível, fundada(s) em NOTA (S) DE PROMISSÓRIA, que segue em anexo, conforme planilha abaixo:

| Nº da Nota Promissória | Data de Emissão | Data de Vencimento | Valor nominal |
| :--- | :--- | :--- | :--- |
| ${acaoData.divida.numero_np || 'S/N'} | ${acaoData.divida.data_emissao_np ? new Date(acaoData.divida.data_emissao_np).toLocaleDateString('pt-BR', {timeZone: 'UTC'}) : ''} | ${acaoData.divida.vencimento ? new Date(acaoData.divida.vencimento).toLocaleDateString('pt-BR', {timeZone: 'UTC'}) : ''} | ${formattedValue} |

A pretensão da parte exequente fundamenta-se no fato de que, na(s) data(s) de vencimento da dívida, a parte executada NÃO efetuou o pagamento devido ou o fez de modo parcial, tornando-se inadimplente em face de emissão da nota promissória, perfazendo o saldo ora em cobrança de **${formattedValue}** (${formatCurrencyToWords(updatedValue)}), motivo pelo qual ajuíza a presente ação para obrigá-la a satisfazer o crédito.

### DOS PEDIDOS
Com base no exposto, requer:
a) Que a parte executada seja citada da presente ação, via mandado judicial a ser cumprido por Oficial de Justiça, para que pague no prazo legal a importância de **${formattedValue}** (${formatCurrencyToWords(updatedValue)}), a qual deve ser devidamente atualizada e acrescida de juros legais desde o inadimplemento.
b) Em caso de não satisfação do crédito naquele prazo, requer o deferimento dos seguintes procedimentos executórios para localização de bens do devedor (a) passíveis de penhora, nesta ordem e na medida da impossibilidade do anterior:
* I. O bloqueio de valores disponíveis em contas bancárias e/ou aplicações financeiras que a(s) parte(s) executada(s) mantém junto à rede bancária por meio do sistema SISBAJUD até a totalidade do crédito, com a consequente conversão em penhora em caso de não impugnação ou do seu improvimento;
* II. O bloqueio de veículo automotor em nome da(s) parte(s) executada(s) junto ao respectivo DETRAN em que estiver cadastrado, por meio do sistema RENAJUD, para tanto, informa: 
    * (  ) Dados do veículo: placa:       / RENAVAM:       / chassi:      ;
    * (X) Não sabe especificar o bem, requer a pesquisa no sistema pelo CPF informado acima.
* III. A parte exequente indica para PENHORA os seguintes bens passíveis de constrição: 
    * (X) Eletroeletrônicos em geral localizados no domicílio do(s) devedor(es);

Atribui à causa o valor de **${formattedValue}** (${formatCurrencyToWords(updatedValue)}).
Pretende demonstrar o alegado por todos os meios de prova admitidos em Direito.
Nestes termos, pede deferimento.

${acaoData.foro || 'Itapema'}/${acaoData.estado_foro || 'SC'}, ${new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}.

---
**ASSINATURA DA PARTE EXEQUENTE**

**ANEXOS:**
${acaoData.anexos.map(a => `* ${a.name}`).join('\n') || '[NENHUM ANEXO ADICIONADO]'}`;
      }

      setLegalDraft({
        json: {},
        text: template
      });

      try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
        const response = await ai.models.generateContent({
          model: "gemini-3.1-pro-preview",
          contents: `Você é um assistente jurídico especializado em Direito Civil brasileiro e Juizados Especiais Cíveis. Sua tarefa é gerar uma petição inicial profissional, clara e bem fundamentada.
          
          TIPO DE AÇÃO: ${activeTab === 'cobranca' ? 'Ação de Cobrança' : 'Execução de Título Extrajudicial (Nota Promissória)'}
          
          DADOS DO REQUERENTE/EXEQUENTE:
          Nome: ${acaoData.requerente.nome}
          CPF/CNPJ: ${acaoData.requerente.cpf_cnpj}
          Estado Civil: ${acaoData.requerente.estado_civil}
          Profissão: ${acaoData.requerente.profissao}
          Endereço: ${acaoData.requerente.endereco}
          E-mail: ${acaoData.requerente.email}
          Telefone: ${acaoData.requerente.telefone}
          
          DADOS DA REQUERIDA/EXECUTADA:
          Nome: ${acaoData.requerida.nome}
          CPF/CNPJ: ${acaoData.requerida.cpf_cnpj}
          Estado Civil: ${acaoData.requerida.estado_civil}
          Profissão: ${acaoData.requerida.profissao}
          Endereço: ${acaoData.requerida.endereco}
          E-mail: ${acaoData.requerida.email}
          Telefone: ${acaoData.requerida.telefone}
          
          DADOS DA DÍVIDA:
          Origem: ${acaoData.divida.origem || 'Nota Promissória'}
          Valor Original: ${acaoData.divida.valor}
          Vencimento: ${acaoData.divida.vencimento}
          Valor Atualizado (com multa de 2% e juros de 1% a.m.): ${formattedValue}
          Número NP: ${acaoData.divida.numero_np}
          Data Emissão NP: ${acaoData.divida.data_emissao_np}
          
          FORO: ${acaoData.foro} / ${acaoData.estado_foro}
          ANEXOS: ${acaoData.anexos.map(a => a.name).join(', ')}
          
          INSTRUÇÕES ADICIONAIS:
          1. Utilize a fundamentação legal adequada (Código de Processo Civil, Lei 9.099/95, etc.).
          2. Inclua os pedidos de citação, procedência, condenação em custas e honorários (se aplicável), e produção de provas.
          3. O texto deve estar pronto para ser assinado e protocolado.
          4. Identifique também qualquer pendência ou informação que falte para que a petição seja perfeita.
          5. Utilize Markdown para formatar o texto (negrito para títulos, seções, etc.).
          6. IMPORTANTE: Não inclua avisos legais, disclaimers ou discursos sobre a responsabilidade do usuário no campo 'text'. O texto deve conter apenas a petição judicial.
          
          Retorne um JSON com os campos 'text' (string com a petição completa formatada em Markdown) e 'pendencias' (array de strings).`,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING },
                pendencias: { type: Type.ARRAY, items: { type: Type.STRING } }
              },
              required: ["text", "pendencias"]
            }
          }
        });

        const result = JSON.parse(response.text);
        if (result.text) {
          setLegalDraft({
            json: result,
            text: result.text
          });
        }
      } catch (aiErr) {
        console.error('AI Generation failed, using template:', aiErr);
        // Keep the template already set
      }
      
      addNotification({
        type: 'success',
        title: 'Minuta Gerada',
        message: 'A minuta da petição inicial foi gerada com sucesso.'
      });
    } catch (err) {
      console.error('Error generating legal draft:', err);
      addNotification({
        type: 'error',
        title: 'Erro na Geração',
        message: 'Não foi possível gerar a minuta.'
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const calculateDebt = () => {
    if (!originalValue || !originalDueDate) return { updatedValue: 0, daysOfDelay: 0, fine: 0, interest: 0 };

    const valueNum = parseFloat(originalValue.replace(',', '.'));
    if (isNaN(valueNum)) return { updatedValue: 0, daysOfDelay: 0, fine: 0, interest: 0 };

    const due = new Date(originalDueDate);
    const today = new Date();
    
    // Reset times to compare just dates
    due.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);

    const daysOfDelay = differenceInDays(today, due);
    
    if (daysOfDelay <= 0) {
      return { updatedValue: valueNum, daysOfDelay: 0, fine: 0, interest: 0 };
    }

    const fine = valueNum * 0.02; // 2% fine
    const interestPerDay = (valueNum * 0.01) / 30; // 1% per month
    const interest = interestPerDay * daysOfDelay;

    const updatedValue = valueNum + fine + interest;

    return { updatedValue, daysOfDelay, fine, interest };
  };

  const generateTemplate = () => {
    const { updatedValue, daysOfDelay, fine, interest } = calculateDebt();
    const formattedOriginalValue = parseFloat(originalValue.replace(',', '.') || '0').toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const formattedUpdatedValue = updatedValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const formattedFine = fine.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const formattedInterest = interest.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    
    let debtDetails = `Consta em nossos registros um débito em aberto originário de **${debtOrigin || '[Descrição da Origem da Dívida]'}**, que encontra-se em atraso há **${daysOfDelay} dias** (vencimento original em ${originalDueDate ? new Date(originalDueDate).toLocaleDateString('pt-BR', {timeZone: 'UTC'}) : '[Data de Vencimento]'}).\n\n`;
    debtDetails += `O valor original da dívida era de **${formattedOriginalValue}**.\n\n`;
    if (daysOfDelay > 0) {
      debtDetails += `Sobre este valor, incidem multa contratual/legal de 2% (${formattedFine}) e juros de mora de 1% ao mês (${formattedInterest}), totalizando um débito atualizado de **${formattedUpdatedValue}**.`;
    } else {
      debtDetails += `O valor atualizado do débito é de **${formattedUpdatedValue}**.`;
    }

    let paymentSection = '';
    if (paymentInfo || installments) {
      paymentSection = `\n### Opções e Dados para Pagamento\n\n`;
      if (installments) paymentSection += `* **Parcelamento:** ${installments}\n`;
      if (paymentInfo) paymentSection += `* **Dados:** ${paymentInfo}\n`;
    }

    return `# NOTIFICAÇÃO EXTRAJUDICIAL DE COBRANÇA
    
À(o) Sr(a). **${debtorName || '[Nome da Cliente/Devedora]'}**

Prezado(a) Senhor(a),

Na qualidade de credor(a), eu, **${creditorName || '[Seu Nome/Nome da Empresa]'}**, venho por meio desta **NOTIFICÁ-LO(A) EXTRAJUDICIALMENTE** para solicitar a regularização de pendências financeiras em seu nome.

${debtDetails}

Considerando que as tentativas anteriores de contato e negociação amigável não obtiveram êxito, concedemos o prazo improrrogável de **${dueDate || '[Prazo em dias, ex: 5 (cinco) dias úteis]'}** a contar do recebimento desta notificação para a quitação do débito ou para que entre em contato visando uma composição amigável.

Ressaltamos que a nossa intenção é sempre resolver a questão da melhor forma possível para ambas as partes. No entanto, o não atendimento a esta notificação no prazo estipulado demonstrará desinteresse na resolução amigável, o que nos obrigará a adotar as medidas cabíveis para a proteção de nossos direitos. 

Tais medidas podem incluir, mas não se limitam a:
1. Inclusão do seu nome e CPF/CNPJ nos órgãos de proteção ao crédito (SPC, Serasa, SCPC).
2. Encaminhamento do débito para cobrança judicial, o que poderá acarretar o acréscimo de custas processuais, juros, correção monetária e honorários advocatícios.

Para regularizar sua situação ou apresentar uma proposta de acordo, solicitamos que entre em contato imediatamente através dos seguintes canais:

**${contactInfo || '[Seus Canais de Contato: Telefone, WhatsApp, E-mail, etc.]'}**

${paymentSection}

Certos de sua compreensão e colaboração para a rápida solução desta pendência, subscrevemo-nos.

Atenciosamente,

**${creditorName || '[Seu Nome/Nome da Empresa]'}**
*${new Date().toLocaleDateString('pt-BR')}*`;
  };

  const handleShareWhatsApp = () => {
    const text = generateTemplate();
    const encodedText = encodeURIComponent(text);
    
    if (debtorPhone) {
      const numericPhone = debtorPhone.replace(/\D/g, '');
      const finalPhone = numericPhone.length <= 11 ? `55${numericPhone}` : numericPhone;
      window.open(`https://wa.me/${finalPhone}?text=${encodedText}`, '_blank');
    } else {
      window.open(`https://wa.me/?text=${encodedText}`, '_blank');
    }
  };

  const handlePrint = () => {
    const text = generateTemplate();
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Notificação Extrajudicial</title>
          <meta charset="utf-8">
          <style>
            body { 
              font-family: "Times New Roman", Times, serif; 
              line-height: 1.6; 
              padding: 40px; 
              white-space: pre-wrap; 
              color: black; 
              font-size: 12pt;
              max-width: 800px;
              margin: 0 auto;
            }
            @media print {
              @page { margin: 2cm; }
              body { padding: 0; }
            }
          </style>
        </head>
        <body onload="setTimeout(() => window.print(), 500)">${text}</body>
      </html>
    `;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const printWindow = window.open(url, '_blank');
    
    if (!printWindow) {
      addNotification({
        type: 'error',
        title: 'Pop-up bloqueado',
        message: 'O seu navegador bloqueou a abertura da página de impressão. Por favor, permita os pop-ups para este site.'
      });
    }
  };

  const { updatedValue, daysOfDelay } = calculateDebt();

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-zinc-800 tracking-tight">Gestão de Cobrança</h2>
          <p className="text-sm text-zinc-500">Ferramentas para recuperação de crédito e assistência jurídica.</p>
        </div>
        
        <div className="flex bg-zinc-100 p-1 rounded-2xl w-fit overflow-x-auto">
          <button
            onClick={() => setActiveTab('notificacao')}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap",
              activeTab === 'notificacao' ? "bg-white text-blue-600 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
            )}
          >
            <FileText className="w-4 h-4" />
            Notificação Extrajudicial
          </button>
          <button
            onClick={() => setActiveTab('cobranca')}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap",
              activeTab === 'cobranca' ? "bg-white text-emerald-600 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
            )}
          >
            <Gavel className="w-4 h-4" />
            Ação de Cobrança
          </button>
          <button
            onClick={() => setActiveTab('execucao')}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap",
              activeTab === 'execucao' ? "bg-white text-purple-600 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
            )}
          >
            <Scale className="w-4 h-4" />
            Execução (Nota Promissória)
          </button>
        </div>
      </div>

      {activeTab === 'notificacao' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Form */}
        <div className="bg-white border border-zinc-200 rounded-[32px] p-8 shadow-sm space-y-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <FileText className="w-5 h-5 text-blue-500" />
            </div>
            <h3 className="text-lg font-bold text-zinc-800">Dados da Notificação</h3>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Seu Nome / Empresa (Credor)</label>
              <input 
                type="text" 
                value={creditorName}
                onChange={(e) => setCreditorName(e.target.value)}
                placeholder="Ex: Maria Silva / Loja da Maria"
                className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-4 py-3 text-sm focus:border-blue-500 outline-none transition-all"
              />
            </div>

            <div className="space-y-2 relative">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Nome da Cliente (Devedora)</label>
              <div className="relative">
                <input 
                  type="text" 
                  value={debtorName}
                  onChange={(e) => {
                    setDebtorName(e.target.value);
                    setSearchQuery(e.target.value);
                    setShowDropdown(true);
                  }}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="Buscar cliente ou digitar nome..."
                  className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl pl-10 pr-4 py-3 text-sm focus:border-blue-500 outline-none transition-all"
                />
                <Search className="w-4 h-4 text-zinc-400 absolute left-4 top-1/2 -translate-y-1/2" />
              </div>
              
              {showDropdown && (searchQuery || customers.length > 0) && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-zinc-200 rounded-2xl shadow-lg overflow-hidden">
                  {searching ? (
                    <div className="p-4 flex justify-center">
                      <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                    </div>
                  ) : customers.length > 0 ? (
                    <ul className="max-h-48 overflow-y-auto">
                      {customers.map(customer => (
                        <li 
                          key={customer.id}
                          onClick={() => handleSelectCustomer(customer)}
                          className="px-4 py-3 hover:bg-zinc-50 cursor-pointer text-sm text-zinc-700 border-b border-zinc-100 last:border-0"
                        >
                          {customer.nome}
                        </li>
                      ))}
                    </ul>
                  ) : searchQuery ? (
                    <div className="p-4 text-sm text-zinc-500 text-center">Nenhum cliente encontrado</div>
                  ) : null}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">WhatsApp da Cliente</label>
              <input 
                type="text" 
                value={debtorPhone}
                onChange={(e) => setDebtorPhone(e.target.value)}
                placeholder="Ex: (11) 99999-9999"
                className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-4 py-3 text-sm focus:border-blue-500 outline-none transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Origem da Dívida</label>
              <input 
                type="text" 
                value={debtOrigin}
                onChange={(e) => setDebtOrigin(e.target.value)}
                placeholder="Ex: compra de cosméticos"
                className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-4 py-3 text-sm focus:border-blue-500 outline-none transition-all"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Valor Original (R$)</label>
                <input 
                  type="text" 
                  value={originalValue}
                  onChange={(e) => setOriginalValue(e.target.value)}
                  placeholder="Ex: 150,00"
                  className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-4 py-3 text-sm focus:border-blue-500 outline-none transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Data de Vencimento</label>
                <input 
                  type="date" 
                  value={originalDueDate}
                  onChange={(e) => setOriginalDueDate(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-4 py-3 text-sm focus:border-blue-500 outline-none transition-all"
                />
              </div>
            </div>

            {originalValue && originalDueDate && (
              <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-blue-700">Dias de atraso:</span>
                  <span className="font-bold text-blue-900">{daysOfDelay} dias</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-blue-700">Valor Atualizado:</span>
                  <span className="font-bold text-blue-900">{updatedValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                </div>
                <p className="text-[10px] text-blue-600 mt-2">Inclui 2% de multa e 1% de mora ao mês.</p>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Prazo para Pagamento</label>
              <input 
                type="text" 
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                placeholder="Ex: 5 (cinco) dias úteis"
                className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-4 py-3 text-sm focus:border-blue-500 outline-none transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Canais de Contato</label>
              <textarea 
                value={contactInfo}
                onChange={(e) => setContactInfo(e.target.value)}
                placeholder="Ex: WhatsApp: (11) 99999-9999 / E-mail: contato@loja.com"
                className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-4 py-3 text-sm focus:border-blue-500 outline-none transition-all min-h-[80px]"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Opções de Parcelamento</label>
              <input 
                type="text" 
                value={installments}
                onChange={(e) => setInstallments(e.target.value)}
                placeholder="Ex: Em até 3x no cartão de crédito"
                className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-4 py-3 text-sm focus:border-blue-500 outline-none transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Dados para Pagamento</label>
              <textarea 
                value={paymentInfo}
                onChange={(e) => setPaymentInfo(e.target.value)}
                placeholder="Ex: Chave PIX: 123.456.789-00"
                className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-4 py-3 text-sm focus:border-blue-500 outline-none transition-all min-h-[80px]"
              />
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="bg-zinc-50 border border-zinc-200 rounded-[32px] p-8 shadow-inner flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-zinc-800">Pré-visualização</h3>
            <div className="flex items-center gap-3">
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 px-4 py-2 rounded-xl text-sm font-bold transition-all"
              >
                <Printer className="w-4 h-4" />
                Imprimir
              </button>
              <button
                onClick={handleShareWhatsApp}
                className="flex items-center gap-2 bg-[#25D366] hover:bg-[#128C7E] text-white px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-md shadow-[#25D366]/20"
              >
                <Send className="w-4 h-4" />
                WhatsApp
              </button>
            </div>
          </div>
          
          <div className="flex-1 bg-white border border-zinc-200 rounded-2xl p-6 overflow-y-auto shadow-sm h-[500px]">
            <div className="markdown-body font-serif text-zinc-700 text-sm leading-relaxed">
              <ReactMarkdown>{generateTemplate()}</ReactMarkdown>
            </div>
          </div>
        </div>
      </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Ação de Cobrança / Execução Form */}
          <div className="bg-white border border-zinc-200 rounded-[32px] p-8 shadow-sm space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center",
                activeTab === 'cobranca' ? "bg-emerald-50" : "bg-purple-50"
              )}>
                {activeTab === 'cobranca' ? (
                  <Gavel className="w-5 h-5 text-emerald-500" />
                ) : (
                  <Scale className="w-5 h-5 text-purple-500" />
                )}
              </div>
              <h3 className="text-lg font-bold text-zinc-800">
                {activeTab === 'cobranca' ? 'Dados da Ação Judicial' : 'Dados da Execução de Título'}
              </h3>
            </div>

            <div className="space-y-6">
              {/* Requerente / Exequente */}
              <div className="space-y-4">
                <h4 className="text-xs font-black text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                  <div className={cn("w-1 h-1 rounded-full", activeTab === 'cobranca' ? "bg-emerald-500" : "bg-purple-500")} />
                  {activeTab === 'cobranca' ? 'Parte Requerente (Você)' : 'Parte Exequente (Você)'}
                </h4>

                {isAddressIncomplete && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">Endereço Incompleto</p>
                      <p className="text-[10px] text-amber-700 mt-1">
                        Seus dados cadastrais estão incompletos. Por favor, atualize seu endereço no menu "Meu Cadastro" para que a ação seja válida.
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase">Nome Completo</label>
                    <input 
                      type="text" 
                      value={acaoData.requerente.nome}
                      onChange={(e) => setAcaoData(prev => ({ ...prev, requerente: { ...prev.requerente, nome: e.target.value } }))}
                      className="w-full bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-2 text-sm focus:border-emerald-500 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase">CPF / CNPJ</label>
                    <input 
                      type="text" 
                      value={acaoData.requerente.cpf_cnpj}
                      onChange={(e) => setAcaoData(prev => ({ ...prev, requerente: { ...prev.requerente, cpf_cnpj: e.target.value } }))}
                      className="w-full bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-2 text-sm focus:border-emerald-500 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase">Estado Civil</label>
                    <select
                      value={acaoData.requerente.estado_civil}
                      onChange={(e) => setAcaoData(prev => ({ ...prev, requerente: { ...prev.requerente, estado_civil: e.target.value } }))}
                      className="w-full bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-2 text-sm focus:border-emerald-500 outline-none transition-all"
                    >
                      <option value="">Selecione...</option>
                      <option value="Solteiro(a)">Solteiro(a)</option>
                      <option value="Casado(a)">Casado(a)</option>
                      <option value="Divorciado(a)">Divorciado(a)</option>
                      <option value="Viúvo(a)">Viúvo(a)</option>
                      <option value="União Estável">União Estável</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase">Profissão</label>
                    <input 
                      type="text" 
                      value={acaoData.requerente.profissao}
                      onChange={(e) => setAcaoData(prev => ({ ...prev, requerente: { ...prev.requerente, profissao: e.target.value } }))}
                      className="w-full bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-2 text-sm focus:border-emerald-500 outline-none transition-all"
                      placeholder="Ex: Vendedor, Autônomo..."
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase">Endereço Completo</label>
                  <input 
                    type="text" 
                    value={acaoData.requerente.endereco}
                    onChange={(e) => setAcaoData(prev => ({ ...prev, requerente: { ...prev.requerente, endereco: e.target.value } }))}
                    className="w-full bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-2 text-sm focus:border-emerald-500 outline-none transition-all"
                  />
                </div>
              </div>

              {/* Requerida / Executada */}
              <div className="space-y-4">
                <h4 className="text-xs font-black text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                  <div className="w-1 h-1 rounded-full bg-red-500" />
                  {activeTab === 'cobranca' ? 'Parte Requerida (Devedora)' : 'Parte Executada (Devedora)'}
                </h4>
                <div className="space-y-2 relative">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase">Buscar Cliente</label>
                  <div className="relative">
                    <input 
                      type="text" 
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setShowDropdown(true);
                      }}
                      onFocus={() => setShowDropdown(true)}
                      placeholder="Pesquisar por nome..."
                      className="w-full bg-zinc-50 border border-zinc-100 rounded-xl pl-10 pr-4 py-2 text-sm focus:border-emerald-500 outline-none transition-all"
                    />
                    <Search className="w-4 h-4 text-zinc-400 absolute left-4 top-1/2 -translate-y-1/2" />
                  </div>
                  
                  {showDropdown && (searchQuery || customers.length > 0) && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-zinc-200 rounded-xl shadow-lg overflow-hidden">
                      {searching ? (
                        <div className="p-4 flex justify-center">
                          <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
                        </div>
                      ) : customers.length > 0 ? (
                        <ul className="max-h-40 overflow-y-auto">
                          {customers.map(customer => (
                            <li 
                              key={customer.id}
                              onClick={() => handleSelectCustomer(customer)}
                              className="px-4 py-2 hover:bg-zinc-50 cursor-pointer text-sm text-zinc-700 border-b border-zinc-100 last:border-0"
                            >
                              {customer.nome}
                            </li>
                          ))}
                        </ul>
                      ) : searchQuery ? (
                        <div className="p-4 text-sm text-zinc-500 text-center">Nenhum cliente encontrado</div>
                      ) : null}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase">Nome Completo</label>
                    <input 
                      type="text" 
                      value={acaoData.requerida.nome}
                      onChange={(e) => setAcaoData(prev => ({ ...prev, requerida: { ...prev.requerida, nome: e.target.value } }))}
                      className="w-full bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-2 text-sm focus:border-emerald-500 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase">CPF / CNPJ</label>
                    <input 
                      type="text" 
                      value={acaoData.requerida.cpf_cnpj}
                      onChange={(e) => setAcaoData(prev => ({ ...prev, requerida: { ...prev.requerida, cpf_cnpj: e.target.value } }))}
                      className="w-full bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-2 text-sm focus:border-emerald-500 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase">Estado Civil</label>
                    <select
                      value={acaoData.requerida.estado_civil}
                      onChange={(e) => setAcaoData(prev => ({ ...prev, requerida: { ...prev.requerida, estado_civil: e.target.value } }))}
                      className="w-full bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-2 text-sm focus:border-emerald-500 outline-none transition-all"
                    >
                      <option value="">Selecione...</option>
                      <option value="Solteiro(a)">Solteiro(a)</option>
                      <option value="Casado(a)">Casado(a)</option>
                      <option value="Divorciado(a)">Divorciado(a)</option>
                      <option value="Viúvo(a)">Viúvo(a)</option>
                      <option value="União Estável">União Estável</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase">Profissão</label>
                    <input 
                      type="text" 
                      value={acaoData.requerida.profissao}
                      onChange={(e) => setAcaoData(prev => ({ ...prev, requerida: { ...prev.requerida, profissao: e.target.value } }))}
                      className="w-full bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-2 text-sm focus:border-emerald-500 outline-none transition-all"
                      placeholder="Ex: Vendedor, Autônomo..."
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase">Endereço Completo</label>
                  <input 
                    type="text" 
                    value={acaoData.requerida.endereco}
                    onChange={(e) => setAcaoData(prev => ({ ...prev, requerida: { ...prev.requerida, endereco: e.target.value } }))}
                    className="w-full bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-2 text-sm focus:border-emerald-500 outline-none transition-all"
                  />
                </div>
              </div>

              {/* Dívida */}
              <div className="space-y-4">
                <h4 className="text-xs font-black text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                  <div className="w-1 h-1 rounded-full bg-amber-500" />
                  Detalhes da {activeTab === 'cobranca' ? 'Dívida' : 'Nota Promissória'}
                </h4>
                {activeTab === 'cobranca' ? (
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase">Origem da Dívida</label>
                    <input 
                      type="text" 
                      value={acaoData.divida.origem}
                      onChange={(e) => setAcaoData(prev => ({ ...prev, divida: { ...prev.divida, origem: e.target.value } }))}
                      placeholder="Ex: Venda de mercadorias conforme nota fiscal..."
                      className="w-full bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-2 text-sm focus:border-emerald-500 outline-none transition-all"
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-zinc-400 uppercase">Nº da Nota Promissória</label>
                      <input 
                        type="text" 
                        value={acaoData.divida.numero_np}
                        onChange={(e) => setAcaoData(prev => ({ ...prev, divida: { ...prev.divida, numero_np: e.target.value } }))}
                        placeholder="Ex: S/N ou 001"
                        className="w-full bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-2 text-sm focus:border-emerald-500 outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-zinc-400 uppercase">Data de Emissão</label>
                      <input 
                        type="date" 
                        value={acaoData.divida.data_emissao_np}
                        onChange={(e) => setAcaoData(prev => ({ ...prev, divida: { ...prev.divida, data_emissao_np: e.target.value } }))}
                        className="w-full bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-2 text-sm focus:border-emerald-500 outline-none transition-all"
                      />
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase">{activeTab === 'cobranca' ? 'Valor (R$)' : 'Valor Nominal (R$)'}</label>
                    <input 
                      type="text" 
                      value={acaoData.divida.valor}
                      onChange={(e) => setAcaoData(prev => ({ ...prev, divida: { ...prev.divida, valor: e.target.value } }))}
                      className="w-full bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-2 text-sm focus:border-emerald-500 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase">Vencimento</label>
                    <input 
                      type="date" 
                      value={acaoData.divida.vencimento}
                      onChange={(e) => setAcaoData(prev => ({ ...prev, divida: { ...prev.divida, vencimento: e.target.value } }))}
                      className="w-full bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-2 text-sm focus:border-emerald-500 outline-none transition-all"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase">Documentos e Comprovantes (Anexos)</label>
                  <div className="mt-2 p-4 bg-zinc-50 border border-zinc-100 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase">Arquivos Selecionados</span>
                      <label className="cursor-pointer bg-white px-3 py-1 border border-zinc-200 rounded-lg text-[10px] font-bold text-zinc-600 hover:bg-zinc-50 transition-all flex items-center gap-2 shadow-sm">
                        {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Paperclip className="w-3 h-3 text-emerald-500" />}
                        {uploading ? 'Enviando...' : 'Anexar Documentos'}
                        <input type="file" multiple className="hidden" onChange={handleFileUpload} disabled={uploading} />
                      </label>
                    </div>

                    {acaoData.anexos.length > 0 ? (
                      <div className="grid grid-cols-1 gap-2">
                        {acaoData.anexos.map((anexo, idx) => (
                          <div key={idx} className="flex items-center justify-between p-2 bg-white border border-zinc-100 rounded-lg group">
                            <div className="flex items-center gap-2 overflow-hidden">
                              <FileText className="w-3 h-3 text-emerald-500 shrink-0" />
                              <span className="text-[10px] text-zinc-600 truncate">{anexo.name}</span>
                            </div>
                            <button 
                              onClick={() => removeAnexo(idx)}
                              className="p-1 text-zinc-300 hover:text-red-500 transition-colors"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[10px] text-zinc-400 text-center py-2 italic">
                        Nenhum documento anexado.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Foro (Cidade)</label>
                  <input 
                    type="text" 
                    value={acaoData.foro}
                    onChange={(e) => setAcaoData(prev => ({ ...prev, foro: e.target.value }))}
                    className="w-full bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-2 text-sm focus:border-emerald-500 outline-none transition-all"
                    placeholder="Ex: Itapema"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Estado (UF)</label>
                  <input 
                    type="text" 
                    value={acaoData.estado_foro}
                    onChange={(e) => setAcaoData(prev => ({ ...prev, estado_foro: e.target.value }))}
                    className="w-full bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-2 text-sm focus:border-emerald-500 outline-none transition-all"
                    placeholder="Ex: SC"
                    maxLength={2}
                  />
                </div>
              </div>

              <button
                onClick={handleGenerateAcao}
                disabled={isGenerating || !acaoData.requerida.nome || !acaoData.divida.valor}
                className={cn(
                  "w-full px-6 py-4 rounded-2xl font-bold transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 text-white",
                  activeTab === 'cobranca' ? "bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20" : "bg-purple-500 hover:bg-purple-600 shadow-purple-500/20"
                )}
              >
                {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileText className="w-5 h-5" />}
                {activeTab === 'cobranca' ? 'Gerar Minuta da Ação' : 'Gerar Minuta da Execução'}
              </button>
            </div>
          </div>

          {/* Ação de Cobrança Preview */}
          <div className="bg-zinc-50 border border-zinc-200 rounded-[32px] p-8 shadow-inner flex flex-col min-h-[600px]">
            {!legalDraft ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4">
                <div className={cn(
                  "w-16 h-16 rounded-3xl flex items-center justify-center",
                  activeTab === 'cobranca' ? "bg-emerald-50" : "bg-purple-50"
                )}>
                  {activeTab === 'cobranca' ? (
                    <Gavel className="w-8 h-8 text-emerald-300" />
                  ) : (
                    <Scale className="w-8 h-8 text-purple-300" />
                  )}
                </div>
                <div>
                  <h4 className="text-lg font-bold text-zinc-400">Aguardando Dados</h4>
                  <p className="text-sm text-zinc-400 max-w-[280px]">Preencha as informações ao lado e clique em "Gerar Minuta" para criar a petição inicial.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-6 flex flex-col h-full">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-zinc-800">Minuta da Petição</h3>
                    <span className="bg-emerald-100 text-emerald-600 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest">Modelo Estruturado</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(legalDraft.text);
                        addNotification({ type: 'success', title: 'Copiado', message: 'Texto jurídico copiado para a área de transferência.' });
                      }}
                      className="p-2 hover:bg-zinc-200 rounded-xl text-zinc-500 transition-all"
                      title="Copiar Texto"
                    >
                      <Copy className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => {
                        const htmlContent = `
                          <!DOCTYPE html>
                          <html>
                            <head>
                              <title>Petição Inicial</title>
                              <meta charset="utf-8">
                              <style>
                                body { 
                                  font-family: "Times New Roman", Times, serif; 
                                  line-height: 1.6; 
                                  padding: 40px; 
                                  white-space: pre-wrap; 
                                  color: black; 
                                  font-size: 12pt;
                                  max-width: 800px;
                                  margin: 0 auto;
                                }
                                @media print {
                                  @page { margin: 2cm; }
                                  body { padding: 0; }
                                }
                              </style>
                            </head>
                            <body onload="setTimeout(() => window.print(), 500)">${legalDraft.text}</body>
                          </html>
                        `;

                        const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
                        const url = URL.createObjectURL(blob);
                        const printWindow = window.open(url, '_blank');
                        
                        if (!printWindow) {
                          addNotification({
                            type: 'error',
                            title: 'Pop-up bloqueado',
                            message: 'O seu navegador bloqueou a abertura da página de impressão.'
                          });
                        }
                      }}
                      className="p-2 hover:bg-zinc-200 rounded-xl text-zinc-500 transition-all"
                      title="Imprimir"
                    >
                      <Printer className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {legalDraft.json.pendencias && legalDraft.json.pendencias.length > 0 && (
                  <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 space-y-2">
                    <div className="flex items-center gap-2 text-amber-700 font-bold text-xs uppercase tracking-widest">
                      <AlertTriangle className="w-4 h-4" />
                      Pendências Identificadas
                    </div>
                    <ul className="text-xs text-amber-600 space-y-1 list-disc pl-4">
                      {legalDraft.json.pendencias.map((p: string, i: number) => <li key={i}>{p}</li>)}
                    </ul>
                  </div>
                )}

                <div className="flex-1 bg-white border border-zinc-200 rounded-2xl p-6 overflow-y-auto shadow-sm">
                  <div className="markdown-body font-serif text-zinc-700 text-sm leading-relaxed">
                    <ReactMarkdown>{legalDraft.text}</ReactMarkdown>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
