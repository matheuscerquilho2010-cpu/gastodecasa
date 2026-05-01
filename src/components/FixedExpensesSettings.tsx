import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, setDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { FixedExpense, EXPENSE_CATEGORIES } from '../types';
import { X, Save, Check } from 'lucide-react';
import { Button } from './ui/Button';

export function FixedExpensesSettings({
  householdId,
  onClose
}: { 
  householdId: string, 
  onClose: () => void 
}) {
  const [expenses, setExpenses] = useState<FixedExpense[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, `households/${householdId}/fixed_expenses`));
    const unsub = onSnapshot(q, (snap) => {
      const data: FixedExpense[] = [];
      snap.forEach(doc => {
        data.push({ id: doc.id, ...doc.data() } as FixedExpense);
      });
      
      // Initialize missing categories
      const existingCats = data.map(d => d.category);
      const toAdd = EXPENSE_CATEGORIES.filter(c => !existingCats.includes(c));
      
      const fullList = [...data, ...toAdd.map(c => ({
        id: '', 
        category: c, 
        amount: 0, 
        active: false, 
        dueDay: 5 
      }))];
      
      setExpenses(fullList);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `households/${householdId}/fixed_expenses`);
    });

    return unsub;
  }, [householdId]);

  const toggleActive = (index: number) => {
    const updated = [...expenses];
    updated[index].active = !updated[index].active;
    setExpenses(updated);
  };

  const updateAmount = (index: number, val: string) => {
    const updated = [...expenses];
    updated[index].amount = parseFloat(val) || 0;
    setExpenses(updated);
  };

  const updateDueDay = (index: number, val: string) => {
    const updated = [...expenses];
    updated[index].dueDay = parseInt(val) || 1;
    setExpenses(updated);
  };

  const handleSaveAll = async () => {
    try {
      setLoading(true);
      for (const item of expenses) {
        if (!item.id && item.active) {
          // completely new
          const newId = Math.random().toString(36).substring(2, 15);
          await setDoc(doc(db, `households/${householdId}/fixed_expenses`, newId), {
            category: item.category,
            amount: item.amount,
            active: item.active,
            dueDay: item.dueDay
          });
        } else if (item.id) {
          // existing
          await updateDoc(doc(db, `households/${householdId}/fixed_expenses`, item.id), {
            amount: item.amount,
            active: item.active,
            dueDay: item.dueDay
          });
        }
      }
      onClose();
    } catch (err: any) {
      console.error(err);
      alert('Erro ao salvar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-lg bg-[#16191E] border border-white/5 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-white/5 shrink-0">
          <h2 className="text-lg font-semibold text-white/90">Gastos Fixos (Automação)</h2>
          <button onClick={onClose} className="p-2 text-white/40 hover:text-white hover:bg-white/5 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          <p className="text-sm text-white/40">Configure os valores padrão. Você poderá usar o botão "Gerar Fixos" no painel para lançar para o mês atual.</p>
          
          {loading ? (
            <div className="text-center p-4 text-white/30">Carregando...</div>
          ) : (
            <div className="space-y-3">
              {expenses.map((item, index) => (
                <div key={item.category} className={`p-4 border rounded-xl transition-colors flex flex-col gap-3 ${item.active ? 'bg-white/5 border-[#8A05BE]/30' : 'bg-[#0F1115] border-white/5'}`}>
                  <div className="flex items-center justify-between">
                    <button 
                      onClick={() => toggleActive(index)}
                      className="flex items-center gap-2 group"
                    >
                      <div className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${item.active ? 'bg-[#8A05BE] border-[#8A05BE]' : 'border-white/20 group-hover:border-white/40'}`}>
                        {item.active && <Check size={14} className="text-white" />}
                      </div>
                      <span className={`font-medium ${item.active ? 'text-white/90' : 'text-white/40'}`}>{item.category}</span>
                    </button>
                    
                    {item.active && (
                       <span className="text-xs text-white/40 bg-white/5 px-2 py-0.5 rounded border border-white/5">R$ {item.amount.toFixed(2)}</span>
                    )}
                  </div>
                  
                  {item.active && (
                    <div className="flex gap-4 items-end pl-7 animate-in slide-in-from-top-2 duration-200 fade-in">
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-white/40 mb-1.5">Valor Padrão (R$)</label>
                        <input 
                          type="number"
                          step="0.01"
                          value={item.amount || ''}
                          onChange={e => updateAmount(index, e.target.value)}
                          className="w-full h-10 bg-[#0F1115] border border-white/5 rounded-lg px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#8A05BE]"
                          placeholder="0.00"
                        />
                      </div>
                      <div className="w-24">
                        <label className="block text-xs font-medium text-white/40 mb-1.5">Venc. (Dia)</label>
                        <input 
                          type="number"
                          min="1"
                          max="31"
                          value={item.dueDay}
                          onChange={e => updateDueDay(index, e.target.value)}
                          className="w-full h-10 bg-[#0F1115] border border-white/5 rounded-lg px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#8A05BE]"
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div className="p-4 border-t border-white/5 shrink-0 bg-[#16191E]">
           <Button onClick={handleSaveAll} disabled={loading} className="w-full h-12 flex items-center justify-center gap-2">
             <Save size={18} /> Salvar Configurações
           </Button>
        </div>
      </div>
    </div>
  );
}
