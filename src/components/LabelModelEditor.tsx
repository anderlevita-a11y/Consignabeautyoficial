import React, { useState, useEffect } from 'react';
import { X, Save, Plus, Trash2, LayoutTemplate, Settings, Eye } from 'lucide-react';
import { LabelModel, LabelElementConfig } from '../types';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';
import { useNotifications } from './NotificationCenter';
import { ConfirmationModal } from './ConfirmationModal';

interface LabelModelEditorProps {
  onClose: () => void;
  onSaved?: () => void;
  initialEditingModel?: Partial<LabelModel> | null;
}

const DEFAULT_ELEMENT_CONFIG: LabelElementConfig = {
  enabled: true,
  x: 0,
  y: 0,
  fontSize: 10,
  width: 0,
  height: 0,
  textAlign: 'left'
};

const DEFAULT_MODEL: Partial<LabelModel> = {
  name: '',
  width: 30,
  height: 15,
  labels_per_row: 3,
  margin_top: 0,
  margin_right: 0,
  margin_bottom: 0,
  margin_left: 0,
  gap_horizontal: 0.13,
  gap_vertical: 0,
  product_name_config: { ...DEFAULT_ELEMENT_CONFIG, y: 0 },
  barcode_drawing_config: { ...DEFAULT_ELEMENT_CONFIG, y: 0.30753 },
  barcode_number_config: { ...DEFAULT_ELEMENT_CONFIG, y: 1.05691 },
  product_size_config: { ...DEFAULT_ELEMENT_CONFIG, enabled: false },
  product_price_config: { ...DEFAULT_ELEMENT_CONFIG, enabled: false }
};

export function LabelModelEditor({ onClose, onSaved, initialEditingModel }: LabelModelEditorProps) {
  const { addNotification } = useNotifications();
  const [models, setModels] = useState<LabelModel[]>([]);
  const [editingModel, setEditingModel] = useState<Partial<LabelModel> | null>(initialEditingModel || null);
  const [loading, setLoading] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; modelId: string | null }>({
    isOpen: false,
    modelId: null
  });

  useEffect(() => {
    loadModels();
  }, []);

  const loadModels = async () => {
    try {
      const { data, error } = await supabase
        .from('label_models')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setModels(data || []);
    } catch (error) {
      console.error('Error loading label models:', error);
    }
  };

  const handleSave = async () => {
    if (!editingModel?.name) {
      addNotification({ type: 'warning', title: 'Aviso', message: 'Por favor, dê um nome ao modelo.' });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not found');

      const modelData = {
        ...editingModel,
        user_id: user.id,
        updated_at: new Date().toISOString()
      };

      let error;
      if (editingModel.id) {
        ({ error } = await supabase
          .from('label_models')
          .update(modelData)
          .eq('id', editingModel.id));
      } else {
        ({ error } = await supabase
          .from('label_models')
          .insert([modelData]));
      }

      if (error) throw error;
      
      addNotification({ type: 'success', title: 'Sucesso', message: 'Modelo salvo com sucesso!' });
      setEditingModel(null);
      loadModels();
      if (onSaved) onSaved();
    } catch (error: any) {
      console.error('Error saving label model:', error);
      addNotification({ type: 'error', title: 'Erro', message: 'Erro ao salvar modelo: ' + error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleteModal({ isOpen: true, modelId: id });
  };

  const confirmDelete = async () => {
    if (!deleteModal.modelId) return;
    
    try {
      const { error } = await supabase
        .from('label_models')
        .delete()
        .eq('id', deleteModal.modelId);

      if (error) throw error;
      addNotification({ type: 'success', title: 'Sucesso', message: 'Modelo excluído com sucesso!' });
      loadModels();
      if (onSaved) onSaved();
    } catch (error) {
      console.error('Error deleting label model:', error);
      addNotification({ type: 'error', title: 'Erro', message: 'Erro ao excluir modelo.' });
    } finally {
      setDeleteModal({ isOpen: false, modelId: null });
    }
  };

  const renderElementRow = (label: string, configKey: keyof LabelModel) => {
    const config = editingModel?.[configKey] as LabelElementConfig;
    if (!config) return null;

    return (
      <tr className="border-b border-zinc-100 last:border-0">
        <td className="py-3 px-4 text-sm text-zinc-600 font-medium">{label}</td>
        <td className="py-3 px-4">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => setEditingModel({
              ...editingModel,
              [configKey]: { ...config, enabled: e.target.checked }
            })}
            className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
          />
        </td>
        <td className="py-3 px-4">
          <select
            value={config.textAlign || 'left'}
            onChange={(e) => setEditingModel({
              ...editingModel,
              [configKey]: { ...config, textAlign: e.target.value as any }
            })}
            className="w-24 bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1 text-xs focus:border-blue-500 outline-none"
          >
            <option value="left">Esquerda</option>
            <option value="center">Centro</option>
            <option value="right">Direita</option>
          </select>
        </td>
        <td className="py-3 px-4">
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={config.fontSize || 10}
              step="0.5"
              onChange={(e) => setEditingModel({
                ...editingModel,
                [configKey]: { ...config, fontSize: parseFloat(e.target.value) || 10 }
              })}
              className="w-16 bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1 text-sm focus:border-blue-500 outline-none"
            />
            <span className="text-[10px] text-zinc-400">pt</span>
          </div>
        </td>
        <td className="py-3 px-4">
          <div className="flex items-center gap-1">
            <input
              type="number"
              step="0.1"
              value={config.width || 0}
              onChange={(e) => setEditingModel({
                ...editingModel,
                [configKey]: { ...config, width: parseFloat(e.target.value) || 0 }
              })}
              className="w-16 bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1 text-sm focus:border-blue-500 outline-none"
            />
            <span className="text-[10px] text-zinc-400">{configKey === 'barcode_drawing_config' ? 'x' : 'mm'}</span>
          </div>
        </td>
        <td className="py-3 px-4">
          <div className="flex items-center gap-1">
            <input
              type="number"
              step="1"
              value={config.height || 0}
              onChange={(e) => setEditingModel({
                ...editingModel,
                [configKey]: { ...config, height: parseFloat(e.target.value) || 0 }
              })}
              className="w-16 bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1 text-sm focus:border-blue-500 outline-none"
            />
            <span className="text-[10px] text-zinc-400">{configKey === 'barcode_drawing_config' ? 'px' : 'mm'}</span>
          </div>
        </td>
        <td className="py-3 px-4">
          <div className="flex items-center gap-1">
            <input
              type="number"
              step="0.1"
              value={config.x}
              onChange={(e) => setEditingModel({
                ...editingModel,
                [configKey]: { ...config, x: parseFloat(e.target.value) || 0 }
              })}
              className="w-20 bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1 text-sm focus:border-blue-500 outline-none"
            />
            <span className="text-[10px] text-zinc-400">mm</span>
          </div>
        </td>
        <td className="py-3 px-4">
          <div className="flex items-center gap-1">
            <input
              type="number"
              step="0.1"
              value={config.y}
              onChange={(e) => setEditingModel({
                ...editingModel,
                [configKey]: { ...config, y: parseFloat(e.target.value) || 0 }
              })}
              className="w-20 bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1 text-sm focus:border-blue-500 outline-none"
            />
            <span className="text-[10px] text-zinc-400">mm</span>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex items-center justify-between p-6 border-b border-zinc-100">
        <div>
          <h2 className="text-xl font-bold text-zinc-800 tracking-tight">Gerenciar Modelos de Etiquetas</h2>
          <p className="text-sm text-zinc-500">Crie e edite seus modelos personalizados.</p>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-zinc-100 rounded-full transition-colors"
        >
          <X className="w-5 h-5 text-zinc-500" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {!editingModel ? (
          <div className="space-y-6">
            <div className="flex justify-end">
              <button
                onClick={() => setEditingModel(DEFAULT_MODEL)}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-md shadow-blue-500/20"
              >
                <Plus className="w-4 h-4" />
                Novo Modelo
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {models.map(model => (
                <div key={model.id} className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 flex items-center justify-between group">
                  <div>
                    <h3 className="font-bold text-zinc-800">{model.name}</h3>
                    <p className="text-xs text-zinc-500">{model.width}x{model.height}mm - {model.labels_per_row} colunas</p>
                  </div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => setEditingModel(model)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Editar"
                    >
                      <Settings className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(model.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Excluir"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              {models.length === 0 && (
                <div className="col-span-full py-12 text-center text-zinc-500 italic">
                  Nenhum modelo personalizado encontrado.
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-zinc-800">
                {editingModel.id ? `Editando: ${editingModel.name}` : 'Novo Modelo de Etiqueta'}
              </h3>
              <button
                onClick={() => setEditingModel(null)}
                className="text-sm text-zinc-500 hover:text-zinc-800 font-medium"
              >
                Cancelar
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-3">
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Nome do Modelo</label>
                <input
                  type="text"
                  value={editingModel.name || ''}
                  onChange={(e) => setEditingModel({ ...editingModel, name: e.target.value })}
                  placeholder="Ex: ETIQUETA_ADESIVA_COUCHE_30_X_15_X_3"
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:border-blue-500 outline-none"
                />
              </div>

              <div className="space-y-4 bg-zinc-50/50 p-4 rounded-2xl border border-zinc-100">
                <h4 className="font-bold text-zinc-800 text-sm flex items-center gap-2">
                  <LayoutTemplate className="w-4 h-4 text-blue-500" />
                  Área de Impressão
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Largura (mm)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={editingModel.width}
                      onChange={(e) => setEditingModel({ ...editingModel, width: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-white border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Altura (mm)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={editingModel.height}
                      onChange={(e) => setEditingModel({ ...editingModel, height: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-white border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Espaço da Coluna (mm)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editingModel.gap_horizontal}
                      onChange={(e) => setEditingModel({ ...editingModel, gap_horizontal: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-white border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4 bg-zinc-50/50 p-4 rounded-2xl border border-zinc-100">
                <h4 className="font-bold text-zinc-800 text-sm flex items-center gap-2">
                  <Settings className="w-4 h-4 text-blue-500" />
                  Margens
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Esquerda</label>
                    <input
                      type="number"
                      step="0.1"
                      value={editingModel.margin_left}
                      onChange={(e) => setEditingModel({ ...editingModel, margin_left: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-white border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Direita</label>
                    <input
                      type="number"
                      step="0.1"
                      value={editingModel.margin_right}
                      onChange={(e) => setEditingModel({ ...editingModel, margin_right: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-white border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Superior</label>
                    <input
                      type="number"
                      step="0.1"
                      value={editingModel.margin_top}
                      onChange={(e) => setEditingModel({ ...editingModel, margin_top: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-white border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Inferior</label>
                    <input
                      type="number"
                      step="0.1"
                      value={editingModel.margin_bottom}
                      onChange={(e) => setEditingModel({ ...editingModel, margin_bottom: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-white border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4 bg-zinc-50/50 p-4 rounded-2xl border border-zinc-100">
                <h4 className="font-bold text-zinc-800 text-sm flex items-center gap-2">
                  <LayoutTemplate className="w-4 h-4 text-blue-500" />
                  Configuração da Folha
                </h4>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Etiquetas por Linha</label>
                  <input
                    type="number"
                    value={editingModel.labels_per_row}
                    onChange={(e) => setEditingModel({ ...editingModel, labels_per_row: parseInt(e.target.value) || 1 })}
                    className="w-full bg-white border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Linhas por Folha (Opcional)</label>
                  <input
                    type="number"
                    value={editingModel.rows_per_sheet || ''}
                    onChange={(e) => setEditingModel({ ...editingModel, rows_per_sheet: parseInt(e.target.value) || undefined })}
                    placeholder="Deixe vazio para bobina"
                    className="w-full bg-white border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="bg-zinc-50 px-6 py-4 border-b border-zinc-200">
                <h4 className="font-bold text-zinc-800 text-sm">Posicionamento dos Elementos</h4>
              </div>
              <table className="w-full">
                <thead>
                   <tr className="bg-zinc-50/50 border-b border-zinc-200">
                     <th className="text-left py-3 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Elemento</th>
                     <th className="text-left py-3 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Ativo</th>
                     <th className="text-left py-3 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Alinhamento</th>
                     <th className="text-left py-3 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Tam. Fonte</th>
                     <th className="text-left py-3 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Largura/Escala</th>
                     <th className="text-left py-3 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Altura</th>
                     <th className="text-left py-3 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Posição (X)</th>
                     <th className="text-left py-3 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Posição (Y)</th>
                   </tr>
                 </thead>
                <tbody>
                  {renderElementRow('Nome do Produto', 'product_name_config')}
                  {renderElementRow('Desenho CDB', 'barcode_drawing_config')}
                  {renderElementRow('Número CDB / EAN', 'barcode_number_config')}
                  {renderElementRow('Tamanho', 'product_size_config')}
                  {renderElementRow('Preço', 'product_price_config')}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t border-zinc-100">
              <button
                onClick={() => setEditingModel(null)}
                className="px-6 py-3 rounded-xl font-bold text-zinc-500 hover:bg-zinc-100 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={loading}
                className="flex items-center gap-2 bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50"
              >
                {loading ? 'Salvando...' : (
                  <>
                    <Save className="w-5 h-5" />
                    Salvar Modelo
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
      {/* Modal de Confirmação de Exclusão */}
      <ConfirmationModal
        isOpen={deleteModal.isOpen}
        title="Excluir Modelo"
        message="Tem certeza que deseja excluir este modelo de etiqueta? Esta ação não pode ser desfeita."
        onConfirm={confirmDelete}
        onCancel={() => setDeleteModal({ isOpen: false, modelId: null })}
        variant="danger"
      />
    </div>
  );
}
