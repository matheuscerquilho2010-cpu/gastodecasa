export type TransactionType = 'income' | 'expense_debit' | 'expense_credit';

export interface Transaction {
  id: string;
  title: string;
  amount: number;
  type: TransactionType;
  category: string;
  createdBy: string;
  createdByName: string; // 'Matheus' | 'Lilian'
  date: string; // YYYY-MM-DD
  createdAt: any; // Firestore Timestamp
  observation: string;
  installments?: {
    current: number;
    total: number;
    groupId: string;
  };
}

export const EXPENSE_CATEGORIES = [
  'Aluguel',
  'Água',
  'Energia',
  'Internet',
  'Ração das crianças',
  'Mercado',
  'Padaria',
  'Gasolina',
  'Lanches',
  'Outros'
];

export interface FixedExpense {
  id: string;
  category: string;
  amount: number;
  active: boolean;
  dueDay: number;
}

export interface CategoryLimit {
  id: string;
  category: string;
  amount: number;
}
