import React, { useEffect, useRef, useState } from 'react';
import { CreditCard, Loader2, CheckCircle2, RefreshCw, XCircle, Sparkles, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { cn, formatError } from '../lib/utils';
import { getAccessState, PRECO_MENSAL } from '../lib/access';
import { useNotifications } from './NotificationCenter';
import { ConfirmationModal } from './ConfirmationModal';

const fmtData = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');

async function chamarFuncao(nome: string, body: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke(nome, { body });
  if (error) {
    // Extrai a mensagem devolvida pela função, quando houver
    let msg = error.message;
    try {
      const ctx = (error as any).context;
      if (ctx?.json) msg = (await ctx.json())?.error || msg;
    } catch { /* mantém msg */ }
    throw new Error(msg);
  }
  return data;
}

export function SubscriptionCard({ profile, onUpdated }: { profile: any; onUpdated: (p: any) => void }) {
  const { addNotification } = useNotifications();
  const [abrindo, setAbrindo] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [confirmarCancelamento, setConfirmarCancelamento] = useState(false);
  const iniciouRetorno = useRef(false);

  const acesso = getAccessState(profile);
  const status = profile?.abacate_subscription_status as string | null | undefined;
  const ativa = status === 'ACTIVE';
  const cancelada = status === 'CANCELLED';

  const recarregarPerfil = async () => {
    const { data } = await supabase.from('profiles').select('*').eq('id', profile.id).single();
    if (data) onUpdated(data);
    return data;
  };

  const sincronizar = async (silencioso = false) => {
    setSincronizando(true);
    try {
      const r = await chamarFuncao('abacatepay-sync');
      const atualizado = await recarregarPerfil();
      if (r?.status === 'ACTIVE') {
        if (!silencioso) {
          addNotification({ type: 'success', title: 'Assinatura ativa', message: 'Pagamento confirmado. Acesso completo liberado!' });
        }
        return atualizado;
      }
      if (!silencioso) {
        addNotification({ type: 'info', title: 'Aguardando pagamento', message: r?.message || 'Ainda não identificamos o pagamento.' });
      }
    } catch (err) {
      if (!silencioso) addNotification({ type: 'error', title: 'Erro ao verificar pagamento', message: formatError(err) });
    } finally {
      setSincronizando(false);
    }
    return null;
  };

  // Voltando do checkout: verifica algumas vezes até o pagamento ser confirmado
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('assinatura') !== 'retorno' || iniciouRetorno.current || !profile?.id) return;
    iniciouRetorno.current = true;

    (async () => {
      for (let i = 0; i < 8; i++) {
        const p = await sincronizar(true);
        if (p?.abacate_subscription_status === 'ACTIVE') {
          addNotification({ type: 'success', title: 'Bem-vinda ao plano Mensal!', message: 'Pagamento confirmado e acesso liberado automaticamente.' });
          params.delete('assinatura');
          // Recarrega para o app inteiro reconhecer o novo acesso
          setTimeout(() => { window.location.href = `${window.location.pathname}?tab=campaigns`; }, 1500);
          return;
        }
        await new Promise((r) => setTimeout(r, 4000));
      }
      addNotification({
        type: 'info',
        title: 'Pagamento em processamento',
        message: 'Assim que a AbacatePay confirmar, seu acesso será liberado automaticamente. Você pode clicar em "Verificar pagamento".',
      });
    })();
  }, [profile?.id]);

  const assinar = async () => {
    setAbrindo(true);
    try {
      const r = await chamarFuncao('abacatepay-checkout');
      if (!r?.url) throw new Error('A AbacatePay não retornou o link de pagamento.');
      window.location.href = r.url;
    } catch (err) {
      addNotification({ type: 'error', title: 'Não foi possível abrir o pagamento', message: formatError(err) });
      setAbrindo(false);
    }
  };

  const cancelar = async () => {
    setConfirmarCancelamento(false);
    setSincronizando(true);
    try {
      await chamarFuncao('abacatepay-cancel');
      await recarregarPerfil();
      addNotification({
        type: 'success',
        title: 'Assinatura cancelada',
        message: `Não haverá novas cobranças. Seu acesso continua até ${fmtData(profile?.vencimento)}.`,
      });
    } catch (err) {
      addNotification({ type: 'error', title: 'Erro ao cancelar', message: formatError(err) });
    } finally {
      setSincronizando(false);
    }
  };

  if (acesso.isAdmin) return null;

  return (
    <section className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="p-4 sm:p-6 border-b border-zinc-100 bg-zinc-50/50 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-zinc-800">Plano Mensal Consigna Beauty</h3>
            <p className="text-xs text-zinc-500">Cobrança recorrente automática • liberação imediata após o pagamento</p>
          </div>
        </div>
        <span className={cn(
          'text-[10px] font-bold px-3 py-1 rounded-lg uppercase shrink-0',
          ativa ? 'bg-emerald-100 text-emerald-700'
            : cancelada ? 'bg-zinc-100 text-zinc-600'
            : acesso.isTrial ? 'bg-blue-100 text-blue-700'
            : 'bg-amber-100 text-amber-700',
        )}>
          {ativa ? 'Assinatura ativa' : cancelada ? 'Cancelada' : acesso.isTrial ? 'Teste grátis' : 'Não assinado'}
        </span>
      </div>

      <div className="p-4 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <div className="flex items-baseline gap-1">
              <span className="text-sm font-bold text-zinc-500">R$</span>
              <span className="text-4xl font-black text-emerald-600 font-mono tabular-nums">
                {PRECO_MENSAL.toFixed(2).replace('.', ',')}
              </span>
              <span className="text-sm text-zinc-400 font-medium">/mês</span>
            </div>
            <ul className="mt-3 space-y-1.5 text-xs text-zinc-600">
              <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Todas as funções liberadas, incluindo Rotas e Simulação</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Renovação automática, sem precisar enviar comprovante</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Cancele quando quiser</li>
            </ul>
          </div>

          {ativa ? (
            <div className="sm:text-right space-y-1">
              <p className="text-xs text-zinc-500">Próxima renovação até</p>
              <p className="text-lg font-bold text-zinc-800">{fmtData(profile?.vencimento)}</p>
              {profile?.abacate_method && (
                <p className="text-[10px] text-zinc-400 uppercase tracking-widest">
                  Pagamento via {profile.abacate_method === 'PIX' ? 'Pix Automático' : 'cartão'}
                </p>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={assinar}
              disabled={abrindo || acesso.isBlocked && profile?.blocked_reason === 'manual'}
              className="w-full sm:w-auto px-6 py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-sm shadow-emerald-600/20 transition-all"
            >
              {abrindo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {abrindo ? 'Abrindo pagamento...' : cancelada ? 'Assinar novamente' : 'Assinar agora'}
            </button>
          )}
        </div>

        {cancelada && profile?.vencimento && !acesso.isExpired && (
          <p className="text-xs text-zinc-500 bg-zinc-50 border border-zinc-100 rounded-xl p-3">
            Sua assinatura foi cancelada e não haverá novas cobranças. O acesso segue liberado até <strong>{fmtData(profile.vencimento)}</strong>.
          </p>
        )}

        {acesso.isTrial && !ativa && (
          <p className="text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-xl p-3 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            Você está no teste grátis{acesso.diasRestantes !== null && acesso.diasRestantes > 0 ? ` (faltam ${acesso.diasRestantes} dia${acesso.diasRestantes > 1 ? 's' : ''})` : ''}. Assine para não perder o acesso quando ele terminar.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-zinc-100">
          {(status === 'PENDING' || ativa || cancelada) && (
            <button
              type="button"
              onClick={() => sincronizar(false)}
              disabled={sincronizando}
              className="mt-3 px-3 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-lg text-xs font-bold flex items-center gap-1.5"
            >
              {sincronizando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Verificar pagamento
            </button>
          )}
          {status === 'PENDING' && profile?.abacate_checkout_url && (
            <a
              href={profile.abacate_checkout_url}
              className="mt-3 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold"
            >
              Continuar pagamento iniciado
            </a>
          )}
          {ativa && (
            <button
              type="button"
              onClick={() => setConfirmarCancelamento(true)}
              disabled={sincronizando}
              className="mt-3 ml-auto px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg text-xs font-bold flex items-center gap-1.5"
            >
              <XCircle className="w-3.5 h-3.5" />
              Cancelar assinatura
            </button>
          )}
        </div>
      </div>

      <ConfirmationModal
        isOpen={confirmarCancelamento}
        title="Cancelar assinatura"
        message={`Tem certeza? As cobranças automáticas param e o acesso continua até ${fmtData(profile?.vencimento)}.`}
        variant="danger"
        onConfirm={cancelar}
        onCancel={() => setConfirmarCancelamento(false)}
      />
    </section>
  );
}
