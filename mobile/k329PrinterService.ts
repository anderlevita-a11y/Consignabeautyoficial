/**
 * Módulo de Impressão Térmica ESC/POS via Bluetooth para React Native (TypeScript)
 * Compatível com impressora K329 (especialmente K329_9129) - Bobina de 80mm / 48 colunas.
 */

import { PermissionsAndroid, Platform } from 'react-native';

// Definições de tipo para dispositivos Bluetooth
export interface BluetoothDevice {
  name: string;
  address: string; // Endereço MAC (ex: '00:11:22:33:44:55')
}

export interface SaleItem {
  name: string;
  qty: number;
  unitPrice: number;
  totalPrice: number;
}

export interface SaleReceiptData {
  storeName?: string;
  storeSubtitle?: string;
  storePhone?: string;
  receiptNumber?: string | number;
  customerName?: string;
  customerDoc?: string;
  dateStr?: string;
  items: SaleItem[];
  subtotal?: number;
  discount?: {
    label: string;
    value: number;
  };
  total: number;
  paymentMethod?: string;
  footerMessage?: string;
}

export const K329_CONFIG = {
  COLUMNS: 48,
  DEFAULT_PRINTER_NAME: 'K329_9129',
  FEED_LINES_AFTER_PRINT: 5,
};

/**
 * Tabela de conversão de caracteres portugueses (PT-BR) para Code Page 850 (CP850)
 */
const CP850_MAP: Record<string, number> = {
  'ç': 0x87, 'Ç': 0x80,
  'á': 0xa0, 'é': 0x82, 'í': 0xa1, 'ó': 0xa2, 'ú': 0xa3,
  'Á': 0xb5, 'É': 0x90, 'Í': 0xd6, 'Ó': 0xe0, 'Ú': 0xe9,
  'à': 0x85, 'À': 0xb7,
  'ã': 0xc6, 'Ã': 0xc7,
  'õ': 0xe4, 'Õ': 0xe5,
  'â': 0x83, 'ê': 0x88, 'ô': 0x93,
  'Â': 0xb6, 'Ê': 0xd2, 'Ô': 0xe2,
  'ü': 0x81, 'Ü': 0x9a,
  'º': 0xa7, 'ª': 0xa6, '°': 0xf8,
  '§': 0x15,
  // Espaços Unicode não-quebráveis mapeados para espaço simples 0x20
  '\u00A0': 0x20, // NBSP
  '\u202F': 0x20, // Narrow NBSP
  '\u2007': 0x20,
  '\u2009': 0x20,
  '\u200A': 0x20,
  '\u200B': 0x20,
  '\uFEFF': 0x20,
};

/**
 * Utilitário para formatar linha de 48 colunas:
 * Texto/descrição à esquerda e Preço à direita, com cálculo dinâmico de espaços e quebra segura.
 */
export function formatTwoColumns(
  left: string,
  right: string,
  totalWidth: number = K329_CONFIG.COLUMNS
): string[] {
  const safeLeft = (left || '').replace(/[\u00A0\u202F\u2000-\u200B\uFEFF]/g, ' ').trim();
  const safeRight = (right || '').replace(/[\u00A0\u202F\u2000-\u200B\uFEFF]/g, ' ').trim();
  const availableLeftWidth = totalWidth - safeRight.length - 1; // 1 espaço mínimo entre esquerda e direita

  if (availableLeftWidth <= 0) {
    return [safeLeft.slice(0, totalWidth - safeRight.length) + safeRight];
  }

  const lines: string[] = [];
  let remainingLeft = safeLeft;

  while (remainingLeft.length > availableLeftWidth) {
    let splitIdx = remainingLeft.lastIndexOf(' ', availableLeftWidth);
    if (splitIdx === -1 || splitIdx < availableLeftWidth * 0.4) {
      splitIdx = availableLeftWidth;
    }

    const lineLeft = remainingLeft.slice(0, splitIdx).trim();
    lines.push(lineLeft.padEnd(totalWidth, ' '));
    remainingLeft = remainingLeft.slice(splitIdx).trim();
  }

  // Linha final com o que restou do texto à esquerda + espaçamento + texto à direita
  const padding = totalWidth - (remainingLeft.length + safeRight.length);
  lines.push(remainingLeft + ' '.repeat(Math.max(1, padding)) + safeRight);

  return lines;
}

/**
 * Utilitário para centralizar texto em 48 colunas
 */
export function formatCenter(text: string, totalWidth: number = K329_CONFIG.COLUMNS): string {
  const clean = (text || '').replace(/[\u00A0\u202F\u2000-\u200B\uFEFF]/g, ' ').trim();
  if (clean.length >= totalWidth) return clean.slice(0, totalWidth);
  const leftPad = Math.floor((totalWidth - clean.length) / 2);
  const rightPad = totalWidth - clean.length - leftPad;
  return ' '.repeat(leftPad) + clean + ' '.repeat(rightPad);
}

/**
 * Divisória simples (exatamente 48 traços)
 */
export function formatDivider(char: string = '-', totalWidth: number = K329_CONFIG.COLUMNS): string {
  return char.repeat(totalWidth);
}

/**
 * Formata valor numérico para padrão BRL (R$ 0,00)
 */
export function formatCurrencyBRL(val: number): string {
  return 'R$ ' + val.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Construtor Fluente de Comandos ESC/POS em Bytes para a K329 (80mm / 48 colunas)
 */
export class K329ESCBuilder {
  private buffer: number[] = [];

  constructor() {
    this.init();
  }

  /**
   * Inicializa impressora (ESC @) e seleciona Fonte A (12x24) + Tabela de Caracteres CP850
   */
  public init(): this {
    this.buffer = [];
    // ESC @ (Initialize)
    this.buffer.push(0x1B, 0x40);
    // ESC M 0 (Font A - 12x24 dots - 48 colunas em 80mm)
    this.buffer.push(0x1B, 0x4D, 0x00);
    // ESC t 2 (Select CP850 Multilingual Latin I)
    this.buffer.push(0x1B, 0x74, 0x02);
    return this;
  }

  /**
   * Alinhamento (0: Esquerda, 1: Centro, 2: Direita)
   */
  public align(alignment: 'left' | 'center' | 'right'): this {
    const val = alignment === 'center' ? 0x01 : alignment === 'right' ? 0x02 : 0x00;
    this.buffer.push(0x1B, 0x61, val);
    return this;
  }

  /**
   * Negrito ligado/desligado (ESC E n)
   */
  public bold(enable: boolean): this {
    this.buffer.push(0x1B, 0x45, enable ? 0x01 : 0x00);
    return this;
  }

  /**
   * Tamanho de texto (GS ! n)
   */
  public textSize(widthMult: 1 | 2 = 1, heightMult: 1 | 2 = 1): this {
    const w = (widthMult - 1) << 4;
    const h = heightMult - 1;
    this.buffer.push(0x1D, 0x21, w | h);
    return this;
  }

  /**
   * Escreve texto convertendo acentuação para CP850
   */
  public text(str: string): this {
    const sanitized = (str || '').replace(/[\u00A0\u202F\u2000-\u200B\uFEFF]/g, ' ');
    for (let i = 0; i < sanitized.length; i++) {
      const ch = sanitized[i];
      if (ch === '\n') {
        this.buffer.push(0x0A);
      } else if (CP850_MAP[ch] !== undefined) {
        this.buffer.push(CP850_MAP[ch]);
      } else {
        const code = ch.charCodeAt(0);
        if (code <= 127) {
          this.buffer.push(code);
        } else if (/\s/.test(ch)) {
          this.buffer.push(0x20);
        } else {
          // Fallback para caractere sem acento
          const normalized = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          if (normalized.length > 0 && normalized.charCodeAt(0) <= 127) {
            this.buffer.push(normalized.charCodeAt(0));
          } else {
            this.buffer.push(0x3F);
          }
        }
      }
    }
    return this;
  }

  public textLine(str: string = ''): this {
    this.text(str);
    this.buffer.push(0x0A);
    return this;
  }

  public twoColumns(left: string, right: string): this {
    const lines = formatTwoColumns(left, right, K329_CONFIG.COLUMNS);
    for (const l of lines) {
      this.textLine(l);
    }
    return this;
  }

  public divider(char: string = '-'): this {
    return this.textLine(formatDivider(char, K329_CONFIG.COLUMNS));
  }

  public doubleDivider(): this {
    return this.divider('=');
  }

  /**
   * Avança n linhas de papel (ESC d n)
   */
  public feed(lines: number = 3): this {
    this.buffer.push(0x1B, 0x64, Math.max(1, Math.min(255, lines)));
    return this;
  }

  /**
   * Comando de corte parcial de papel (GS V 66 n)
   */
  public cut(feedLines: number = 4): this {
    this.feed(feedLines);
    this.buffer.push(0x1D, 0x56, 0x42, 0x14);
    return this;
  }

  /**
   * Retorna os bytes do payload em Uint8Array
   */
  public toUint8Array(): Uint8Array {
    return new Uint8Array(this.buffer);
  }

  /**
   * Retorna os bytes em formato Base64 (padrão de envio das pontes nativas React Native)
   */
  public toBase64(): string {
    const bytes = this.toUint8Array();
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    // No React Native ou Node, use btoa ou Buffer
    if (typeof btoa !== 'undefined') {
      return btoa(binary);
    }
    return Buffer.from(binary, 'binary').toString('base64');
  }
}

/**
 * Monta o comprovante completo de venda para a K329
 */
export function buildSaleReceiptBytes(receipt: SaleReceiptData): Uint8Array {
  const b = new K329ESCBuilder();

  // 1. Cabeçalho
  b.align('center');
  if (receipt.storeName) {
    b.bold(true).textSize(2, 2).textLine(receipt.storeName).textSize(1, 1).bold(false);
  }
  if (receipt.storeSubtitle) {
    b.textLine(receipt.storeSubtitle);
  }
  if (receipt.storePhone) {
    b.textLine(`WhatsApp: ${receipt.storePhone}`);
  }
  b.textLine('COMPROVANTE DE VENDA / SACOLA');
  b.doubleDivider();

  // 2. Metadados do Pedido e Cliente
  b.align('left');
  if (receipt.receiptNumber) {
    b.twoColumns('Identificador / Sacola:', `#${receipt.receiptNumber}`);
  }
  if (receipt.customerName) {
    b.twoColumns('Cliente:', receipt.customerName);
  }
  if (receipt.customerDoc) {
    b.twoColumns('CPF:', receipt.customerDoc);
  }
  if (receipt.dateStr) {
    b.twoColumns('Data / Hora:', receipt.dateStr);
  }
  b.divider();

  // 3. Tabela de Itens (48 colunas)
  b.bold(true);
  b.twoColumns('ITEM / DESCRICAO', 'VALOR (R$)');
  b.bold(false);
  b.divider();

  for (const item of receipt.items) {
    const qtyPrefix = item.qty > 1 ? `${item.qty}x ` : '';
    const leftText = `${qtyPrefix}${item.name}`;
    const rightText = formatCurrencyBRL(item.totalPrice);
    b.twoColumns(leftText, rightText);
  }
  b.divider();

  // 4. Subtotal e Desconto
  if (receipt.subtotal !== undefined && receipt.discount) {
    b.twoColumns('Subtotal Bruto:', formatCurrencyBRL(receipt.subtotal));
    b.twoColumns(receipt.discount.label + ':', `- ${formatCurrencyBRL(receipt.discount.value)}`);
    b.divider();
  }

  // 5. Total em Destaque
  b.bold(true);
  b.twoColumns('TOTAL A PAGAR:', formatCurrencyBRL(receipt.total));
  b.bold(false);
  b.doubleDivider();

  // 6. Forma de Pagamento
  if (receipt.paymentMethod) {
    b.twoColumns('Forma de Pagamento:', receipt.paymentMethod);
    b.divider();
  }

  // 7. Rodapé e Agradecimento
  b.align('center');
  if (receipt.footerMessage) {
    b.textLine(receipt.footerMessage);
  } else {
    b.textLine('Agradecemos pela preferencia!');
    b.textLine('Volte sempre!');
  }

  // 8. Avanço de Papel e Corte
  b.cut(K329_CONFIG.FEED_LINES_AFTER_PRINT);

  return b.toUint8Array();
}

/**
 * Driver / Gerenciador Bluetooth para React Native
 * Funciona de forma agnóstica ou integrada à biblioteca react-native-bluetooth-escpos-printer / BluetoothSerial
 */
export class K329ReactNativePrinterService {
  /**
   * Solicita permissões de Bluetooth no Android (Android 12+ e anteriores)
   */
  public static async requestBluetoothPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;

    try {
      const apiLevel = Platform.Version;

      if (typeof apiLevel === 'number' && apiLevel >= 31) {
        // Android 12+ (API 31+)
        const results = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);

        return (
          results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED &&
          results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED
        );
      } else {
        // Android 11 ou inferior
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Permissao de Localizacao e Bluetooth',
            message: 'O aplicativo precisa de permissao para localizar a impressora Bluetooth K329.',
            buttonPositive: 'Permitir',
          }
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }
    } catch (err) {
      console.warn('Erro ao solicitar permissoes Bluetooth:', err);
      return false;
    }
  }

  /**
   * Busca lista de dispositivos Bluetooth emparelhados no sistema.
   * Utiliza a ponte nativa instalada (ex: BluetoothManager ou BluetoothSerial).
   */
  public static async getPairedDevices(bluetoothBridge?: any): Promise<BluetoothDevice[]> {
    const bridge = bluetoothBridge || (global as any).BluetoothManager;
    if (!bridge) {
      console.warn('Ponte Bluetooth nativa nao encontrada. Retornando dispositivos simulados ou mock.');
      return [
        { name: 'K329_9129 (Impressora Preferencial)', address: '86:67:7A:B4:91:29' },
        { name: 'K329_PORTABLE_80MM', address: '00:11:22:33:44:55' }
      ];
    }

    try {
      // Método padrão do react-native-bluetooth-escpos-printer
      if (typeof bridge.enableBluetooth === 'function') {
        await bridge.enableBluetooth();
      }

      // Se a biblioteca for react-native-bluetooth-escpos-printer:
      if (typeof bridge.scanDevices === 'function') {
        const scanResult = await bridge.scanDevices();
        const paired = typeof scanResult === 'string' ? JSON.parse(scanResult).paired : scanResult.paired || [];
        return paired.map((d: any) => ({
          name: d.name || 'Dispositivo Desconhecido',
          address: d.address,
        }));
      }

      // Se a biblioteca for react-native-bluetooth-serial:
      if (typeof bridge.list === 'function') {
        const list = await bridge.list();
        return list.map((d: any) => ({
          name: d.name || 'Dispositivo',
          address: d.id || d.address,
        }));
      }

      return [];
    } catch (error) {
      console.error('Erro ao obter dispositivos pareados:', error);
      throw error;
    }
  }

  /**
   * Conecta ao dispositivo pelo MAC address e envia imediatamente os bytes de impressão.
   */
  public static async printToDevice(
    deviceAddress: string,
    receiptData: SaleReceiptData,
    bluetoothBridge?: any
  ): Promise<void> {
    const bridge = bluetoothBridge || (global as any).BluetoothManager;
    const escpos = (global as any).BluetoothEscposPrinter;

    // Gera os bytes ESC/POS com 48 colunas e acentuação em português
    const bytes = buildSaleReceiptBytes(receiptData);

    if (!bridge) {
      console.log(`[Simulação] Conectando à impressora K329 no endereco ${deviceAddress}...`);
      console.log(`[Simulação] Enviados ${bytes.length} bytes ESC/POS para K329_9129.`);
      return;
    }

    // 1. Conexão imediata com a impressora selecionada
    await bridge.connect(deviceAddress);

    // 2. Envio dos bytes via ponte nativa
    if (escpos && typeof escpos.printRaw === 'function') {
      // Converte para string Base64 se a ponte requerer printRaw em base64
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64Payload = (typeof btoa !== 'undefined') ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64');
      await escpos.printRaw(base64Payload);
    } else if (typeof bridge.write === 'function') {
      // react-native-bluetooth-serial aceita Buffer/Uint8Array
      await bridge.write(bytes);
    } else {
      throw new Error('Nenhum metodo de envio de bytes brutos (printRaw/write) disponivel na ponte nativa.');
    }
  }
}
