/**
 * K329 Thermal Printer (80mm) ESC/POS Driver & Receipt Formatter
 * 
 * Especificações Técnicas K329:
 * - Papel: 80 mm
 * - Colunas: Exatamente 48 colunas por linha (Fonte A - 12x24 dots)
 * - Padrão de Comandos: ESC/POS
 * - Conexão: Bluetooth Clássico via SPP (Serial Port Profile)
 * - UUID SPP: 00001101-0000-1000-8000-00805F9B34FB
 * - Tabelas de Caracteres: CP850 (0x1B, 0x74, 0x02) ou Windows-1252 (0x1B, 0x74, 0x10)
 */

export const K329_CONFIG = {
  COLUMNS: 48,
  DOTS_PER_LINE: 576, // 80mm @ 203 DPI (8 dots/mm)
  SPP_UUID: '00001101-0000-1000-8000-00805F9B34FB',
  DEFAULT_CODE_PAGE: 'CP850' as 'CP850' | 'WINDOWS-1252',
  DIVIDER: '-'.repeat(48),
  DOUBLE_DIVIDER: '='.repeat(48),
  CHUNK_SIZE: 512, // Tamanho máximo de pacote para evitar buffer overflow na K329
  CHUNK_DELAY_MS: 30, // Intervalo entre envio de pacotes
};

export type K329CodePage = 'CP850' | 'WINDOWS-1252';

export type K329Align = 'left' | 'center' | 'right';

export interface K329ItemLine {
  description: string;
  qty?: number;
  unitPrice?: number;
  totalPrice: number;
}

export interface K329ReceiptData {
  header?: {
    storeName: string;
    subtitle?: string;
    documentType: string;
    storeDocument?: string;
    phone?: string;
    address?: string;
  };
  info?: Array<{ label: string; value: string }>;
  items?: K329ItemLine[];
  subtotal?: number;
  discount?: { label: string; value: number };
  total: number;
  payments?: Array<{ method: string; amount: number; installments?: string }>;
  footerNotes?: string[];
  pixQrCode?: string;
  barcode?: string;
}

export type K329ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'printing' | 'error';

/**
 * Tabela de conversão de caracteres Unicode (PT-BR) para CP850
 */
const UNICODE_TO_CP850: Record<string, number> = {
  // Letras minúsculas acentuadas
  'á': 0xA0, 'à': 0x85, 'ã': 0xC6, 'â': 0x83, 'ä': 0x84,
  'é': 0x82, 'è': 0x8A, 'ê': 0x88, 'ë': 0x89,
  'í': 0xA1, 'ì': 0x8D, 'î': 0x8C, 'ï': 0x8B,
  'ó': 0xA2, 'ò': 0x95, 'õ': 0xE4, 'ô': 0x93, 'ö': 0x94,
  'ú': 0xA3, 'ù': 0x97, 'û': 0x96, 'ü': 0x81,
  'ç': 0x87, 'ñ': 0xA4,
  // Letras maiúsculas acentuadas
  'Á': 0xB5, 'À': 0xB7, 'Ã': 0xC7, 'Â': 0xB6, 'Ä': 0x8E,
  'É': 0x90, 'È': 0xD4, 'Ê': 0xD2, 'Ë': 0xD3,
  'Í': 0xD6, 'Ì': 0xDE, 'Î': 0xD7, 'Ï': 0xD8,
  'Ó': 0xE0, 'Ò': 0xE3, 'Õ': 0xE5, 'Ô': 0xE2, 'Ö': 0x99,
  'Ú': 0xE9, 'Ù': 0xEB, 'Û': 0xEA, 'Ü': 0x9A,
  'Ç': 0x80, 'Ñ': 0xA5,
  // Símbolos comuns
  'º': 0xA7,
  'ª': 0xA6,
  '°': 0xF8,
  '§': 0xF5,
  '¿': 0xA8,
  '¡': 0xAD,
  // Espaços Unicode não-quebráveis e variantes (substitui por espaço ASCII 0x20)
  '\u00A0': 0x20, // Non-breaking space (NBSP)
  '\u202F': 0x20, // Narrow non-breaking space
  '\u2007': 0x20, // Figure space
  '\u2009': 0x20, // Thin space
  '\u200A': 0x20, // Hair space
  '\u200B': 0x20, // Zero-width space
  '\uFEFF': 0x20, // Zero-width non-breaking space / BOM
};

/**
 * Tabela de conversão de caracteres Unicode (PT-BR) para Windows-1252
 */
const UNICODE_TO_WIN1252: Record<string, number> = {
  'á': 0xE1, 'à': 0xE0, 'ã': 0xE3, 'â': 0xE2, 'ä': 0xE4,
  'é': 0xE9, 'è': 0xE8, 'ê': 0xEA, 'ë': 0xEB,
  'í': 0xED, 'ì': 0xEC, 'î': 0xEE, 'ï': 0xEF,
  'ó': 0xF3, 'ò': 0xF2, 'õ': 0xF5, 'ô': 0xF4, 'ö': 0xF6,
  'ú': 0xFA, 'ù': 0xF9, 'û': 0xFB, 'ü': 0xFC,
  'ç': 0xE7, 'ñ': 0xF1,
  'Á': 0xC1, 'À': 0xC0, 'Ã': 0xC3, 'Â': 0xC2, 'Ä': 0xC4,
  'É': 0xC9, 'È': 0xC8, 'Ê': 0xCA, 'Ë': 0xCB,
  'Í': 0xCD, 'Ì': 0xCC, 'Î': 0xCE, 'Ï': 0xCF,
  'Ó': 0xD3, 'Ò': 0xD2, 'Õ': 0xD5, 'Ô': 0xD4, 'Ö': 0xD6,
  'Ú': 0xDA, 'Ù': 0xD9, 'Û': 0xDB, 'Ü': 0xDC,
  'Ç': 0xC7, 'Ñ': 0xD1,
  'º': 0xBA,
  'ª': 0xAA,
  '°': 0xB0,
  '§': 0xA7,
  '€': 0x80,
  '•': 0x95,
  // Espaços Unicode
  '\u00A0': 0x20,
  '\u202F': 0x20,
  '\u2007': 0x20,
  '\u2009': 0x20,
  '\u200A': 0x20,
  '\u200B': 0x20,
  '\uFEFF': 0x20,
};

/**
 * Converte uma string Unicode para bytes usando a tabela de caracteres indicada (CP850 ou Windows-1252).
 * Remove ou substitui qualquer caractere de espaçamento não-padrão (como NBSP gerado por toLocaleString)
 * por espaço padrão (0x20), impedindo que apareça como ponto de interrogação (?) no recibo físico.
 */
export function encodeStringToBytes(text: string, codePage: K329CodePage = 'CP850'): Uint8Array {
  const bytes: number[] = [];
  const map = codePage === 'CP850' ? UNICODE_TO_CP850 : UNICODE_TO_WIN1252;

  // Substitui preventivamente qualquer espaço Unicode especial por espaço normal ASCII (0x20)
  const sanitizedText = (text || '')
    .replace(/[\u00A0\u202F\u2000-\u200B\u205F\u3000\uFEFF]/g, ' ');

  for (let i = 0; i < sanitizedText.length; i++) {
    const char = sanitizedText[i];
    const code = char.charCodeAt(0);

    // Caracteres ASCII padrão (0x20 a 0x7E) + quebra de linha / retorno
    if (code === 0x0A || code === 0x0D || (code >= 0x20 && code <= 0x7E)) {
      bytes.push(code);
    } else if (map[char] !== undefined) {
      bytes.push(map[char]);
    } else if (code === 0x00A0 || code === 0x202F || (code >= 0x2000 && code <= 0x200B) || code === 0xFEFF) {
      bytes.push(0x20); // Espaço seguro
    } else {
      // Normaliza para ASCII (remove diacríticos se não houver mapeamento direto)
      const normalized = char.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (normalized.length > 0 && normalized.charCodeAt(0) <= 0x7E) {
        bytes.push(normalized.charCodeAt(0));
      } else if (/\s/.test(char)) {
        // Se ainda for qualquer forma de espaço, envie espaço simples
        bytes.push(0x20);
      } else {
        bytes.push(0x3F); // '?' somente para caracteres gráficos irreconhecíveis
      }
    }
  }

  return new Uint8Array(bytes);
}

/**
 * Utilitário para formatar linha de 48 colunas com duas colunas (Esquerda e Direita).
 * Alinha perfeitamente com padding de espaços, garantindo que o total da linha seja 48 colunas.
 * Caso o texto à esquerda seja muito longo, ele é quebrado em múltiplas linhas de 48 caracteres.
 */
export function formatTwoColumns(left: string, right: string, totalWidth: number = K329_CONFIG.COLUMNS): string[] {
  const cleanLeft = (left || '').replace(/[\u00A0\u202F\u2000-\u200B\u205F\u3000\uFEFF]/g, ' ').trim();
  const cleanRight = (right || '').replace(/[\u00A0\u202F\u2000-\u200B\u205F\u3000\uFEFF]/g, ' ').trim();

  // Caso básico: cabe em uma única linha
  if (cleanLeft.length + cleanRight.length + 1 <= totalWidth) {
    const padding = totalWidth - (cleanLeft.length + cleanRight.length);
    return [cleanLeft + ' '.repeat(padding) + cleanRight];
  }

  // Se o lado direito por si só for maior que totalWidth (raro), truncar
  const safeRight = cleanRight.length >= totalWidth ? cleanRight.slice(0, totalWidth - 1) : cleanRight;
  const maxLeftOnLastLine = totalWidth - safeRight.length - 1;

  const lines: string[] = [];
  let remainingLeft = cleanLeft;

  // Quebra o texto da esquerda até sobrar espaço para a última linha com o texto da direita
  while (remainingLeft.length > maxLeftOnLastLine) {
    let chunk = remainingLeft.slice(0, totalWidth);
    // Tenta quebrar na última palavra
    const lastSpace = chunk.lastIndexOf(' ');
    if (lastSpace > 10) {
      chunk = remainingLeft.slice(0, lastSpace);
      remainingLeft = remainingLeft.slice(lastSpace + 1).trim();
    } else {
      remainingLeft = remainingLeft.slice(totalWidth).trim();
    }
    lines.push(chunk);
  }

  // Linha final com a sobra da esquerda + padding de espaços + texto da direita
  const padding = totalWidth - (remainingLeft.length + safeRight.length);
  lines.push(remainingLeft + ' '.repeat(Math.max(1, padding)) + safeRight);

  return lines;
}

/**
 * Utilitário para formatar linha de 48 colunas com 3 colunas (Ex: Código/Qtd | Descrição | Valor).
 */
export function formatThreeColumns(
  col1: string,
  col2: string,
  col3: string,
  width1: number = 8,
  width3: number = 12,
  totalWidth: number = K329_CONFIG.COLUMNS
): string[] {
  const width2 = totalWidth - width1 - width3;
  const c1 = (col1 || '').replace(/[\u00A0\u202F\u2000-\u200B\uFEFF]/g, ' ').padEnd(width1, ' ').slice(0, width1);
  const c3 = (col3 || '').replace(/[\u00A0\u202F\u2000-\u200B\uFEFF]/g, ' ').padStart(width3, ' ').slice(0, width3);
  const cleanCol2 = (col2 || '').replace(/[\u00A0\u202F\u2000-\u200B\uFEFF]/g, ' ');

  if (cleanCol2.length <= width2) {
    return [c1 + cleanCol2.padEnd(width2, ' ') + c3];
  }

  // Quebra a coluna 2 se for maior
  const lines: string[] = [];
  let rem = cleanCol2;
  let first = true;

  while (rem.length > 0) {
    const chunk = rem.slice(0, width2);
    rem = rem.slice(width2);
    if (first) {
      lines.push(c1 + chunk.padEnd(width2, ' ') + c3);
      first = false;
    } else {
      lines.push(' '.repeat(width1) + chunk.padEnd(width2, ' ') + ' '.repeat(width3));
    }
  }

  return lines;
}

/**
 * Centraliza um texto em exatamente 48 colunas.
 */
export function formatCenter(text: string, totalWidth: number = K329_CONFIG.COLUMNS): string {
  const clean = (text || '').replace(/[\u00A0\u202F\u2000-\u200B\uFEFF]/g, ' ').trim();
  if (clean.length >= totalWidth) return clean.slice(0, totalWidth);
  const leftPadding = Math.floor((totalWidth - clean.length) / 2);
  const rightPadding = totalWidth - clean.length - leftPadding;
  return ' '.repeat(leftPadding) + clean + ' '.repeat(rightPadding);
}

/**
 * Construtor Fluente de Comandos ESC/POS para a Impressora K329 (80 mm / 48 colunas)
 */
export class K329ReceiptBuilder {
  private buffer: number[] = [];
  private codePage: K329CodePage;

  constructor(codePage: K329CodePage = K329_CONFIG.DEFAULT_CODE_PAGE) {
    this.codePage = codePage;
    this.init();
  }

  /**
   * Envia comando de inicialização da impressora (0x1B, 0x40)
   * e configura a tabela de caracteres para Português (CP850 ou Windows-1252).
   */
  public init(): this {
    this.buffer = [];
    // ESC @ (Initialize printer)
    this.buffer.push(0x1B, 0x40);

    // ESC M 0 (Select Font A - 12x24 dots - 48 columns on 80mm)
    this.buffer.push(0x1B, 0x4D, 0x00);

    // ESC t n (Select Character Code Table)
    if (this.codePage === 'CP850') {
      // 0x1B, 0x74, 0x02: CP850 (Multilingual Latin I)
      this.buffer.push(0x1B, 0x74, 0x02);
    } else {
      // 0x1B, 0x74, 0x10: Windows-1252
      this.buffer.push(0x1B, 0x74, 0x10);
    }

    return this;
  }

  /**
   * Define o alinhamento do texto
   */
  public align(alignment: K329Align): this {
    // ESC a n (0: Left, 1: Center, 2: Right)
    const code = alignment === 'center' ? 0x01 : alignment === 'right' ? 0x02 : 0x00;
    this.buffer.push(0x1B, 0x61, code);
    return this;
  }

  /**
   * Ativa ou desativa modo negrito (Emphasize)
   */
  public bold(enable: boolean = true): this {
    // ESC E n (0: Off, 1: On)
    this.buffer.push(0x1B, 0x45, enable ? 0x01 : 0x00);
    return this;
  }

  /**
   * Ativa ou desativa sublinhado
   */
  public underline(enable: boolean = true): this {
    // ESC - n (0: Off, 1: 1-dot thickness)
    this.buffer.push(0x1B, 0x2D, enable ? 0x01 : 0x00);
    return this;
  }

  /**
   * Define tamanho da fonte (dobro de altura, largura ou ambos)
   */
  public textSize(width: 1 | 2 = 1, height: 1 | 2 = 1): this {
    // GS ! n
    let n = 0;
    if (width === 2) n |= 0x20;
    if (height === 2) n |= 0x01;
    this.buffer.push(0x1D, 0x21, n);
    return this;
  }

  /**
   * Adiciona texto simples codificado na tabela ativa
   */
  public text(content: string): this {
    const bytes = encodeStringToBytes(content, this.codePage);
    for (let i = 0; i < bytes.length; i++) {
      this.buffer.push(bytes[i]);
    }
    return this;
  }

  /**
   * Adiciona texto e quebra a linha
   */
  public textLine(content: string = ''): this {
    this.text(content);
    this.newLine();
    return this;
  }

  /**
   * Adiciona linha em branco
   */
  public newLine(count: number = 1): this {
    for (let i = 0; i < count; i++) {
      this.buffer.push(0x0A);
    }
    return this;
  }

  /**
   * Imprime divisória exata de 48 traços (-)
   */
  public divider(): this {
    this.align('left');
    this.bold(false);
    this.textLine(K329_CONFIG.DIVIDER);
    return this;
  }

  /**
   * Imprime divisória dupla (=) de 48 caracteres
   */
  public doubleDivider(): this {
    this.align('left');
    this.bold(false);
    this.textLine(K329_CONFIG.DOUBLE_DIVIDER);
    return this;
  }

  /**
   * Imprime linha alinhada em 2 colunas com padding dinâmico até 48 caracteres
   */
  public twoColumns(left: string, right: string): this {
    const lines = formatTwoColumns(left, right, K329_CONFIG.COLUMNS);
    for (const line of lines) {
      this.textLine(line);
    }
    return this;
  }

  /**
   * Imprime linha alinhada em 3 colunas totalizando 48 caracteres
   */
  public threeColumns(col1: string, col2: string, col3: string, w1: number = 8, w3: number = 12): this {
    const lines = formatThreeColumns(col1, col2, col3, w1, w3, K329_CONFIG.COLUMNS);
    for (const line of lines) {
      this.textLine(line);
    }
    return this;
  }

  /**
   * Imprime texto centralizado preenchido para 48 colunas
   */
  public textCenter(content: string): this {
    this.align('center');
    this.textLine(content);
    this.align('left');
    return this;
  }

  /**
   * Imprime código de barras padrão CODE128
   */
  public barcode128(data: string, height: number = 64): this {
    this.align('center');
    // GS h n (Barcode height in dots, 1-255)
    this.buffer.push(0x1D, 0x68, Math.min(Math.max(height, 20), 200));

    // GS w n (Barcode width, 2-6)
    this.buffer.push(0x1D, 0x77, 0x02);

    // GS H n (Select print position of HRI characters: 2 = Below)
    this.buffer.push(0x1D, 0x48, 0x02);

    // GS k m d1...dk (Print barcode CODE128)
    const rawBytes = encodeStringToBytes(data, this.codePage);
    this.buffer.push(0x1D, 0x6B, 0x49, rawBytes.length);
    for (let i = 0; i < rawBytes.length; i++) {
      this.buffer.push(rawBytes[i]);
    }

    this.newLine();
    this.align('left');
    return this;
  }

  /**
   * Imprime QR Code no formato nativo ESC/POS (Modelo 2)
   */
  public qrcode(data: string, moduleSize: number = 6): this {
    this.align('center');
    const bytes = encodeStringToBytes(data, this.codePage);
    const len = bytes.length + 3;
    const pL = len % 256;
    const pH = Math.floor(len / 256);

    // 1. Model: GS ( k 4 0 49 65 50 0 (Model 2)
    this.buffer.push(0x1D, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00);

    // 2. Module size: GS ( k 3 0 49 67 n
    const safeSize = Math.min(Math.max(moduleSize, 3), 10);
    this.buffer.push(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, safeSize);

    // 3. Error correction level: GS ( k 3 0 49 69 48 (Level L: 48, M: 49, Q: 50, H: 51)
    this.buffer.push(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x31); // Level M

    // 4. Store data in symbol storage area: GS ( k pL pH 49 80 48 d1...dk
    this.buffer.push(0x1D, 0x28, 0x6B, pL, pH, 0x31, 0x50, 0x30);
    for (let i = 0; i < bytes.length; i++) {
      this.buffer.push(bytes[i]);
    }

    // 5. Print symbol: GS ( k 3 0 49 81 48
    this.buffer.push(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30);

    this.newLine();
    this.align('left');
    return this;
  }

  /**
   * Alimenta linhas de papel e executa corte parcial (Partial Cut)
   */
  public cut(feedLines: number = 4): this {
    // ESC d n (Feed n lines)
    this.buffer.push(0x1B, 0x64, Math.max(1, feedLines));
    // GS V 66 0 (Feed paper and partial cut)
    this.buffer.push(0x1D, 0x56, 0x42, 0x14);
    return this;
  }

  /**
   * Retorna os bytes prontos para envio ao buffer da impressora
   */
  public toBytes(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}

/**
 * Gerador de recibos padronizados para 80 mm / 48 colunas
 */
export function buildK329Receipt(data: K329ReceiptData, codePage: K329CodePage = 'CP850'): Uint8Array {
  const b = new K329ReceiptBuilder(codePage);

  // 1. Cabeçalho
  if (data.header) {
    b.align('center');
    b.bold(true).textSize(2, 2);
    b.textLine(data.header.storeName);
    b.textSize(1, 1).bold(false);

    if (data.header.subtitle) {
      b.textLine(data.header.subtitle);
    }
    if (data.header.storeDocument) {
      b.textLine(`CNPJ/CPF: ${data.header.storeDocument}`);
    }
    if (data.header.phone) {
      b.textLine(`Tel: ${data.header.phone}`);
    }
    if (data.header.address) {
      b.textLine(data.header.address);
    }

    b.newLine(1);
    b.bold(true).textLine(`*** ${data.header.documentType.toUpperCase()} ***`);
    b.bold(false);
    b.align('left');
  }

  b.doubleDivider();

  // 2. Metadados (Cliente, Sacola, Data, etc.)
  if (data.info && data.info.length > 0) {
    for (const item of data.info) {
      b.twoColumns(item.label + ':', item.value);
    }
    b.divider();
  }

  // 3. Tabela de Itens
  if (data.items && data.items.length > 0) {
    b.bold(true);
    b.twoColumns('ITEM / PRODUTO', 'VALOR (R$)');
    b.bold(false);
    b.divider();

    for (const item of data.items) {
      const qtyStr = item.qty !== undefined && item.qty > 1 
        ? `${item.qty}x ${item.unitPrice ? formatCurrency(item.unitPrice) : ''} ` 
        : '';
      const cleanItemDesc = (item.description || '').replace(/[\u00A0\u202F\u2000-\u200B\uFEFF]/g, ' ').trim();
      const desc = `${qtyStr}${cleanItemDesc}`.replace(/\s{2,}/g, ' ');
      const priceStr = formatCurrency(item.totalPrice);

      b.twoColumns(desc, priceStr);
    }

    b.divider();
  }

  // 4. Totais e Descontos
  if (data.subtotal !== undefined && data.discount) {
    b.twoColumns('Subtotal Bruto:', formatCurrency(data.subtotal));
    b.twoColumns(data.discount.label + ':', `- ${formatCurrency(data.discount.value)}`);
    b.divider();
  }

  // Total Geral em destaque (negrito)
  b.bold(true);
  b.twoColumns('TOTAL A PAGAR:', formatCurrency(data.total));
  b.bold(false);
  b.doubleDivider();

  // 5. Forma de Pagamento
  if (data.payments && data.payments.length > 0) {
    b.bold(true).textLine('FORMA DE PAGAMENTO:').bold(false);
    for (const p of data.payments) {
      const label = p.installments ? `${p.method} (${p.installments})` : p.method;
      b.twoColumns(label, formatCurrency(p.amount));
    }
    b.divider();
  }

  // 6. QR Code PIX (se houver)
  if (data.pixQrCode) {
    b.align('center');
    b.bold(true).textLine('PAGUE COM PIX');
    b.bold(false);
    b.qrcode(data.pixQrCode, 6);
    b.textLine('Aponte a camera do app do seu banco');
    b.newLine(1);
    b.align('left');
    b.divider();
  }

  // 7. Código de Barras (se houver)
  if (data.barcode) {
    b.barcode128(data.barcode, 60);
  }

  // 8. Mensagens de Rodapé
  if (data.footerNotes && data.footerNotes.length > 0) {
    b.align('center');
    for (const note of data.footerNotes) {
      b.textLine(note);
    }
    b.align('left');
  }

  // 9. Corte de Papel
  b.cut(5);

  return b.toBytes();
}

/**
 * Converte os dados do recibo em texto monoespaçado estritamente formatado em 48 colunas.
 * Garante fidelidade ao padrão K329 ESC/POS para impressão nativa do SO (80mm) ou visualização.
 */
export function buildK329ReceiptPlainText(data: K329ReceiptData): string {
  const lines: string[] = [];

  // Cabeçalho
  if (data.header) {
    if (data.header.storeName) lines.push(formatCenter(data.header.storeName));
    if (data.header.subtitle) lines.push(formatCenter(data.header.subtitle));
    if (data.header.phone) lines.push(formatCenter(`Tel/WhatsApp: ${data.header.phone}`));
    if (data.header.documentType) lines.push(formatCenter(`*** ${data.header.documentType} ***`));
    lines.push(K329_CONFIG.DOUBLE_DIVIDER);
  }

  // Metadados / Informações
  if (data.info && data.info.length > 0) {
    for (const item of data.info) {
      lines.push(...formatTwoColumns(item.label + ':', item.value));
    }
    lines.push(K329_CONFIG.DIVIDER);
  }

  // Itens
  if (data.items && data.items.length > 0) {
    lines.push(...formatTwoColumns('ITEM / PRODUTO', 'VALOR (R$)'));
    lines.push(K329_CONFIG.DIVIDER);

    for (const item of data.items) {
      const qtyStr = item.qty !== undefined && item.qty > 1 
        ? `${item.qty}x ${item.unitPrice ? formatCurrency(item.unitPrice) : ''} ` 
        : '';
      const cleanItemDesc = (item.description || '').replace(/[\u00A0\u202F\u2000-\u200B\uFEFF]/g, ' ').trim();
      const desc = `${qtyStr}${cleanItemDesc}`.replace(/\s{2,}/g, ' ');
      const priceStr = formatCurrency(item.totalPrice);
      lines.push(...formatTwoColumns(desc, priceStr));
    }
    lines.push(K329_CONFIG.DIVIDER);
  }

  // Subtotal e descontos
  if (data.subtotal !== undefined && data.discount) {
    lines.push(...formatTwoColumns('Subtotal Bruto:', formatCurrency(data.subtotal)));
    lines.push(...formatTwoColumns(data.discount.label + ':', `- ${formatCurrency(data.discount.value)}`));
    lines.push(K329_CONFIG.DIVIDER);
  }

  // Total
  lines.push(...formatTwoColumns('TOTAL A PAGAR:', formatCurrency(data.total)));
  lines.push(K329_CONFIG.DOUBLE_DIVIDER);

  // Pagamentos
  if (data.payments && data.payments.length > 0) {
    lines.push('FORMA DE PAGAMENTO:');
    for (const p of data.payments) {
      const label = p.installments ? `${p.method} (${p.installments})` : p.method;
      lines.push(...formatTwoColumns(label, formatCurrency(p.amount)));
    }
    lines.push(K329_CONFIG.DIVIDER);
  }

  // Código de barras / identificador
  if (data.barcode) {
    lines.push(formatCenter(`[CODIGO: ${data.barcode}]`));
    lines.push(K329_CONFIG.DIVIDER);
  }

  // Rodapé
  if (data.footerNotes && data.footerNotes.length > 0) {
    for (const note of data.footerNotes) {
      lines.push(formatCenter(note));
    }
  }

  return lines.join('\n');
}

/**
 * Dispara impressão direta formatada para 80mm com 48 colunas monoespaçadas
 * Funciona mesmo quando as portas seriais/bluetooth do navegador estão bloqueadas por Permissions-Policy no iframe.
 */
export function printThermal80mm(text48Cols: string, title: string = 'Recibo K329'): void {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    window.print();
    return;
  }

  doc.open();
  doc.write(`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${title}</title>
    <style>
      @page {
        size: 80mm auto;
        margin: 0mm;
      }
      @media print {
        html, body {
          width: 72mm;
          margin: 0 auto;
          padding: 2mm 0;
        }
      }
      body {
        font-family: 'Courier New', Courier, monospace;
        font-size: 11px;
        line-height: 1.25;
        color: #000;
        background: #fff;
        white-space: pre;
        word-wrap: break-word;
        margin: 0;
        padding: 4px;
      }
    </style>
  </head>
  <body>${text48Cols}</body>
</html>`);
  doc.close();

  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (e) {
      console.warn('Erro ao disparar impressão térmica no iframe:', e);
    } finally {
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 2500);
    }
  }, 300);
}

/**
 * Envia o payload ESC/POS em base64 diretamente para o aplicativo RawBT no Android
 */
export function printRawBT(bytes: Uint8Array): void {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  window.location.href = `rawbt:data:application/octet-stream;base64,${base64}`;
}

/**
 * Faz download do arquivo binário ESC/POS para envio direto à impressora
 */
export function downloadK329Bin(bytes: Uint8Array, filename: string = 'recibo-k329.bin'): void {
  const blob = new Blob([bytes], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Driver de Conexão Bluetooth para Impressora K329
 * Trata perfil SPP (UUID 00001101-0000-1000-8000-00805F9B34FB)
 * com suporte a Web Serial (porta RFCOMM pareada) e Web Bluetooth.
 */
export class K329BluetoothDriver {
  private status: K329ConnectionStatus = 'disconnected';
  private serialPort: any = null;
  private serialWriter: any = null;
  private gattServer: any = null;
  private gattCharacteristic: any = null;
  private onStatusChange?: (status: K329ConnectionStatus, message?: string) => void;

  constructor(onStatusChange?: (status: K329ConnectionStatus, message?: string) => void) {
    this.onStatusChange = onStatusChange;
  }

  public getStatus(): K329ConnectionStatus {
    return this.status;
  }

  public isConnected(): boolean {
    return this.status === 'connected';
  }

  private setStatus(status: K329ConnectionStatus, message?: string) {
    this.status = status;
    if (this.onStatusChange) {
      this.onStatusChange(status, message);
    }
  }

  /**
   * Conecta à impressora K329 via Bluetooth Serial (Web Serial API)
   * Este é o método recomendado e mais estável no Chrome/Edge para dispositivos SPP (Bluetooth Clássico).
   */
  public async connectSerial(baudRate: number = 9600): Promise<boolean> {
    if (!('serial' in navigator)) {
      throw new Error('Web Serial API não suportada neste navegador. Use o Google Chrome ou Edge.');
    }

    try {
      this.setStatus('connecting', 'Solicitando porta serial / bluetooth...');
      // Solicita seleção de porta
      this.serialPort = await (navigator as any).serial.requestPort({
        // Filtro opcional ou seleção livre da porta COM/SPP do K329
      });

      await this.serialPort.open({
        baudRate: baudRate,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        flowControl: 'none',
      });

      this.serialWriter = this.serialPort.writable.getWriter();
      this.setStatus('connected', 'Conectado à K329 com sucesso via Serial/SPP.');
      return true;
    } catch (err: any) {
      const isPolicy = err.name === 'SecurityError' || String(err.message || '').toLowerCase().includes('permissions policy');
      const msg = isPolicy 
        ? 'Acesso Serial bloqueado pelas políticas do iframe (Permissions-Policy). Abra o app em Nova Aba para conectar direto, ou use "Imprimir Térmica (80mm)" / "RawBT".'
        : (err.message || 'Falha ao conectar à porta Serial da K329.');
      this.setStatus('error', msg);
      throw new Error(msg);
    }
  }

  /**
   * Conecta à impressora K329 via Web Bluetooth (usando SPP UUID padrão)
   */
  public async connectBluetooth(): Promise<boolean> {
    if (!('bluetooth' in navigator)) {
      throw new Error('Web Bluetooth não suportado neste navegador.');
    }

    try {
      this.setStatus('connecting', 'Buscando impressora K329 via Bluetooth SPP...');

      const sppUuid = K329_CONFIG.SPP_UUID.toLowerCase();

      // Solicita dispositivo Bluetooth com o serviço SPP
      const device = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          sppUuid,
          '000018f0-0000-1000-8000-00805f9b34fb', // Standard thermal printer service
          '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC transparent serial
          'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Posnet/K329 custom serial
        ]
      });

      device.addEventListener('gattserverdisconnected', () => {
        this.setStatus('disconnected', 'A impressora K329 foi desconectada.');
        this.gattServer = null;
        this.gattCharacteristic = null;
      });

      this.setStatus('connecting', 'Conectando ao GATT Server...');
      const server = await device.gatt.connect();
      this.gattServer = server;

      // Procura primeiro pelo serviço SPP padrão ou serviços de porta serial conhecidos
      let targetCharacteristic = null;
      const services = await server.getPrimaryServices();

      for (const service of services) {
        try {
          const characteristics = await service.getCharacteristics();
          for (const char of characteristics) {
            if (char.properties.write || char.properties.writeWithoutResponse) {
              targetCharacteristic = char;
              break;
            }
          }
          if (targetCharacteristic) break;
        } catch {
          // Continua procurando
        }
      }

      if (!targetCharacteristic) {
        throw new Error('Nenhuma característica de escrita serial encontrada na K329.');
      }

      this.gattCharacteristic = targetCharacteristic;
      this.setStatus('connected', `Conectado à K329 com sucesso (${device.name || 'Impressora'}).`);
      return true;
    } catch (err: any) {
      const isPolicy = err.name === 'SecurityError' || String(err.message || '').toLowerCase().includes('permissions policy');
      const msg = isPolicy 
        ? 'Acesso Bluetooth bloqueado pelas políticas do iframe (Permissions-Policy). Abra o app em Nova Aba para conectar direto, ou use "Imprimir Térmica (80mm)" / "RawBT".'
        : (err.message || 'Falha ao conectar via Bluetooth GATT.');
      this.setStatus('error', msg);
      throw new Error(msg);
    }
  }

  /**
   * Envia os bytes para a impressora em chunks seguros de 512 bytes
   * com pequeno atraso para não estourar o buffer interno da K329.
   */
  public async print(bytes: Uint8Array): Promise<void> {
    if (!this.isConnected() && !this.serialWriter && !this.gattCharacteristic) {
      throw new Error('A impressora K329 não está conectada. Conecte-se antes de imprimir.');
    }

    this.setStatus('printing', 'Enviando dados para a K329...');

    try {
      const chunkSize = K329_CONFIG.CHUNK_SIZE;
      const total = bytes.length;

      for (let offset = 0; offset < total; offset += chunkSize) {
        const chunk = bytes.slice(offset, offset + chunkSize);

        if (this.serialWriter) {
          await this.serialWriter.write(chunk);
        } else if (this.gattCharacteristic) {
          if (this.gattCharacteristic.writeValueWithoutResponse) {
            await this.gattCharacteristic.writeValueWithoutResponse(chunk);
          } else {
            await this.gattCharacteristic.writeValue(chunk);
          }
        }

        // Aguarda intervalo para a K329 esvaziar o buffer térmico
        if (offset + chunkSize < total) {
          await delay(K329_CONFIG.CHUNK_DELAY_MS);
        }
      }

      this.setStatus('connected', 'Impressão concluída com sucesso!');
    } catch (err: any) {
      this.setStatus('error', `Erro durante o envio dos dados: ${err.message}`);
      throw err;
    }
  }

  /**
   * Desconecta e libera as portas seriais/bluetooth
   */
  public async disconnect(): Promise<void> {
    try {
      if (this.serialWriter) {
        await this.serialWriter.close();
        this.serialWriter = null;
      }
      if (this.serialPort) {
        await this.serialPort.close();
        this.serialPort = null;
      }
      if (this.gattServer && this.gattServer.connected) {
        this.gattServer.disconnect();
        this.gattServer = null;
        this.gattCharacteristic = null;
      }
      this.setStatus('disconnected', 'Impressora desconectada.');
    } catch (err: any) {
      console.error('Erro ao desconectar K329:', err);
      this.setStatus('disconnected');
    }
  }
}

/**
 * Formata valores monetários no padrão brasileiro (R$ 0,00) utilizando estritamente
 * caracteres ASCII e espaço padrão (0x20).
 * NUNCA utiliza \u00A0 (NBSP) ou \u202F que causavam a impressão de '?' no hardware térmico.
 */
export function formatCurrency(val: number): string {
  if (val === undefined || val === null || isNaN(val)) return 'R$ 0,00';
  const num = Number(val);
  const parts = num.toFixed(2).split('.');
  const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const decimalPart = parts[1];
  return `R$ ${integerPart},${decimalPart}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
