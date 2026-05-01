import { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, doc, setDoc, serverTimestamp, getDocs, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Transaction, FixedExpense, CategoryLimit } from '../types';
import { Plus, ChevronLeft, ChevronRight, Settings, Zap, X, Target, Bell, Search, Trash2, MessageCircle, Sparkles } from 'lucide-react';
import { format, startOfMonth, endOfMonth, addMonths, subMonths, isSameMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from './ui/Button';
import { TransactionModal } from './TransactionModal';
import { DashboardCharts } from './DashboardCharts';
import { FixedExpensesSettings } from './FixedExpensesSettings';
import { CategoryLimitsSettings } from './CategoryLimitsSettings';
import { getFinancialInsights } from '../services/geminiService';
import Markdown from 'react-markdown';

export function Dashboard({ householdId, user }: { householdId: string, user: { uid: string, displayName?: string | null } }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [limits, setLimits] = useState<CategoryLimit[]>([]);
  const [fixedExpenses, setFixedExpenses] = useState<FixedExpense[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [initialModalData, setInitialModalData] = useState<{ category?: string; amount?: string; title?: string } | undefined>(undefined);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLimitsOpen, setIsLimitsOpen] = useState(false);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiInsights, setAiInsights] = useState('');
  const [loadingAi, setLoadingAi] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [notifPerm, setNotifPerm] = useState(window.Notification ? Notification.permission : 'denied');
  const [searchTerm, setSearchTerm] = useState('');
  const notifiedRef = useRef<Record<string, 'warning' | 'danger'>>({});

  useEffect(() => {
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    const startStr = format(start, 'yyyy-MM-dd');
    const endStr = format(end, 'yyyy-MM-dd');

    const q = query(
      collection(db, `households/${householdId}/transactions`),
      where('date', '>=', startStr),
      where('date', '<=', endStr),
      // We don't order here because Firestore needs a composite index for date >= and orderBy date. 
      // We will sort in memory.
    );

    const unsub = onSnapshot(q, (snap) => {
      const data: Transaction[] = [];
      snap.forEach(doc => {
        data.push({ id: doc.id, ...doc.data() } as Transaction);
      });
      data.sort((a, b) => b.date.localeCompare(a.date));
      setTransactions(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `households/${householdId}/transactions`);
    });

    return unsub;
  }, [householdId, currentDate]);

  useEffect(() => {
    const qLimits = query(collection(db, `households/${householdId}/category_limits`));
    const unsubLimits = onSnapshot(qLimits, (snap) => {
      const data: CategoryLimit[] = [];
      snap.forEach(doc => {
        data.push({ id: doc.id, ...doc.data() } as CategoryLimit);
      });
      setLimits(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `households/${householdId}/category_limits`);
    });
    return unsubLimits;
  }, [householdId]);

  useEffect(() => {
    const qFixed = query(collection(db, `households/${householdId}/fixed_expenses`));
    const unsubFixed = onSnapshot(qFixed, (snap) => {
      const data: FixedExpense[] = [];
      snap.forEach(doc => {
        data.push({ id: doc.id, ...doc.data() } as FixedExpense);
      });
      setFixedExpenses(data);
    });
    return unsubFixed;
  }, [householdId]);

  useEffect(() => {
    if (!window.Notification || Notification.permission !== 'granted') return;

    limits.filter(l => l.amount > 0).forEach(limit => {
      const spent = transactions
        .filter(t => t.type.includes('expense') && t.category === limit.category)
        .reduce((a, b) => a + b.amount, 0);
      const percent = (spent / limit.amount) * 100;

      let state: 'ok' | 'warning' | 'danger' = 'ok';
      if (percent >= 100) state = 'danger';
      else if (percent >= 80) state = 'warning';

      const lastState = notifiedRef.current[limit.category];

      if (state !== 'ok' && lastState !== state) {
        const title = state === 'danger' ? 'Limite Excedido!' : 'Atenção: Próximo ao Limite';
        const body = state === 'danger'
          ? `Você excedeu o limite de ${limit.category}. Gasto: R$ ${spent.toFixed(2)} de R$ ${limit.amount.toFixed(2)}`
          : `Você atingiu ${percent.toFixed(1)}% do limite de ${limit.category}.`;
          
        new Notification(title, { body });
        notifiedRef.current[limit.category] = state;
      } else if (state === 'ok' && lastState) {
        delete notifiedRef.current[limit.category];
      }
    });
  }, [transactions, limits]);

  const toggleNotifications = () => {
    if (!window.Notification) {
      alert('Seu navegador não suporta notificações.');
      return;
    }
    if (Notification.permission === 'default') {
      Notification.requestPermission().then(perm => setNotifPerm(perm));
    } else if (Notification.permission === 'denied') {
      alert('Você bloqueou as notificações. Ative as permissões nas configurações do navegador.');
    } else {
      alert('As notificações já estão ativadas.');
    }
  };

  const handleGenerateFixed = async () => {
    try {
       setGenerating(true);
       const q = query(collection(db, `households/${householdId}/fixed_expenses`));
       const snap = await getDocs(q);
       const fixed: FixedExpense[] = [];
       snap.forEach(d => {
         const data = d.data() as FixedExpense;
         if (data.active) fixed.push(data);
       });

       if (fixed.length === 0) {
         alert('Nenhum gasto fixo ativo configurado.');
         return;
       }

       const yyyyMM = format(currentDate, 'yyyy-MM');
       
       for (const f of fixed) {
         // Check if already exist for this month and category to avoid dups?
         const existing = transactions.find(t => t.category === f.category && t.type === 'expense_debit' && t.observation.includes('Automático'));
         if (existing) continue;

         const day = String(f.dueDay).padStart(2, '0');
         let dateStr = `${yyyyMM}-${day}`;
         // Ensure it's valid date
         const end = endOfMonth(currentDate);
         if (f.dueDay > end.getDate()) {
            dateStr = format(end, 'yyyy-MM-dd');
         }

         const id = Math.random().toString(36).substring(2, 15);
         await setDoc(doc(db, `households/${householdId}/transactions`, id), {
            title: f.category,
            amount: f.amount,
            type: 'expense_debit',
            category: f.category,
            createdBy: user.uid,
            createdByName: user.displayName || 'Sistema',
            date: dateStr,
            createdAt: serverTimestamp(),
            observation: 'Automático'
         });
       }
       alert('Gastos fixos processados para o mês!');
    } catch(err) {
       console.error(err);
       alert('Erro ao gerar');
    } finally {
       setGenerating(false);
    }
  };

  const income = transactions.filter(t => t.type === 'income').reduce((a, b) => a + b.amount, 0);
  const debit = transactions.filter(t => t.type === 'expense_debit').reduce((a, b) => a + b.amount, 0);
  const credit = transactions.filter(t => t.type === 'expense_credit').reduce((a, b) => a + b.amount, 0);
  const totalExpenses = debit + credit;
  const balance = income - totalExpenses;

  const filteredTransactions = transactions.filter(t => 
    t.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
    t.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.createdByName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleExportCSV = () => {
    const headers = ['Data', 'Tipo', 'Categoria', 'Descrição', 'Valor (R$)', 'Quem', 'Parcela', 'Observação'];
    const rows = transactions.map(t => [
      format(new Date(t.date + 'T00:00:00'), 'dd/MM/yyyy'),
      t.type === 'income' ? 'Entrada' : t.type === 'expense_credit' ? 'Crédito' : 'Débito',
      t.category,
      t.title,
      t.amount.toFixed(2),
      t.createdByName,
      t.installments ? `${t.installments.current}/${t.installments.total}` : '1/1',
      t.observation || ''
    ]);
    
    const csvContent = [
      headers.join(';'),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
    ].join('\n');
    
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `financas_casal_${format(currentDate, 'yyyy-MM')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyForAI = () => {
    const table = [
      '| Data | Categoria | Descrição | Valor | Quem | Parcela |',
      '| :--- | :--- | :--- | :--- | :--- | :--- |',
      ...transactions.map(t => 
        `| ${format(new Date(t.date + 'T00:00:00'), 'dd/MM')} | ${t.category} | ${t.title} | R$ ${t.amount.toFixed(2)} | ${t.createdByName} | ${t.installments ? `${t.installments.current}/${t.installments.total}` : '1/1'} |`
      )
    ].join('\n');

    const summary = `
Resumo Financeiro (${format(currentDate, 'MMMM yyyy', { locale: ptBR })}):
- Receitas: R$ ${income.toFixed(2)}
- Despesas: R$ ${totalExpenses.toFixed(2)}
- Saldo: R$ ${balance.toFixed(2)}

Dados para Análise:
${table}
    `;

    navigator.clipboard.writeText(summary.trim());
    alert('Planilha formatada e copiada para o clipboard! Agora você pode colar diretamente no chat com o Antigravity.');
  };

  return (
    <div className="min-h-screen bg-[#0F1115] text-white pb-20 font-sans">
      <header className="bg-[#16191E] border-b border-white/5 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#8A05BE] text-white font-bold italic tracking-tighter flex items-center justify-center shadow-lg shadow-[#8A05BE]/20">
              FD
            </div>
            <h1 className="font-semibold text-lg hidden sm:block text-white/90">Controle do Casal</h1>
          </div>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={async () => {
                try {
                  setLoadingAi(true);
                  setIsAiModalOpen(true);
                  const insights = await getFinancialInsights(transactions, limits, fixedExpenses, user.displayName || 'Usuário');
                  setAiInsights(insights || '');
                } catch (e: any) {
                  setAiInsights('Erro ao gerar insights: ' + e.message);
                } finally {
                  setLoadingAi(false);
                }
              }}
              className="flex items-center gap-2 text-xs font-bold bg-gradient-to-r from-amber-500/20 to-[#8A05BE]/20 text-amber-400 px-3 py-1.5 rounded-lg border border-amber-500/20 hover:scale-105 transition-transform"
              title="Gerar Insights com IA"
              disabled={loadingAi}
            >
              <Sparkles size={16} />
              <span className="hidden sm:inline">Insights IA</span>
            </button>
            <button 
              onClick={() => setIsLimitsOpen(true)}
              className="text-white/40 hover:text-white transition-colors"
              title="Limites de Gastos"
            >
              <Target size={20} />
            </button>
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="text-white/40 hover:text-white transition-colors"
              title="Configurar Gastos Fixos"
            >
              <Settings size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 space-y-6 mt-4">
        {balance < 0 && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-500 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
            <span>⚠️</span> Atenção: Os gastos superaram a renda total do mês! Procure economizar.
          </div>
        )}
        
        {/* Month Navigation */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setCurrentDate(subMonths(currentDate, 1))}
              className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm hover:bg-white/10 text-white transition-colors"
            >
              Anterior
            </button>
            <span className="font-medium bg-white/10 border border-white/5 px-4 py-2 rounded-lg text-sm capitalize">
              {format(currentDate, 'MMMM yyyy', { locale: ptBR })}
            </span>
            <button 
              onClick={() => setCurrentDate(addMonths(currentDate, 1))}
              className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm hover:bg-white/10 text-white transition-colors"
            >
              Próximo
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button
               onClick={handleGenerateFixed}
               disabled={generating}
               className="flex items-center gap-2 text-xs font-medium bg-[#8A05BE]/20 text-[#8A05BE] hover:bg-[#8A05BE]/30 px-3 py-1.5 rounded-lg border border-[#8A05BE]/10 transition-colors disabled:opacity-50"
            >
               <Zap size={14} />
               Gerar Fixos do Mês
            </button>
            {!isSameMonth(currentDate, new Date()) && (
              <button 
                onClick={() => setCurrentDate(new Date())}
                className="text-sm text-white/40 hover:text-white/70 font-medium"
              >
                Mês atual
              </button>
            )}
          </div>
        </div>

        {/* Quick Add Buttons */}
        <div className="flex flex-wrap gap-2">
          <button 
            onClick={() => {
              setInitialModalData({ category: 'Mercado', title: 'Compras Mercado', amount: '200' });
              setIsModalOpen(true);
            }}
            className="flex-1 min-w-[120px] bg-[#16191E] border border-white/5 hover:border-white/10 p-3 rounded-xl flex items-center justify-center gap-2 transition-all hover:bg-white/5 group"
          >
            <span className="text-xl group-hover:scale-110 transition-transform">🛒</span>
            <div className="text-left">
              <div className="text-[10px] text-white/40 uppercase font-bold leading-none mb-1">Rápido</div>
              <div className="text-sm font-semibold text-white/80">Mercado</div>
            </div>
          </button>
          <button 
            onClick={() => {
              setInitialModalData({ category: 'Gasolina', title: 'Posto de Gasolina', amount: '50' });
              setIsModalOpen(true);
            }}
            className="flex-1 min-w-[120px] bg-[#16191E] border border-white/5 hover:border-white/10 p-3 rounded-xl flex items-center justify-center gap-2 transition-all hover:bg-white/5 group"
          >
            <span className="text-xl group-hover:scale-110 transition-transform">⛽</span>
            <div className="text-left">
              <div className="text-[10px] text-white/40 uppercase font-bold leading-none mb-1">Rápido</div>
              <div className="text-sm font-semibold text-white/80">Gasolina</div>
            </div>
          </button>
          <button 
            onClick={() => {
              setInitialModalData({ category: 'Lanches', title: 'iFood / Lanche', amount: '40' });
              setIsModalOpen(true);
            }}
            className="flex-1 min-w-[120px] bg-[#16191E] border border-white/5 hover:border-white/10 p-3 rounded-xl flex items-center justify-center gap-2 transition-all hover:bg-white/5 group"
          >
            <span className="text-xl group-hover:scale-110 transition-transform">🍕</span>
            <div className="text-left">
              <div className="text-[10px] text-white/40 uppercase font-bold leading-none mb-1">Rápido</div>
              <div className="text-sm font-semibold text-white/80">Lanches</div>
            </div>
          </button>
        </div>

        {/* Top Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-[#16191E] border border-white/5 p-6 rounded-2xl shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-[#8A05BE]/10 rounded-full -mr-8 -mt-8"></div>
            <div className="text-white/40 text-xs uppercase tracking-widest font-bold mb-2">Saldo Total</div>
            <div className={`text-3xl font-mono ${balance >= 0 ? 'text-[#8A05BE]' : 'text-rose-500'}`}>
              R$ {balance.toFixed(2)}
            </div>
            <div className="mt-4 h-1 bg-white/5 rounded-full overflow-hidden">
              <div className={`h-full ${balance >= 0 ? 'bg-[#8A05BE]' : 'bg-rose-500'} ${balance >= 0 ? 'w-3/4' : 'w-full'}`}></div>
            </div>
          </div>
          <div className="bg-[#16191E] border border-white/5 p-6 rounded-2xl shadow-xl">
            <div className="text-white/40 text-xs uppercase tracking-widest font-bold mb-2">Entradas (Renda)</div>
            <div className="text-emerald-400 text-3xl font-mono">R$ {income.toFixed(2)}</div>
          </div>
          <div className="bg-[#16191E] border border-white/5 p-6 rounded-2xl shadow-xl">
            <div className="text-white/40 text-xs uppercase tracking-widest font-bold mb-2">Saídas (Gastos)</div>
            <div className="text-rose-500 text-3xl font-mono">R$ {totalExpenses.toFixed(2)}</div>
            <div className="flex gap-4 mt-2 text-[10px] text-white/40 font-semibold">
              <span className="px-2 py-0.5 bg-rose-500/10 rounded uppercase">Débito: R$ {debit.toFixed(0)}</span>
              <span className="px-2 py-0.5 bg-rose-500/10 rounded border border-rose-500/20 uppercase">Crédito: R$ {credit.toFixed(0)}</span>
            </div>
          </div>
        </div>

        {/* Limits */}
        {limits.filter(l => l.amount > 0).length > 0 && (
          <div className="bg-[#16191E] border border-white/5 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-sm font-bold uppercase tracking-widest text-white/60">Progresso dos Limites</h2>
              {window.Notification && notifPerm !== 'granted' && (
                <button 
                  onClick={toggleNotifications}
                  className="flex items-center gap-2 text-xs font-medium bg-white/5 hover:bg-white/10 text-white/70 px-3 py-1.5 rounded-lg border border-white/10 transition-colors"
                  title="Ativar Notificações"
                >
                  <Bell size={14} />
                  Ativar Alertas
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {limits.filter(l => l.amount > 0).map(limit => {
                const spent = transactions
                  .filter(t => t.type.includes('expense') && t.category === limit.category)
                  .reduce((a, b) => a + b.amount, 0);
                const percent = Math.min((spent / limit.amount) * 100, 100);
                const isWarning = percent >= 80 && percent < 100;
                const isDanger = percent >= 100;

                let barColor = 'bg-[#8A05BE]';
                if (isWarning) barColor = 'bg-yellow-500';
                if (isDanger) barColor = 'bg-rose-500';

                return (
                  <div key={limit.id} className="bg-[#0F1115] border border-white/5 p-4 rounded-xl">
                    <div className="flex justify-between text-sm mb-2">
                       <span className="font-medium text-white/90">{limit.category}</span>
                       <span className="font-mono text-white/70">R$ {spent.toFixed(2)} / R$ {limit.amount.toFixed(2)}</span>
                    </div>
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden mb-2">
                       <div className={`h-full ${barColor} transition-all duration-500`} style={{ width: `${percent}%` }}></div>
                    </div>
                    {isWarning && <div className="text-xs text-yellow-500">Atenção: Próximo ao limite.</div>}
                    {isDanger && <div className="text-xs text-rose-500">Alerta: Limite excedido!</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Charts */}
        <DashboardCharts transactions={transactions} />

        {/* Recent Transactions List */}
        <div className="bg-[#16191E] border border-white/5 rounded-2xl overflow-hidden shadow-xl">
          <div className="p-6 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-widest text-white/60">Transações</h2>
              <span className="text-xs text-white/40">{filteredTransactions.length} registros</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search size={14} className="text-white/40" />
                </div>
                <input 
                  type="text" 
                  placeholder="Buscar..." 
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="bg-[#0F1115] border border-white/10 rounded-lg pl-9 pr-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#8A05BE] w-32 sm:w-auto"
                />
              </div>
              
              <button 
                onClick={handleCopyForAI}
                className="flex items-center gap-1.5 text-[10px] font-bold bg-[#8A05BE]/10 hover:bg-[#8A05BE]/20 px-3 py-1.5 rounded-lg border border-[#8A05BE]/20 transition-all text-[#8A05BE] group"
                title="Copiar dados formatados para o Antigravity"
              >
                <Zap size={14} className="group-hover:scale-110 transition-transform" />
                <span className="hidden sm:inline">Copiar p/ AI</span>
              </button>

              <button 
                onClick={handleExportCSV}
                className="flex items-center gap-1.5 text-[10px] font-bold bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg border border-white/10 transition-all text-white/50"
                title="Exportar Mês em CSV (Excel)"
              >
                Exportar CSV
              </button>
            </div>
          </div>
          <div className="divide-y divide-white/5">
            {filteredTransactions.length === 0 ? (
              <div className="p-8 text-center text-white/30 text-sm">
                Nenhuma transação encontrada.
              </div>
            ) : (
              filteredTransactions.map(t => (
                <div key={t.id} className="group p-4 px-6 flex items-center justify-between hover:bg-white/5 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                      t.type.includes('income') 
                        ? 'bg-emerald-500/20 text-emerald-400' 
                        : t.type === 'expense_credit' 
                          ? 'bg-white/10 text-white'
                          : 'bg-rose-500/20 text-rose-500'
                    }`}>
                      {t.type.includes('income') ? '+' : '-'}
                    </div>
                    <div>
                      <div className="font-medium text-white/90 text-sm">{t.title}</div>
                      <div className="text-[10px] text-white/40 mt-1 flex items-center gap-2 uppercase font-semibold">
                        <span className="bg-white/5 px-2 py-0.5 rounded border border-white/5">{t.category}</span>
                        {t.installments && (
                          <span className="bg-[#8A05BE]/20 text-[#8A05BE] px-2 py-0.5 rounded border border-[#8A05BE]/20 text-[9px] font-bold">
                            {t.installments.current}/{t.installments.total}
                          </span>
                        )}
                        <span>{t.createdByName}</span>
                        <span>{format(new Date(t.date + 'T00:00:00'), 'dd/MM')}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className={`font-mono text-sm ${t.type.includes('income') ? 'text-emerald-400' : 'text-white'}`}>
                      {t.type.includes('income') ? '' : '-'}R$ {t.amount.toFixed(2)}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          const text = encodeURIComponent(`🚨 *Nova Transação*\n\n👤 *Quem:* ${t.createdByName}\n💰 *Valor:* R$ ${t.amount.toFixed(2).replace('.', ',')}\n📂 *Categoria:* ${t.category}\n📝 *Descrição:* ${t.title}${t.observation ? `\n💬 *Obs:* ${t.observation}` : ''}\n📅 *Data:* ${format(new Date(t.date + 'T00:00:00'), 'dd/MM/yyyy')}`);
                          window.open(`https://wa.me/?text=${text}`, '_blank');
                        }}
                        className="text-white/30 hover:text-green-500 transition-all p-2"
                        title="Compartilhar no WhatsApp"
                      >
                        <MessageCircle size={16} />
                      </button>
                      <button
                        onClick={async () => {
                          try {
                             await deleteDoc(doc(db, `households/${householdId}/transactions`, t.id));
                          } catch (e: any) { 
                             handleFirestoreError(e, OperationType.DELETE, `households/${householdId}/transactions/${t.id}`);
                          }
                        }}
                        className="text-white/30 hover:text-rose-500 transition-all p-2"
                        title="Excluir"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      {/* FAB to Add Transaction */}
      <button 
        onClick={() => {
          setInitialModalData(undefined);
          setIsModalOpen(true);
        }}
        className="fixed bottom-10 right-10 w-16 h-16 bg-[#8A05BE] rounded-2xl shadow-2xl shadow-[#8A05BE]/40 flex items-center justify-center transform hover:scale-110 transition-all z-20"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
        </svg>
      </button>

      {isModalOpen && (
        <TransactionModal 
          householdId={householdId}
          onClose={() => {
            setIsModalOpen(false);
            setInitialModalData(undefined);
          }}
          userName={user.displayName || 'Matheus'}
          uid={user.uid}
          initialData={initialModalData}
        />
      )}
      {isSettingsOpen && (
        <FixedExpensesSettings householdId={householdId} onClose={() => setIsSettingsOpen(false)} />
      )}
      {isLimitsOpen && (
        <CategoryLimitsSettings householdId={householdId} onClose={() => setIsLimitsOpen(false)} />
      )}
      {isAiModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#16191E] w-full max-w-2xl rounded-3xl shadow-2xl border border-white/10 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-[#8A05BE]/10 to-transparent">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-400">
                  <Sparkles size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">IA Coach Financeiro</h2>
                  <p className="text-xs text-white/40 uppercase tracking-widest font-semibold">Análise Inteligente</p>
                </div>
              </div>
              <button 
                onClick={() => setIsAiModalOpen(false)}
                className="text-white/40 hover:text-white p-2 hover:bg-white/5 rounded-full transition-colors"
              >
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-[#0F1115]/50">
              {loadingAi ? (
                <div className="flex flex-col items-center justify-center py-20 space-y-4">
                  <div className="relative">
                    <div className="w-16 h-16 border-4 border-[#8A05BE]/20 border-t-[#8A05BE] rounded-full animate-spin"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Sparkles size={20} className="text-[#8A05BE] animate-pulse" />
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-white font-medium">Analisando suas finanças...</p>
                    <p className="text-white/40 text-sm">Organizando dados e calculando tendências</p>
                  </div>
                </div>
              ) : (
                <div className="prose prose-invert prose-amber max-w-none prose-sm leading-relaxed">
                  <Markdown components={{
                    h1: ({children}) => <h1 className="text-xl font-bold text-white mb-4 mt-2">{children}</h1>,
                    h2: ({children}) => <h2 className="text-lg font-bold text-white/90 mb-3 mt-4 border-l-4 border-[#8A05BE] pl-3">{children}</h2>,
                    h3: ({children}) => <h3 className="text-base font-bold text-white/80 mb-2 mt-3">{children}</h3>,
                    p: ({children}) => <p className="text-white/70 mb-4">{children}</p>,
                    li: ({children}) => <li className="text-white/70 mb-2">{children}</li>,
                    strong: ({children}) => <strong className="text-white font-bold">{children}</strong>,
                  }}>
                    {aiInsights}
                  </Markdown>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-white/5 bg-[#16191E] flex justify-end">
              <Button onClick={() => setIsAiModalOpen(false)} className="px-8">
                Entendido
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
