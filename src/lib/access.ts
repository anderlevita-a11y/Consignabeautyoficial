// Regras de acesso do Consigna Beauty — fonte única para App, Sidebar e Perfil.
//   TRIAL  → 7 dias grátis (liberado pelo admin), sem Rotas e Simulação
//   MENSAL → todas as funções (pago via AbacatePay ou liberado pelo admin)
import type { Profile } from '../types';

export const SUPER_ADMIN_EMAIL = 'anderlevita@gmail.com';
export const PRECO_MENSAL = 39.99;
export const TABS_BLOQUEADAS_NO_TRIAL = ['routes', 'simulation'];

export interface AccessState {
  isAdmin: boolean;
  isBlocked: boolean;
  isTrial: boolean;
  isMensal: boolean;
  isExpired: boolean;
  hasAccess: boolean;
  diasRestantes: number | null;
  assinaturaAtiva: boolean;
}

export function getAccessState(profile: Partial<Profile> | null | undefined, sessionEmail?: string): AccessState {
  const isAdmin = profile?.role === 'admin' || profile?.email === SUPER_ADMIN_EMAIL || sessionEmail === SUPER_ADMIN_EMAIL;
  const isBlocked = !!profile?.is_blocked;
  const status = (profile?.status_pagamento || '').toUpperCase();
  const tipo = (profile?.plano_tipo || '').toLowerCase();

  const isTrial = status === 'TRIAL' || tipo === 'trial';
  // Aceita as categorias antigas como mensal até a migração rodar
  const isMensal = !isTrial && (status === 'MENSAL' || tipo === 'mensal' || ['PRO', 'STARTER', 'PAGO'].includes(status) || ['pro', 'starter', 'standard'].includes(tipo));

  const venc = profile?.vencimento ? new Date(profile.vencimento) : null;
  const isExpired = !!venc && venc.getTime() < Date.now();
  const diasRestantes = venc ? Math.ceil((venc.getTime() - Date.now()) / 86400000) : null;

  const temPlano = isTrial || isMensal || !!profile?.access_key_code;
  const hasAccess = isAdmin || (temPlano && !isBlocked && !isExpired);

  return {
    isAdmin, isBlocked, isTrial, isMensal, isExpired, hasAccess, diasRestantes,
    assinaturaAtiva: profile?.abacate_subscription_status === 'ACTIVE',
  };
}
