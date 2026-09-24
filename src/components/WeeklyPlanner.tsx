import React, { useState, useEffect } from 'react';
import { 
  Calendar, 
  Plus, 
  Trash2, 
  Save, 
  Clock, 
  ChevronLeft, 
  ChevronRight,
  MoreVertical,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Download,
  Share2
} from 'lucide-react';
import { cn, formatError } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../lib/supabase';
import { useNotifications } from './NotificationCenter';

interface ScheduleItem {
  id: string;
  day: number; // 0-6 (Mon-Sun)
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  title: string;
  category: string;
  color: string;
}

const DAYS = [
  'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'
];

const CATEGORIES = [
  { name: 'Trabalho', color: 'bg-blue-500' },
  { name: 'Pessoal', color: 'bg-emerald-500' },
  { name: 'Estudo', color: 'bg-violet-500' },
  { name: 'Saúde', color: 'bg-rose-500' },
  { name: 'Outros', color: 'bg-zinc-500' }
];

export function WeeklyPlanner({ embedded = false }: { embedded?: boolean }) {
  const { addNotification } = useNotifications();
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ScheduleItem | null>(null);
  const [selectedDay, setSelectedDay] = useState(new Date().getDay() === 0 ? 6 : new Date().getDay() - 1);

  // Form state
  const [formDay, setFormDay] = useState(0);
  const [formStart, setFormStart] = useState('09:00');
  const [formEnd, setFormEnd] = useState('10:00');
  const [formTitle, setFormTitle] = useState('');
  const [formCategory, setFormCategory] = useState('Trabalho');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data, error } = await supabase
          .from('smart_notepad')
          .select('data')
          .eq('user_id', session.user.id)
          .single();

        if (data?.data?.weekly_schedule) {
          setItems(data.data.weekly_schedule);
          setLoading(false);
          return;
        }
      }
    } catch (err) {
      console.error('Error loading schedule:', err);
    }

    const saved = localStorage.getItem('weekly_schedule');
    if (saved) {
      setItems(JSON.parse(saved));
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('Usuário não autenticado');

      const { data: existingData } = await supabase
        .from('smart_notepad')
        .select('data')
        .eq('user_id', session.user.id)
        .single();

      const newData = {
        ...(existingData?.data || {}),
        weekly_schedule: items
      };

      const { error } = await supabase
        .from('smart_notepad')
        .upsert({
          user_id: session.user.id,
          data: newData,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;

      localStorage.setItem('weekly_schedule', JSON.stringify(items));
      
      addNotification({
        type: 'success',
        title: 'Agenda Salva',
        message: 'Sua agenda semanal foi sincronizada com sucesso.'
      });
    } catch (err) {
      console.error('Error saving schedule:', err);
      addNotification({
        type: 'error',
        title: 'Erro ao salvar',
        message: formatError(err)
      });
      localStorage.setItem('weekly_schedule', JSON.stringify(items));
    } finally {
      setSaving(false);
    }
  };

  const openAddModal = (day: number) => {
    setFormDay(day);
    setFormTitle('');
    setFormStart('09:00');
    setFormEnd('10:00');
    setFormCategory('Trabalho');
    setEditingItem(null);
    setIsModalOpen(true);
  };

  const openEditModal = (item: ScheduleItem) => {
    setEditingItem(item);
    setFormDay(item.day);
    setFormTitle(item.title);
    setFormStart(item.startTime);
    setFormEnd(item.endTime);
    setFormCategory(item.category);
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const categoryObj = CATEGORIES.find(c => c.name === formCategory) || CATEGORIES[0];
    
    const newItem: ScheduleItem = {
      id: editingItem?.id || Date.now().toString(),
      day: formDay,
      startTime: formStart,
      endTime: formEnd,
      title: formTitle,
      category: formCategory,
      color: categoryObj.color
    };

    if (editingItem) {
      setItems(items.map(i => i.id === editingItem.id ? newItem : i));
    } else {
      setItems([...items, newItem]);
    }

    setIsModalOpen(false);
  };

  const removeItem = (id: string) => {
    setItems(items.filter(i => i.id !== id));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 text-[#38a89d] animate-spin" />
      </div>
    );
  }

  return (
    <div className={cn("mx-auto space-y-8 animate-in fade-in duration-500", !embedded && "max-w-7xl pb-20")}>
      {/* Header */}
      {!embedded && (
        <div className="bg-white p-8 rounded-[32px] border border-zinc-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-[#38a89d]/10 rounded-2xl flex items-center justify-center">
              <Calendar className="w-7 h-7 text-[#38a89d]" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-zinc-800 tracking-tight">Agenda Semanal</h2>
              <p className="text-sm text-zinc-500">Organize sua rotina e maximize sua produtividade.</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={() => openAddModal(selectedDay)}
              className="flex items-center gap-2 bg-zinc-100 text-zinc-700 px-6 py-3 rounded-2xl text-sm font-bold hover:bg-zinc-200 transition-all"
            >
              <Plus className="w-5 h-5" />
              Novo Evento
            </button>
            <button 
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 bg-[#38a89d] text-white px-6 py-3 rounded-2xl text-sm font-bold hover:bg-[#2d8a81] transition-all shadow-sm shadow-[#38a89d]/20 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              Salvar Agenda
            </button>
          </div>
        </div>
      )}

      {/* Embedded Day Selector */}
      {embedded && (
        <div className="bg-white p-8 rounded-[32px] border border-zinc-100 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-indigo-500" />
              <h3 className="font-bold text-zinc-800 uppercase tracking-wider text-xs">Agenda Semanal</h3>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={handleSave}
                disabled={saving}
                className="p-2 hover:bg-zinc-50 rounded-xl text-[#38a89d] transition-all disabled:opacity-50"
                title="Salvar Agenda"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              </button>
              <button 
                onClick={() => openAddModal(selectedDay)}
                className="p-2 hover:bg-zinc-50 rounded-xl text-zinc-400 transition-all"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2">
            {DAYS.map((day, i) => (
              <button
                key={day}
                onClick={() => setSelectedDay(i)}
                className={cn(
                  "px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap",
                  selectedDay === i 
                    ? "bg-zinc-900 text-white shadow-md" 
                    : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
                )}
              >
                {day.substring(0, 3)}
              </button>
            ))}
          </div>

          <div className="space-y-3 min-h-[300px]">
            {items
              .filter(item => item.day === selectedDay)
              .sort((a, b) => a.startTime.localeCompare(b.startTime))
              .map(item => (
                <motion.div 
                  layout
                  key={item.id}
                  onClick={() => openEditModal(item)}
                  className="p-4 rounded-2xl border border-zinc-100 bg-zinc-50/50 hover:bg-white hover:border-zinc-200 cursor-pointer group relative transition-all"
                >
                  <div className={cn("absolute left-0 top-3 bottom-3 w-1 rounded-r-full", item.color)} />
                  <div className="pl-2 flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                          {item.startTime} - {item.endTime}
                        </span>
                        <span className={cn("w-1.5 h-1.5 rounded-full", item.color)} />
                      </div>
                      <h4 className="text-sm font-bold text-zinc-800">{item.title}</h4>
                    </div>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        removeItem(item.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-2 hover:bg-red-50 text-red-500 rounded-lg transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              ))}
            
            {items.filter(item => item.day === selectedDay).length === 0 && (
              <button 
                onClick={() => openAddModal(selectedDay)}
                className="w-full py-12 border-2 border-dashed border-zinc-100 rounded-[32px] flex flex-col items-center justify-center gap-3 text-zinc-300 hover:border-zinc-200 hover:text-zinc-400 transition-all group"
              >
                <div className="w-12 h-12 rounded-2xl bg-zinc-50 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Plus className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest">Adicionar compromisso</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Full Grid View (only when not embedded) */}
      {!embedded && (
        <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
          {DAYS.map((dayName, index) => (
            <div key={dayName} className="space-y-4">
              <div className="bg-white p-4 rounded-2xl border border-zinc-100 shadow-sm text-center">
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{dayName}</h3>
              </div>
              
              <div className="space-y-3 min-h-[200px]">
                {items
                  .filter(item => item.day === index)
                  .sort((a, b) => a.startTime.localeCompare(b.startTime))
                  .map(item => (
                    <motion.div 
                      layout
                      key={item.id}
                      onClick={() => openEditModal(item)}
                      className={cn(
                        "p-4 rounded-2xl border cursor-pointer group relative transition-all hover:scale-[1.02]",
                        "bg-white border-zinc-100 hover:border-zinc-200 shadow-sm"
                      )}
                    >
                      <div className={cn("absolute left-0 top-4 bottom-4 w-1 rounded-r-full", item.color)} />
                      <div className="pl-2 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                            {item.startTime} - {item.endTime}
                          </span>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              removeItem(item.id);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 text-red-500 rounded-lg transition-all"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                        <h4 className="text-sm font-bold text-zinc-800 line-clamp-2">{item.title}</h4>
                        <span className="text-[10px] font-medium text-zinc-500">{item.category}</span>
                      </div>
                    </motion.div>
                  ))}
                
                <button 
                  onClick={() => openAddModal(index)}
                  className="w-full py-4 border-2 border-dashed border-zinc-100 rounded-2xl flex flex-col items-center justify-center gap-2 text-zinc-300 hover:border-zinc-200 hover:text-zinc-400 transition-all group"
                >
                  <Plus className="w-5 h-5 group-hover:scale-110 transition-transform" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Adicionar</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden"
            >
              <div className="p-8 border-b border-zinc-100 flex items-center justify-between">
                <h3 className="text-xl font-bold text-zinc-800">
                  {editingItem ? 'Editar Evento' : 'Novo Evento'}
                </h3>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 hover:bg-zinc-100 rounded-xl transition-all"
                >
                  <MoreVertical className="w-5 h-5 text-zinc-400" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-8 space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Título</label>
                  <input 
                    autoFocus
                    required
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="Ex: Reunião de Planejamento"
                    className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-4 text-sm focus:ring-2 focus:ring-[#38a89d]/10 focus:border-[#38a89d] outline-none transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Início</label>
                    <input 
                      required
                      type="time"
                      value={formStart}
                      onChange={(e) => setFormStart(e.target.value)}
                      className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-4 text-sm focus:ring-2 focus:ring-[#38a89d]/10 focus:border-[#38a89d] outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Fim</label>
                    <input 
                      required
                      type="time"
                      value={formEnd}
                      onChange={(e) => setFormEnd(e.target.value)}
                      className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-4 text-sm focus:ring-2 focus:ring-[#38a89d]/10 focus:border-[#38a89d] outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Dia da Semana</label>
                  <select 
                    value={formDay}
                    onChange={(e) => setFormDay(parseInt(e.target.value))}
                    className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-6 py-4 text-sm focus:ring-2 focus:ring-[#38a89d]/10 focus:border-[#38a89d] outline-none transition-all"
                  >
                    {DAYS.map((day, i) => (
                      <option key={day} value={i}>{day}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Categoria</label>
                  <div className="grid grid-cols-3 gap-2">
                    {CATEGORIES.map((cat) => (
                      <button
                        key={cat.name}
                        type="button"
                        onClick={() => setFormCategory(cat.name)}
                        className={cn(
                          "px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider border transition-all",
                          formCategory === cat.name 
                            ? "bg-zinc-900 text-white border-zinc-900" 
                            : "bg-white text-zinc-500 border-zinc-100 hover:border-zinc-200"
                        )}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-4 flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-6 py-4 rounded-2xl text-sm font-bold text-zinc-500 hover:bg-zinc-50 transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 bg-[#38a89d] text-white px-6 py-4 rounded-2xl text-sm font-bold hover:bg-[#2d8a81] transition-all shadow-lg shadow-[#38a89d]/20"
                  >
                    {editingItem ? 'Atualizar' : 'Adicionar'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}