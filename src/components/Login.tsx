import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { formatError } from '../lib/utils';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { motion } from 'motion/react';

import { Logo } from './Logo';
import { LegalConfirmationModal } from './LegalConfirmationModal';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [legalSettings, setLegalSettings] = useState<any>(null);
  const [showLegalModal, setShowLegalModal] = useState(false);

  React.useEffect(() => {
    fetchLegalSettings();
  }, []);

  async function fetchLegalSettings() {
    try {
      const { data, error } = await supabase
        .from('app_legal_settings')
        .select('*')
        .single();
      if (data) setLegalSettings(data);
    } catch (err) {
      console.error('Error fetching legal settings:', err);
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSignUp) {
      handleSignUp();
    } else {
      handleLogin(e);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
    } catch (err: any) {
      setError(formatError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!email || !password) {
      setError('Preencha email e senha para cadastrar.');
      return;
    }
    if (password.length < 8) {
      setError('A senha deve ter no mínimo 8 caracteres.');
      return;
    }
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            accepted_terms_version: legalSettings?.version || 0
          }
        }
      });
      if (error) throw error;
      
      setSuccessMsg('Cadastro realizado com sucesso! Verifique seu email se necessário.');
      
    } catch (err: any) {
      setError(formatError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Por favor, digite seu email no campo acima para recuperar a senha.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setError('Por favor, digite um email válido.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: `${window.location.origin}/`,
      });
      
      if (error) {
        // Handle specific Supabase errors that might not be caught by formatError
        if (error.message.includes('rate limit')) {
          throw new Error('Muitas solicitações. Por favor, aguarde um minuto antes de tentar novamente.');
        }
        throw error;
      }

      setResetSent(true);
      setSuccessMsg('Instruções de recuperação enviadas para o seu email! Verifique também a caixa de spam.');
    } catch (err: any) {
      console.error('Reset password error:', err);
      setError(formatError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f0f2f5] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Watermark Pattern (Simulated) */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none flex items-center justify-center">
        <div className="w-[150%] h-[150%] rotate-12 flex flex-wrap gap-20 justify-center">
          {[...Array(20)].map((_, i) => (
            <div key={i} className="w-64 h-64 border-[20px] border-[#4a1d33] rounded-full opacity-20" />
          ))}
        </div>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-[440px] bg-[#fdf8e1] rounded-[40px] p-8 sm:p-12 shadow-[0_20px_50px_rgba(0,0,0,0.1)] relative z-10 border border-white/20"
      >
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Logo className="w-32 h-32" />
          </div>
          <h1 className="text-[28px] font-bold text-[#4a1d33] tracking-wide uppercase leading-tight">
            Consigna Beauty
          </h1>
          <p className="text-[#6b4e5d] text-lg font-medium mt-1">
            Solução de Vendas
          </p>
          <div className="w-full h-[1px] bg-[#dcd7c0] mt-6" />
        </div>

        <div className="mb-6 text-center">
          {isSignUp ? (
            <p className="text-[#6b4e5d] text-sm font-medium">
              Já sou cadastrado?{' '}
              <button
                type="button"
                disabled={loading}
                onClick={() => setIsSignUp(false)}
                className="text-[#4a1d33] font-bold hover:underline underline-offset-2 disabled:opacity-50"
              >
                Voltar ao login
              </button>
            </p>
          ) : (
            <p className="text-[#6b4e5d] text-sm font-medium">
              Primeiro acesso?{' '}
              <button
                type="button"
                disabled={loading}
                onClick={() => setIsSignUp(true)}
                className="text-[#4a1d33] font-bold hover:underline underline-offset-2 disabled:opacity-50"
              >
                Cadastre-se aqui
              </button>
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm text-center"
            >
              {error}
            </motion.div>
          )}

          {successMsg && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-emerald-50 border border-emerald-200 text-emerald-600 px-4 py-3 rounded-xl text-sm text-center font-medium"
            >
              {successMsg}
            </motion.div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-[#4a1d33] ml-1">Email</label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-white border border-[#d1d5db] rounded-xl px-4 py-3.5 text-[#4a1d33] placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#38a89d]/20 focus:border-[#38a89d] transition-all shadow-sm"
              placeholder={isSignUp ? "Seu melhor email" : "Digite seu email corporativo"}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-[#4a1d33] ml-1">Senha</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                autoComplete={isSignUp ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white border border-[#d1d5db] rounded-xl px-4 py-3.5 text-[#4a1d33] placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#38a89d]/20 focus:border-[#38a89d] transition-all shadow-sm"
                placeholder={isSignUp ? "Crie uma senha forte" : "Digite sua senha"}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-[#38a89d] transition-colors"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            
            {isSignUp && password && (
              <div className="mt-2 space-y-1.5">
                <div className="flex gap-1 h-1">
                  {[...Array(4)].map((_, i) => {
                    const strength = 
                      (password.length >= 8 ? 1 : 0) +
                      (/[A-Z]/.test(password) ? 1 : 0) +
                      (/[0-9]/.test(password) ? 1 : 0) +
                      (/[^A-Za-z0-9]/.test(password) ? 1 : 0);
                    return (
                      <div 
                        key={i} 
                        className={`h-full flex-1 rounded-full transition-colors ${
                          i < strength 
                            ? strength <= 1 ? 'bg-red-400' : strength <= 2 ? 'bg-amber-400' : strength <= 3 ? 'bg-emerald-400' : 'bg-emerald-600'
                            : 'bg-zinc-200'
                        }`} 
                      />
                    );
                  })}
                </div>
                <p className="text-[10px] text-zinc-500 flex items-center gap-1.5">
                  {password.length < 8 ? 'Mínimo 8 caracteres' : 'Senha aceitável'}
                </p>
              </div>
            )}

            {!isSignUp && (
              <div className="text-right">
                <button 
                  type="button" 
                  onClick={handleResetPassword}
                  disabled={loading}
                  className="text-xs font-bold text-[#4a1d33] hover:underline underline-offset-2 disabled:opacity-50"
                >
                  Esqueceu a senha?
                </button>
              </div>
            )}
          </div>

          <div className="pt-4 space-y-4">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#38a89d] hover:bg-[#2d8a81] text-white font-bold py-4 rounded-[20px] transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#38a89d]/20 active:scale-[0.98] disabled:opacity-70"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (isSignUp ? 'CADASTRAR' : 'ENTRAR')}
            </button>
          </div>
        </form>
      </motion.div>
      
      {/* Decorative Stars/Dots from the image */}
      <div className="absolute bottom-10 right-10 opacity-20">
        <div className="w-4 h-4 bg-[#4a1d33] rotate-45" />
      </div>
      <div className="absolute top-20 left-20 opacity-10">
        <div className="w-8 h-8 rounded-full border-4 border-[#4a1d33]" />
      </div>

      {legalSettings && (
        <LegalConfirmationModal
          isOpen={showLegalModal}
          privacyPolicy={legalSettings.privacy_policy}
          termsOfUse={legalSettings.terms_of_use}
          onConfirm={async () => {
            setShowLegalModal(false);
          }}
        />
      )}
    </div>
  );
}
