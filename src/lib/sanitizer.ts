/**
 * Sanitization and Validation Utilities
 * Focuses on XSS prevention and Data Integrity
 */

/**
 * Strips HTML tags from a string to prevent XSS
 */
export const sanitizeHtml = (str: string): string => {
  if (!str) return '';
  return str.replace(/<[^>]*>?/gm, '');
};

/**
 * Trims and cleans a string from potentially malicious characters
 * but keeps common punctuation for names/titles.
 */
export const sanitizeString = (str: string): string => {
  if (!str) return '';
  // Strip HTML and trim
  let clean = sanitizeHtml(str).trim();
  // Limit length safely if it's too long (optional safety cap)
  return clean.substring(0, 500);
};

/**
 * Validates Brazilian CPF
 */
export const isValidCPF = (cpf: string): boolean => {
  if (!cpf) return false;
  const cleanCpf = cpf.replace(/\D/g, '');
  if (cleanCpf.length !== 11) return false;
  if (/^(\d)\1+$/.test(cleanCpf)) return false;

  let sum = 0;
  let remainder;

  for (let i = 1; i <= 9; i++) sum = sum + parseInt(cleanCpf.substring(i - 1, i)) * (11 - i);
  remainder = (sum * 10) % 11;
  if ((remainder === 10) || (remainder === 11)) remainder = 0;
  if (remainder !== parseInt(cleanCpf.substring(9, 10))) return false;

  sum = 0;
  for (let i = 1; i <= 10; i++) sum = sum + parseInt(cleanCpf.substring(i - 1, i)) * (12 - i);
  remainder = (sum * 10) % 11;
  if ((remainder === 10) || (remainder === 11)) remainder = 0;
  if (remainder !== parseInt(cleanCpf.substring(10, 11))) return false;

  return true;
};

/**
 * Validates WhatsApp/Phone (simple length check for now)
 */
export const isValidPhone = (phone: string): boolean => {
  if (!phone) return false;
  const cleanPhone = phone.replace(/\D/g, '');
  return cleanPhone.length >= 10 && cleanPhone.length <= 11;
};

/**
 * Sanitizes numeric inputs
 */
export const sanitizePrice = (value: string | number): number => {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  const sanitized = value.replace('R$', '').replace(/\s/g, '').replace('.', '').replace(',', '.');
  const num = parseFloat(sanitized);
  return isNaN(num) ? 0 : num;
};
