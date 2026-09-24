import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function validateCPF(cpf: string): boolean {
  cpf = cpf.replace(/[^\d]+/g, '');
  if (cpf === '') return false;
  
  if (cpf.length !== 11 || 
      cpf === "00000000000" || 
      cpf === "11111111111" || 
      cpf === "22222222222" || 
      cpf === "33333333333" || 
      cpf === "44444444444" || 
      cpf === "55555555555" || 
      cpf === "66666666666" || 
      cpf === "77777777777" || 
      cpf === "88888888888" || 
      cpf === "99999999999")
      return false;
      
  let add = 0;
  for (let i = 0; i < 9; i++)
      add += parseInt(cpf.charAt(i)) * (10 - i);
  let rev = 11 - (add % 11);
  if (rev === 10 || rev === 11)
      rev = 0;
  if (rev !== parseInt(cpf.charAt(9)))
      return false;
      
  add = 0;
  for (let i = 0; i < 10; i++)
      add += parseInt(cpf.charAt(i)) * (11 - i);
  rev = 11 - (add % 11);
  if (rev === 10 || rev === 11)
      rev = 0;
  if (rev !== parseInt(cpf.charAt(10)))
      return false;
      
  return true;
}

export function formatError(error: any): string {
  const message = error?.message || String(error);
  
  if (message.includes('Failed to fetch') || message.includes('Falha ao conectar com o Supabase')) {
    return 'Erro de conexão: O Supabase está pausado ou a URL está incorreta. Acesse o painel do Supabase e restaure seu projeto.';
  }
  
  if (message.includes('Edge Function')) {
    return 'O servidor de PDF está indisponível. O sistema usará o modo de impressão simplificado automaticamente.';
  }

  if (message.includes('Refresh Token Not Found') || message.includes('Invalid Refresh Token')) {
    return 'Sua sessão expirou. Por favor, faça login novamente.';
  }

  if (message.includes('Email rate limit exceeded')) {
    return 'Muitas solicitações de email. Por favor, aguarde um minuto antes de tentar novamente.';
  }

  if (message.includes('User not found')) {
    return 'Usuário não encontrado.';
  }

  if (message.includes('Invalid login credentials')) {
    return 'Email ou senha incorretos.';
  }

  if (message.includes('Error sending recovery email')) {
    return 'Erro ao enviar email de recuperação. Isso geralmente ocorre devido a limites do Supabase ou falta de configuração SMTP. Verifique as configurações de Autenticação no painel do Supabase.';
  }

  return message;
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

export function formatMoneyInput(value: string): string {
  const cleanValue = value.replace(/\D/g, '');
  if (!cleanValue) return '0,00';
  const numberValue = parseInt(cleanValue) / 100;
  return formatMoney(numberValue);
}

export function parseMoney(value: string): number {
  if (!value) return 0;
  return parseFloat(value.replace(/\./g, '').replace(',', '.')) || 0;
}

export function validatePhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 11;
}

export function printFallback(payload: any, onError?: (msg: string) => void) {
  const win = window.open('', '_blank');
  if (!win) {
    if (onError) {
      onError('Por favor, permita popups para imprimir.');
    } else {
      console.warn('Popup blocked: Por favor, permita popups para imprimir.');
    }
    return;
  }

  const isEtiqueta = payload.tipo_documento === 'etiqueta';
  const total = payload.itens.reduce((acc: number, item: any) => acc + (item.total || 0), 0);

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Impressão - Consigna Beauty</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 40px; color: #18181b; line-height: 1.5; }
          .header { text-align: center; border-bottom: 2px solid #00a86b; padding-bottom: 20px; margin-bottom: 30px; }
          .header h1 { margin: 0; color: #00a86b; font-size: 24px; text-transform: uppercase; letter-spacing: 2px; }
          .header p { margin: 5px 0 0; color: #71717a; font-size: 12px; font-weight: bold; }
          .info { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; font-size: 13px; }
          .info-block b { display: block; color: #71717a; text-transform: uppercase; font-size: 10px; margin-bottom: 4px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
          th { text-align: left; border-bottom: 2px solid #f4f4f5; padding: 12px 8px; font-size: 11px; color: #71717a; text-transform: uppercase; }
          td { padding: 12px 8px; border-bottom: 1px solid #f4f4f5; font-size: 13px; }
          .text-right { text-align: right; }
          .footer { border-top: 2px solid #f4f4f5; padding-top: 20px; }
          .total-row { display: flex; justify-content: flex-end; align-items: center; gap: 20px; }
          .total-label { font-size: 12px; font-weight: bold; color: #71717a; text-transform: uppercase; }
          .total-value { font-size: 24px; font-weight: 900; color: #18181b; }
          .no-print { background: #f4f4f5; padding: 15px; border-radius: 12px; margin-bottom: 40px; display: flex; align-items: center; justify-content: space-between; border: 1px solid #e4e4e7; }
          .btn-print { background: #00a86b; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: bold; cursor: pointer; transition: all 0.2s; }
          .btn-print:hover { background: #008f5b; transform: translateY(-1px); }
          @media print { .no-print { display: none; } body { padding: 0; } }
        </style>
      </head>
      <body>
        <div class="no-print">
          <div>
            <b style="display: block; font-size: 14px; color: #18181b;">Modo de Segurança Ativado</b>
            <span style="font-size: 12px; color: #71717a;">O servidor de PDF está offline. Use esta versão simplificada para imprimir.</span>
          </div>
          <button class="btn-print" onclick="window.print()">Imprimir Documento</button>
        </div>
        
        <div class="header">
          <h1>Consigna Beauty</h1>
          <p>${isEtiqueta ? 'Etiqueta de Identificação' : 'Nota de Entrega / Acerto'}</p>
        </div>

        <div class="info">
          <div class="info-block">
            <b>Cliente / Destinatário</b>
            <span>${payload.dados_cliente.nome}</span>
            ${payload.dados_cliente.cpf ? `<span style="display: block; font-size: 11px; color: #71717a; margin-top: 2px;">CPF: ${payload.dados_cliente.cpf}</span>` : ''}
          </div>
          <div class="info-block" style="text-align: right;">
            <b>Data de Emissão</b>
            <span>${new Date().toLocaleDateString('pt-BR')}</span>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Descrição do Produto</th>
              <th class="text-right">Qtd</th>
              <th class="text-right">Unitário</th>
              <th class="text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${payload.itens.map((item: any) => `
              <tr>
                <td>${item.nome}</td>
                <td class="text-right">${item.qtd}</td>
                <td class="text-right">R$ ${item.preco.toFixed(2)}</td>
                <td class="text-right">R$ ${(item.total || 0).toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="footer">
          <div class="total-row">
            <span class="total-label">Valor Total</span>
            <span class="total-value">R$ ${total.toFixed(2)}</span>
          </div>
        </div>

        <div style="margin-top: 60px; border-top: 1px solid #e4e4e7; padding-top: 10px; text-align: center; max-width: 300px; margin-left: auto; margin-right: auto;">
          <div style="height: 40px;"></div>
          <p style="margin: 0; font-size: 12px; font-weight: bold; color: #18181b; text-transform: uppercase;">${payload.dados_cliente.nome}</p>
          ${payload.dados_cliente.cpf && payload.dados_cliente.cpf !== '---' ? `<p style="margin: 0; font-size: 10px; color: #71717a;">CPF: ${payload.dados_cliente.cpf}</p>` : ''}
          <p style="margin: 4px 0 0; font-size: 10px; color: #71717a; text-transform: uppercase; letter-spacing: 1px;">Assinatura do Cliente</p>
        </div>
        
        <div style="margin-top: 40px; font-size: 10px; color: #a1a1aa; text-align: center;">
          Gerado automaticamente por Consigna Beauty - Sistema de Gestão
        </div>
      </body>
    </html>
  `;

  win.document.write(html);
  win.document.close();
}

export function stripLeadingZeros(code: string | null | undefined): string {
  if (!code) return '';
  const trimmed = String(code).trim().toLowerCase();
  return trimmed.replace(/^0+/, '');
}

export function isBarcodeMatch(productCode: string | null | undefined, searchCode: string | null | undefined): boolean {
  if (!productCode || !searchCode) return false;
  const pNorm = String(productCode).trim().toLowerCase();
  const sNorm = String(searchCode).trim().toLowerCase();
  if (!pNorm || !sNorm) return false;

  // 1. Direct exact match
  if (pNorm === sNorm) return true;

  // 2. Normalized leading zeros match (e.g. 00000000030393 matches 30393)
  const pStripped = stripLeadingZeros(pNorm);
  const sStripped = stripLeadingZeros(sNorm);
  if (pStripped && sStripped && pStripped === sStripped) {
    return true;
  }

  return false;
}

export function isStrictBarcodeMatch(
  product: { ean?: string | null; barcode?: string | null; ean_variations?: string[] | null },
  search: string | null | undefined
): boolean {
  if (!search) return false;
  const s = String(search).trim();
  if (!s) return false;

  if (isBarcodeMatch(product.ean, s)) return true;
  if (isBarcodeMatch(product.barcode, s)) return true;
  if (product.ean_variations && product.ean_variations.some(v => isBarcodeMatch(v, s))) return true;

  return false;
}

export function getProductDisplayCode(product: { ean?: string | null; barcode?: string | null }): string {
  return product.ean?.trim() || product.barcode?.trim() || '';
}

export function doesProductMatchBarcode(
  product: { ean?: string | null; barcode?: string | null; label_name?: string | null; name?: string | null; ean_variations?: string[] | null },
  search: string
): boolean {
  if (!search) return false;
  const searchTrimmed = search.trim();
  if (!searchTrimmed) return false;

  // Strict code match first
  if (isStrictBarcodeMatch(product, searchTrimmed)) return true;

  // Exact match on label_name or name
  const sLower = searchTrimmed.toLowerCase();
  if (product.label_name && product.label_name.toLowerCase().trim() === sLower) return true;
  if (product.name && product.name.toLowerCase().trim() === sLower) return true;

  return false;
}

