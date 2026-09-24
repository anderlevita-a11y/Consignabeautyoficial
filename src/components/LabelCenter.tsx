import React, { useState, useEffect, useRef } from 'react';
import { Printer, X, Package, Tag, Settings, Plus, Minus, Search, CheckCircle2, ChevronRight, LayoutTemplate, Edit3, Trash2 } from 'lucide-react';
import { Product, LabelModel as CustomLabelModel } from '../types';
import { supabase } from '../lib/supabase';
import { cn, formatError } from '../lib/utils';
import { useNotifications } from './NotificationCenter';
import JsBarcode from 'jsbarcode';
import { LabelModelEditor } from './LabelModelEditor';
import { ConfirmationModal } from './ConfirmationModal';

interface LabelCenterProps {
  onClose: () => void;
  initialProduct?: Product;
}

type LabelType = 'barcode' | 'shipping';

interface LabelModel {
  id: string;
  name: string;
  description: string;
  width: number; // mm
  height: number; // mm
  labelsPerRow: number;
  rowsPerSheet?: number; // if undefined, it's a continuous roll
  margin?: { top: number; right: number; bottom: number; left: number };
  gap?: { horizontal: number; vertical: number };
}

const BARCODE_MODELS: LabelModel[] = [
  {
    id: 'pimaco_6180',
    name: 'Pimaco 6180 / 6080 / 6280',
    description: 'Folha A4 - 30 etiquetas (3 colunas x 10 linhas)',
    width: 66.7,
    height: 25.4,
    labelsPerRow: 3,
    rowsPerSheet: 10,
    margin: { top: 21.2, right: 4.8, bottom: 21.2, left: 4.8 },
    gap: { horizontal: 2.5, vertical: 0 }
  },
  {
    id: 'pimaco_6182',
    name: 'Pimaco 6182 / 6082 / 6282',
    description: 'Folha A4 - 14 etiquetas (2 colunas x 7 linhas)',
    width: 101.6,
    height: 33.9,
    labelsPerRow: 2,
    rowsPerSheet: 7,
    margin: { top: 21.2, right: 4.8, bottom: 21.2, left: 4.8 },
    gap: { horizontal: 2.5, vertical: 0 }
  },
  {
    id: 'thermal_40x40',
    name: 'Bobina Térmica 40x40mm',
    description: 'Impressora Térmica (Zebra, Argox, Elgin) - 1 coluna',
    width: 40,
    height: 40,
    labelsPerRow: 1,
    margin: { top: 2, right: 2, bottom: 2, left: 2 },
    gap: { horizontal: 0, vertical: 2 }
  },
  {
    id: 'thermal_33x22',
    name: 'Bobina Térmica 33x22mm (3 colunas)',
    description: 'Impressora Térmica (Joias, Óculos) - 3 colunas',
    width: 33,
    height: 22,
    labelsPerRow: 3,
    margin: { top: 2, right: 2, bottom: 2, left: 2 },
    gap: { horizontal: 2, vertical: 2 }
  },
  {
    id: 'elgin_30x15_3',
    name: 'Elgin L42 Pro - 30x15mm (3 colunas)',
    description: 'Bobina Térmica 30x15mm - 3 colunas (Nome, Barcode, EAN)',
    width: 30,
    height: 15,
    labelsPerRow: 3,
    margin: { top: 0.5, right: 0.5, bottom: 0.5, left: 0.5 },
    gap: { horizontal: 1.5, vertical: 0 }
  },
  {
    id: 'zebra_jewelry_105x13',
    name: 'Etiqueta Joias 105x13mm',
    description: 'Etiquetas - Zebra/elgin/argox - uma por vez',
    width: 105,
    height: 13,
    labelsPerRow: 1,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    gap: { horizontal: 0, vertical: 0 }
  }
];

const SHIPPING_MODELS: LabelModel[] = [
  {
    id: 'thermal_100x150',
    name: 'Bobina Térmica 100x150mm',
    description: 'Padrão Correios, Mercado Livre, Shopee, Jadlog',
    width: 100,
    height: 150,
    labelsPerRow: 1,
    margin: { top: 2, right: 2, bottom: 2, left: 2 },
    gap: { horizontal: 0, vertical: 2 }
  },
  {
    id: 'a4_4_labels',
    name: 'Folha A4 (4 por folha)',
    description: 'Padrão Correios A4 (105x148mm)',
    width: 105,
    height: 148.5,
    labelsPerRow: 2,
    rowsPerSheet: 2,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    gap: { horizontal: 0, vertical: 0 }
  }
];

export function LabelCenter({ onClose, initialProduct }: LabelCenterProps) {
  const { addNotification } = useNotifications();
  const [activeTab, setActiveTab] = useState<LabelType>('barcode');
  const [selectedModel, setSelectedModel] = useState<string>('pimaco_6180');
  const [products, setProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<{ product: Product; quantity: number }[]>([]);
  const [customModels, setCustomModels] = useState<CustomLabelModel[]>([]);
  const [showEditor, setShowEditor] = useState(false);
  const [initialModelToEdit, setInitialModelToEdit] = useState<Partial<CustomLabelModel> | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; modelId: string | null }>({
    isOpen: false,
    modelId: null
  });

  const handleDeleteModel = (e: React.MouseEvent, modelId: string) => {
    e.stopPropagation();
    setDeleteModal({ isOpen: true, modelId });
  };

  const confirmDeleteModel = async () => {
    if (!deleteModal.modelId) return;

    try {
      const { error } = await supabase
        .from('label_models')
        .delete()
        .eq('id', deleteModal.modelId);

      if (error) throw error;
      
      addNotification({ type: 'success', title: 'Sucesso', message: 'Modelo excluído com sucesso!' });
      if (selectedModel === deleteModal.modelId) {
        setSelectedModel('pimaco_6180');
      }
      loadCustomModels();
    } catch (error) {
      console.error('Error deleting label model:', error);
      addNotification({ type: 'error', title: 'Erro', message: 'Erro ao excluir modelo.' });
    } finally {
      setDeleteModal({ isOpen: false, modelId: null });
    }
  };

  const handleEditModel = (modelId: string) => {
    const isCustom = customModels.find(m => m.id === modelId);
    if (isCustom) {
      setInitialModelToEdit(isCustom);
      setShowEditor(true);
      return;
    }

    const standard = BARCODE_MODELS.find(m => m.id === modelId) || SHIPPING_MODELS.find(m => m.id === modelId);
    if (standard) {
      const isJewelry = standard.id === 'zebra_jewelry_105x13';
      const customMapping: Partial<CustomLabelModel> = {
        name: `Cópia de ${standard.name}`,
        width: standard.width,
        height: standard.height,
        labels_per_row: standard.labelsPerRow,
        rows_per_sheet: standard.rowsPerSheet,
        margin_top: standard.margin?.top || 0,
        margin_right: standard.margin?.right || 0,
        margin_bottom: standard.margin?.bottom || 0,
        margin_left: standard.margin?.left || 0,
        gap_horizontal: standard.gap?.horizontal || 0,
        gap_vertical: standard.gap?.vertical || 0,
        product_name_config: isJewelry 
          ? { enabled: true, x: 1, y: 1, fontSize: 6.5 }
          : { enabled: true, x: 2, y: 2, fontSize: 10 },
        product_price_config: isJewelry
          ? { enabled: true, x: 1, y: 6.5, fontSize: 8.5 }
          : { enabled: true, x: 2, y: 15, fontSize: 12 },
        barcode_drawing_config: isJewelry
          ? { enabled: true, x: 1, y: 3, width: 2.0, height: 40 }
          : { enabled: true, x: 2, y: 6, width: 1.5, height: 40 },
        barcode_number_config: { enabled: true, x: isJewelry ? 1 : 2, y: isJewelry ? 10 : 30, fontSize: 10 },
        product_size_config: { enabled: false, x: 0, y: 0 }
      };
      setInitialModelToEdit(customMapping);
      setShowEditor(true);
    }
  };
  const [shippingData, setShippingData] = useState({
    senderName: '',
    senderAddress: '',
    recipientName: '',
    recipientAddress: '',
    trackingCode: '',
    weight: ''
  });

  useEffect(() => {
    const init = async () => {
      await Promise.all([loadProducts(), loadCustomModels()]);
    };
    init();
  }, []);

  // Handle initial product through separate effect after products are loaded
  useEffect(() => {
    if (initialProduct) {
      // Set search term immediately to the new barcode/EAN
      const newCode = initialProduct.barcode || initialProduct.ean || '';
      setSearchTerm(newCode);

      // Refresh product list to make sure the background list reflects the saved state
      loadProducts();

      // Add to selected products immediately (replacing old version if it exists)
      setSelectedProducts(prev => {
        const exists = prev.find(p => p.product.id === initialProduct.id);
        if (exists) {
          return prev.map(p => p.product.id === initialProduct.id ? { ...p, product: initialProduct } : p);
        }
        return [{ product: initialProduct, quantity: 1 }, ...prev];
      });

      addNotification({
        type: 'success',
        title: 'Produto Carregado',
        message: `${initialProduct.name} está pronto para impressão.`
      });
    }
  }, [initialProduct?.id, initialProduct?.barcode, initialProduct?.ean]);

  const loadCustomModels = async () => {
    try {
      const { data, error } = await supabase
        .from('label_models')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCustomModels(data || []);
    } catch (error) {
      console.error('Error loading custom models:', error);
      addNotification({
        type: 'error',
        title: 'Erro ao carregar modelos',
        message: formatError(error)
      });
    }
  };

  const loadProducts = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('products')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (data) setProducts(data);
    } catch (error) {
      console.error('Error loading products:', error);
      addNotification({
        type: 'error',
        title: 'Erro ao carregar produtos',
        message: formatError(error)
      });
    }
  };

  const handleAddProduct = (product: Product) => {
    if (!selectedProducts.find(p => p.product.id === product.id)) {
      setSelectedProducts([...selectedProducts, { product, quantity: 1 }]);
    }
  };

  const handleUpdateQuantity = (productId: string, delta: number) => {
    setSelectedProducts(prev => prev.map(p => {
      if (p.product.id === productId) {
        const newQuantity = Math.max(1, p.quantity + delta);
        return { ...p, quantity: newQuantity };
      }
      return p;
    }));
  };

  const handleRemoveProduct = (productId: string) => {
    setSelectedProducts(prev => prev.filter(p => p.product.id !== productId));
  };

  const filteredProducts = products.filter(p => {
    const normalize = (str: string) => 
      (str || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    
    if (!searchTerm) return true;
    const search = normalize(searchTerm);
    return normalize(p.name).includes(search) ||
           normalize(p.label_name || '').includes(search) ||
           normalize(p.barcode || '').includes(search) ||
           normalize(p.ean || '').includes(search) ||
           (p.ean_variations || []).some(v => normalize(v).includes(search));
  });

  const handlePrint = () => {
    const allBarcodeModels = [
      ...BARCODE_MODELS,
      ...customModels.map(m => ({
        id: m.id,
        name: m.name,
        description: 'Modelo Personalizado',
        width: m.width,
        height: m.height,
        labelsPerRow: m.labels_per_row,
        rowsPerSheet: m.rows_per_sheet,
        margin: { top: m.margin_top, right: m.margin_right, bottom: m.margin_bottom, left: m.margin_left },
        gap: { horizontal: m.gap_horizontal, vertical: m.gap_vertical },
        custom: m
      }))
    ];

    const model = activeTab === 'barcode' 
      ? allBarcodeModels.find(m => m.id === selectedModel)
      : SHIPPING_MODELS.find(m => m.id === selectedModel);

    if (!model) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      addNotification({
        type: 'error',
        title: 'Pop-up bloqueado',
        message: 'O seu navegador bloqueou a abertura da página de impressão. Por favor, permita os pop-ups para este site.'
      });
      return;
    }

    const isCustom = (model as any).custom;
    const custom = isCustom ? (model as any).custom as CustomLabelModel : null;
    const isJewelryModel = model.id === 'zebra_jewelry_105x13' || (model.width === 105 && model.height === 13);
    const isElginModel = model.id === 'elgin_30x15_3';

    let htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Impressão de Etiquetas</title>
          <meta charset="utf-8">
          <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
          <style>
            body { 
              margin: 0; 
              padding: 0; 
              font-family: Arial, sans-serif; 
              background: #fff;
            }
            .page {
              ${model.rowsPerSheet ? `
                width: 210mm;
                min-height: 297mm;
                padding: ${model.margin?.top}mm ${model.margin?.right}mm ${model.margin?.bottom}mm ${model.margin?.left}mm;
                box-sizing: border-box;
                page-break-after: always;
                display: flex;
                flex-wrap: wrap;
                align-content: flex-start;
              ` : `
                width: ${model.width * model.labelsPerRow + (model.margin?.left || 0) + (model.margin?.right || 0) + (model.gap?.horizontal || 0) * (model.labelsPerRow - 1)}mm;
                padding: ${model.margin?.top || 0}mm ${model.margin?.right || 0}mm ${model.margin?.bottom || 0}mm ${model.margin?.left || 0}mm;
                box-sizing: border-box;
                display: flex;
                flex-wrap: wrap;
                align-content: flex-start;
                page-break-after: always;
              `}
            }
            .label {
              width: ${model.width}mm;
              height: ${model.height}mm;
              box-sizing: border-box;
              margin-right: ${model.gap?.horizontal || 0}mm;
              margin-bottom: ${model.rowsPerSheet ? (model.gap?.vertical || 0) : 0}mm;
              display: flex;
              flex-direction: ${isJewelryModel ? 'row' : 'column'};
              ${isCustom ? 'position: relative;' : (isJewelryModel ? 'justify-content: flex-start; align-items: stretch;' : 'justify-content: center; align-items: center;')}
              overflow: hidden;
              page-break-inside: avoid;
              ${!model.rowsPerSheet ? 'border: 1px dashed #ccc;' : ''} /* Helper border for continuous rolls */
            }
            .label:nth-child(${model.labelsPerRow}n) {
              margin-right: 0;
            }
            
            /* Barcode specific styles */
            .barcode-label {
              text-align: center;
              padding: ${isElginModel ? '0.5mm' : (isJewelryModel ? '0' : '2mm')};
              ${isJewelryModel ? 'display: flex; align-items: stretch; padding: 0;' : ''}
            }
            .barcode-name {
              ${isCustom ? `
                position: absolute;
                left: ${custom?.product_name_config.x || 0}mm;
                top: ${custom?.product_name_config.y || 0}mm;
                width: calc(100% - ${(custom?.product_name_config.x || 0) * 2}mm);
                text-align: ${custom?.product_name_config.textAlign || 'left'};
                display: ${custom?.product_name_config.enabled ? 'block' : 'none'};
                font-size: ${custom?.product_name_config.fontSize || 10}pt;
              ` : `
                font-size: ${isElginModel ? '6pt' : (isJewelryModel ? '6.5pt' : (model.height < 20 ? '6pt' : model.height < 30 ? '8pt' : '10pt'))};
                margin-bottom: ${isElginModel ? '0.5mm' : (isJewelryModel ? '0.2mm' : '2px')};
                ${isJewelryModel ? 'text-align: left; line-height: 1.1; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; width: 100%;' : ''}
              `}
              font-weight: bold;
              white-space: nowrap;
            }
            .barcode-price {
              ${isCustom ? `
                position: absolute;
                left: ${custom?.product_price_config.x || 0}mm;
                top: ${custom?.product_price_config.y || 0}mm;
                width: calc(100% - ${(custom?.product_price_config.x || 0) * 2}mm);
                text-align: ${custom?.product_price_config.textAlign || 'left'};
                display: ${custom?.product_price_config.enabled ? 'block' : 'none'};
                font-size: ${custom?.product_price_config.fontSize || 10}pt;
              ` : `
                font-size: ${isElginModel ? '7pt' : (isJewelryModel ? '8.5pt' : (model.height < 20 ? '7pt' : model.height < 30 ? '9pt' : '12pt'))};
                margin-top: ${isElginModel ? '0.5mm' : (isJewelryModel ? '0' : '2px')};
                ${isJewelryModel ? 'display: block; text-align: left; line-height: 1; width: 100%;' : ''}
              `}
              font-weight: ${isJewelryModel ? 'bold' : '800'};
            }
            .barcode-ean {
              ${isCustom ? `
                position: absolute;
                left: ${custom?.barcode_number_config.x || 0}mm;
                top: ${custom?.barcode_number_config.y || 0}mm;
                width: calc(100% - ${(custom?.barcode_number_config.x || 0) * 2}mm);
                text-align: ${custom?.barcode_number_config.textAlign || 'left'};
                display: ${custom?.barcode_number_config.enabled ? 'block' : 'none'};
                font-size: ${custom?.barcode_number_config.fontSize || 8}pt;
              ` : (isJewelryModel ? 'display: block; font-size: 7pt; margin-top: 0.5mm;' : 'display: none;')}
              font-weight: bold;
            }
            .barcode-size {
              ${isCustom ? `
                position: absolute;
                left: ${custom?.product_size_config.x || 0}mm;
                top: ${custom?.product_size_config.y || 0}mm;
                width: calc(100% - ${(custom?.product_size_config.x || 0) * 2}mm);
                text-align: ${custom?.product_size_config.textAlign || 'left'};
                display: ${custom?.product_size_config.enabled ? 'block' : 'none'};
                font-size: ${custom?.product_size_config.fontSize || 8}pt;
              ` : 'display: none;'}
              font-weight: bold;
            }
            .barcode-img {
              ${isCustom ? `
                position: absolute;
                left: ${custom?.barcode_drawing_config.x || 0}mm;
                top: ${custom?.barcode_drawing_config.y || 0}mm;
                display: ${custom?.barcode_drawing_config.enabled ? 'block' : 'none'};
                ${custom?.barcode_drawing_config.textAlign === 'center' ? 'left: 50%; transform: translateX(-50%);' : 
                  custom?.barcode_drawing_config.textAlign === 'right' ? 'left: auto; right: 0;' : ''}
              ` : `
                max-width: 100%;
                height: ${isElginModel ? '6mm' : (isJewelryModel ? '8.5mm' : (model.height < 20 ? '7mm' : model.height < 30 ? '12mm' : '18mm'))};
                ${isJewelryModel ? 'width: 26mm; flex-shrink: 0;' : ''}
              `}
            }

            /* Shipping specific styles */
            .shipping-label {
              padding: 5mm;
              border: 1px solid #000;
              width: 100%;
              height: 100%;
              display: flex;
              flex-direction: column;
            }
            .shipping-header {
              border-bottom: 2px solid #000;
              padding-bottom: 5mm;
              margin-bottom: 5mm;
              text-align: center;
              font-weight: bold;
              font-size: 16pt;
            }
            .shipping-section {
              margin-bottom: 5mm;
            }
            .shipping-title {
              font-size: 10pt;
              font-weight: bold;
              margin-bottom: 2px;
            }
            .shipping-text {
              font-size: 12pt;
            }

            @media print {
              body { -webkit-print-color-adjust: exact; }
              @page { 
                ${model.rowsPerSheet ? `
                  size: A4;
                  margin: 0;
                ` : `
                  size: ${model.width * model.labelsPerRow + (model.margin?.left || 0) + (model.margin?.right || 0) + (model.gap?.horizontal || 0) * (model.labelsPerRow - 1)}mm ${model.height + (model.margin?.top || 0) + (model.margin?.bottom || 0)}mm;
                  margin: 0;
                `}
              }
              .label { border: none !important; }
            }
          </style>
        </head>
        <body>
          <div id="labels-container"></div>
          <script>
            function renderLabels() {
              const container = document.getElementById('labels-container');
              let html = '';
              
              ${activeTab === 'barcode' ? `
                const items = ${JSON.stringify(selectedProducts.flatMap(p => Array(p.quantity).fill(p.product)))};
                let currentLabel = 0;
                let currentPage = 0;
                const labelsPerPage = ${model.rowsPerSheet ? model.labelsPerRow * model.rowsPerSheet : model.labelsPerRow || 1};
                
                items.forEach((item, index) => {
                  if (index % labelsPerPage === 0) {
                    html += '<div class="page">';
                  }
                  
                  const price = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.sale_price || 0);
                  const barcodeValue = item.barcode || item.ean || item.id.substring(0, 12);
                  const isElginSmall = ${isElginModel};
                  const isJewelry = ${isJewelryModel};
                  const isCustom = ${!!isCustom};
                  
                  html += \u0060
                    <div class="label barcode-label">
                      \${isJewelry && !isCustom ? \u0060
                        <div style="width: 85.5mm; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; padding-left: 0.5mm; flex-shrink: 0; box-sizing: border-box;">
                          <div class="barcode-name" style="position: static; width: 100%; white-space: normal; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; font-size: 7pt; line-height: 1; margin-bottom: 0.2mm; text-align: left;">\${item.name}</div>
                          <svg class="barcode-img" id="barcode-\${index}" style="position: static; width: 85mm; height: 18mm;"></svg>
                          <div class="barcode-ean" style="position: static; display: block; font-size: 9pt; margin-top: 0.2mm; font-weight: bold; text-align: left; width: 85mm;">\${barcodeValue}</div>
                        </div>
                        <div style="width: 30mm; display: flex; flex-direction: column; justify-content: center; align-items: flex-start; padding-left: 1mm; margin-left: -35mm; flex-shrink: 0; box-sizing: border-box;">
                          <div class="barcode-name" style="position: static; width: 100%; white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: 7pt; line-height: 1.1; margin-bottom: 0.5mm; text-align: left;">\${item.name}</div>
                          <div class="barcode-price" style="position: static; width: 100%; font-size: 10pt; font-weight: bold; text-align: left;">\${price}</div>
                        </div>
                      \u0060 : \u0060
                        <div class="barcode-name">\${item.name}</div>
                        <svg class="barcode-img" id="barcode-\${index}"></svg>
                        <div class="barcode-price">\${isElginSmall ? (item.ean || '') : price}</div>
                        \${isCustom ? \u0060
                          <div class="barcode-ean">\${barcodeValue}</div>
                          <div class="barcode-size">\${item.size || ''}</div>
                        \u0060 : ''}
                      \u0060}
                    </div>
                  \u0060;
                  
                  if ((index + 1) % labelsPerPage === 0 || index === items.length - 1) {
                    html += '</div>';
                  }
                });
                
                container.innerHTML = html;
                
                // Generate barcodes
                items.forEach((item, index) => {
                  const barcodeValue = item.barcode || item.ean || item.id.substring(0, 12);
                  const isElginSmall = ${model.id === 'elgin_30x15_3'};
                  const isJewelry = ${model.id === 'zebra_jewelry_105x13'};
                  const isCustom = ${!!isCustom};
                  const custom = ${JSON.stringify(custom)};
                  
                  try {
                    JsBarcode("#barcode-" + index, barcodeValue, {
                      format: "CODE128",
                      width: isCustom ? (custom.barcode_drawing_config.width || 1.0) : (isElginSmall ? 1.0 : (isJewelry ? 1.0 : 1.5)),
                      height: isCustom ? (custom.barcode_drawing_config.height || 25) : (isElginSmall ? 25 : (isJewelry ? 22 : 40)),
                      displayValue: isCustom ? false : (!isElginSmall && !isJewelry),
                      fontSize: 10,
                      margin: 0
                    });
                  } catch(e) {
                    console.error("Error generating barcode", e);
                  }
                });
              ` : `
                html += '<div class="page">';
                html += \`
                  <div class="label">
                    <div class="shipping-label">
                      <div class="shipping-header">
                        ETIQUETA DE ENVIO
                      </div>
                      <div class="shipping-section">
                        <div class="shipping-title">DESTINATÁRIO</div>
                        <div class="shipping-text">
                          <strong>\${${JSON.stringify(shippingData.recipientName)}}</strong><br>
                          \${${JSON.stringify(shippingData.recipientAddress)}.replace(/\\n/g, '<br>')}
                        </div>
                      </div>
                      <div style="flex-grow: 1;"></div>
                      <div class="shipping-section" style="border-top: 1px solid #ccc; padding-top: 5mm;">
                        <div class="shipping-title">REMETENTE</div>
                        <div class="shipping-text" style="font-size: 10pt;">
                          \${${JSON.stringify(shippingData.senderName)}}<br>
                          \${${JSON.stringify(shippingData.senderAddress)}.replace(/\\n/g, '<br>')}
                        </div>
                      </div>
                      \${${JSON.stringify(shippingData.trackingCode)} ? \`
                        <div style="text-align: center; margin-top: 5mm;">
                          <svg id="tracking-barcode"></svg>
                        </div>
                      \` : ''}
                    </div>
                  </div>
                \`;
                html += '</div>';
                container.innerHTML = html;
                
                if (${JSON.stringify(shippingData.trackingCode)}) {
                  try {
                    JsBarcode("#tracking-barcode", ${JSON.stringify(shippingData.trackingCode)}, {
                      format: "CODE128",
                      width: 2,
                      height: 50,
                      displayValue: true,
                      fontSize: 14,
                      margin: 0
                    });
                  } catch(e) {}
                }
              `}
              
              setTimeout(() => window.print(), 1000);
            }
            
            // Wait for JsBarcode to load
            window.onload = renderLabels;
          </script>
        </body>
      </html>
    `;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    printWindow.location.href = url;
  };

  if (showEditor) {
    return (
      <LabelModelEditor 
        onClose={() => {
          setShowEditor(false);
          setInitialModelToEdit(null);
        }} 
        onSaved={loadCustomModels}
        initialEditingModel={initialModelToEdit}
      />
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-zinc-800 tracking-tight">Central de Etiquetas</h2>
          <p className="text-sm text-zinc-500">Imprima etiquetas de código de barras e envio de encomendas.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowEditor(true)}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-sm font-bold transition-all"
          >
            <Settings className="w-4 h-4" />
            Configurar Modelos
          </button>
          <button
            onClick={onClose}
            className="p-2 hover:bg-zinc-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-zinc-500" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 bg-zinc-100 p-1 rounded-xl w-fit">
        <button
          onClick={() => {
            setActiveTab('barcode');
            setSelectedModel('pimaco_6180');
          }}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
            activeTab === 'barcode'
              ? "bg-white text-zinc-900 shadow-sm"
              : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/50"
          )}
        >
          <Tag className="w-4 h-4" />
          Código de Barras
        </button>
        <button
          onClick={() => {
            setActiveTab('shipping');
            setSelectedModel('thermal_100x150');
          }}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
            activeTab === 'shipping'
              ? "bg-white text-zinc-900 shadow-sm"
              : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/50"
          )}
        >
          <Package className="w-4 h-4" />
          Envio de Encomendas
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Configuration */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Model Selection */}
          <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm space-y-4">
            <h3 className="text-lg font-bold text-zinc-800 flex items-center gap-2">
              <LayoutTemplate className="w-5 h-5 text-blue-500" />
              Modelo da Etiqueta
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                ...BARCODE_MODELS,
                ...customModels.map(m => ({
                  id: m.id,
                  name: m.name,
                  description: 'Modelo Personalizado',
                  width: m.width,
                  height: m.height,
                  labelsPerRow: m.labels_per_row,
                  rowsPerSheet: m.rows_per_sheet,
                  margin: { top: m.margin_top, right: m.margin_right, bottom: m.margin_bottom, left: m.margin_left },
                  gap: { horizontal: m.gap_horizontal, vertical: m.gap_vertical }
                }))
              ].filter(m => activeTab === 'barcode' || SHIPPING_MODELS.find(sm => sm.id === m.id)).map(model => (
                <div
                  key={model.id}
                  onClick={() => setSelectedModel(model.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedModel(model.id);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  className={cn(
                    "flex flex-col items-start p-4 rounded-xl border-2 text-left transition-all cursor-pointer",
                    selectedModel === model.id
                      ? "border-blue-500 bg-blue-50/50"
                      : "border-zinc-200 bg-white hover:border-zinc-300"
                  )}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <div className="flex flex-col">
                      <span className="font-bold text-zinc-800">{model.name}</span>
                      <span className="text-[10px] text-zinc-400 font-mono">
                        {model.width}x{model.height}mm
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {customModels.some(cm => cm.id === model.id) && (
                        <button
                          onClick={(e) => handleDeleteModel(e, model.id)}
                          className="p-1.5 hover:bg-red-100 rounded-lg text-red-400 hover:text-red-600 transition-colors"
                          title="Excluir este modelo"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditModel(model.id);
                        }}
                        className="p-1.5 hover:bg-zinc-200 rounded-lg text-zinc-400 hover:text-zinc-600 transition-colors"
                        title="Personalizar este modelo"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      {selectedModel === model.id && <CheckCircle2 className="w-4 h-4 text-blue-500" />}
                    </div>
                  </div>
                  <span className="text-xs text-zinc-500">{model.description}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Content Configuration */}
          {activeTab === 'barcode' ? (
            <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm space-y-6">
              <h3 className="text-lg font-bold text-zinc-800 flex items-center gap-2">
                <Tag className="w-5 h-5 text-blue-500" />
                Produtos para Impressão
              </h3>

              {/* Search */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Buscar produto por nome ou código..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl pl-10 pr-4 py-3 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                />
                <Search className="w-4 h-4 text-zinc-400 absolute left-4 top-1/2 -translate-y-1/2" />
              </div>

              {/* Search Results */}
              <div className="border border-zinc-200 rounded-xl max-h-80 overflow-y-auto bg-white shadow-sm scrollbar-thin scrollbar-thumb-zinc-200">
                {filteredProducts.length === 0 ? (
                  <div className="p-8 text-center text-sm text-zinc-500">
                    {searchTerm ? 'Nenhum produto encontrado.' : 'Comece a digitar para pesquisar produtos...'}
                  </div>
                ) : (
                  filteredProducts.slice(0, 300).map(product => (
                    <div 
                      key={product.id}
                      className="flex items-center justify-between p-4 border-b border-zinc-100 last:border-0 hover:bg-zinc-50 transition-colors group"
                    >
                      <div className="min-w-0 pr-4">
                        <p className="font-bold text-sm text-zinc-800 truncate group-hover:text-blue-600 transition-colors">{product.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {product.barcode && (
                            <span className="text-[10px] font-bold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">EXC: {product.barcode}</span>
                          )}
                          {product.ean && (
                            <span className="text-[10px] text-zinc-400 font-mono">EAN: {product.ean}</span>
                          )}
                          {!product.barcode && !product.ean && (
                            <span className="text-[10px] text-zinc-400 italic">Sem código</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          handleAddProduct(product);
                          setSearchTerm('');
                        }}
                        className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all text-[10px] font-bold whitespace-nowrap"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        ADICIONAR
                      </button>
                    </div>
                  ))
                )}
                {filteredProducts.length > 300 && (
                  <div className="p-3 text-center text-[10px] text-zinc-400 border-t border-zinc-50 bg-zinc-50 italic font-medium">
                    Mostrando 300 de {filteredProducts.length} produtos. Refine sua busca por nome ou código para encontrar outros.
                  </div>
                )}
              </div>

              {/* Selected Products */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-zinc-700">Produtos Selecionados ({selectedProducts.reduce((acc, p) => acc + p.quantity, 0)} etiquetas)</h4>
                  {selectedProducts.length > 0 && (
                    <button 
                      onClick={() => setSelectedProducts([])}
                      className="text-[10px] font-bold text-red-500 hover:text-red-600 transition-colors uppercase tracking-wider flex items-center gap-1 bg-red-50 px-2 py-1 rounded-lg"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Limpar Tudo
                    </button>
                  )}
                </div>
                {selectedProducts.length === 0 ? (
                  <div className="p-6 border-2 border-dashed border-zinc-200 rounded-xl text-center text-zinc-500 text-sm">
                    Nenhum produto selecionado para impressão.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedProducts.map(({ product, quantity }) => (
                      <div key={product.id} className="flex items-center justify-between p-3 bg-zinc-50 border border-zinc-200 rounded-xl">
                        <div className="flex-1 min-w-0 pr-4">
                          <p className="font-medium text-sm text-zinc-800 truncate">{product.name}</p>
                          <p className="text-xs text-zinc-500">{product.barcode || product.ean || 'Sem código'}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center bg-white border border-zinc-200 rounded-lg">
                            <button
                              onClick={() => handleUpdateQuantity(product.id, -1)}
                              className="p-1.5 text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50 rounded-l-lg"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-8 text-center text-sm font-medium">{quantity}</span>
                            <button
                              onClick={() => handleUpdateQuantity(product.id, 1)}
                              className="p-1.5 text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50 rounded-r-lg"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                          <button
                            onClick={() => handleRemoveProduct(product.id)}
                            className="flex items-center gap-1 px-2 py-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors group/del"
                            title="Remover da lista"
                          >
                            <Trash2 className="w-4 h-4" />
                            <span className="text-[10px] font-bold uppercase hidden group-hover/del:inline">Excluir</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm space-y-6">
              <h3 className="text-lg font-bold text-zinc-800 flex items-center gap-2">
                <Package className="w-5 h-5 text-blue-500" />
                Dados do Envio
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-zinc-700 border-b pb-2">Destinatário</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-zinc-500 mb-1">Nome Completo</label>
                      <input
                        type="text"
                        value={shippingData.recipientName}
                        onChange={e => setShippingData({...shippingData, recipientName: e.target.value})}
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-sm focus:border-blue-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-500 mb-1">Endereço Completo</label>
                      <textarea
                        value={shippingData.recipientAddress}
                        onChange={e => setShippingData({...shippingData, recipientAddress: e.target.value})}
                        rows={3}
                        placeholder="Rua, Número, Bairro&#10;Cidade - UF&#10;CEP"
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-sm focus:border-blue-500 outline-none resize-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-zinc-700 border-b pb-2">Remetente</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-zinc-500 mb-1">Nome / Empresa</label>
                      <input
                        type="text"
                        value={shippingData.senderName}
                        onChange={e => setShippingData({...shippingData, senderName: e.target.value})}
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-sm focus:border-blue-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-500 mb-1">Endereço</label>
                      <textarea
                        value={shippingData.senderAddress}
                        onChange={e => setShippingData({...shippingData, senderAddress: e.target.value})}
                        rows={3}
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-sm focus:border-blue-500 outline-none resize-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="col-span-1 md:col-span-2 space-y-4 pt-4 border-t">
                  <h4 className="text-sm font-bold text-zinc-700">Informações Adicionais</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-zinc-500 mb-1">Código de Rastreio (Opcional)</label>
                      <input
                        type="text"
                        value={shippingData.trackingCode}
                        onChange={e => setShippingData({...shippingData, trackingCode: e.target.value})}
                        placeholder="Ex: BR123456789BR"
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-sm focus:border-blue-500 outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Actions */}
        <div className="space-y-6">
          <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-6 shadow-sm sticky top-6">
            <h3 className="text-lg font-bold text-zinc-800 mb-4">Resumo</h3>
            
            <div className="space-y-4 mb-6">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">Tipo</span>
                <span className="font-medium text-zinc-800">
                  {activeTab === 'barcode' ? 'Código de Barras' : 'Envio'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">Modelo</span>
                <span className="font-medium text-zinc-800 text-right max-w-[150px] truncate">
                  {(activeTab === 'barcode' ? BARCODE_MODELS : SHIPPING_MODELS).find(m => m.id === selectedModel)?.name}
                </span>
              </div>
              {activeTab === 'barcode' && (
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Total de Etiquetas</span>
                  <span className="font-bold text-blue-600">
                    {selectedProducts.reduce((acc, p) => acc + p.quantity, 0)}
                  </span>
                </div>
              )}
            </div>

            <button
              onClick={handlePrint}
              disabled={activeTab === 'barcode' && selectedProducts.length === 0}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-4 py-3 rounded-xl font-bold transition-all shadow-md shadow-blue-500/20"
            >
              <Printer className="w-5 h-5" />
              Imprimir Etiquetas
            </button>
            
            <p className="text-xs text-zinc-400 mt-4 text-center">
              Certifique-se de que a impressora correta está selecionada e que o tamanho do papel corresponde ao modelo escolhido.
            </p>
          </div>
        </div>
      </div>
      <ConfirmationModal
        isOpen={deleteModal.isOpen}
        title="Excluir Modelo"
        message="Tem certeza que deseja excluir este modelo de etiqueta? Esta ação não pode ser desfeita."
        onConfirm={confirmDeleteModel}
        onCancel={() => setDeleteModal({ isOpen: false, modelId: null })}
        variant="danger"
      />
    </div>
  );
}
