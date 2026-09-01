// Em desenvolvimento, a URL relativa usa o proxy do Vite e mantém as
// requisições na mesma origem do frontend. Uma URL explícita continua
// disponível para outros ambientes por meio de VITE_API_URL.
const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

export interface SummaryResponse {
  valorTotal: number
  quantidadePagamentos: number
  quantidadeEscolas: number
  ticketMedio: number
}

export interface MonthlyResponse {
  mesNumero: number
  mes: string
  quantidadePagamentos: number
  quantidadeEscolas: number
  valorTotal: number
  ticketMedio: number
}

export interface ExpenseResponse {
  tipoDespesa: string
  pagamentos: number
  escolas: number
  valorTotal: number
  ticketMedio: number
  percentualTotal: number
}

export interface CityResponse {
  cidade: string
  pagamentos: number
  escolas: number
  valorTotal: number
  ticketMedio: number
  percentualTotal: number
}

export interface SchoolResponse {
  inep: string
  nomeEscola: string
  cidade: string
  nivelEnsino: string
  pagamentos: number
  valorTotal: number
  ticketMedio: number
}

export interface DashboardData {
  summary: SummaryResponse
  monthly: MonthlyResponse[]
  expenses: ExpenseResponse[]
  cities: CityResponse[]
  schools: SchoolResponse[]
}

export interface DashboardFilters {
  cidade?: string[]
  inep?: string[]
  tipoDespesa?: string[]
  nivelEnsino?: string[]
  mesInicio?: number
  mesFim?: number
}

export interface FilterOptionsResponse {
  cidades: string[]
  escolas: Array<{ inep: string; nomeEscola: string }>
  tiposDespesa: string[]
  niveisEnsino: string[]
}

function queryString(filters: DashboardFilters): string {
  const params = new URLSearchParams()
  const entries = Object.entries(filters) as Array<[keyof DashboardFilters, string[] | number | undefined]>
  entries.forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach(item => { if (item) params.append(key, item) })
    } else if (value !== undefined) {
      params.set(key, String(value))
    }
  })
  const result = params.toString()
  return result ? `?${result}` : ''
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { signal })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { details?: string } | null
    throw new Error(body?.details ?? `A API respondeu com status ${response.status}.`)
  }
  return response.json() as Promise<T>
}

export async function getDashboardData(filters: DashboardFilters = {}, signal?: AbortSignal): Promise<DashboardData> {
  const query = queryString(filters)
  const [summary, monthly, expenses, cities, schools] = await Promise.all([
    get<SummaryResponse>(`/api/summary${query}`, signal),
    get<MonthlyResponse[]>(`/api/monthly${query}`, signal),
    get<ExpenseResponse[]>(`/api/expenses${query}`, signal),
    get<CityResponse[]>(`/api/cities${query}`, signal),
    get<SchoolResponse[]>(`/api/schools${query}`, signal),
  ])

  return { summary, monthly, expenses, cities, schools }
}

export function getFilterOptions(filters: DashboardFilters = {}, signal?: AbortSignal): Promise<FilterOptionsResponse> {
  return get<FilterOptionsResponse>(`/api/filters${queryString(filters)}`, signal)
}
