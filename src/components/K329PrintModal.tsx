import React, { useState, useEffect, useRef } from 'react';
import { 
  Printer, 
  Bluetooth, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  FileText, 
  Settings2, 
  RefreshCw,
  Zap,
  HelpCircle,
  ExternalLink,
  Smartphone,
  Copy,
  Download,
  Check
} from 'lucide-react';
import { 
  K329BluetoothDriver, 
  K329ReceiptBuilder, 
  buildK329Receipt, 
  buildK329ReceiptPlainText,
  printThermal80mm,
  printRawBT,
  downloadK329Bin,
  K329ReceiptData, 
  K329CodePage, 
  K329ConnectionStatus,
  K329_CONFIG
} from '../lib/k329Printer';
import { cn } from '../lib/utils';

interface K329PrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  receiptData?: K329ReceiptData;
  title?: string;
}

export const K329PrintModal: React.FC<K329PrintModalProps> = ({
  isOpen,
  onClose,
  receiptData,
  title = 'Imprimir na K329 (80mm Bluetooth)'
}) => {
  const [status, setStatus] = useState<K329ConnectionStatus>('disconnected');
  const [statusMsg, setStatusMsg] = useState<string>('Desconectado');
  const [codePage, setCodePage] = useState<K329CodePage>('CP850');
  const [isPrinting, setIsPrinting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'test' | 'config'>('preview');

  const isInIframe = typeof window !== 'undefined' && window.self !== window.top;
  const driverRef = useRef<K329BluetoothDriver | null>(null);

  useEffect(() => {
    if (!driverRef.current) {
      driverRef.current = new K329BluetoothDriver((newStatus, msg) => {
        setStatus(newStatus);
        if (msg) setStatusMsg(msg);
      });
    }
  }, []);

  if (!isOpen) return null;

  const handleConnectBluetooth = async () => {
    if (!driverRef.current) return;
    try {
      await driverRef.current.connectBluetooth();
    } catch (err: any) {
      console.error('Falha na conexão Bluetooth:', err);
    }
  };

  const handleConnectSerial = async () => {
    if (!driverRef.current) return;
    try {
      await driverRef.current.connectSerial(9600);
    } catch (err: any) {
      console.error('Falha na conexão Serial/SPP:', err);
    }
  };

  const handleDisconnect = async () => {
    if (!driverRef.current) return;
    await driverRef.current.disconnect();
  };

  const handlePrintReceipt = async () => {
    if (!driverRef.current || !driverRef.current.isConnected()) {
      setStatusMsg('Por favor, conecte a impressora K329 antes de imprimir, ou use "Imprimir Térmica (80mm)".');
      return;
    }

    if (!receiptData) {
      setStatusMsg('Nenhum dado de recibo disponível.');
      return;
    }

    setIsPrinting(true);
    try {
      const bytes = buildK329Receipt(receiptData, codePage);
      await driverRef.current.print(bytes);
    } catch (err: any) {
      console.error('Erro ao imprimir:', err);
    } finally {
      setIsPrinting(false);
    }
  };

  const handlePrintSystem = () => {
    if (!receiptData) return;
    const plainText = buildK329ReceiptPlainText(receiptData);
    printThermal80mm(plainText, title);
  };

  const handlePrintRawBT = () => {
    if (!receiptData) return;
    const bytes = buildK329Receipt(receiptData, codePage);
    printRawBT(bytes);
  };

  const handleDownloadBin = () => {
    if (!receiptData) return;
    const bytes = buildK329Receipt(receiptData, codePage);
    downloadK329Bin(bytes, `recibo-k329-${Date.now()}.bin`);
  };

  const handleCopyText = () => {
    if (!receiptData) return;
    const plainText = buildK329ReceiptPlainText(receiptData);
    navigator.clipboard.writeText(plainText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenStandalone = () => {
    window.open(window.location.href, '_blank');
  };

  const plainTextReceipt = receiptData ? buildK329ReceiptPlainText(receiptData) : '';

  const handleTestPrint = async () => {
    if (!driverRef.current || !driverRef.current.isConnected()) {
      setStatusMsg('Conecte a impressora antes de rodar o autoteste.');
      return;
    }

    setIsPrinting(true);
    try {
      const b = new K329ReceiptBuilder(codePage);
      b.init();
      b.align('center');
      b.bold(true).textSize(2, 2);
      b.textLine('TESTE K329 (80mm)');
      b.textSize(1, 1).bold(false);
      b.textLine(`Tabela Ativa: ${codePage}`);
      b.textLine(`SPP UUID: ${K329_CONFIG.SPP_UUID.slice(0, 8)}...`);
      b.doubleDivider();

      // Teste de 48 colunas exatas
      b.align('left');
      b.textLine('REGUA DE 48 COLUNAS (FONTE A - 12x24):');
      b.textLine('123456789012345678901234567890123456789012345678');
      b.divider();

      // Teste de alinhamento em 2 colunas com padding dinâmico
      b.bold(true);
      b.textLine('TESTE ALINHAMENTO DINAMICO 48 COLUNAS:');
      b.bold(false);
      b.twoColumns('PRODUTO TESTE A', 'R$ 15,00');
      b.twoColumns('CREME HIDRATANTE CORPORAL 200ML', 'R$ 89,90');
      b.twoColumns('PERFUME FLORAL INTENSO EDP LONGA DURACAO 100ML', 'R$ 249,00');
      b.divider();

      // Teste de acentuação e caracteres em português
      b.bold(true).textLine('TESTE DE ACENTUACAO (PORTUGUES PT-BR):').bold(false);
      b.textLine('ç Ç ã Ã á Á à À â Â é É ê Ê í Í ó Ó õ Õ ô Ô ú Ú');
      b.textLine('Símbolos: R$ 1º 2ª 50°C Nº & % @ / - * §');
      b.textLine('Promoção: R$ 1.250,00 com 15% de comissão!');
      b.divider();

      // Teste de QR Code e Código de barras
      b.align('center');
      b.textLine('TESTE QR CODE NATIVO (ESC/POS):');
      b.qrcode('https://consignabeauty.app/test-k329', 5);
      b.newLine(1);
      b.textLine('TESTE BARCODE CODE128:');
      b.barcode128('K329-80MM-TEST', 50);

      b.doubleDivider();
      b.bold(true).textLine('AUTOTESTE CONCLUIDO COM SUCESSO!').bold(false);
      b.textLine('Consigna Beauty - Sistema de Gestao');
      b.cut(5);

      await driverRef.current.print(b.toBytes());
    } catch (err: any) {
      console.error('Erro no teste K329:', err);
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-900 w-full max-w-2xl rounded-[32px] shadow-2xl border border-zinc-100 dark:border-zinc-800 overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200">
        
        {/* Top Header */}
        <div className="p-5 sm:p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center text-emerald-600">
              <Printer className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
                  {title}
                </h3>
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                  48 Cols
                </span>
              </div>
              <p className="text-xs text-zinc-500">
                Padrão ESC/POS • 80mm • Bluetooth Clássico SPP (UUID 00001101)
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors text-zinc-400 hover:text-zinc-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Bar */}
        <div className={cn(
          "px-6 py-2.5 flex flex-wrap items-center justify-between text-xs border-b font-medium transition-colors gap-2",
          status === 'connected' 
            ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" 
            : status === 'connecting' || status === 'printing'
            ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
            : status === 'error'
            ? "bg-red-500/10 text-red-600 border-red-500/20"
            : "bg-zinc-50 dark:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800"
        )}>
          <div className="flex items-center gap-2 max-w-full">
            <span className={cn(
              "w-2 h-2 rounded-full shrink-0 animate-pulse",
              status === 'connected' ? "bg-emerald-500" :
              status === 'connecting' || status === 'printing' ? "bg-amber-500" :
              status === 'error' ? "bg-red-500" : "bg-zinc-400"
            )} />
            <span className="font-semibold tracking-wide text-[11px] truncate">
              {statusMsg}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {status === 'connected' ? (
              <button
                onClick={handleDisconnect}
                className="px-2.5 py-1 text-[11px] bg-red-100 hover:bg-red-200 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg transition-colors font-bold"
              >
                Desconectar
              </button>
            ) : (
              <div className="flex gap-1.5">
                <button
                  onClick={handleConnectSerial}
                  className="px-2.5 py-1 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors font-bold flex items-center gap-1 shadow-sm"
                  title="Conectar via Porta Serial RFCOMM pareada (requer janela fora de iframe)"
                >
                  <Zap className="w-3 h-3" />
                  Conectar Serial/SPP
                </button>
                <button
                  onClick={handleConnectBluetooth}
                  className="px-2.5 py-1 text-[11px] bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-bold flex items-center gap-1 shadow-sm"
                  title="Conectar via Web Bluetooth GATT/SPP"
                >
                  <Bluetooth className="w-3 h-3" />
                  Bluetooth
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Alerta de Permissions Policy / Iframe */}
        {(isInIframe || statusMsg.toLowerCase().includes('permissions') || statusMsg.toLowerCase().includes('bloquead')) && (
          <div className="mx-6 mt-4 p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block">Acesso Serial Bloqueado no Iframe:</span>
                <span className="text-amber-800 dark:text-amber-300 text-[11px]">
                  Os navegadores restringem a porta Serial dentro de iframes. Abra o aplicativo em uma <strong>Aba Própria</strong> para conectar o Bluetooth SPP nativo, ou use a opção <strong>"Imprimir Térmica (80mm)"</strong> logo abaixo.
                </span>
              </div>
            </div>
            <button
              onClick={handleOpenStandalone}
              className="shrink-0 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold flex items-center gap-1.5 transition-colors shadow-sm text-xs self-end sm:self-center"
              title="Abrir em aba independente para liberar a Web Serial API"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Abrir em Nova Aba
            </button>
          </div>
        )}

        {/* Tab Selector */}
        <div className="flex border-b border-zinc-100 dark:border-zinc-800 px-6 bg-zinc-50/50 dark:bg-zinc-900/50">
          <button
            onClick={() => setActiveTab('preview')}
            className={cn(
              "py-3 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5",
              activeTab === 'preview'
                ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                : "border-transparent text-zinc-400 hover:text-zinc-600"
            )}
          >
            <FileText className="w-4 h-4" />
            Visualização 80mm
          </button>
          <button
            onClick={() => setActiveTab('test')}
            className={cn(
              "py-3 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5",
              activeTab === 'test'
                ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                : "border-transparent text-zinc-400 hover:text-zinc-600"
            )}
          >
            <CheckCircle2 className="w-4 h-4" />
            Autoteste K329
          </button>
          <button
            onClick={() => setActiveTab('config')}
            className={cn(
              "py-3 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5",
              activeTab === 'config'
                ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                : "border-transparent text-zinc-400 hover:text-zinc-600"
            )}
          >
            <Settings2 className="w-4 h-4" />
            Configuração
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {activeTab === 'preview' && (
            <div className="space-y-4">
              {/* Barra de Ações Rápidas do Preview */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1 text-xs font-bold text-zinc-600 dark:text-zinc-300">
                  <span>Layout Térmico: 48 Colunas Exatas</span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    onClick={handleCopyText}
                    className="px-2.5 py-1 text-xs bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 rounded-lg transition-colors flex items-center gap-1"
                    title="Copiar texto formatado em 48 colunas"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copiado!' : 'Copiar Texto'}
                  </button>

                  <button
                    onClick={handleDownloadBin}
                    className="px-2.5 py-1 text-xs bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 rounded-lg transition-colors flex items-center gap-1"
                    title="Baixar binário ESC/POS (.bin)"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Baixar .BIN
                  </button>

                  <button
                    onClick={handlePrintRawBT}
                    className="px-2.5 py-1 text-xs bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg border border-purple-200 transition-colors flex items-center gap-1 font-semibold"
                    title="Imprimir direto no aplicativo RawBT para Android"
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    RawBT (Android)
                  </button>
                </div>
              </div>

              <div className="bg-[#fffeee] text-zinc-900 p-5 rounded-2xl border border-amber-200/70 shadow-inner font-mono text-[11px] leading-relaxed select-all whitespace-pre overflow-x-auto">
                {plainTextReceipt || '[Nenhum item selecionado para impressão]'}
              </div>

              <div className="flex items-center gap-2 text-xs text-zinc-500 bg-zinc-50 dark:bg-zinc-800/40 p-3 rounded-xl">
                <HelpCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>
                  Formatação estrita de 48 colunas compatível com bobinas térmicas de 80 mm (Fonte A - 12x24 dots) e tabela de acentuação para português.
                </span>
              </div>
            </div>
          )}

          {activeTab === 'test' && (
            <div className="space-y-4">
              <div className="bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-700/60 space-y-3">
                <h4 className="text-sm font-bold text-zinc-800 dark:text-zinc-100 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  Roteiro do Autoteste K329
                </h4>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  O autoteste enviará um pacote completo para validar todos os recursos da sua impressora K329 de 80mm:
                </p>
                <ul className="text-xs text-zinc-600 dark:text-zinc-400 space-y-1 list-disc list-inside">
                  <li>Comando de inicialização ESC @ (0x1B, 0x40)</li>
                  <li>Configuração da tabela {codePage} para português</li>
                  <li>Régua de calibração exata de 48 colunas</li>
                  <li>Divisórias de 48 traços contínuos</li>
                  <li>Alinhamento dinâmico de duas colunas (Item e Preço)</li>
                  <li>Acentos gráficos: ç, á, é, í, ó, ú, ã, õ, º, ª</li>
                  <li>Código QR nativo (ESC/POS Modelo 2) e código de barras CODE128</li>
                  <li>Corte de papel parcial automático</li>
                </ul>
              </div>

              <button
                onClick={handleTestPrint}
                disabled={status !== 'connected' || isPrinting}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-2xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-600/20"
              >
                {isPrinting ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Printer className="w-5 h-5" />
                )}
                Executar Autoteste na K329
              </button>
            </div>
          )}

          {activeTab === 'config' && (
            <div className="space-y-4">
              <div className="bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-700/60 space-y-3">
                <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 block">
                  Tabela de Caracteres (Code Page)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setCodePage('CP850')}
                    className={cn(
                      "p-3 rounded-xl border text-left text-xs font-semibold transition-all",
                      codePage === 'CP850'
                        ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400"
                    )}
                  >
                    <div className="font-bold">CP850 (Multilingual)</div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">0x1B, 0x74, 0x02 • Padrão K329</div>
                  </button>

                  <button
                    onClick={() => setCodePage('WINDOWS-1252')}
                    className={cn(
                      "p-3 rounded-xl border text-left text-xs font-semibold transition-all",
                      codePage === 'WINDOWS-1252'
                        ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400"
                    )}
                  >
                    <div className="font-bold">Windows-1252 (Latin 1)</div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">0x1B, 0x74, 0x10 • Alternativo</div>
                  </button>
                </div>
              </div>

              <div className="bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-700/60 space-y-2 text-xs text-zinc-600 dark:text-zinc-400">
                <div className="font-bold text-zinc-800 dark:text-zinc-200">Instruções de Pareamento:</div>
                <p>1. Ligue a impressora K329 e certifique-se de que a bobina de 80mm está abastecida.</p>
                <p>2. No Android, Windows ou Mac, pareie a impressora nas configurações de Bluetooth do sistema (código padrão geral: 0000 ou 1234).</p>
                <p>3. Clique em <strong>Conectar Serial/SPP</strong> no topo para abrir o canal serial RFCOMM.</p>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Actions */}
        <div className="p-4 sm:p-5 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/70 flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-xs font-bold text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
          >
            Fechar
          </button>

          <div className="flex flex-wrap items-center gap-2">
            {/* Botão de Impressão Térmica do Sistema (sempre disponível, ignora bloqueio de iframe) */}
            <button
              onClick={handlePrintSystem}
              disabled={!receiptData}
              className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-900 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
              title="Dispara a caixa de impressão do sistema formatada para impressora térmica de 80mm com 48 colunas"
            >
              <Printer className="w-4 h-4 text-emerald-400" />
              <span>Imprimir Térmica (80mm)</span>
            </button>

            {/* Botão de Envio Direto para a K329 (Serial / Bluetooth SPP) */}
            <button
              onClick={handlePrintReceipt}
              disabled={status !== 'connected' || isPrinting || !receiptData}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-600/20 flex items-center gap-2 active:scale-95"
              title={status === 'connected' ? 'Envia comandos ESC/POS diretos para a K329' : 'Conecte à porta Serial ou Bluetooth para habilitar'}
            >
              {isPrinting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Zap className="w-4 h-4" />
              )}
              <span>{status === 'connected' ? 'Enviar para K329 (ESC/POS)' : 'K329 (Conecte acima)'}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
