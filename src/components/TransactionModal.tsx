import React, { useState } from 'react';
import { doc, setDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { EXPENSE_CATEGORIES, TransactionType } from '../types';
import { X } from 'lucide-react';
import { Button } from './ui/Button';
import { addMonths, format } from 'date-fns';

export function TransactionModal({
  householdId,
  onClose,
  userName,
  uid,
  initialData
}: { 
  householdId: string, 
  onClose: () => void,
  userName: string,
  uid: string,
  initialData?: {
    category?: string;
    amount?: string;
    title?: string;
  }
}) {
  const [title, setTitle] = useState(initialData?.title || '');
  const [amount, setAmount] = useState(initialData?.amount || '');
  const [type, setType] = useState<TransactionType>('expense_debit');
  const [category, setCategory] = useState(initialData?.category || EXPENSE_CATEGORIES[0]);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [observation, setObservation] = useState('');
  const [person, setPerson] = useState<'Matheus' | 'Lilian'>(userName.includes('Lilian') ? 'Lilian' : 'Matheus');
  const [installments, setInstallments] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [shareOnWhatsApp, setShareOnWhatsApp] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !amount || parseFloat(amount) <= 0) {
      setError('Por favor, preencha o título e um valor válido maior que zero.');
      return;
    }

    try {
      setLoading(true);
      setError('');
      
      const transactionCategory = type === 'income' ? 'Renda' : category;
      const parsedAmount = parseFloat(amount);
      const groupId = Math.random().toString(36).substring(2, 11);
      
      const batch = writeBatch(db);
      const baseDate = new Date(date + 'T12:00:00'); // Use noon to avoid timezone shift

      const numInstallments = type === 'expense_credit' ? installments : 1;
      const amountPerInstallment = parsedAmount / numInstallments;

      for (let i = 1; i <= numInstallments; i++) {
        const installmentId = Math.random().toString(36).substring(2, 15);
        const installmentDate = i === 1 ? date : format(addMonths(baseDate, i - 1), 'yyyy-MM-dd');
        const docRef = doc(db, `households/${householdId}/transactions`, installmentId);
        
        const payload: any = {
          title: numInstallments > 1 ? `${title} (${i}/${numInstallments})` : title,
          amount: amountPerInstallment,
          type,
          category: transactionCategory,
          createdBy: uid,
          createdByName: person,
          date: installmentDate,
          createdAt: serverTimestamp(),
          observation: observation || ''
        };

        if (numInstallments > 1) {
          payload.installments = {
            current: i,
            total: numInstallments,
            groupId: groupId
          };
        }

        batch.set(docRef, payload);
      }

      if (shareOnWhatsApp) {
        const text = encodeURIComponent(`🚨 *Nova Transação*\n\n👤 *Quem:* ${person}\n💰 *Valor:* ${numInstallments > 1 ? `${numInstallments}x de R$ ${amountPerInstallment.toFixed(2).replace('.', ',')} (Total: R$ ${parsedAmount.toFixed(2).replace('.', ',')})` : `R$ ${parsedAmount.toFixed(2).replace('.', ',')}`}\n📂 *Categoria:* ${transactionCategory}\n📝 *Descrição:* ${title}${observation ? `\n💬 *Obs:* ${observation}` : ''}\n📅 *Data:* ${new Date(date + 'T00:00:00').toLocaleDateString('pt-BR')}`);
        const waUrl = `https://wa.me/?text=${text}`;
        window.open(waUrl, '_blank');
      }

      await batch.commit();
      onClose();
    } catch (err: any) {
      console.error('Error saving transaction:', err);
      setError('Erro ao salvar transação: ' + (err.message || 'Erro desconhecido. Verifique suas permissões.'));
      try {
        handleFirestoreError(err, OperationType.CREATE, `households/${householdId}/transactions`);
      } catch (e) {
        // swallow the thrown error from handleFirestoreError so we can show the state error
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-[#16191E] border border-white/5 rounded-3xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-white/5">
          <h2 className="text-lg font-semibold text-white/90">Nova Transação</h2>
          <button onClick={onClose} className="p-2 text-white/40 hover:text-white hover:bg-white/5 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && <div className="p-3 bg-rose-500/10 text-rose-500 rounded-lg text-sm">{error}</div>}
          
          <div className="flex bg-[#0F1115] border border-white/5 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setType('expense_debit')}
              className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-colors ${type === 'expense_debit' ? 'bg-[#16191E] text-white shadow-sm border border-white/5' : 'text-white/40 hover:text-white/70'}`}
            >
              Débito
            </button>
            <button
              type="button"
              onClick={() => setType('expense_credit')}
              className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-colors ${type === 'expense_credit' ? 'bg-[#16191E] text-white shadow-sm border border-white/5' : 'text-white/40 hover:text-white/70'}`}
            >
              Crédito
            </button>
            <button
              type="button"
              onClick={() => setType('income')}
              className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-colors ${type === 'income' ? 'bg-emerald-900/40 border border-emerald-900/50 text-emerald-400 shadow-sm' : 'text-white/40 hover:text-white/70'}`}
            >
              Renda (+ )
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-white/40 mb-1.5">Título / Descrição curta</label>
              <input 
                type="text" 
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full bg-[#0F1115] border border-white/5 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-[#8A05BE]"
                placeholder="Ex: Conta de Luz"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/40 mb-1.5">Valor {type === 'expense_credit' && installments > 1 ? 'Total' : ''} (R$)</label>
              <input 
                type="number" 
                step="0.01"
                min="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="w-full bg-[#0F1115] border border-white/5 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-[#8A05BE]"
                placeholder="0.00"
                required
              />
            </div>
          </div>

          {type === 'expense_credit' && (
            <div className="bg-[#8A05BE]/5 border border-[#8A05BE]/10 p-3 rounded-xl">
              <label className="block text-xs font-medium text-[#8A05BE]/80 mb-2 font-bold uppercase tracking-wider">Parcelamento</label>
              <div className="flex items-center gap-4">
                <select
                  value={installments}
                  onChange={e => setInstallments(parseInt(e.target.value))}
                  className="bg-[#0F1115] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-[#8A05BE] w-32"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 18, 24].map(n => (
                    <option key={n} value={n}>{n}x {n === 1 ? '(À vista)' : ''}</option>
                  ))}
                </select>
                {installments > 1 && amount && (
                  <div className="text-xs text-white/60">
                    <span className="text-white/40">Cada parcela:</span> <span className="text-emerald-400 font-mono">R$ {(parseFloat(amount) / installments).toFixed(2)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-white/40 mb-1.5">Quem ({type === 'income' ? 'recebeu' : 'pagou'})?</label>
              <select
                value={person}
                onChange={e => setPerson(e.target.value as 'Matheus' | 'Lilian')}
                className="w-full bg-[#0F1115] border border-white/5 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-[#8A05BE] appearance-none"
              >
                <option value="Matheus">Matheus</option>
                <option value="Lilian">Lilian</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-white/40 mb-1.5">Data</label>
              <input 
                type="date" 
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full bg-[#0F1115] border border-white/5 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-[#8A05BE] color-scheme-dark"
                required
              />
            </div>
          </div>

          {type !== 'income' && (
            <div>
              <label className="block text-xs font-medium text-white/40 mb-1.5">Categoria</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full bg-[#0F1115] border border-white/5 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-[#8A05BE] appearance-none"
              >
                {EXPENSE_CATEGORIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-white/40 mb-1.5">Observação (Opcional)</label>
            <textarea 
              value={observation}
              onChange={e => setObservation(e.target.value)}
              className="w-full bg-[#0F1115] border border-white/5 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-[#8A05BE] resize-none h-20"
              placeholder="Detalhes adicionais..."
            />
          </div>

          <div className="flex items-center gap-3 bg-green-500/5 border border-green-500/10 p-3 rounded-xl">
            <input 
              type="checkbox" 
              id="whatsapp-share"
              checked={shareOnWhatsApp}
              onChange={e => setShareOnWhatsApp(e.target.checked)}
              className="w-4 h-4 rounded border-white/10 bg-[#0F1115] text-[#25D366] focus:ring-[#25D366]"
            />
            <label htmlFor="whatsapp-share" className="text-sm text-green-500/80 font-medium cursor-pointer flex items-center gap-2">
              Compartilhar no WhatsApp após salvar
            </label>
          </div>

          <div className="pt-2">
            <Button type="submit" disabled={loading} className="w-full h-12 text-base">
              {loading ? 'Salvando...' : 'Adicionar Transação'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
