import React from 'react';
import { X, Printer, ExternalLink } from 'lucide-react';
import { cn } from '../lib/utils';

interface PrintPreviewProps {
  pdfUrl: string;
  onClose: () => void;
  tipo: 'termica' | 'a4' | 'etiqueta';
}

export function PrintPreview({ pdfUrl, onClose, tipo }: PrintPreviewProps) {
  // Ajusta a largura do modal de acordo com o tipo de documento
  const modalWidth = {
    termica: 'max-w-[380px]',
    etiqueta: 'max-w-[450px]',
    a4: 'max-w-5xl'
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
      <div className={cn(
        "bg-white rounded-[32px] shadow-2xl w-full flex flex-col max-h-[95vh] overflow-hidden animate-in zoom-in-95 duration-300",
        modalWidth[tipo]
      )}>
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-zinc-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-zinc-800 tracking-tight">Prévia de Impressão</h3>
              <p className="text-[10px] text-zinc-400 uppercase font-bold tracking-widest">
                {tipo === 'termica' ? 'Cupom 80mm' : tipo === 'etiqueta' ? 'Etiqueta 40x25mm' : 'Documento A4'}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 hover:bg-zinc-100 rounded-xl text-zinc-400 hover:text-zinc-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Iframe do PDF */}
        <div className="flex-1 overflow-hidden bg-zinc-100 p-4 sm:p-6">
          <div className="w-full h-full bg-white rounded-2xl shadow-inner overflow-hidden relative">
            <iframe
              src={`${pdfUrl}#toolbar=1&navpanes=0&scrollbar=1`}
              className="w-full h-[65vh] border-none"
              title="PDF Preview"
            />
          </div>
        </div>

        {/* Footer com Ações */}
        <div className="p-6 border-t border-zinc-100 flex flex-col sm:flex-row gap-3">
          <button 
            onClick={onClose}
            className="flex-1 py-4 border border-zinc-200 text-zinc-500 rounded-2xl font-bold hover:bg-zinc-50 transition-all text-sm uppercase tracking-widest"
          >
            Fechar
          </button>
          <button 
            onClick={() => window.open(pdfUrl, '_blank')}
            className="flex-1 py-4 bg-zinc-900 text-white rounded-2xl font-bold hover:bg-zinc-800 transition-all shadow-lg shadow-zinc-900/20 flex items-center justify-center gap-2 text-sm uppercase tracking-widest"
          >
            <ExternalLink className="w-4 h-4" />
            Abrir e Imprimir
          </button>
        </div>
      </div>
    </div>
  );
}
