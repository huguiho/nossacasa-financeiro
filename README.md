# NossaCasa Financeiro

Aplicação de controle financeiro compartilhado com interface inspirada em planilha, usando Next.js e Supabase.

## Rodar localmente

```bash
npm install
npm run dev
```

## Recursos desta primeira versão
- Login/cadastro com Supabase Auth
- Criação automática da primeira casa
- Dashboard com receitas, despesas e saldo
- Planilha visual de movimentações
- Categorias do banco
- Inserção e exclusão de lançamentos
- Atualização em tempo real quando Realtime estiver habilitado para transactions


## Estrutura v2
Uma única conta compartilhada com quatro áreas visuais:
- Resumo Geral: consolida todos os lançamentos.
- Casa: gastos e receitas compartilhados.
- Rapaz: gastos e receitas pessoais.
- Mulher: gastos e receitas pessoais.

Cada movimentação usa o campo `finance_area` do Supabase para manter as três planilhas separadas.
