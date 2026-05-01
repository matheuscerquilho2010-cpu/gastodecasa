import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, setDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { CategoryLimit, EXPENSE_CATEGORIES } from '../types';
import { X, Save, AlertCircle } from 'lucide-react';
import { Button } from './ui/Button';

export function CategoryLimitsSettings({
  householdId,
  onClose
}: { 
  householdId: string, 
  onClose: () => void 
}) {
  const [limits, setLimits] = useState<CategoryLimit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, `households/${householdId}/category_limits`));
    const unsub = onSnapshot(q, (snap) => {
      const data: CategoryLimit[] = [];
      snap.forEach(doc => {
        data.push({ id: doc.id, ...doc.data() } as CategoryLimit);
      });
      
      // Initialize missing categories
      const existingCats = data.map(d => d.category);
      const toAdd = EXPENSE_CATEGORIES.filter(c => !existingCats.includes(c));
      
      const fullList = [...data, ...toAdd.map(c => ({
        id: '', 
        category: c, 
        amount: 0
      }))];
      
      setLimits(fullList);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `households/${householdId}/category_limits`);
    });

    return unsub;
  }, [householdId]);

  const updateAmount = (index: number, val: string) => {
    const updated = [...limits];
    updated[index].amount = parseFloat(val) || 0;
    setLimits(updated);
  };

  const handleSaveAll = async () => {
    try {
      setLoading(true);
      for (const item of limits) {
        if (!item.id && item.amount > 0) {
          // completely new
          const newId = Math.random().toString(36).substring(2, 15);
          await setDoc(doc(db, `households/${householdId}/category_limits`, newId), {
            category: item.category,
            amount: item.amount
          });
        } else if (item.id) {
          // existing
          await updateDoc(doc(db, `households/${householdId}/category_limits`, item.id), {
            amount: item.amount
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
          <div className="flex items-center gap-2">
            <AlertCircle size={20} className="text-[#8A05BE]" />
            <h2 className="text-lg font-semibold text-white/90">Limites de Gastos</h2>
          </div>
          <button onClick={onClose} className="p-2 text-white/40 hover:text-white hover:bg-white/5 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          <p className="text-sm text-white/40">Defina um valor máximo mensal para cada categoria. Deixe 0 para não ter limite.</p>
          
          {loading ? (
            <div className="text-center p-4 text-white/30">Carregando...</div>
          ) : (
            <div className="space-y-3">
              {limits.map((item, index) => (
                <div key={item.category} className="p-3 bg-[#0F1115] border border-white/5 rounded-xl flex items-center justify-between gap-4">
                  <span className="font-medium text-white/90">{item.category}</span>
                  <div className="w-32 relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm">R$</span>
                    <input 
                      type="number"
                      step="0.01"
                      min="0"
                      value={item.amount || ''}
                      onChange={e => updateAmount(index, e.target.value)}
                      className="w-full h-10 bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#8A05BE]"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div className="p-4 border-t border-white/5 shrink-0 bg-[#16191E]">
           <Button onClick={handleSaveAll} disabled={loading} className="w-full h-12 flex items-center justify-center gap-2">
             <Save size={18} /> Salvar Limites
           </Button>
        </div>
      </div>
    </div>
  );
}
