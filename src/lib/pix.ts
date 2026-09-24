export function generatePixPayload(
  pixKey: string,
  beneficiary: string,
  city: string,
  amount: number,
  transactionId: string = '***'
): string {
  const formatLength = (str: string) => str.length.toString().padStart(2, '0');
  
  // Format amount to 2 decimal places
  const formattedAmount = amount.toFixed(2);
  
  // Format beneficiary name (max 25 chars, uppercase, no special chars)
  const formattedBeneficiary = beneficiary
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .substring(0, 25)
    .toUpperCase()
    .padEnd(1, ' ');

  // Format city (max 15 chars, uppercase, no special chars)
  const formattedCity = city
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .substring(0, 15)
    .toUpperCase()
    .padEnd(1, ' ');

  // Payload Format Indicator
  let payload = '000201';
  
  // Point of Initiation Method
  payload += '010211';
  
  // Merchant Account Information
  const gui = '0014br.gov.bcb.pix';
  const key = `01${formatLength(pixKey)}${pixKey}`;
  const merchantAccountInfo = gui + key;
  payload += `26${formatLength(merchantAccountInfo)}${merchantAccountInfo}`;
  
  // Merchant Category Code
  payload += '52040000';
  
  // Transaction Currency (BRL)
  payload += '5303986';
  
  // Transaction Amount
  if (amount > 0) {
    payload += `54${formatLength(formattedAmount)}${formattedAmount}`;
  }
  
  // Country Code
  payload += '5802BR';
  
  // Merchant Name
  payload += `59${formatLength(formattedBeneficiary)}${formattedBeneficiary}`;
  
  // Merchant City
  payload += `60${formatLength(formattedCity)}${formattedCity}`;
  
  // Additional Data Field Template
  const txId = `05${formatLength(transactionId)}${transactionId}`;
  payload += `62${formatLength(txId)}${txId}`;
  
  // CRC16
  payload += '6304';
  
  return payload + calculateCRC16(payload);
}

function calculateCRC16(payload: string): string {
  let crc = 0xFFFF;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc = crc << 1;
      }
    }
  }
  return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}
