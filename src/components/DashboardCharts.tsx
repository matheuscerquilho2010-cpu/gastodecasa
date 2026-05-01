import { useMemo } from 'react';
import { Transaction } from '../types';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, AreaChart, Area } from 'recharts';

const COLORS = ['#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#84cc16', '#22c55e', '#14b8a6'];

export function DashboardCharts({ transactions }: { transactions: Transaction[] }) {
  
  const { expensesByCategory, expensesByType, incomeByPerson, expensesByPerson, dailySpending } = useMemo(() => {
    const expenseData: Record<string, number> = {};
    const typeData = { debit: 0, credit: 0 };
    const incomeData: Record<string, number> = {};
    const expenseByPersonData: Record<string, number> = {};
    const dailySpendingData: Record<number, number> = {};

    transactions.forEach(t => {
      const day = parseInt(t.date.split('-')[2], 10);
      if (t.type === 'expense_debit' || t.type === 'expense_credit') {
        dailySpendingData[day] = (dailySpendingData[day] || 0) + t.amount;
      }
      
      if (t.type === 'expense_debit') {
        typeData.debit += t.amount;
        expenseData[t.category] = (expenseData[t.category] || 0) + t.amount;
        expenseByPersonData[t.createdByName] = (expenseByPersonData[t.createdByName] || 0) + t.amount;
      } else if (t.type === 'expense_credit') {
        typeData.credit += t.amount;
        expenseData[t.category] = (expenseData[t.category] || 0) + t.amount;
        expenseByPersonData[t.createdByName] = (expenseByPersonData[t.createdByName] || 0) + t.amount;
      } else if (t.type === 'income') {
        incomeData[t.createdByName] = (incomeData[t.createdByName] || 0) + t.amount;
      }
    });

    const expensesArray = Object.entries(expenseData).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    const typesArray = [
      { name: 'Débito', value: typeData.debit },
      { name: 'Crédito', value: typeData.credit }
    ];
    const incomeArray = Object.entries(incomeData).map(([name, value]) => ({ name, value }));
    const expensesByPersonArray = Object.entries(expenseByPersonData).map(([name, value]) => ({ name, value }));
    
    // Fill all days of the month up to the max day we have data for, or 31
    const maxDay = Math.max(...Object.keys(dailySpendingData).map(Number), 1);
    const dailySpendingArray = Array.from({ length: maxDay }, (_, i) => ({
      day: i + 1,
      value: dailySpendingData[i + 1] || 0
    }));

    return { 
      expensesByCategory: expensesArray, 
      expensesByType: typesArray, 
      incomeByPerson: incomeArray, 
      expensesByPerson: expensesByPersonArray,
      dailySpending: dailySpendingArray
    };
  }, [transactions]);

  const hasExpenses = expensesByCategory.length > 0;
  const hasIncome = incomeByPerson.length > 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[#16191E] border border-white/5 rounded-2xl p-5 shadow-xl flex flex-col">
          <h3 className="text-sm font-bold uppercase tracking-widest text-white/60 mb-4">Gastos por Categoria</h3>
          <div className="h-64 flex-1">
            {!hasExpenses ? (
              <div className="h-full flex items-center justify-center text-white/30 text-sm">Sem dados</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={expensesByCategory}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="transparent"
                  >
                    {expensesByCategory.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number) => `R$ ${value.toFixed(2)}`}
                    contentStyle={{ backgroundColor: '#0F1115', borderColor: 'rgba(255,255,255,0.05)', borderRadius: '12px', color: '#fff' }}
                    itemStyle={{ color: '#fff' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          {hasExpenses && (
            <div className="mt-4 flex flex-wrap gap-2 justify-center shrink-0">
              {expensesByCategory.slice(0, 5).map((entry, index) => (
                <div key={entry.name} className="flex items-center gap-1.5 text-[10px] uppercase font-semibold text-white/40">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                  {entry.name} (R$ {entry.value.toFixed(0)})
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-[#16191E] border border-white/5 rounded-2xl p-5 shadow-xl flex flex-col items-stretch h-[364px] md:h-auto">
          <h3 className="text-sm font-bold uppercase tracking-widest text-white/60 mb-4">Gastos por Pessoa</h3>
          {!hasExpenses ? (
            <div className="flex-1 flex items-center justify-center text-white/30 text-sm">Sem dados</div>
          ) : (
             <div className="flex-1 min-h-0">
               <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={expensesByPerson} layout="vertical" margin={{ top: 0, right: 30, left: 20, bottom: 0 }}>
                   <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                   <XAxis type="number" stroke="rgba(255,255,255,0.2)" fontSize={10} tickFormatter={(val) => `R$${val}`} />
                   <YAxis dataKey="name" type="category" stroke="rgba(255,255,255,0.4)" fontSize={10} fontWeight="bold" />
                   <Tooltip 
                      formatter={(value: number) => `R$ ${value.toFixed(2)}`}
                      cursor={{fill: 'rgba(255,255,255,0.05)'}}
                      contentStyle={{ backgroundColor: '#0F1115', borderColor: 'rgba(255,255,255,0.05)', borderRadius: '12px', color: '#fff' }}
                   />
                   <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                     {expensesByPerson.map((entry, index) => (
                       <Cell key={`cell-${index}`} fill={COLORS[(index+4) % COLORS.length]} />
                     ))}
                   </Bar>
                 </BarChart>
               </ResponsiveContainer>
             </div>
          )}
        </div>
      </div>

      <div className="bg-[#16191E] border border-white/5 rounded-2xl p-5 shadow-xl h-64">
        <h3 className="text-sm font-bold uppercase tracking-widest text-white/60 mb-4">Gastos por Dia (Mês)</h3>
        {!hasExpenses ? (
          <div className="h-full flex items-center justify-center text-white/30 text-sm">Sem dados</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dailySpending} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorSpend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="day" stroke="rgba(255,255,255,0.2)" fontSize={10} tickFormatter={(val) => `Dia ${val}`} />
              <YAxis stroke="rgba(255,255,255,0.2)" fontSize={10} tickFormatter={(val) => `R$${val}`} />
              <Tooltip 
                formatter={(value: number) => `R$ ${value.toFixed(2)}`}
                labelFormatter={(label) => `Dia ${label}`}
                contentStyle={{ backgroundColor: '#0F1115', borderColor: 'rgba(255,255,255,0.05)', borderRadius: '12px', color: '#fff' }}
              />
              <Area type="monotone" dataKey="value" stroke="#8b5cf6" fillOpacity={1} fill="url(#colorSpend)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[#16191E] border border-white/5 rounded-2xl p-5 h-[164px] shadow-xl">
          <h3 className="text-sm font-bold uppercase tracking-widest text-white/60 mb-2">Débito vs Crédito</h3>
          {!hasExpenses ? (
            <div className="h-20 flex items-center justify-center text-white/30 text-sm">Sem dados</div>
          ) : (
             <ResponsiveContainer width="100%" height="100%">
               <BarChart data={expensesByType} layout="vertical" margin={{ top: 0, right: 30, left: 20, bottom: 0 }}>
                 <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                 <XAxis type="number" stroke="rgba(255,255,255,0.2)" fontSize={10} tickFormatter={(val) => `R$${val}`} />
                 <YAxis dataKey="name" type="category" stroke="rgba(255,255,255,0.4)" fontSize={10} fontWeight="bold" />
                 <Tooltip 
                    formatter={(value: number) => `R$ ${value.toFixed(2)}`}
                    cursor={{fill: 'rgba(255,255,255,0.05)'}}
                    contentStyle={{ backgroundColor: '#0F1115', borderColor: 'rgba(255,255,255,0.05)', borderRadius: '12px', color: '#fff' }}
                 />
                 <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                   {expensesByType.map((entry, index) => (
                     <Cell key={`cell-${index}`} fill={entry.name === 'Débito' ? '#8A05BE' : '#f43f5e'} />
                   ))}
                 </Bar>
               </BarChart>
             </ResponsiveContainer>
          )}
        </div>

        <div className="bg-[#16191E] border border-white/5 rounded-2xl p-5 h-[164px] shadow-xl">
          <h3 className="text-sm font-bold uppercase tracking-widest text-white/60 mb-2">Renda por Pessoa</h3>
          {!hasIncome ? (
            <div className="h-20 flex items-center justify-center text-white/30 text-sm">Sem dados</div>
          ) : (
             <ResponsiveContainer width="100%" height="100%">
               <BarChart data={incomeByPerson} layout="vertical" margin={{ top: 0, right: 30, left: 20, bottom: 0 }}>
                 <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                 <XAxis type="number" stroke="rgba(255,255,255,0.2)" fontSize={10} tickFormatter={(val) => `R$${val}`} />
                 <YAxis dataKey="name" type="category" stroke="rgba(255,255,255,0.4)" fontSize={10} fontWeight="bold" />
                 <Tooltip 
                    formatter={(value: number) => `R$ ${value.toFixed(2)}`}
                    cursor={{fill: 'rgba(255,255,255,0.05)'}}
                    contentStyle={{ backgroundColor: '#0F1115', borderColor: 'rgba(255,255,255,0.05)', borderRadius: '12px', color: '#fff' }}
                 />
                 <Bar dataKey="value" fill="#34d399" radius={[0, 4, 4, 0]} />
               </BarChart>
             </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
