import { useEffect, useRef, useState } from 'react'
import { AlertCircle, BarChart3, CalendarDays, ChevronLeft, ChevronRight, CircleDollarSign, Database, GraduationCap, Info, Landmark, LayoutDashboard, LoaderCircle, MapPin, ReceiptText, RefreshCw, School, ShieldCheck, Sparkles, WalletCards } from 'lucide-react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { getDashboardData, getFilterOptions, type DashboardData, type FilterOptionsResponse } from './lib/api'
import { MultiSelect } from './components/MultiSelect'

const orange = '#f58220'
const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
const compact = (value: number) => `R$ ${(value / 1_000_000).toFixed(2).replace('.', ',')} mi`
const metricMoney = (value: number) => value >= 1_000_000 ? compact(value) : value >= 1_000 ? `R$ ${(value / 1_000).toFixed(2).replace('.', ',')} mil` : money(value)
const percent = (value: number) => `${value.toFixed(2).replace('.', ',')}%`
const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago']
const keepValid = (selected: string[], available: Set<string>) => {
  const valid = selected.filter(value => available.has(value))
  return valid.length === selected.length ? selected : valid
}

type InsightItem = { key: string; content: React.ReactNode }
type InsightFilters = { cities: string[]; schools: string[]; expenses: string[] }

function buildExecutiveInsights(data: DashboardData, filters: InsightFilters): InsightItem[] {
  const candidates: InsightItem[] = []
  const total = data.summary.valorTotal
  const share = (value: number) => total ? percent(value / total * 100) : '0%'
  const topExpense = data.expenses[0]
  const topCities = data.cities.slice(0, 2)
  const peakMonth = data.monthly.length > 1 ? data.monthly.reduce((highest, item) => item.valorTotal > highest.valorTotal ? item : highest) : null
  const topSchool = data.schools[0]

  if (filters.expenses.length === 0 && topExpense) {
    candidates.push({ key: 'expense', content: <><b>{topExpense.tipoDespesa}</b> lidera as despesas, com {percent(topExpense.percentualTotal)} do valor e <b>{topExpense.pagamentos} pagamentos</b>.</> })
  }
  if (filters.cities.length === 0 && data.cities.length > 1) {
    const cityShare = topCities.reduce((sum, item) => sum + item.valorTotal, 0)
    candidates.push({ key: 'cities', content: <><b>{topCities.map(item => item.cidade).join(' e ')}</b> concentram {share(cityShare)} do valor movimentado.</> })
  }
  if (peakMonth) {
    candidates.push({ key: 'month', content: <><b>{peakMonth.mes}</b> registrou o pico do período: {money(peakMonth.valorTotal)}, equivalente a {share(peakMonth.valorTotal)} do total.</> })
  }
  if (filters.schools.length === 0 && data.schools.length > 1 && topSchool) {
    candidates.push({ key: 'school', content: <><b>{topSchool.nomeEscola}</b> lidera entre as escolas, com {money(topSchool.valorTotal)} ({share(topSchool.valorTotal)}).</> })
  }
  if (data.schools.length > 5) {
    const topFiveValue = data.schools.slice(0, 5).reduce((sum, item) => sum + item.valorTotal, 0)
    candidates.push({ key: 'top-five', content: <>As <b>5 escolas</b> de maior movimentação concentram {share(topFiveValue)} do valor do recorte.</> })
  }
  if (data.summary.quantidadePagamentos > 0) {
    candidates.push({ key: 'ticket', content: <>O ticket médio é <b>{money(data.summary.ticketMedio)}</b> em {data.summary.quantidadePagamentos.toLocaleString('pt-BR')} pagamentos.</> })
  }
  if (data.summary.quantidadeEscolas > 0) {
    const average = data.summary.quantidadePagamentos / data.summary.quantidadeEscolas
    candidates.push({ key: 'average-payments', content: <>Média de <b>{average.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} pagamentos</b> por escola no recorte.</> })
  }
  if (data.monthly.length > 1) {
    candidates.push({ key: 'active-months', content: <>Houve movimentação em <b>{data.monthly.length} meses</b> do período analisado.</> })
  }

  return candidates.slice(0, 5)
}

type TipProps = { active?: boolean; payload?: Array<{ value: number }>; label?: string }
function ChartTip({ active, payload, label }: TipProps) {
  if (!active || !payload?.length) return null
  return <div className="chart-tip"><span>{label}</span><strong>{money(payload[0].value)}</strong></div>
}

function PeriodPicker({ start, end, onStartChange, onEndChange }: { start: number; end: number; onStartChange: (month: number) => void; onEndChange: (month: number) => void }) {
  const [open, setOpen] = useState(false)
  const [openField, setOpenField] = useState<'start' | 'end' | null>(null)
  const [activeMonth, setActiveMonth] = useState(1)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
        setOpenField(null)
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        setOpenField(null)
      }
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  const toggleField = (field: 'start' | 'end') => {
    setOpenField(current => current === field ? null : field)
    setActiveMonth(field === 'start' ? start : end)
  }

  const chooseMonth = (field: 'start' | 'end', month: number) => {
    if ((field === 'start' && month > end) || (field === 'end' && month < start)) return
    if (field === 'start') onStartChange(month)
    else onEndChange(month)
    setActiveMonth(month)
    setOpenField(null)
  }

  const handleMonthKey = (field: 'start' | 'end', event: React.KeyboardEvent<HTMLButtonElement>) => {
    const minimum = field === 'start' ? 1 : start
    const maximum = field === 'start' ? end : 8
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setOpenField(field)
      const direction = event.key === 'ArrowDown' ? 1 : -1
      setActiveMonth(current => Math.max(minimum, Math.min(maximum, current + direction)))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (openField === field) chooseMonth(field, activeMonth)
      else toggleField(field)
    }
  }

  const monthControl = (field: 'start' | 'end', value: number, label: string) => <div className="month-control">
    <span>{label}</span>
    <button type="button" className="month-trigger" data-field={field} aria-expanded={openField === field} onFocus={() => setActiveMonth(value)} onClick={() => toggleField(field)} onKeyDown={event => handleMonthKey(field, event)}>{MONTHS[value - 1]}<ChevronRight/></button>
    {openField === field && <div className="month-options" role="listbox">
      {MONTHS.map((month, index) => {
        const number = index + 1
        const disabled = field === 'start' ? number > end : number < start
        return <button type="button" role="option" aria-selected={number === value} disabled={disabled} data-month={number} className={number === activeMonth ? 'is-active' : ''} key={month} onMouseEnter={() => !disabled && setActiveMonth(number)} onClick={() => chooseMonth(field, number)}>{month}</button>
      })}
    </div>}
  </div>

  return <div className="period-picker" ref={rootRef}>
    <button type="button" className="period" aria-expanded={open} onClick={() => { setOpen(current => !current); setOpenField(null) }}><CalendarDays size={17}/><span>{MONTHS[start - 1]} — {MONTHS[end - 1]}</span></button>
    {open && <div className="period-popover" onMouseDown={event => event.stopPropagation()}>
      <span className="period-popover-title">Selecionar período</span>
      <div className="period-popover-controls">
        {monthControl('start', start, 'De')}
        {monthControl('end', end, 'Até')}
      </div>
    </div>}
  </div>
}

function Executive() {
  const [confirmedDashboard, setConfirmedDashboard] = useState<{ data: DashboardData; filters: InsightFilters } | null>(null)
  const [options, setOptions] = useState<FilterOptionsResponse | null>(null)
  const [error, setError] = useState('')
  const [dataLoading, setDataLoading] = useState(true)
  const [optionsLoading, setOptionsLoading] = useState(true)
  const [retry, setRetry] = useState(0)
  const [city, setCity] = useState<string[]>([])
  const [school, setSchool] = useState<string[]>([])
  const [expense, setExpense] = useState<string[]>([])
  const [level, setLevel] = useState<string[]>([])
  const [monthStart, setMonthStart] = useState(1)
  const [monthEnd, setMonthEnd] = useState(8)
  const [schoolPage, setSchoolPage] = useState(0)
  const data = confirmedDashboard?.data ?? null

  useEffect(() => setSchoolPage(0), [city, school, expense, level, monthStart, monthEnd])

  useEffect(() => {
    const controller = new AbortController()
    setOptionsLoading(true)
    setError('')
    getFilterOptions({
      cidade: city.length ? city : undefined,
      inep: school.length ? school : undefined,
      tipoDespesa: expense.length ? expense : undefined,
      nivelEnsino: level.length ? level : undefined,
      mesInicio: monthStart,
      mesFim: monthEnd,
    }, controller.signal)
      .then(nextOptions => {
        setOptions(nextOptions)
        setCity(current => keepValid(current, new Set(nextOptions.cidades)))
        setSchool(current => keepValid(current, new Set(nextOptions.escolas.map(item => item.inep))))
        setExpense(current => keepValid(current, new Set(nextOptions.tiposDespesa)))
        setLevel(current => keepValid(current, new Set(nextOptions.niveisEnsino)))
      })
      .catch(err => { if (err?.name !== 'AbortError') setError(err instanceof Error ? err.message : 'Não foi possível carregar os filtros.') })
      .finally(() => { if (!controller.signal.aborted) setOptionsLoading(false) })
    return () => controller.abort()
  }, [city, school, expense, level, monthStart, monthEnd, retry])

  useEffect(() => {
    const controller = new AbortController()
    const filtersForRequest: InsightFilters = { cities: [...city], schools: [...school], expenses: [...expense] }
    setDataLoading(true)
    setError('')
    getDashboardData({
      cidade: city.length ? city : undefined,
      inep: school.length ? school : undefined,
      tipoDespesa: expense.length ? expense : undefined,
      nivelEnsino: level.length ? level : undefined,
      mesInicio: monthStart,
      mesFim: monthEnd,
    }, controller.signal)
      .then(nextData => setConfirmedDashboard({ data: nextData, filters: filtersForRequest }))
      .catch(err => { if (err?.name !== 'AbortError') setError(err instanceof Error ? err.message : 'Não foi possível carregar os dados.') })
      .finally(() => { if (!controller.signal.aborted) setDataLoading(false) })
    return () => controller.abort()
  }, [city, school, expense, level, monthStart, monthEnd, retry])

  const monthly = data?.monthly.map(item => ({ name: item.mes, value: item.valorTotal })) ?? []
  const expenses = data?.expenses.map(item => ({ name: item.tipoDespesa, value: item.valorTotal, pct: percent(item.percentualTotal) })) ?? []
  const executiveInsights = confirmedDashboard ? buildExecutiveInsights(confirmedDashboard.data, confirmedDashboard.filters) : []
  const filtersActive = Boolean(city.length || school.length || expense.length || level.length || monthStart !== 1 || monthEnd !== 8)
  const clearFilters = () => { setCity([]); setSchool([]); setExpense([]); setLevel([]); setMonthStart(1); setMonthEnd(8) }
  const schoolOptions = options?.escolas.map(item => ({ value: item.inep, label: `${item.nomeEscola} · INEP ${item.inep}`, searchText: item.inep })) ?? []
  const initialLoading = (!data || !options) && (dataLoading || optionsLoading)
  const updating = Boolean(data && options && (dataLoading || optionsLoading))
  const pageSize = 5
  const schoolCount = data?.schools.length ?? 0
  const pageCount = Math.max(1, Math.ceil(schoolCount / pageSize))
  const visibleSchools = data?.schools.slice(schoolPage * pageSize, (schoolPage + 1) * pageSize) ?? []
  const rangeStart = schoolCount ? schoolPage * pageSize + 1 : 0
  const rangeEnd = Math.min((schoolPage + 1) * pageSize, schoolCount)

  useEffect(() => {
    setSchoolPage(current => Math.min(current, pageCount - 1))
  }, [pageCount])

  if (initialLoading) return <><section className="page-heading"><div><span className="eyebrow">GESTÃO FINANCEIRA</span><h2>Visão Executiva</h2><p>Acompanhamento consolidado dos recursos da rede estadual</p></div></section><section className="data-state"><LoaderCircle/><div><b>Carregando dados do painel</b><span>Consultando a base estadual de 2026…</span></div></section></>
  if (!data || !options) return <><section className="page-heading"><div><span className="eyebrow">GESTÃO FINANCEIRA</span><h2>Visão Executiva</h2><p>Acompanhamento consolidado dos recursos da rede estadual</p></div></section><section className="data-state error"><AlertCircle/><div><b>Não foi possível carregar o painel</b><span>{error}</span></div><button onClick={() => setRetry(value => value + 1)}>Tentar novamente</button></section></>

  return <>
    <section className="page-heading"><div><span className="eyebrow">GESTÃO FINANCEIRA</span><h2>Visão Executiva</h2><p>Acompanhamento consolidado dos recursos da rede estadual</p></div><PeriodPicker start={monthStart} end={monthEnd} onStartChange={month => { setMonthStart(month); if (month > monthEnd) setMonthEnd(month) }} onEndChange={month => { setMonthEnd(month); if (month < monthStart) setMonthStart(month) }} /></section>
    <section className="filter-panel">
      <MultiSelect label="Cidade" placeholder="Buscar cidade..." value={city} onChange={setCity} options={options.cidades.map(item => ({ value: item, label: item }))} /><MultiSelect label="Escola" placeholder="Buscar escola..." value={school} onChange={setSchool} options={schoolOptions} />
      <MultiSelect label="Tipo de despesa" placeholder="Buscar despesa..." value={expense} onChange={setExpense} options={options.tiposDespesa.map(item => ({ value: item, label: item }))} /><MultiSelect label="Nível de ensino" placeholder="Buscar nível..." value={level} onChange={setLevel} options={options.niveisEnsino.map(item => ({ value: item, label: item }))} />
      <button className="clear" onClick={clearFilters} disabled={!filtersActive}><RefreshCw size={15}/> Limpar filtros</button>
      {updating && <div className="update-feedback"><LoaderCircle/> Atualizando...</div>}
      {!updating && error && <div className="update-feedback update-error"><AlertCircle/> <span>Falha ao atualizar.</span><button onClick={() => setRetry(value => value + 1)}>Tentar novamente</button></div>}
    </section>
    <section className="kpi-grid">
      <Kpi icon={<CircleDollarSign/>} label="Valor movimentado" value={metricMoney(data.summary.valorTotal)} hint="Recursos no período" />
      <Kpi icon={<ReceiptText/>} label="Pagamentos" value={data.summary.quantidadePagamentos.toLocaleString('pt-BR')} hint="Registros conciliados" />
      <Kpi icon={<School/>} label="Escolas" value={data.summary.quantidadeEscolas.toLocaleString('pt-BR')} hint="Unidades estaduais" />
      <Kpi icon={<WalletCards/>} label="Ticket médio" value={metricMoney(data.summary.ticketMedio)} hint="Por pagamento" />
    </section>
    <section className="dashboard-grid">
      <Card title="Evolução Mensal" subtitle="Valor movimentado por mês" className="wide">
        <div className="chart"><ResponsiveContainer><AreaChart data={monthly} margin={{top:12,right:8,left:-10,bottom:0}}><defs><linearGradient id="fillOrange" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={orange} stopOpacity={.3}/><stop offset="100%" stopColor={orange} stopOpacity={.02}/></linearGradient></defs><CartesianGrid stroke="#e8e8e8" vertical={false}/><XAxis dataKey="name" axisLine={false} tickLine={false}/><YAxis axisLine={false} tickLine={false} tickFormatter={v => `${(v/1e6).toFixed(1)} mi`}/><Tooltip content={<ChartTip/>}/><Area type="monotone" dataKey="value" stroke={orange} strokeWidth={3} fill="url(#fillOrange)" dot={{r:4,fill:'#fff',stroke:orange,strokeWidth:2}}/></AreaChart></ResponsiveContainer></div>
      </Card>
      <Card title="Insights Executivos" subtitle="Destaques para tomada de decisão" className="insights">
        {executiveInsights.map((item, index) => <Insight n={String(index + 1).padStart(2, '0')} key={item.key}>{item.content}</Insight>)}
      </Card>
      <Card title="Por tipo de despesa" subtitle="Participação no valor total">
        <div className="chart bar-chart"><ResponsiveContainer><BarChart data={expenses} layout="vertical" margin={{left:10,right:24}}><CartesianGrid stroke="#eee" horizontal={false}/><XAxis type="number" hide/><YAxis dataKey="name" type="category" width={118} axisLine={false} tickLine={false}/><Tooltip content={<ChartTip/>}/><Bar dataKey="value" fill={orange} radius={[0,5,5,0]} barSize={18}/></BarChart></ResponsiveContainer></div>
        <div className="legend-row">{expenses.map(e=><span key={e.name}><i/>{e.name} <b>{e.pct}</b></span>)}</div>
      </Card>
      <Card title="Ranking por cidade" subtitle="Cidades com maior valor movimentado">
        <div className="rank-list">{data.cities.map((c,i)=><div className="rank" key={c.cidade}><span className="rank-number">{String(i+1).padStart(2,'0')}</span><div><div><strong>{c.cidade}</strong><b>{compact(c.valorTotal)}</b></div><div className="track"><i style={{width:`${data.cities[0]?.valorTotal ? c.valorTotal/data.cities[0].valorTotal*100 : 0}%`}}/></div></div></div>)}</div>
      </Card>
    </section>
    <Card title="Detalhamento por escola" subtitle="Unidades com maior valor movimentado" className="table-card" actions={<div className="table-pagination"><span>{rangeStart}–{rangeEnd} de {schoolCount}</span><button aria-label="Página anterior" disabled={schoolPage === 0} onClick={() => setSchoolPage(page => Math.max(0, page - 1))}><ChevronLeft/></button><button aria-label="Próxima página" disabled={schoolPage >= pageCount - 1} onClick={() => setSchoolPage(page => Math.min(pageCount - 1, page + 1))}><ChevronRight/></button></div>}>
      <div className="table-wrap"><table><thead><tr><th>Escola</th><th>Cidade</th><th>Nível</th><th>Nº de pagamentos</th><th>Valor total</th><th>Ticket médio</th></tr></thead><tbody>{visibleSchools.map(item=><tr key={item.inep}><td><span className="school-icon"><School size={15}/></span><b>{item.nomeEscola}</b></td><td>{item.cidade}</td><td><span className="tag">{item.nivelEnsino}</span></td><td>{item.pagamentos}</td><td><b>{money(item.valorTotal)}</b></td><td>{money(item.ticketMedio)}</td></tr>)}</tbody></table>{data.schools.length === 0 && <div className="empty-table">Nenhuma escola encontrada para os filtros selecionados.</div>}</div>
    </Card>
  </>
}

function Kpi({icon,label,value,hint}:{icon:React.ReactNode,label:string,value:string,hint:string}) { return <article className="kpi"><div className="kpi-icon">{icon}</div><div><span>{label}</span><strong>{value}</strong><small>{hint}</small></div></article> }
function Card({title,subtitle,children,className='',actions}:{title:string,subtitle:string,children:React.ReactNode,className?:string,actions?:React.ReactNode}) { return <article className={`card ${className}`}><header><div><h3>{title}</h3><p>{subtitle}</p></div>{actions}</header>{children}</article> }
function Insight({n,children}:{n:string,children:React.ReactNode}) { return <div className="insight"><span>{n}</span><p>{children}</p></div> }

function Quality() {
  const metrics = [
    {icon:<Database/>,value:'100',label:'Escolas Cadastradas'}, {icon:<School/>,value:'90',label:'Escolas Estaduais'},
    {icon:<ReceiptText/>,value:'600',label:'Pagamentos na Base Bruta'}, {icon:<Info/>,value:'42',label:'Pagamentos sem Correspondência Cadastral'},
  ]
  return <>
    <section className="page-heading"><div><span className="eyebrow">GOVERNANÇA DE DADOS</span><h2>Qualidade & Modelagem</h2><p>Critérios de integração, tratamento e limitações da base</p></div><div className="quality-seal"><ShieldCheck size={18}/> Base documentada</div></section>
    <section className="quality-metrics">{metrics.map(m=><article key={m.label}><span>{m.icon}</span><div><strong>{m.value}</strong><small>{m.label}</small></div></article>)}</section>
    <section className="quality-grid">
      <article className="card model-card"><header><div><h3>Chave de integração das bases</h3><p>Regra aplicada para relacionar cadastro e pagamentos</p></div></header>
        <div className="flow"><div className="flow-box"><small>IDENTIFICADOR ORIGINAL</small><strong>INEP</strong><code>31<span>027225</span></code></div><div className="flow-arrow"><ChevronRight/><small>extrair</small></div><div className="flow-box active"><small>REGRA DE TRANSFORMAÇÃO</small><strong>Últimos 6 dígitos</strong><code><span>027225</span></code></div><div className="flow-arrow"><ChevronRight/><small>comparar</small></div><div className="flow-box"><small>CHAVE DE PAGAMENTO</small><strong>CodEsc</strong><code><span>027225</span></code></div></div>
        <div className="rule-note"><Info size={18}/><p>O código é tratado como <b>texto</b> durante todo o processo, garantindo a preservação dos zeros à esquerda no CodEsc.</p></div>
      </article>
      <article className="card treatments"><header><div><h3>Tratamentos aplicados</h3><p>Ajustes necessários para consistência cadastral</p></div></header>
        <div className="treatment"><span className="status">CORRIGIDO</span><div><small>Padronização de cidade</small><p><del>1Belo Horizonte</del><ChevronRight size={15}/><b>Belo Horizonte</b></p></div></div>
        <div className="treatment"><span className="status">PRESERVADO</span><div><small>Formatação da chave</small><p><code>027225</code><ChevronRight size={15}/><b>6 caracteres</b></p></div></div>
      </article>
    </section>
    <section className="method-note"><div><Landmark size={25}/></div><div><span>NOTA METODOLÓGICA</span><h3>Limitação para análise de inadimplência</h3><p>A base não possui informações de <b>vencimento, status ou saldo em aberto</b>. Por esse motivo, os dados disponíveis não permitem calcular a inadimplência real. Qualquer indicador nesse sentido dependeria da inclusão desses campos na fonte de origem.</p></div></section>
    <section className="lineage"><div><Sparkles size={19}/><span>Cadastro de escolas</span></div><i/><div><MapPin size={19}/><span>Normalização</span></div><i/><div><BarChart3 size={19}/><span>Conciliação</span></div><i/><div><ShieldCheck size={19}/><span>Camada analítica</span></div></section>
  </>
}

export default function App() {
  const [page,setPage] = useState<'executive'|'quality'>('executive')
  return <div className="app-shell"><aside><div className="brand"><div className="mg-mark">MG</div><div><b>SEE · MG</b><span>Educação</span></div></div><nav><small>PAINEL</small><button className={page==='executive'?'selected':''} onClick={()=>setPage('executive')}><LayoutDashboard/>Visão Executiva</button><button className={page==='quality'?'selected':''} onClick={()=>setPage('quality')}><Database/>Qualidade & Modelagem</button></nav><div className="side-footer"><GraduationCap/><span>Rede Estadual<br/><b>Minas Gerais</b></span></div></aside><div className="main"><header className="topbar">
  <div>
    <h1>Painel Financeiro da Rede Estadual</h1>
    <p>Secretaria de Estado de Educação de Minas Gerais</p>
  </div>

  <div className="header-signature">
    <span>REDE ESTADUAL</span>
    <div className="header-signature-line" />
    <strong>2026</strong>
  </div>
</header><main>{page==='executive'?<Executive/>:<Quality/>}</main><footer>Secretaria de Estado de Educação de Minas Gerais <span>•</span> Painel para fins de análise</footer></div></div>
}
