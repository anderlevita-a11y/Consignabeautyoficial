import React, { useState, useEffect } from 'react';
import { 
  StickyNote, 
  CheckSquare, 
  Calendar, 
  Instagram, 
  Users, 
  Lightbulb, 
  Plus, 
  Trash2, 
  Save,
  Clock,
  Target,
  MessageCircle,
  TrendingUp,
  Star,
  AlertCircle,
  ChevronRight,
  LayoutDashboard,
  Smartphone,
  Loader2,
  ChevronLeft,
  Copy
} from 'lucide-react';
import { cn, formatError } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../lib/supabase';
import { useNotifications } from './NotificationCenter';
import { WeeklyPlanner } from './WeeklyPlanner';
import { DailyInsight } from '../types';
import { ConfirmationModal } from './ConfirmationModal';

interface Task {
  id: string;
  text: string;
  completed: boolean;
  period: 'morning' | 'afternoon' | 'night';
}

interface Habit {
  id: string;
  name: string;
  completed: boolean;
}

interface ContentIdea {
  id: string;
  title: string;
  type: 'topo' | 'meio' | 'fundo';
  status: 'idea' | 'draft' | 'scheduled' | 'posted';
}

interface Lead {
  id: string;
  name: string;
  status: 'new' | 'negotiating' | 'closed' | 'lost';
  lastContact: string;
}

interface Feedback {
  id: string;
  text: string;
  type: 'positive' | 'negative' | 'suggestion';
}

export function SmartNotepad() {
  const { addNotification } = useNotifications();
  const [activeTab, setActiveTab] = useState<'today' | 'content' | 'sales' | 'insights'>('today');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // State for Today
  const [habits, setHabits] = useState<Habit[]>([
    { id: '1', name: 'Postar Stories', completed: false },
    { id: '2', name: 'Prospecção (5 leads)', completed: false },
    { id: '3', name: 'Responder DMs', completed: false }
  ]);
  const [inegociaveis, setInegociaveis] = useState<string[]>(['', '', '']);
  const [insightDoDia, setInsightDoDia] = useState('');

  // State for Content
  const [contentIdeas, setContentIdeas] = useState<ContentIdea[]>([]);
  const [captions, setCaptions] = useState('');
  
  // State for Sales
  const [leads, setLeads] = useState<Lead[]>([]);
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [scripts, setScripts] = useState('');

  // State for Insights
  const [generalNotes, setGeneralNotes] = useState('');

  // Daily Insight State
  const [currentInsight, setCurrentInsight] = useState<DailyInsight | null>(null);
  const [insightExhausted, setInsightExhausted] = useState(false);

  // Deletion state
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    feedbackId: string | null;
  }>({
    isOpen: false,
    feedbackId: null
  });

  // Load data from Supabase (with localStorage fallback)
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
        if (user) {
          const { data, error } = await supabase
            .from('smart_notepad')
            .select('data')
            .eq('user_id', user.id)
            .single();

          if (data?.data) {
            const notepadData = data.data;
            if (notepadData.habits) setHabits(notepadData.habits);
            if (notepadData.inegociaveis) setInegociaveis(notepadData.inegociaveis);
            if (notepadData.insightDoDia) setInsightDoDia(notepadData.insightDoDia);
            if (notepadData.contentIdeas) setContentIdeas(notepadData.contentIdeas);
            if (notepadData.captions) setCaptions(notepadData.captions);
            if (notepadData.leads) setLeads(notepadData.leads);
            if (notepadData.feedbacks) setFeedbacks(notepadData.feedbacks);
            if (notepadData.scripts) setScripts(notepadData.scripts);
            if (notepadData.generalNotes) setGeneralNotes(notepadData.generalNotes);
            
            // Handle Daily Insight
            const today = new Date().toISOString().split('T')[0];
            if (notepadData.lastInsightDate === today && notepadData.currentInsight) {
              setCurrentInsight(notepadData.currentInsight);
            } else {
              // New day or first time, fetch next insight
              const nextIndex = notepadData.lastInsightDate ? (notepadData.lastInsightIndex + 1) : 0;
              
              const { data: nextInsight, error: insightError } = await supabase
                .from('daily_insights')
                .select('*')
                .eq('order_index', nextIndex)
                .single();

              if (nextInsight) {
                setCurrentInsight(nextInsight);
                // We don't save yet, we'll save on the next auto-save or manual save
                // But we should update the state so it's consistent
              } else {
                // Check if we are out of insights
                const { count } = await supabase
                  .from('daily_insights')
                  .select('*', { count: 'exact', head: true });
                
                if (count && nextIndex >= count) {
                  setInsightExhausted(true);
                }
              }
            }

            setLoading(false);
          }
        }
      } catch (err) {
        console.error('Error loading from Supabase:', err);
        addNotification({
          type: 'error',
          title: 'Erro ao carregar notas',
          message: formatError(err)
        });
      }

      // Fallback to localStorage
      const saved = localStorage.getItem('smart_notepad_data');
      if (saved) {
        const data = JSON.parse(saved);
        if (data.habits) setHabits(data.habits);
        if (data.inegociaveis) setInegociaveis(data.inegociaveis);
        if (data.insightDoDia) setInsightDoDia(data.insightDoDia);
        if (data.contentIdeas) setContentIdeas(data.contentIdeas);
        if (data.captions) setCaptions(data.captions);
        if (data.leads) setLeads(data.leads);
        if (data.feedbacks) setFeedbacks(data.feedbacks);
        if (data.scripts) setScripts(data.scripts);
        if (data.generalNotes) setGeneralNotes(data.generalNotes);
      }
      setLoading(false);
    };

    loadData();
  }, []);

  // Save data to localStorage (auto-save)
  useEffect(() => {
    if (loading) return;
    const data = {
      habits,
      inegociaveis,
      insightDoDia,
      contentIdeas,
      captions,
      leads,
      feedbacks,
      scripts,
      generalNotes,
      currentInsight,
      lastInsightDate: currentInsight ? new Date().toISOString().split('T')[0] : null,
      lastInsightIndex: currentInsight ? currentInsight.order_index : 0
    };
    localStorage.setItem('smart_notepad_data', JSON.stringify(data));
  }, [habits, inegociaveis, insightDoDia, contentIdeas, captions, leads, feedbacks, scripts, generalNotes, currentInsight, loading]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
      if (!user) throw new Error('Usuário não autenticado');

      // Fetch existing data to merge (preserve weekly_schedule)
      const { data: existingData } = await supabase
        .from('smart_notepad')
        .select('data')
        .eq('user_id', user.id)
        .single();

      const data = {
        ...(existingData?.data || {}),
        habits,
        inegociaveis,
        insightDoDia,
        contentIdeas,
        captions,
        leads,
        feedbacks,
        scripts,
        generalNotes,
        currentInsight,
        lastInsightDate: currentInsight ? new Date().toISOString().split('T')[0] : null,
        lastInsightIndex: currentInsight ? currentInsight.order_index : 0
      };

      const { error } = await supabase
        .from('smart_notepad')
        .upsert({
          user_id: user.id,
          data: data,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
      addNotification({
        type: 'success',
        title: 'Sucesso',
        message: 'Bloco de notas salvo com sucesso!'
      });
    } catch (err: any) {
      console.error('Error saving to Supabase:', err);
      addNotification({
        type: 'error',
        title: 'Erro ao salvar notas',
        message: formatError(err)
      });
    } finally {
      setSaving(false);
    }
  };

  const addLead = () => {
    const newLead: Lead = {
      id: Date.now().toString(),
      name: '',
      status: 'new',
      lastContact: new Date().toISOString().split('T')[0]
    };
    setLeads([...leads, newLead]);
  };

  const addContentIdea = () => {
    const newIdea: ContentIdea = {
      id: Date.now().toString(),
      title: '',
      type: 'topo',
      status: 'idea'
    };
    setContentIdeas([...contentIdeas, newIdea]);
  };

  const confirmDeleteFeedback = () => {
    if (deleteModal.feedbackId) {
      setFeedbacks(feedbacks.filter(item => item.id !== deleteModal.feedbackId));
    }
    setDeleteModal({ isOpen: false, feedbackId: null });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 text-[#38a89d] animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-20 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-8 rounded-[32px] border border-zinc-100 shadow-sm">
        <div className="flex items-center justify-between w-full md:w-auto">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-[#38a89d]/10 rounded-2xl flex items-center justify-center">
              <StickyNote className="w-7 h-7 text-[#38a89d]" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-zinc-800 tracking-tight">Bloco de Notas</h2>
              <p className="text-sm text-zinc-500">Seu segundo cérebro.</p>
            </div>
          </div>
          <button 
            onClick={handleSave}
            disabled={saving}
            className="md:hidden flex items-center gap-2 bg-[#38a89d] text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-[#2d8a81] transition-all disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar
          </button>
        </div>
        
        <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
          <div className="flex items-center gap-2 bg-zinc-100 p-1.5 rounded-2xl overflow-x-auto w-full md:w-auto no-scrollbar">
            <TabButton active={activeTab === 'today'} onClick={() => setActiveTab('today')} icon={LayoutDashboard} label="Hoje" />
            <TabButton active={activeTab === 'content'} onClick={() => setActiveTab('content')} icon={Instagram} label="Conteúdo" />
            <TabButton active={activeTab === 'sales'} onClick={() => setActiveTab('sales')} icon={Users} label="Vendas" />
            <TabButton active={activeTab === 'insights'} onClick={() => setActiveTab('insights')} icon={Lightbulb} label="Insights" />
          </div>
          
          <button 
            onClick={handleSave}
            disabled={saving}
            className="hidden md:flex items-center gap-2 bg-[#38a89d] text-white px-6 py-3 rounded-2xl text-sm font-bold hover:bg-[#2d8a81] transition-all shadow-sm shadow-[#38a89d]/20 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            Salvar no Servidor
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'today' && (
          <motion.div 
            key="today"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-8"
          >
            {/* Left Column: Priorities & Habits */}
            <div className="space-y-8">
              {/* Inegociáveis */}
              <div className="bg-white p-8 rounded-[32px] border border-zinc-100 shadow-sm space-y-6">
                <div className="flex items-center gap-3">
                  <Target className="w-5 h-5 text-red-500" />
                  <h3 className="font-bold text-zinc-800 uppercase tracking-wider text-xs">Os 3 Inegociáveis</h3>
                </div>
                <div className="space-y-3">
                  {inegociaveis.map((text, i) => (
                    <div key={i} className="flex items-center gap-3 bg-zinc-50 p-4 rounded-2xl border border-zinc-100">
                      <span className="text-xs font-bold text-zinc-400">0{i+1}</span>
                      <input 
                        type="text"
                        value={text}
                        onChange={(e) => {
                          const newIneg = [...inegociaveis];
                          newIneg[i] = e.target.value;
                          setInegociaveis(newIneg);
                        }}
                        placeholder="Defina uma prioridade..."
                        className="bg-transparent border-none w-full text-sm font-semibold text-zinc-700 focus:ring-0 p-0"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Habit Tracker */}
              <div className="bg-white p-8 rounded-[32px] border border-zinc-100 shadow-sm space-y-6">
                <div className="flex items-center gap-3">
                  <TrendingUp className="w-5 h-5 text-[#38a89d]" />
                  <h3 className="font-bold text-zinc-800 uppercase tracking-wider text-xs">Rastreador de Hábitos</h3>
                </div>
                <div className="space-y-2">
                  {habits.map((habit) => (
                    <button 
                      key={habit.id}
                      onClick={() => setHabits(habits.map(h => h.id === habit.id ? { ...h, completed: !h.completed } : h))}
                      className={cn(
                        "w-full flex items-center justify-between p-4 rounded-2xl border transition-all",
                        habit.completed 
                          ? "bg-emerald-50 border-emerald-100 text-emerald-700" 
                          : "bg-zinc-50 border-zinc-100 text-zinc-600 hover:border-zinc-200"
                      )}
                    >
                      <span className="text-sm font-bold">{habit.name}</span>
                      <div className={cn(
                        "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
                        habit.completed ? "bg-emerald-500 border-emerald-500" : "border-zinc-300"
                      )}>
                        {habit.completed && <CheckSquare className="w-3 h-3 text-white" />}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Middle Column: Weekly Planner */}
            <div className="lg:col-span-2 space-y-8">
              <WeeklyPlanner embedded={true} />

              {/* Insight do Dia */}
              <div className="bg-[#fdf8e1] p-8 rounded-[32px] border border-[#f1e4a1] shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Lightbulb className="w-5 h-5 text-amber-500" />
                    <h3 className="font-bold text-amber-900 uppercase tracking-wider text-xs">Dica de Publicação do Dia</h3>
                  </div>
                  {currentInsight && (
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(currentInsight.content);
                        addNotification({
                          type: 'success',
                          title: 'Copiado',
                          message: 'Dica copiada para a área de transferência!'
                        });
                      }}
                      className="p-2 hover:bg-amber-100 rounded-xl text-amber-600 transition-all"
                      title="Copiar Dica"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  )}
                </div>
                
                {insightExhausted ? (
                  <div className="bg-amber-50/50 p-4 rounded-2xl border border-dashed border-amber-200">
                    <p className="text-xs text-amber-800 font-medium text-center italic">
                      ⚠️ Dicas esgotadas! Por favor, avise o administrador para renovar o banco de dados.
                    </p>
                  </div>
                ) : currentInsight ? (
                  <div className="space-y-3">
                    <div className="max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                      <pre className="text-amber-900/80 text-xs italic whitespace-pre-wrap font-sans leading-relaxed">
                        {currentInsight.content}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <div className="animate-pulse flex space-y-2 flex-col">
                    <div className="h-2 bg-amber-200 rounded w-3/4"></div>
                    <div className="h-2 bg-amber-200 rounded w-1/2"></div>
                    <div className="h-2 bg-amber-200 rounded w-5/6"></div>
                  </div>
                )}

                <div className="pt-4 border-t border-amber-200/50">
                  <div className="flex items-center gap-2 mb-2">
                    <Star className="w-4 h-4 text-amber-500" />
                    <h4 className="text-[10px] font-bold text-amber-900 uppercase tracking-wider">Meu Insight Pessoal</h4>
                  </div>
                  <textarea 
                    value={insightDoDia}
                    onChange={(e) => setInsightDoDia(e.target.value)}
                    placeholder="Qual foi o seu maior aprendizado de hoje?"
                    className="w-full bg-transparent border-none p-0 text-amber-900/70 text-sm italic focus:ring-0 resize-none h-16"
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'content' && (
          <motion.div 
            key="content"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-8"
          >
            {/* Funnel Section */}
            <div className="lg:col-span-2 space-y-8">
              <div className="bg-white p-8 rounded-[32px] border border-zinc-100 shadow-sm space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Smartphone className="w-5 h-5 text-pink-500" />
                    <h3 className="font-bold text-zinc-800 uppercase tracking-wider text-xs">Fábrica de Conteúdo (Funil)</h3>
                  </div>
                  <button 
                    onClick={addContentIdea}
                    className="flex items-center gap-2 bg-pink-50 text-pink-600 px-4 py-2 rounded-xl text-xs font-bold hover:bg-pink-100 transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    Nova Ideia
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FunnelColumn 
                    title="Atração (Topo)" 
                    subtitle="Reels, Dicas Rápidas"
                    ideas={contentIdeas.filter(i => i.type === 'topo')}
                    onUpdate={(id, title) => setContentIdeas(contentIdeas.map(i => i.id === id ? { ...i, title } : i))}
                    onRemove={(id) => setContentIdeas(contentIdeas.filter(i => i.id !== id))}
                    color="pink"
                  />
                  <FunnelColumn 
                    title="Desejo (Meio)" 
                    subtitle="Bastidores, Prova Social"
                    ideas={contentIdeas.filter(i => i.type === 'meio')}
                    onUpdate={(id, title) => setContentIdeas(contentIdeas.map(i => i.id === id ? { ...i, title } : i))}
                    onRemove={(id) => setContentIdeas(contentIdeas.filter(i => i.id !== id))}
                    color="violet"
                  />
                  <FunnelColumn 
                    title="Venda (Fundo)" 
                    subtitle="Oferta Direta, CTA"
                    ideas={contentIdeas.filter(i => i.type === 'fundo')}
                    onUpdate={(id, title) => setContentIdeas(contentIdeas.map(i => i.id === id ? { ...i, title } : i))}
                    onRemove={(id) => setContentIdeas(contentIdeas.filter(i => i.id !== id))}
                    color="emerald"
                  />
                </div>
              </div>

              {/* Banco de Legendas */}
              <div className="bg-white p-8 rounded-[32px] border border-zinc-100 shadow-sm space-y-4">
                <div className="flex items-center gap-3">
                  <MessageCircle className="w-5 h-5 text-zinc-400" />
                  <h3 className="font-bold text-zinc-800 uppercase tracking-wider text-xs">Banco de Legendas & Rascunhos</h3>
                </div>
                <textarea 
                  value={captions}
                  onChange={(e) => setCaptions(e.target.value)}
                  placeholder="Escreva seus rascunhos aqui..."
                  className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl p-6 text-sm text-zinc-600 focus:ring-2 focus:ring-pink-500/10 focus:border-pink-500 outline-none transition-all h-64"
                />
              </div>
            </div>

            {/* Checklist Column */}
            <div className="space-y-8">
              <div className="bg-white p-8 rounded-[32px] border border-zinc-100 shadow-sm space-y-6">
                <div className="flex items-center gap-3">
                  <CheckSquare className="w-5 h-5 text-emerald-500" />
                  <h3 className="font-bold text-zinc-800 uppercase tracking-wider text-xs">Checklist de Postagem</h3>
                </div>
                <div className="space-y-3">
                  <StaticCheckItem label="Responder comentários anteriores" />
                  <StaticCheckItem label="CTA clara na legenda" />
                  <StaticCheckItem label="Hashtags estratégicas" />
                  <StaticCheckItem label="Capa atraente (Reels)" />
                  <StaticCheckItem label="Compartilhar nos Stories" />
                  <StaticCheckItem label="Interagir com 5 perfis do nicho" />
                </div>
              </div>
              
              <div className="bg-zinc-900 p-8 rounded-[32px] text-white space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Dica Estratégica</h4>
                <p className="text-sm italic text-zinc-300">"Documente, não apenas crie. O bastidor gera mais confiança que o post perfeito."</p>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'sales' && (
          <motion.div 
            key="sales"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-8"
          >
            {/* CRM Express */}
            <div className="lg:col-span-2 space-y-8">
              <div className="bg-white p-8 rounded-[32px] border border-zinc-100 shadow-sm space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Users className="w-5 h-5 text-blue-500" />
                    <h3 className="font-bold text-zinc-800 uppercase tracking-wider text-xs">CRM Express (Leads)</h3>
                  </div>
                  <button 
                    onClick={addLead}
                    className="flex items-center gap-2 bg-blue-50 text-blue-600 px-4 py-2 rounded-xl text-xs font-bold hover:bg-blue-100 transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    Novo Lead
                  </button>
                </div>

                <div className="space-y-3">
                  {leads.map((lead) => (
                    <div key={lead.id} className="flex flex-col sm:flex-row sm:items-center gap-4 bg-zinc-50 p-4 rounded-2xl border border-zinc-100 group">
                      <input 
                        type="text"
                        value={lead.name}
                        onChange={(e) => setLeads(leads.map(l => l.id === lead.id ? { ...l, name: e.target.value } : l))}
                        placeholder="Nome do cliente..."
                        className="flex-1 bg-transparent border-none text-sm font-bold text-zinc-700 focus:ring-0 p-0 w-full"
                      />
                      <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                        <select 
                          value={lead.status}
                          onChange={(e) => setLeads(leads.map(l => l.id === lead.id ? { ...l, status: e.target.value as any } : l))}
                          className="bg-white border border-zinc-200 rounded-lg text-[10px] font-bold uppercase py-1 px-2 outline-none"
                        >
                          <option value="new">Novo</option>
                          <option value="negotiating">Negociando</option>
                          <option value="closed">Fechado</option>
                          <option value="lost">Perdido</option>
                        </select>
                        <input 
                          type="date"
                          value={lead.lastContact}
                          onChange={(e) => setLeads(leads.map(l => l.id === lead.id ? { ...l, lastContact: e.target.value } : l))}
                          className="bg-transparent border-none text-[10px] font-bold text-zinc-400 focus:ring-0 p-0"
                        />
                        <button 
                          onClick={() => setLeads(leads.filter(l => l.id !== lead.id))}
                          className="opacity-100 sm:opacity-0 group-hover:opacity-100 p-2 hover:bg-red-50 text-red-500 rounded-lg transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {leads.length === 0 && (
                    <div className="text-center py-12 text-zinc-400 italic text-sm">
                      Nenhum lead registrado. Comece a prospectar!
                    </div>
                  )}
                </div>
              </div>

              {/* Script de Abordagem */}
              <div className="bg-white p-8 rounded-[32px] border border-zinc-100 shadow-sm space-y-4">
                <div className="flex items-center gap-3">
                  <MessageCircle className="w-5 h-5 text-indigo-500" />
                  <h3 className="font-bold text-zinc-800 uppercase tracking-wider text-xs">Script de Abordagem & Objeções</h3>
                </div>
                <textarea 
                  value={scripts}
                  onChange={(e) => setScripts(e.target.value)}
                  placeholder="Lembretes de como quebrar objeções comuns..."
                  className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl p-6 text-sm text-zinc-600 focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all h-48"
                />
              </div>
            </div>

            {/* Feedback Section */}
            <div className="space-y-8">
              <div className="bg-white p-8 rounded-[32px] border border-zinc-100 shadow-sm space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-500" />
                    <h3 className="font-bold text-zinc-800 uppercase tracking-wider text-xs">Feedback de Ouro</h3>
                  </div>
                  <button 
                    onClick={() => setFeedbacks([...feedbacks, { id: Date.now().toString(), text: '', type: 'suggestion' }])}
                    className="p-2 hover:bg-zinc-50 rounded-lg transition-all"
                  >
                    <Plus className="w-4 h-4 text-zinc-400" />
                  </button>
                </div>
                <div className="space-y-3">
                  {feedbacks.map((f) => (
                    <div key={f.id} className="space-y-2 group">
                      <div className="flex items-center gap-2">
                        <select 
                          value={f.type}
                          onChange={(e) => setFeedbacks(feedbacks.map(item => item.id === f.id ? { ...item, type: e.target.value as any } : item))}
                          className={cn(
                            "text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full border",
                            f.type === 'positive' ? "bg-emerald-50 border-emerald-100 text-emerald-600" :
                            f.type === 'negative' ? "bg-red-50 border-red-100 text-red-600" :
                            "bg-amber-50 border-amber-100 text-amber-600"
                          )}
                        >
                          <option value="positive">Elogio</option>
                          <option value="negative">Reclamação</option>
                          <option value="suggestion">Sugestão</option>
                        </select>
                        <button 
                          onClick={() => setDeleteModal({ isOpen: true, feedbackId: f.id })}
                          className="text-red-400 hover:text-red-600 transition-all p-1 hover:bg-red-50 rounded-md"
                          title="Excluir Feedback"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <textarea 
                        value={f.text}
                        onChange={(e) => setFeedbacks(feedbacks.map(item => item.id === f.id ? { ...item, text: e.target.value } : item))}
                        placeholder="O que o cliente disse?"
                        className="w-full bg-zinc-50 border border-zinc-100 rounded-xl p-3 text-xs text-zinc-600 focus:ring-1 focus:ring-amber-500/10 focus:border-amber-500 outline-none transition-all resize-none h-20"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-blue-600 p-8 rounded-[32px] text-white space-y-4 shadow-lg shadow-blue-500/20">
                <h4 className="text-xs font-bold uppercase tracking-widest text-blue-200">Regra de Ouro</h4>
                <p className="text-sm italic text-blue-50">"A regra dos 2 dias: nunca deixe um lead sem resposta por mais de 48h."</p>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'insights' && (
          <motion.div 
            key="insights"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-8"
          >
            <div className="bg-white p-8 rounded-[32px] border border-zinc-100 shadow-sm space-y-6">
              <div className="flex items-center gap-3">
                <Lightbulb className="w-6 h-6 text-amber-500" />
                <h3 className="font-bold text-zinc-800 uppercase tracking-wider text-xs">Arquivo de Insights & Aprendizados</h3>
              </div>
              <textarea 
                value={generalNotes}
                onChange={(e) => setGeneralNotes(e.target.value)}
                placeholder="Anote aqui o que aprendeu em cursos, observando a concorrência ou em conversas..."
                className="w-full bg-zinc-50 border border-zinc-100 rounded-[32px] p-8 text-sm text-zinc-600 focus:ring-4 focus:ring-amber-500/5 focus:border-amber-500 outline-none transition-all h-[60vh] leading-relaxed"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmationModal
        isOpen={deleteModal.isOpen}
        title="Excluir Feedback"
        message="Tem certeza que deseja excluir este feedback de ouro? Esta ação não pode ser desfeita."
        confirmText="Sim, excluir"
        onConfirm={confirmDeleteFeedback}
        onCancel={() => setDeleteModal({ isOpen: false, feedbackId: null })}
        variant="danger"
      />
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label }: { active: boolean, onClick: () => void, icon: any, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-4 sm:px-6 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap",
        active ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
      )}
    >
      <Icon className={cn("w-4 h-4", active ? "text-[#38a89d]" : "text-zinc-400")} />
      {label}
    </button>
  );
}

function FunnelColumn({ title, subtitle, ideas, onUpdate, onRemove, color }: any) {
  const colors: any = {
    pink: "bg-pink-50 text-pink-600 border-pink-100",
    violet: "bg-violet-50 text-violet-600 border-violet-100",
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-100"
  };

  return (
    <div className="space-y-4">
      <div className={cn("p-4 rounded-2xl border", colors[color])}>
        <h4 className="text-xs font-bold uppercase tracking-wider">{title}</h4>
        <p className="text-[10px] opacity-70">{subtitle}</p>
      </div>
      <div className="space-y-2">
        {ideas.map((idea: any) => (
          <div key={idea.id} className="bg-zinc-50 p-3 rounded-xl border border-zinc-100 group">
            <textarea 
              value={idea.title}
              onChange={(e) => onUpdate(idea.id, e.target.value)}
              placeholder="Ideia de post..."
              className="w-full bg-transparent border-none text-xs text-zinc-600 focus:ring-0 p-0 resize-none h-12"
            />
            <div className="flex justify-end mt-1 opacity-0 group-hover:opacity-100 transition-all">
              <button onClick={() => onRemove(idea.id)} className="text-red-400 hover:text-red-600">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StaticCheckItem({ label }: { label: string }) {
  const [checked, setChecked] = useState(false);
  return (
    <button 
      onClick={() => setChecked(!checked)}
      className={cn(
        "w-full flex items-center gap-3 p-3 rounded-xl border transition-all",
        checked ? "bg-emerald-50 border-emerald-100 text-emerald-700" : "bg-zinc-50 border-zinc-100 text-zinc-500"
      )}
    >
      <div className={cn(
        "w-4 h-4 rounded border flex items-center justify-center",
        checked ? "bg-emerald-500 border-emerald-500" : "border-zinc-300"
      )}>
        {checked && <CheckSquare className="w-2.5 h-2.5 text-white" />}
      </div>
      <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
    </button>
  );
}
