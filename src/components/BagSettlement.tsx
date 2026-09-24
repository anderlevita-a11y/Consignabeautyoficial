import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Printer, 
  Check, 
  Loader2, 
  Search, 
  QrCode, 
  Save, 
  Megaphone, 
  Copy, 
  ExternalLink, 
  Plus, 
  MinusCircle, 
  RefreshCcw, 
  RotateCcw,
  Package, 
  CheckCircle2, 
  AlertCircle 
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { generatePixPayload } from '../lib/pix';
import { supabase } from '../lib/supabase';
import { Bag, BagItem, Product, Profile } from '../types';
import { cn, printFallback, formatError, formatMoney, formatMoneyInput, parseMoney, doesProductMatchBarcode, isBarcodeMatch, isStrictBarcodeMatch, getProductDisplayCode, stripLeadingZeros } from '../lib/utils';
import { format } from 'date-fns';
import { PrintPreview } from './PrintPreview';
import { useNotifications } from './NotificationCenter';
import { ConfirmationModal } from './ConfirmationModal';

interface BagSettlementProps {
  bag: Bag;
  onClose: () => void;
  onSave: () => void;
}

interface SettlementItem extends BagItem {
  returned_quantity: number;
  product: Product;
}

export function BagSettlement({ bag, onClose, onSave }: BagSettlementProps) {
  const { addNotification } = useNotifications();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<SettlementItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<'dinheiro' | 'pix' | 'cartao'>('pix');
  const [receivedAmount, setReceivedAmount] = useState<string>('0,00');
  const [searchProduct, setSearchProduct] = useState('');
  const [userProfile, setUserProfile] = useState<Profile | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [pdfUrl, setPdfUrl] = useState('');
  const [campaignDiscount, setCampaignDiscount] = useState(30);
  const [previewType, setPreviewType] = useState<'termica' | 'a4' | 'etiqueta'>('termica');
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'warning' | 'info';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const returnInputRef = useRef<HTMLInputElement>(null);
  const lastScanRef = useRef<{ code: string; time: number }>({ code: '', time: 0 });
  const scanTimerRef = useRef<NodeJS.Timeout | null>(null);

  const focusReturnInput = () => {
    requestAnimationFrame(() => {
      returnInputRef.current?.focus();
    });
    setTimeout(() => {
      returnInputRef.current?.focus();
    }, 20);
    setTimeout(() => {
      returnInputRef.current?.focus();
    }, 80);
  };

  useEffect(() => {
    if (!loading && bag.status !== 'closed') {
      focusReturnInput();
    }
  }, [loading, bag.status]);

  useEffect(() => {
    return () => {
      if (scanTimerRef.current) {
        clearTimeout(scanTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => setFeedback(null), 2500);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  useEffect(() => {
    fetchData();
  }, [bag.id]);

  async function fetchData() {
    try {
      // Fetch campaign discount
      if (bag.campaign_id) {
        const { data: campaign } = await supabase
          .from('campaigns')
          .select('discount_pct')
          .eq('id', bag.campaign_id)
          .single();
        if (campaign) setCampaignDiscount(campaign.discount_pct);
      }

      // Fetch user profile for PIX details
      const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        setUserProfile(profile);
      }

      const { data: bagItemsData, error: bagItemsError } = await supabase
        .from('bag_items')
        .select('*')
        .eq('bag_id', bag.id)
        .limit(30000);

      if (bagItemsError) throw bagItemsError;
      
      // Fetch products separately to avoid foreign key issues
      const productIds = (bagItemsData || []).map(item => item.product_id).filter(Boolean);
      let productsData: any[] = [];
      
      if (productIds.length > 0) {
        const { data: pData } = await supabase
          .from('products')
          .select('*')
          .in('id', productIds);
        if (pData) productsData = pData;
      }

      const settlementItems = (bagItemsData || []).map(item => {
        const product = productsData.find(p => p.id === item.product_id);
        return {
          ...item,
          returned_quantity: item.returned_quantity || 0,
          product: product || {
            id: item.product_id || '',
            name: item.product_name,
            sale_price: item.unit_price, // Use stored unit_price as fallback
            current_stock: 0
          }
        };
      });
      
      setItems(settlementItems);
      
      // Calculate initial total to pay using stored unit_price
      const totalToPay = settlementItems.reduce((acc, item) => {
        const sold = item.quantity - item.returned_quantity;
        return acc + (sold * item.unit_price);
      }, 0);
      
      setReceivedAmount(formatMoney(bag.received_amount || 0));
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  }

  const updateReturnedQuantity = (itemId: string, qty: number) => {
    setItems(items.map(item => {
      if (item.id === itemId) {
        const newReturned = Math.min(item.quantity, Math.max(0, qty));
        return { ...item, returned_quantity: newReturned };
      }
      return item;
    }));
  };

  const handleReturnAll = () => {
    if (bag.status === 'closed' || items.length === 0) return;

    setConfirmModal({
      isOpen: true,
      title: 'Devolver Todos os Produtos',
      message: 'Tem certeza que deseja marcar TODOS os produtos desta sacola como devolvidos? As quantidades devolvidas serão preenchidas com o total enviado.',
      confirmText: 'Sim, Devolver Tudo',
      cancelText: 'Cancelar',
      variant: 'warning',
      onConfirm: () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        setItems(prevItems => prevItems.map(item => ({
          ...item,
          returned_quantity: item.quantity
        })));
        setFeedback({ message: 'Todos os produtos devolvidos', type: 'success' });
        focusReturnInput();
      }
    });
  };

  const totalGross = items.reduce((acc, item) => acc + (item.quantity * item.unit_price), 0);
  const totalSold = items.reduce((acc, item) => {
    const sold = item.quantity - item.returned_quantity;
    return acc + (sold * item.unit_price);
  }, 0);
  
  const commission = totalSold * (campaignDiscount / 100);
  const amountToPay = totalSold - commission;
  const numericReceivedAmount = parseMoney(receivedAmount);


  const handleReopen = async () => {
    if (saving) return;

    setConfirmModal({
      isOpen: true,
      title: 'Reabrir Sacola',
      message: 'Deseja reabrir esta sacola? Os itens devolvidos serão removidos do estoque novamente.',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        setSaving(true);
        try {
          // Idempotency check: verify current status from DB
          const { data: currentBag } = await supabase
            .from('bags')
            .select('status')
            .eq('id', bag.id)
            .single();
          
          if (currentBag?.status !== 'closed') {
            onSave();
            return;
          }

          // 1. Revert stock and reset returned_quantity
          for (const item of items) {
            // Fetch current state from DB to ensure idempotency
            const { data: dbItem } = await supabase
              .from('bag_items')
              .select('returned_quantity')
              .eq('id', item.id)
              .single();
            
            const currentReturned = dbItem?.returned_quantity || 0;

            if (currentReturned > 0) {
              const { data: product } = await supabase
                .from('products')
                .select('current_stock')
                .eq('id', item.product.id)
                .single();
              
              if (product) {
                await supabase
                  .from('products')
                  .update({ current_stock: Math.max(0, (product.current_stock || 0) - currentReturned) })
                  .eq('id', item.product.id);
              }
              
              await supabase
                .from('bag_items')
                .update({ returned_quantity: 0 })
                .eq('id', item.id);
            }
          }

          // 2. Update bag status
          const { error: bagError } = await supabase
            .from('bags')
            .update({ 
              status: 'open',
              payment_status: 'pending',
              total_value: totalGross,
              received_amount: 0
            })
            .eq('id', bag.id);

          if (bagError) throw bagError;
          
          onSave();
        } catch (err) {
          console.error('Error reopening bag:', err);
          addNotification({
            type: 'error',
            title: 'Erro ao reabrir',
            message: 'Erro ao reabrir sacola. Verifique sua conexão.'
          });
        } finally {
          setSaving(false);
        }
      }
    });
  };

  const handleFinalize = async () => {
    if (saving) return;
    setSaving(true);
    try {
      // Idempotency check: verify current status from DB
      const { data: currentBag } = await supabase
        .from('bags')
        .select('status')
        .eq('id', bag.id)
        .single();
      
      if (currentBag?.status === 'closed') {
        onSave();
        return;
      }

      // 1. Update bag items and return stock using differential adjustment
      for (const item of items) {
        // Fetch current state from DB to ensure idempotency
        const { data: dbItem } = await supabase
          .from('bag_items')
          .select('returned_quantity')
          .eq('id', item.id)
          .single();
        
        const prevReturned = dbItem?.returned_quantity || 0;
        const diff = item.returned_quantity - prevReturned;

        // Update bag item
        const { error: itemError } = await supabase
          .from('bag_items')
          .update({ returned_quantity: item.returned_quantity })
          .eq('id', item.id);
        
        if (itemError) throw itemError;

        // Return to stock based on the DIFFERENCE
        if (diff !== 0) {
          const { data: product } = await supabase
            .from('products')
            .select('current_stock, has_grid, grid_data')
            .eq('id', item.product.id)
            .single();
          
          if (product) {
            let updateData: any = {
              current_stock: Number(product.current_stock || 0) + diff
            };

            // Update grid data if product has grid
            if (product.has_grid && product.grid_data && item.color && item.size) {
              const newGridData = product.grid_data.map((g: any) => {
                if (g.color === item.color && g.size === item.size) {
                  return { ...g, quantity: (g.quantity || 0) + diff };
                }
                return g;
              });
              updateData.grid_data = newGridData;
            }

            const { error: stockError } = await supabase
              .from('products')
              .update(updateData)
              .eq('id', item.product.id);
            
            if (stockError) throw stockError;
          }
        }
      }

      // 2. Update bag status and payment
      let paymentStatus: 'paid' | 'partial' | 'pending' = 'partial';
      if (numericReceivedAmount >= amountToPay) {
        paymentStatus = 'paid';
      } else if (numericReceivedAmount <= 0) {
        paymentStatus = 'pending';
      }

      const { error: bagError } = await supabase
        .from('bags')
        .update({ 
          status: 'closed',
          total_value: amountToPay,
          received_amount: numericReceivedAmount,
          payment_status: paymentStatus,
          closed_at: new Date().toISOString()
        })
        .eq('id', bag.id);

      if (bagError) throw bagError;
      
      // Share on WhatsApp before closing
      await handleWhatsAppShare();
      
      onSave();
    } catch (err) {
      console.error('Error finalizing settlement:', err);
      addNotification({
        type: 'error',
        title: 'Erro ao finalizar',
        message: 'Erro ao finalizar acerto. Verifique sua conexão.'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleProductSearchChange = (val: string) => {
    if (scanTimerRef.current) {
      clearTimeout(scanTimerRef.current);
      scanTimerRef.current = null;
    }

    setSearchProduct(val);
    const trimmed = val.trim();
    if (!trimmed) return;

    // Para evitar que a leitura de um código seja truncada prematuramente no onChange,
    // usamos debounce para scanners que não enviam Enter, sem interceptar imediatamente
    const isCodeLike = /^\d{3,}$/.test(trimmed) || trimmed.length >= 6;
    if (isCodeLike) {
      scanTimerRef.current = setTimeout(() => {
        processProductReturn(trimmed);
      }, 450);
    }
  };

  const processProductReturn = (rawValue?: string) => {
    if (scanTimerRef.current) {
      clearTimeout(scanTimerRef.current);
      scanTimerRef.current = null;
    }

    const raw = rawValue !== undefined ? rawValue : (returnInputRef.current?.value || searchProduct);
    const code = (raw || '').trim();

    if (!code) {
      setSearchProduct('');
      if (returnInputRef.current) returnInputRef.current.value = '';
      focusReturnInput();
      return;
    }
    
    const now = Date.now();
    const codeNorm = code.toLowerCase();
    if (lastScanRef.current.code === codeNorm && now - lastScanRef.current.time < 600) {
      setSearchProduct('');
      if (returnInputRef.current) returnInputRef.current.value = '';
      focusReturnInput();
      return;
    }

    lastScanRef.current = { code: codeNorm, time: now };

    // 1. PRIORIDADE ABSOLUTA: Match estrito de código de barras
    let item = items.find(i => isStrictBarcodeMatch(i.product, code));

    // 2. Se não achou por código, verifica se o nome ou marca bate idêntico
    if (!item) {
      const searchLower = code.toLowerCase();
      item = items.find(i => 
        (i.product.name && i.product.name.trim().toLowerCase() === searchLower) ||
        (i.product.label_name && i.product.label_name.trim().toLowerCase() === searchLower)
      );
    }

    // 3. Se for código numérico e não bateu exato com nenhum item da sacola:
    const isNumericCode = /^\d{3,}$/.test(code);

    if (!item && !isNumericCode) {
      const searchLower = code.toLowerCase();
      const textMatches = items.filter(i => 
        (i.product.name?.toLowerCase() || '').includes(searchLower) ||
        (i.product.label_name?.toLowerCase() || '').includes(searchLower)
      );
      if (textMatches.length === 1) {
        item = textMatches[0];
      }
    }
    
    if (item) {
      const codeDisplay = getProductDisplayCode(item.product);
      if (item.returned_quantity >= item.quantity) {
        setFeedback({ 
          message: `Qtd máxima já devolvida: ${item.product.name}`, 
          type: 'error' 
        });
      } else {
        updateReturnedQuantity(item.id, item.returned_quantity + 1);
        setFeedback({ 
          message: codeDisplay 
            ? `Devolvido: ${item.product.name} (Cód: ${codeDisplay})` 
            : `Devolvido: ${item.product.name}`, 
          type: 'success' 
        });
      }
      setSearchProduct('');
      if (returnInputRef.current) {
        returnInputRef.current.value = '';
      }
      setTimeout(() => {
        setSearchProduct('');
        if (returnInputRef.current) {
          returnInputRef.current.value = '';
        }
      }, 0);
      focusReturnInput();
    } else {
      const errorMsg = isNumericCode 
        ? `Código "${code}" não pertence a esta sacola` 
        : `Item "${code}" não localizado nesta sacola`;
      setFeedback({ message: errorMsg, type: 'error' });
      setSearchProduct('');
      if (returnInputRef.current) {
        returnInputRef.current.value = '';
      }
      setTimeout(() => {
        setSearchProduct('');
        if (returnInputRef.current) {
          returnInputRef.current.value = '';
        }
      }, 0);
      focusReturnInput();
    }
  };

  const filteredItems = searchProduct
    ? items.filter(item => {
        const search = searchProduct.toLowerCase().trim();
        const searchStripped = stripLeadingZeros(search);

        const nameMatch = (item.product.name?.toLowerCase() || '').includes(search);
        const labelMatch = (item.product.label_name?.toLowerCase() || '').includes(search);

        const codeStrict = isStrictBarcodeMatch(item.product, search);

        const eanStr = (item.product.ean || '').toLowerCase().trim();
        const eanStripped = stripLeadingZeros(eanStr);
        const barcodeStr = (item.product.barcode || '').toLowerCase().trim();
        const barcodeStripped = stripLeadingZeros(barcodeStr);

        const codePrefixMatch = 
          (eanStr.length > 0 && eanStr.startsWith(search)) ||
          (eanStripped.length > 0 && searchStripped.length >= 2 && eanStripped.startsWith(searchStripped)) ||
          (barcodeStr.length > 0 && barcodeStr.startsWith(search)) ||
          (barcodeStripped.length > 0 && searchStripped.length >= 2 && barcodeStripped.startsWith(searchStripped));

        const codeContainsMatch = 
          (eanStr.length > 0 && eanStr.includes(search)) ||
          (barcodeStr.length > 0 && barcodeStr.includes(search));

        const varMatch = (item.product.ean_variations || []).some(v => {
          const vStr = (v || '').toLowerCase().trim();
          const vStripped = stripLeadingZeros(vStr);
          return isBarcodeMatch(v, search) ||
                 (vStr.length > 0 && vStr.startsWith(search)) ||
                 (vStripped.length > 0 && searchStripped.length >= 2 && vStripped.startsWith(searchStripped)) ||
                 (vStr.length > 0 && vStr.includes(search));
        });

        return codeStrict || codePrefixMatch || codeContainsMatch || varMatch || nameMatch || labelMatch;
      }).sort((a, b) => {
        const search = searchProduct.toLowerCase().trim();
        const aExact = isStrictBarcodeMatch(a.product, search) ? 1 : 0;
        const bExact = isStrictBarcodeMatch(b.product, search) ? 1 : 0;
        if (aExact !== bExact) return bExact - aExact;
        return 0;
      }).slice(0, 15)
    : [];

  const handleWhatsAppShare = async () => {
    try {
      const numericReceivedAmount = parseMoney(receivedAmount);
      const customerName = bag.customer?.nome || 'Cliente';
      const customerCPF = bag.customer?.cpf || '---';
      const customerWhatsApp = bag.customer?.whatsapp || '---';
      let message = `*Resumo da Sacola #${bag.bag_number.replace(/\D/g, '')}*\n`;
      message += `Cliente: ${customerName}\n`;
      if (customerCPF !== '---') {
        message += `CPF: ${customerCPF}\n`;
      }
      if (customerWhatsApp !== '---') {
        message += `WhatsApp: ${customerWhatsApp}\n`;
      }
      message += `\n*Itens:*\n`;
      
      items.forEach(item => {
        const sold = item.quantity - item.returned_quantity;
        if (sold > 0) {
          message += `- ${item.product.name}\n  ${sold} un x R$ ${item.unit_price.toFixed(2)}\n`;
        }
      });
      
      message += `\nSubtotal: R$ ${totalSold.toFixed(2)}`;
      if (campaignDiscount > 0) {
        message += `\nDesconto Campanha (${campaignDiscount}%): R$ ${commission.toFixed(2)}`;
      }
      
      message += `\n*Total a Pagar: R$ ${amountToPay.toFixed(2)}*`;
      
      if (numericReceivedAmount > 0) {
        message += `\nValor Recebido: R$ ${numericReceivedAmount.toFixed(2)}`;
        const debt = amountToPay - numericReceivedAmount;
        if (debt > 0) {
          message += `\n*Saldo Devedor: R$ ${debt.toFixed(2)}*`;
        }
      }

      message += `\n\n__________________________\nAssinatura: ${customerName}\nCPF: ${customerCPF}${customerWhatsApp !== '---' ? `\nWhatsApp: ${customerWhatsApp}` : ''}`;
      
      const encodedMessage = encodeURIComponent(message);
      window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');
    } catch (err) {
      console.error('Error sharing on WhatsApp:', err);
    }
  };

  const handlePrintPDF = async () => {
    setSaving(true);
    try {
      const doc = new jsPDF();
      const customerName = bag.customer?.nome || 'Cliente';
      const customerCPF = bag.customer?.cpf || '---';
      const dateStr = format(new Date(), 'dd/MM/yyyy HH:mm');
      
      // Header
      doc.setFontSize(20);
      doc.setTextColor(56, 168, 157); // Emerald Green color
      doc.text('CONSIGNA BEAUTY', 105, 15, { align: 'center' });
      
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text('Relatório de Acerto de Sacola', 105, 22, { align: 'center' });
      
      // Divider
      doc.setDrawColor(230, 230, 230);
      doc.line(15, 28, 195, 28);
      
      // Info section
      doc.setFontSize(11);
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'bold');
      doc.text('DADOS DA SACOLA', 15, 38);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`Sacola: #${bag.bag_number.replace(/\D/g, '')}`, 15, 45);
      doc.text(`Cliente: ${customerName}`, 15, 52);
      doc.text(`CPF: ${customerCPF}`, 15, 59);
      doc.text(`Data: ${dateStr}`, 15, 66);
      doc.text(`Status: ${bag.status === 'closed' ? 'FECHADA' : 'EM ABERTO'}`, 15, 73);

      // Items table
      const soldItems = items.map(item => ({
        product: item.product.name,
        qty: item.quantity,
        returned: item.returned_quantity,
        sold: item.quantity - item.returned_quantity,
        price: formatMoney(item.unit_price),
        total: formatMoney((item.quantity - item.returned_quantity) * item.unit_price)
      })).filter(i => i.sold > 0 || i.returned > 0);

      autoTable(doc, {
        startY: 85,
        head: [['Produto', 'Enviado', 'Devolvido', 'Vendido', 'Preço Unit.', 'Subtotal']],
        body: soldItems.map(i => [i.product, i.qty, i.returned, i.sold, i.price, i.total]),
        headStyles: { fillColor: [56, 168, 157], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        styles: { fontSize: 9, cellPadding: 3 },
        columnStyles: {
          1: { halign: 'center' },
          2: { halign: 'center' },
          3: { halign: 'center' },
          4: { halign: 'right' },
          5: { halign: 'right' },
        }
      });

      // Summary section
      const finalY = (doc as any).lastAutoTable.finalY + 15;
      
      doc.setFont('helvetica', 'bold');
      doc.text('RESUMO FINANCEIRO', 15, finalY);
      
      doc.setFont('helvetica', 'normal');
      doc.text('Subtotal Bruto:', 140, finalY + 10, { align: 'right' });
      doc.text(formatMoney(totalSold), 195, finalY + 10, { align: 'right' });
      
      doc.text(`Comissão (${campaignDiscount}%):`, 140, finalY + 17, { align: 'right' });
      doc.text(`- ${formatMoney(commission)}`, 195, finalY + 17, { align: 'right' });
      
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('TOTAL A PAGAR:', 140, finalY + 27, { align: 'right' });
      doc.setTextColor(56, 168, 157);
      doc.text(formatMoney(amountToPay), 195, finalY + 27, { align: 'right' });

      // Signatures
      const signatureY = finalY + 60;
      doc.setDrawColor(200, 200, 200);
      doc.line(20, signatureY, 90, signatureY);
      doc.line(120, signatureY, 190, signatureY);
      
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(customerName, 55, signatureY + 5, { align: 'center' });
      doc.text('Assinatura do Cliente', 55, signatureY + 10, { align: 'center' });
      
      doc.text('Consigna Beauty', 155, signatureY + 5, { align: 'center' });
      doc.text('Assinatura do Consultor', 155, signatureY + 10, { align: 'center' });

      // Save PDF
      doc.save(`Acerto_Sacola_${bag.bag_number.replace(/\D/g, '')}.pdf`);
      
      addNotification({
        type: 'success',
        title: 'PDF Gerado',
        message: 'Relatório de acerto gerado com sucesso!'
      });
    } catch (err: any) {
      console.error('Error generating PDF:', err);
      addNotification({
        type: 'error',
        title: 'Erro no PDF',
        message: 'Não foi possível gerar o PDF. Tente novamente.'
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <div className="bg-zinc-50/50 min-h-screen p-4 sm:p-8 animate-in fade-in duration-300">
      <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 mb-8">
            <h2 className="text-2xl font-bold text-zinc-800 text-center sm:text-left">Sacolas</h2>
            <div className="flex flex-col sm:flex-row gap-3">
              {bag.status === 'closed' && (
                <button 
                  onClick={handlePrintPDF}
                  disabled={saving}
                  className="flex items-center justify-center gap-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 px-6 py-3 sm:py-2.5 rounded-xl font-bold transition-all shadow-sm disabled:opacity-50 w-full sm:w-auto"
                >
                  {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Printer className="w-5 h-5" />}
                  Exportar PDF
                </button>
              )}
              {bag.status === 'closed' ? (
                <button 
                  onClick={handleReopen}
                  disabled={saving}
                  className="flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-6 py-3 sm:py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50 w-full sm:w-auto"
                >
                  {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCcw className="w-5 h-5" />}
                  Reabrir Sacola
                </button>
              ) : (
                <button 
                  onClick={handleFinalize}
                  disabled={saving}
                  className="flex items-center justify-center gap-2 bg-[#00a86b] hover:bg-[#008f5b] text-white px-6 py-3 sm:py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 w-full sm:w-auto"
                >
                  {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                  Salvar Sacola
                </button>
              )}
            </div>
          </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white border border-zinc-200 rounded-3xl p-4 sm:p-8 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                <div className="flex items-center gap-4">
                  <button onClick={onClose} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                    <X className="w-5 h-5 text-zinc-400" />
                  </button>
                  <h3 className="text-lg sm:text-xl font-bold text-zinc-700 italic">Acerto da Sacola #{bag.bag_number.replace(/\D/g, '')}</h3>
                </div>
                <div className="flex flex-wrap items-end gap-3 w-full sm:w-auto">
                  {bag.status !== 'closed' && (
                    <button
                      type="button"
                      onClick={handleReturnAll}
                      disabled={items.length === 0}
                      className="flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-50 hover:bg-amber-100 border border-amber-200/80 text-amber-800 rounded-xl text-xs font-bold transition-all active:scale-95 shadow-sm disabled:opacity-50 h-[42px] w-full sm:w-auto"
                      title="Devolver todos os produtos da sacola"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                      Devolver Tudo
                    </button>
                  )}
                  <div className="flex flex-col gap-1 w-full sm:w-auto">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Bipar Devolução</label>
                    <div className="relative w-full sm:w-64">
                    <input 
                      ref={returnInputRef}
                      type="text" 
                      placeholder="Digite ou bipe o código..."
                      className="bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2.5 text-sm font-medium text-zinc-800 focus:outline-none focus:border-emerald-500 w-full disabled:opacity-50 transition-all"
                      value={searchProduct}
                      disabled={bag.status === 'closed'}
                      onChange={(e) => handleProductSearchChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === 'Tab' || e.code === 'NumpadEnter' || e.keyCode === 13 || e.keyCode === 9) {
                          e.preventDefault();
                          e.stopPropagation();
                          processProductReturn(e.currentTarget.value);
                        }
                      }}
                      onKeyUp={(e) => {
                        if (e.key === 'Enter' || e.key === 'Tab' || e.code === 'NumpadEnter' || e.keyCode === 13 || e.keyCode === 9) {
                          e.preventDefault();
                          e.stopPropagation();
                        }
                      }}
                    />
                    {filteredItems.length > 0 && (
                      <div className="absolute z-20 top-full right-0 mt-1 bg-white border border-zinc-200 rounded-xl shadow-xl max-h-60 overflow-y-auto w-full sm:w-80">
                        {filteredItems.map(item => {
                          const code = getProductDisplayCode(item.product);
                          const isExact = isStrictBarcodeMatch(item.product, searchProduct);
                          return (
                            <button 
                              key={item.id}
                              type="button"
                              onClick={() => {
                                if (item.returned_quantity >= item.quantity) {
                                  setFeedback({ message: `Qtd máxima já devolvida: ${item.product.name}`, type: 'error' });
                                } else {
                                  updateReturnedQuantity(item.id, item.returned_quantity + 1);
                                  setFeedback({ 
                                    message: code ? `Devolvido: ${item.product.name} (Cód: ${code})` : `Devolvido: ${item.product.name}`, 
                                    type: 'success' 
                                  });
                                }
                                setSearchProduct('');
                                if (returnInputRef.current) {
                                  returnInputRef.current.value = '';
                                }
                                setTimeout(() => {
                                  setSearchProduct('');
                                  if (returnInputRef.current) {
                                    returnInputRef.current.value = '';
                                  }
                                }, 0);
                                focusReturnInput();
                              }}
                              className={cn(
                                "w-full flex items-center gap-3 px-4 py-2 hover:bg-zinc-50 text-left border-b border-zinc-50 last:border-0 transition-colors",
                                isExact && "bg-emerald-50/50 border-l-4 border-l-emerald-500"
                              )}
                            >
                              <div className={cn(
                                "w-8 h-8 rounded flex items-center justify-center shrink-0",
                                isExact ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-400"
                              )}>
                                <Package className="w-4 h-4" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-bold text-zinc-800 truncate">{item.product.name}</p>
                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                  <span className="font-mono text-[10px] font-bold text-zinc-700 bg-zinc-100 px-1.5 py-0.5 rounded border border-zinc-200">
                                    Cód: {code || 'Sem código'}
                                  </span>
                                  <span className="text-[10px] text-zinc-400">Enviado: {item.quantity}</span>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

              {/* Desktop Table View */}
              <div className="hidden md:block border border-zinc-100 rounded-2xl overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-zinc-50/50 border-b border-zinc-100">
                      <th className="px-6 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Produto</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-center">Enviado</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-center">Devolvido</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-center">Vendido</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    {items.map((item) => {
                      const sold = item.quantity - item.returned_quantity;
                      return (
                        <tr key={item.id} className="hover:bg-zinc-50/30 transition-colors">
                          <td className="px-6 py-4">
                            <div>
                              <p className="text-xs font-bold text-zinc-700 uppercase">{item.product.name}</p>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                <span className="font-mono text-[10px] font-bold text-zinc-700 bg-zinc-100 px-1.5 py-0.5 rounded border border-zinc-200">
                                  Cód: {getProductDisplayCode(item.product) || 'Sem código'}
                                </span>
                                {item.product.label_name && (
                                  <span className="text-[10px] text-zinc-400">{item.product.label_name}</span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center font-bold text-zinc-800">{item.quantity}</td>
                          <td className="px-6 py-4 text-center">
                            <input 
                              type="text" 
                              inputMode="numeric"
                              className="w-16 bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1 text-center text-sm focus:outline-none focus:border-emerald-500 disabled:opacity-50 disabled:bg-zinc-100"
                              value={item.returned_quantity === 0 ? '' : item.returned_quantity}
                              disabled={bag.status === 'closed'}
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                updateReturnedQuantity(item.id, val);
                              }}
                              placeholder="0"
                            />
                          </td>
                          <td className="px-6 py-4 text-center font-bold text-emerald-600">{sold}</td>
                          <td className="px-6 py-4 text-right font-bold text-zinc-800">
                            <p className="text-[10px] text-zinc-400">R$</p>
                            {(sold * item.unit_price).toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="md:hidden space-y-4">
                {items.map((item) => {
                  const sold = item.quantity - item.returned_quantity;
                  return (
                    <div key={item.id} className="bg-zinc-50/50 border border-zinc-100 rounded-2xl p-4 space-y-4">
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-zinc-700 uppercase truncate">{item.product.name}</p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="font-mono text-[10px] font-bold text-zinc-700 bg-zinc-100 px-1.5 py-0.5 rounded border border-zinc-200">
                              Cód: {getProductDisplayCode(item.product) || 'Sem código'}
                            </span>
                            {item.product.label_name && (
                              <span className="text-[10px] text-zinc-400">{item.product.label_name}</span>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[10px] text-zinc-400 uppercase font-bold">Total</p>
                          <p className="text-sm font-black text-zinc-800">R$ {(sold * item.unit_price).toFixed(2)}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4 pt-4 border-t border-zinc-100">
                        <div className="text-center">
                          <p className="text-[10px] text-zinc-400 uppercase font-bold mb-1">Enviado</p>
                          <p className="text-sm font-bold text-zinc-800">{item.quantity}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[10px] text-zinc-400 uppercase font-bold mb-1">Devolvido</p>
                          <input 
                            type="text" 
                            inputMode="numeric"
                            className="w-full bg-white border border-zinc-200 rounded-lg px-2 py-1 text-center text-sm font-bold focus:outline-none focus:border-emerald-500 disabled:opacity-50 disabled:bg-zinc-100"
                            value={item.returned_quantity === 0 ? '' : item.returned_quantity}
                            disabled={bag.status === 'closed'}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 0;
                              updateReturnedQuantity(item.id, val);
                            }}
                            placeholder="0"
                          />
                        </div>
                        <div className="text-center">
                          <p className="text-[10px] text-zinc-400 uppercase font-bold mb-1">Vendido</p>
                          <p className="text-sm font-bold text-emerald-600">{sold}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Sidebar Summary */}
          <div className="space-y-6">
            <div className="bg-white border border-zinc-200 rounded-3xl p-4 sm:p-8 shadow-sm space-y-8">
              <div>
                <h4 className="text-lg font-bold text-zinc-700 italic mb-6">Resumo do Acerto</h4>
                <div className="space-y-4">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-zinc-500">Valor Bruto</span>
                    <span className="font-bold text-zinc-800">R$ {totalSold.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-zinc-500">Comissão ({campaignDiscount}%)</span>
                    <span className="font-bold text-red-500">- R$ {commission.toFixed(2)}</span>
                  </div>

                  <div className="pt-4 border-t border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0">
                    <span className="text-lg font-bold text-zinc-800">A Pagar</span>
                    <span className="text-2xl font-black text-emerald-500">R$ {amountToPay.toFixed(2)}</span>
                  </div>

                  {bag.installments && bag.installments > 1 && (
                    <div className="flex flex-col items-end gap-1 mt-4 pt-4 border-t border-zinc-50">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Plano de Parcelamento</span>
                      <p className="text-emerald-600 font-black text-lg">
                        {bag.installments}x de R$ {(amountToPay / bag.installments).toFixed(2)}
                      </p>
                    </div>
                  )}

                  {numericReceivedAmount > 0 && numericReceivedAmount < amountToPay && (
                    <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0">
                      <span className="text-sm font-bold text-zinc-500">Saldo Devedor</span>
                      <span className="text-lg font-black text-red-500">
                        R$ {(amountToPay - numericReceivedAmount).toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Valor Recebido (R$)</label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 font-bold">R$</div>
                  <input 
                    type="text" 
                    inputMode="numeric"
                    className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl pl-12 pr-4 py-4 text-xl sm:text-2xl font-black text-zinc-800 focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                    value={receivedAmount}
                    disabled={bag.status === 'closed'}
                    onChange={(e) => {
                      setReceivedAmount(formatMoneyInput(e.target.value));
                    }}
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2">
                    <button 
                      onClick={() => setReceivedAmount(formatMoney(amountToPay))}
                      disabled={bag.status === 'closed'}
                      className="bg-emerald-50 text-emerald-600 hover:bg-emerald-100 px-2 py-1 rounded-lg text-[10px] font-bold uppercase transition-colors disabled:opacity-50"
                    >
                      Integral
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Forma de Pagamento</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['dinheiro', 'pix', 'cartao'] as const).map((method) => (
                    <button
                      key={method}
                      onClick={() => setPaymentMethod(method)}
                      disabled={bag.status === 'closed'}
                      className={cn(
                        "py-3 rounded-xl text-[10px] font-bold uppercase transition-all disabled:opacity-50",
                        paymentMethod === method 
                          ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" 
                          : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
                      )}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>

              {paymentMethod === 'pix' && (
                <div className="bg-zinc-50 rounded-3xl p-4 sm:p-6 flex flex-col items-center gap-4">
                  <div className="bg-white p-4 rounded-2xl shadow-sm">
                    {userProfile?.pix_key ? (
                      <QRCodeSVG 
                        value={generatePixPayload(
                          userProfile.pix_key,
                          userProfile.pix_beneficiary || 'Beneficiario',
                          'BRASIL',
                          amountToPay,
                          `SAC${bag.bag_number.replace(/\D/g, '')}`
                        )}
                        size={140}
                        level="M"
                        includeMargin={false}
                      />
                    ) : (
                      <div className="w-32 h-32 flex items-center justify-center bg-zinc-100 rounded-xl">
                        <QrCode className="w-10 h-10 text-zinc-300" />
                      </div>
                    )}
                  </div>
                  <div className="text-center space-y-1 w-full">
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Escaneie para Pagar</p>
                    {userProfile?.pix_key ? (
                      <div className="mt-2 flex flex-col items-center gap-3">
                        <div className="w-full overflow-hidden">
                          <p className="text-xs font-bold text-zinc-800 break-all">{userProfile.pix_key}</p>
                          {userProfile.pix_beneficiary && (
                            <p className="text-[10px] text-zinc-400 uppercase truncate">{userProfile.pix_beneficiary}</p>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            const payload = generatePixPayload(
                              userProfile.pix_key!,
                              userProfile.pix_beneficiary || 'Beneficiario',
                              'BRASIL',
                              amountToPay,
                              `SAC${bag.bag_number.replace(/\D/g, '')}`
                            );
                            navigator.clipboard.writeText(payload);
                            addNotification({
                              type: 'success',
                              title: 'Copiado',
                              message: 'Código PIX copiado!'
                            });
                          }}
                          className="flex items-center justify-center gap-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 px-4 py-2 rounded-lg text-xs font-bold transition-colors w-full"
                        >
                          <Copy className="w-4 h-4" />
                          Copiar Código
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-red-500 mt-2">Chave PIX não configurada.</p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-2 no-print">
                <button 
                  onClick={handleWhatsAppShare}
                  className="flex-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 p-4 rounded-2xl transition-all active:scale-95 flex items-center justify-center"
                  title="Compartilhar WhatsApp"
                >
                  <Megaphone className="w-6 h-6" />
                </button>
                <button 
                  onClick={handlePrintPDF}
                  disabled={saving}
                  className="flex-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 p-4 rounded-2xl transition-all active:scale-95 flex items-center justify-center disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-6 h-6 animate-spin" /> : <Printer className="w-6 h-6" />}
                </button>
                {bag.status === 'closed' ? (
                  <button 
                    onClick={handleReopen}
                    disabled={saving}
                    className="flex-[2] bg-amber-500 hover:bg-amber-600 text-white p-4 rounded-2xl font-bold transition-all active:scale-[0.98] shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCcw className="w-5 h-5" />}
                    Reabrir Sacola
                  </button>
                ) : (
                  <button 
                    onClick={handleFinalize}
                    disabled={saving}
                    className="flex-[2] bg-[#00a86b] hover:bg-[#008f5b] text-white p-4 rounded-2xl font-bold transition-all active:scale-[0.98] shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                    Finalizar Acerto
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {showPreview && (
        <PrintPreview 
          pdfUrl={pdfUrl} 
          tipo={previewType} 
          onClose={() => setShowPreview(false)} 
        />
      )}
      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText || 'Confirmar'}
        cancelText={confirmModal.cancelText || 'Cancelar'}
        variant={confirmModal.variant || 'warning'}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />

      {/* Feedback Overlay */}
      {feedback && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-none animate-in fade-in zoom-in duration-200 p-4">
          <div className={cn(
            "px-8 py-6 max-w-xl w-full rounded-3xl shadow-2xl backdrop-blur-md flex flex-col items-center gap-3 border-4",
            feedback.type === 'success' 
              ? "bg-emerald-600/95 border-emerald-400 text-white" 
              : "bg-red-600/95 border-red-500 text-white"
          )}>
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-16 h-16 shrink-0" />
            ) : (
              <AlertCircle className="w-16 h-16 shrink-0" />
            )}
            <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-center break-words">
              {feedback.message}
            </h2>
          </div>
        </div>
      )}
    </div>
  );
}
