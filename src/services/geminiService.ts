import { GoogleGenAI } from "@google/genai";
import { Transaction, CategoryLimit, FixedExpense } from "../types";

const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY || '' });

export async function getFinancialInsights(
  transactions: Transaction[],
  limits: CategoryLimit[],
  fixedExpenses: FixedExpense[],
  userName: string
) {
  const prompt = `
    Você é um Coach Financeiro Pessoal especializado em ajudar famílias no Brasil. 
    Analise os dados financeiros abaixo e forneça um resumo amigável e insights práticos para ${userName}.
    
    ### DADOS FINANCEIROS DO MÊS ATUAL:
    
    TRANSAÇÕES:
    ${transactions.map(t => `- ${t.date}: ${t.title} (${t.category}) - R$ ${t.amount.toFixed(2)} [${t.type}]`).join('\n')}
    
    LIMITES POR CATEGORIA:
    ${limits.map(l => `- ${l.category}: Limite R$ ${l.amount.toFixed(2)}`).join('\n')}
    
    DESPESAS FIXAS:
    ${fixedExpenses.map(f => `- ${f.category}: R$ ${f.amount.toFixed(2)} (${f.active ? 'Ativa' : 'Inativa'})`).join('\n')}
    
    ### INSTRUÇÕES:
    1. Calcule o total de receitas e despesas.
    2. Identifique se o usuário está acima do limite em alguma categoria.
    3. Destaque gastos incomuns ou altos.
    4. Dê 3 dicas práticas para economizar este mês.
    5. Seja encorajador mas honesto.
    6. Formate a resposta em Markdown.
    
    Responda em Português do Brasil.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });

    return response.text;
  } catch (error) {
    console.error("Gemini AI Error:", error);
    throw new Error("Não foi possível gerar os insights financeiros no momento.");
  }
}
