'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient, User } from '@supabase/supabase-js'

const supabase = createClient(
  'https://ovjkvfzzqfduxuzybfwp.supabase.co',
  'sb_publishable_yxxjeYinFJr8ImBy9-YnKA_qhXE3XD3'
)

type Tx = {
  id: string
  household_id: string
  user_id: string
  type: 'income' | 'expense'
  description: string
  amount: number
  transaction_date: string
  payment_method: string | null
  status: 'paid' | 'pending'
  scope: 'household' | 'personal'
  category_id: string | null
  categories?: { name: string } | null
  finance_area?: 'casa' | 'rapaz' | 'mulher'
}

type Category = { id: string; name: string; kind: 'income' | 'expense' }

export default function Home() {
  const [user, setUser] = useState<User | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login')
  const [message, setMessage] = useState('')
  const [householdId, setHouseholdId] = useState<string | null>(null)
  const [transactions, setTransactions] = useState<Tx[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [activeArea, setActiveArea] = useState<'resumo' | 'casa' | 'rapaz' | 'mulher'>('resumo')
  const [newTx, setNewTx] = useState({
    transaction_date: new Date().toISOString().slice(0,10),
    description: '',
    category_id: '',
    type: 'expense' as 'income' | 'expense',
    payment_method: 'PIX',
    amount: '',
    status: 'paid' as 'paid' | 'pending',
    scope: 'household' as 'household' | 'personal'
  })

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null)
      setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user) return
    bootstrap()
  }, [user])

  async function bootstrap() {
    setLoading(true)
    const { data: membership } = await supabase
      .from('household_members')
      .select('household_id')
      .eq('user_id', user!.id)
      .limit(1)
      .maybeSingle()

    let hid = membership?.household_id ?? null
    if (!hid) {
      const { data, error } = await supabase.rpc('create_household', { p_name: 'Nossa Casa' })
      if (error) {
        setMessage(error.message)
        setLoading(false)
        return
      }
      hid = data as string
    }
    setHouseholdId(hid)
    await Promise.all([loadCategories(hid), loadTransactions(hid)])
    setLoading(false)
  }

  async function loadCategories(hid: string) {
    const { data } = await supabase.from('categories').select('id,name,kind').eq('household_id', hid).order('name')
    setCategories((data ?? []) as Category[])
  }

  async function loadTransactions(hid: string) {
    const { data } = await supabase
      .from('transactions')
      .select('*, categories(name)')
      .eq('household_id', hid)
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false })
    setTransactions((data ?? []) as Tx[])
  }

  useEffect(() => {
    if (!householdId) return
    const channel = supabase.channel(`transactions:${householdId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `household_id=eq.${householdId}` }, () => loadTransactions(householdId))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [householdId])

  async function authenticate(e: React.FormEvent) {
    e.preventDefault()
    setMessage('')
    if (authMode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setMessage(error.message)
    } else {
      const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: email.split('@')[0] } } })
      setMessage(error ? error.message : 'Cadastro criado. Se a confirmação de e-mail estiver ativa, confirme seu e-mail antes de entrar.')
    }
  }

  async function addTransaction(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !householdId || !newTx.description || !newTx.amount) return
    const { error } = await supabase.from('transactions').insert({
      household_id: householdId,
      user_id: user.id,
      transaction_date: newTx.transaction_date,
      description: newTx.description,
      category_id: newTx.category_id || null,
      type: newTx.type,
      payment_method: newTx.payment_method,
      amount: Number(String(newTx.amount).replace(',', '.')),
      status: newTx.status,
      scope: activeArea === 'casa' || activeArea === 'resumo' ? 'household' : 'personal',
      finance_area: activeArea === 'resumo' ? 'casa' : activeArea
    })
    if (error) return setMessage(error.message)
    setNewTx(v => ({ ...v, description: '', amount: '' }))
    await loadTransactions(householdId)
  }

  async function deleteTx(id: string) {
    await supabase.from('transactions').delete().eq('id', id)
    if (householdId) await loadTransactions(householdId)
  }

  const visibleTransactions = useMemo(
    () => activeArea === 'resumo' ? transactions : transactions.filter(t => (t.finance_area ?? 'casa') === activeArea),
    [transactions, activeArea]
  )

  const totals = useMemo(() => {
    const income = visibleTransactions.filter(t => t.type === 'income' && t.status === 'paid').reduce((s,t) => s + Number(t.amount), 0)
    const expense = visibleTransactions.filter(t => t.type === 'expense' && t.status === 'paid').reduce((s,t) => s + Number(t.amount), 0)
    return { income, expense, balance: income - expense }
  }, [visibleTransactions])

  const money = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  if (loading) return <main className="center"><div className="loader">NossaCasa Financeiro</div></main>

  if (!user) return (
    <main className="authPage">
      <section className="authCard">
        <div className="brandMark">N</div>
        <h1>NossaCasa Financeiro</h1>
        <p>Finanças do casal em um só lugar, com a simplicidade de uma planilha.</p>
        <form onSubmit={authenticate}>
          <label>E-mail<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required /></label>
          <label>Senha<input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength={6} required /></label>
          <button className="primary">{authMode === 'login' ? 'Entrar' : 'Criar conta'}</button>
        </form>
        {message && <div className="notice">{message}</div>}
        <button className="link" onClick={()=>setAuthMode(authMode === 'login' ? 'signup' : 'login')}>
          {authMode === 'login' ? 'Ainda não tenho conta' : 'Já tenho uma conta'}
        </button>
      </section>
    </main>
  )

  return (
    <div className="shell">
      <aside>
        <div className="brand"><span>N</span><strong>NossaCasa</strong></div>
        <nav>
          <a className={activeArea==='resumo'?'active':''} onClick={()=>setActiveArea('resumo')}>📊 Resumo Geral</a>
          <a className={activeArea==='casa'?'active':''} onClick={()=>setActiveArea('casa')}>🏠 Casa</a>
          <a className={activeArea==='rapaz'?'active':''} onClick={()=>setActiveArea('rapaz')}>👨 Rapaz</a>
          <a className={activeArea==='mulher'?'active':''} onClick={()=>setActiveArea('mulher')}>👩 Mulher</a>
        </nav>
        <button className="logout" onClick={()=>supabase.auth.signOut()}>Sair</button>
      </aside>

      <main className="content">
        <header>
          <div><span className="eyebrow">NOSSA CASA FINANCEIRO</span><h1>{activeArea === 'resumo' ? 'Resumo Geral' : activeArea === 'casa' ? 'Controle da Casa' : activeArea === 'rapaz' ? 'Gastos do Rapaz' : 'Gastos da Mulher'}</h1><p>{activeArea === 'resumo' ? 'Visão consolidada de toda a vida financeira.' : activeArea === 'casa' ? 'Receitas e despesas compartilhadas da casa.' : 'Área pessoal separada dos gastos da casa.'}</p></div>
          <div className="sync">● Sincronizado</div>
        </header>

        <section className="cards">
          <article><span>Receitas</span><strong>{money(totals.income)}</strong><small>Entradas confirmadas</small></article>
          <article><span>Despesas</span><strong>{money(totals.expense)}</strong><small>Saídas confirmadas</small></article>
          <article><span>Saldo</span><strong>{money(totals.balance)}</strong><small>Disponível no período</small></article>
          <article><span>Movimentações</span><strong>{visibleTransactions.length}</strong><small>{activeArea === 'resumo' ? 'Lançamentos totais' : 'Lançamentos nesta aba'}</small></article>
        </section>

        <section className="sheetCard">
          <div className="sheetHead"><div><h2>{activeArea === 'resumo' ? 'Todas as movimentações' : `Planilha — ${activeArea === 'casa' ? 'Casa' : activeArea === 'rapaz' ? 'Rapaz' : 'Mulher'}`}</h2><p>{activeArea === 'resumo' ? 'Visão consolidada. Para lançar um gasto, escolha Casa, Rapaz ou Mulher.' : 'Adicione como em uma planilha. Os totais desta área são calculados automaticamente.'}</p></div></div>

          <form className="quickRow" onSubmit={addTransaction}>
            <input type="date" value={newTx.transaction_date} onChange={e=>setNewTx({...newTx,transaction_date:e.target.value})}/>
            <input placeholder="Descrição" value={newTx.description} onChange={e=>setNewTx({...newTx,description:e.target.value})}/>
            <select value={newTx.category_id} onChange={e=>setNewTx({...newTx,category_id:e.target.value})}><option value="">Categoria</option>{categories.filter(c=>c.kind===newTx.type).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <select value={newTx.type} onChange={e=>setNewTx({...newTx,type:e.target.value as 'income'|'expense',category_id:''})}><option value="expense">Despesa</option><option value="income">Receita</option></select>
            <select value={newTx.payment_method} onChange={e=>setNewTx({...newTx,payment_method:e.target.value})}><option>PIX</option><option>Débito</option><option>Crédito</option><option>Dinheiro</option><option>Transferência</option></select>
            <input className="moneyInput" placeholder="R$ 0,00" inputMode="decimal" value={newTx.amount} onChange={e=>setNewTx({...newTx,amount:e.target.value})}/>
            <button className="addBtn">+ Adicionar</button>
          </form>

          <div className="tableWrap">
            <table>
              <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Tipo</th><th>Pagamento</th><th>Status</th><th>Valor</th><th></th></tr></thead>
              <tbody>
                {visibleTransactions.length === 0 ? <tr><td colSpan={8} className="empty">Nenhuma movimentação ainda. Use a linha acima para começar.</td></tr> : visibleTransactions.map(tx=>(
                  <tr key={tx.id}>
                    <td>{new Date(tx.transaction_date+'T12:00:00').toLocaleDateString('pt-BR')}</td>
                    <td className="desc">{tx.description}</td>
                    <td>{tx.categories?.name ?? '—'}</td>
                    <td><span className={tx.type==='income'?'pill income':'pill expense'}>{tx.type==='income'?'Receita':'Despesa'}</span></td>
                    <td>{tx.payment_method ?? '—'}</td>
                    <td><span className="status">{tx.status==='paid'?'Pago':'Pendente'}</span></td>
                    <td className={tx.type==='income'?'amount plus':'amount minus'}>{tx.type==='income'?'+ ':'- '}{money(Number(tx.amount))}</td>
                    <td><button className="trash" onClick={()=>deleteTx(tx.id)}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        {message && <div className="floatingNotice">{message}</div>}
      </main>
    </div>
  )
}
