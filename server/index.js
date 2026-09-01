import express from 'express'
import cors from 'cors'
import { BigQuery } from '@google-cloud/bigquery'

const PORT = Number(process.env.PORT) || 3001
const HOST = '0.0.0.0'
const PROJECT_ID = 'personal-bi-482412'
const VIEW = `\`${PROJECT_ID}.desafio_bi.vw_dashboard_estadual_2026\``
const FILTER_COLUMNS = {
  cidade: 'Cidade',
  inep: 'INEP',
  tipoDespesa: 'Tipo_Despesa',
  nivelEnsino: 'Nivel_Ensino',
}
const PERIOD_FILTERS = new Set(['mesInicio', 'mesFim'])
const DEVELOPMENT_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173']
const PRODUCTION_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean)
const ALLOWED_ORIGINS = new Set([...DEVELOPMENT_ORIGINS, ...PRODUCTION_ORIGINS])

const app = express()
const bigquery = new BigQuery({ projectId: PROJECT_ID })

app.disable('x-powered-by')
app.use(cors({
  origin(origin, callback) {
    if (!origin || ALLOWED_ORIGINS.has(origin)) return callback(null, true)
    return callback(new RequestError('Origem não permitida pelo CORS.'))
  },
}))
app.use(express.json())

function toJsonValue(value) {
  if (value === null || value === undefined) return value
  if (typeof value === 'bigint') return Number(value)
  if (Array.isArray(value)) return value.map(toJsonValue)
  if (typeof value === 'object') {
    if (value.constructor?.name === 'BigQueryNumeric' && 'value' in value) {
      return Number(value.value)
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toJsonValue(item)]))
  }
  return value
}

async function select(query, params = {}) {
  const [rows] = await bigquery.query({ query, params, location: 'US', useLegacySql: false })
  return rows.map(toJsonValue)
}

class RequestError extends Error {
  constructor(message) {
    super(message)
    this.status = 400
  }
}

function getFilters(query, ignoredFilter) {
  const unknown = Object.keys(query).filter(key => !(key in FILTER_COLUMNS) && !PERIOD_FILTERS.has(key))
  if (unknown.length) {
    throw new RequestError(`Parâmetro(s) não suportado(s): ${unknown.join(', ')}.`)
  }

  const params = {}
  const clauses = []
  for (const [name, column] of Object.entries(FILTER_COLUMNS)) {
    const rawValue = query[name]
    if (rawValue === undefined) continue
    const rawValues = Array.isArray(rawValue) ? rawValue : [rawValue]
    if (rawValues.length > 100 || rawValues.some(value =>
      typeof value !== 'string' || value.length > 200 || value.includes('\u0000')
    )) {
      throw new RequestError(`Valor inválido para o parâmetro ${name}.`)
    }
    const values = [...new Set(rawValues.map(value => value.trim()).filter(Boolean))]
    if (!values.length) continue
    params[name] = values
    if (name !== ignoredFilter) clauses.push(`${column} IN UNNEST(@${name})`)
  }

  const readMonth = name => {
    const rawValue = query[name]
    if (rawValue === undefined || rawValue === '') return undefined
    if (Array.isArray(rawValue) || typeof rawValue !== 'string' || !/^\d{1,2}$/.test(rawValue.trim())) {
      throw new RequestError(`Valor inválido para o parâmetro ${name}.`)
    }
    const value = Number(rawValue)
    if (!Number.isInteger(value) || value < 1 || value > 12) {
      throw new RequestError(`O parâmetro ${name} deve ser um inteiro entre 1 e 12.`)
    }
    return value
  }

  const mesInicio = readMonth('mesInicio')
  const mesFim = readMonth('mesFim')
  if (mesInicio !== undefined && mesFim !== undefined && mesInicio > mesFim) {
    throw new RequestError('mesInicio não pode ser maior que mesFim.')
  }
  if (mesInicio !== undefined) {
    params.mesInicio = mesInicio
    clauses.push('Mes >= @mesInicio')
  }
  if (mesFim !== undefined) {
    params.mesFim = mesFim
    clauses.push('Mes <= @mesFim')
  }

  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params }
}

function requireValues(where, condition) {
  return where ? `${where} AND ${condition}` : `WHERE ${condition}`
}

const asyncRoute = handler => async (req, res, next) => {
  try {
    await handler(req, res)
  } catch (error) {
    next(error)
  }
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', project: PROJECT_ID })
})

app.get('/api/summary', asyncRoute(async (req, res) => {
  const { where, params } = getFilters(req.query)
  const [summary] = await select(`
    SELECT
      CAST(COALESCE(SUM(Valor), 0) AS FLOAT64) AS valorTotal,
      COUNT(DISTINCT ID_Pagamento) AS quantidadePagamentos,
      COUNT(DISTINCT INEP) AS quantidadeEscolas,
      CAST(SAFE_DIVIDE(COALESCE(SUM(Valor), 0), COUNT(DISTINCT ID_Pagamento)) AS FLOAT64) AS ticketMedio
    FROM ${VIEW}
    ${where}
  `, params)
  res.json(summary)
}))

app.get('/api/monthly', asyncRoute(async (req, res) => {
  const { where, params } = getFilters(req.query)
  const rows = await select(`
    SELECT
      EXTRACT(MONTH FROM Data_Pagamento) AS mesNumero,
      CASE EXTRACT(MONTH FROM Data_Pagamento)
        WHEN 1 THEN 'Jan' WHEN 2 THEN 'Fev' WHEN 3 THEN 'Mar' WHEN 4 THEN 'Abr'
        WHEN 5 THEN 'Mai' WHEN 6 THEN 'Jun' WHEN 7 THEN 'Jul' WHEN 8 THEN 'Ago'
        WHEN 9 THEN 'Set' WHEN 10 THEN 'Out' WHEN 11 THEN 'Nov' WHEN 12 THEN 'Dez'
      END AS mes,
      COUNT(DISTINCT ID_Pagamento) AS quantidadePagamentos,
      COUNT(DISTINCT INEP) AS quantidadeEscolas,
      CAST(COALESCE(SUM(Valor), 0) AS FLOAT64) AS valorTotal,
      CAST(SAFE_DIVIDE(COALESCE(SUM(Valor), 0), COUNT(DISTINCT ID_Pagamento)) AS FLOAT64) AS ticketMedio
    FROM ${VIEW}
    ${where}
    GROUP BY mesNumero, mes
    ORDER BY mesNumero
  `, params)
  res.json(rows)
}))

app.get('/api/expenses', asyncRoute(async (req, res) => {
  const { where, params } = getFilters(req.query)
  const rows = await select(`
    SELECT
      Tipo_Despesa AS tipoDespesa,
      COUNT(DISTINCT ID_Pagamento) AS pagamentos,
      COUNT(DISTINCT INEP) AS escolas,
      CAST(COALESCE(SUM(Valor), 0) AS FLOAT64) AS valorTotal,
      CAST(SAFE_DIVIDE(COALESCE(SUM(Valor), 0), COUNT(DISTINCT ID_Pagamento)) AS FLOAT64) AS ticketMedio,
      CAST(SAFE_MULTIPLY(SAFE_DIVIDE(COALESCE(SUM(Valor), 0), SUM(SUM(Valor)) OVER ()), 100) AS FLOAT64) AS percentualTotal
    FROM ${VIEW}
    ${where}
    GROUP BY Tipo_Despesa
    ORDER BY valorTotal DESC
  `, params)
  res.json(rows)
}))

app.get('/api/cities', asyncRoute(async (req, res) => {
  const { where, params } = getFilters(req.query)
  const rows = await select(`
    SELECT
      Cidade AS cidade,
      COUNT(DISTINCT ID_Pagamento) AS pagamentos,
      COUNT(DISTINCT INEP) AS escolas,
      CAST(COALESCE(SUM(Valor), 0) AS FLOAT64) AS valorTotal,
      CAST(SAFE_DIVIDE(COALESCE(SUM(Valor), 0), COUNT(DISTINCT ID_Pagamento)) AS FLOAT64) AS ticketMedio,
      CAST(SAFE_MULTIPLY(SAFE_DIVIDE(COALESCE(SUM(Valor), 0), SUM(SUM(Valor)) OVER ()), 100) AS FLOAT64) AS percentualTotal
    FROM ${VIEW}
    ${where}
    GROUP BY Cidade
    ORDER BY valorTotal DESC
  `, params)
  res.json(rows)
}))

app.get('/api/schools', asyncRoute(async (req, res) => {
  const { where, params } = getFilters(req.query)
  const rows = await select(`
    SELECT
      INEP AS inep,
      Nome_Escola AS nomeEscola,
      Cidade AS cidade,
      Nivel_Ensino AS nivelEnsino,
      COUNT(DISTINCT ID_Pagamento) AS pagamentos,
      CAST(COALESCE(SUM(Valor), 0) AS FLOAT64) AS valorTotal,
      CAST(SAFE_DIVIDE(COALESCE(SUM(Valor), 0), COUNT(DISTINCT ID_Pagamento)) AS FLOAT64) AS ticketMedio
    FROM ${VIEW}
    ${where}
    GROUP BY INEP, Nome_Escola, Cidade, Nivel_Ensino
    ORDER BY valorTotal DESC
  `, params)
  res.json(rows)
}))

app.get('/api/filters', asyncRoute(async (req, res) => {
  const { params } = getFilters(req.query)
  const citiesWhere = requireValues(getFilters(req.query, 'cidade').where, 'Cidade IS NOT NULL')
  const schoolsWhere = requireValues(getFilters(req.query, 'inep').where, 'INEP IS NOT NULL AND Nome_Escola IS NOT NULL')
  const expensesWhere = requireValues(getFilters(req.query, 'tipoDespesa').where, 'Tipo_Despesa IS NOT NULL')
  const levelsWhere = requireValues(getFilters(req.query, 'nivelEnsino').where, 'Nivel_Ensino IS NOT NULL')
  const [filters] = await select(`
    SELECT
      (SELECT ARRAY_AGG(cidade ORDER BY cidade) FROM (
        SELECT DISTINCT Cidade AS cidade FROM ${VIEW} ${citiesWhere}
      )) AS cidades,
      (SELECT ARRAY_AGG(STRUCT(inep, nomeEscola) ORDER BY nomeEscola, inep) FROM (
        SELECT DISTINCT CAST(INEP AS STRING) AS inep, Nome_Escola AS nomeEscola
        FROM ${VIEW} ${schoolsWhere}
      )) AS escolas,
      (SELECT ARRAY_AGG(tipoDespesa ORDER BY tipoDespesa) FROM (
        SELECT DISTINCT Tipo_Despesa AS tipoDespesa FROM ${VIEW} ${expensesWhere}
      )) AS tiposDespesa,
      (SELECT ARRAY_AGG(nivelEnsino ORDER BY nivelEnsino) FROM (
        SELECT DISTINCT Nivel_Ensino AS nivelEnsino FROM ${VIEW} ${levelsWhere}
      )) AS niveisEnsino
  `, params)
  res.json(filters)
}))

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint não encontrado.' })
})

app.use((error, req, res, next) => {
  console.error(`[${new Date().toISOString()}]`, error)
  const message = error?.message || 'Erro desconhecido ao consultar o BigQuery.'
  const status = error?.status === 400 ? 400 : 500
  res.status(status).json({ error: status === 400 ? 'Parâmetros de consulta inválidos.' : 'Falha ao consultar os dados do dashboard.', details: message })
})

app.listen(PORT, HOST, () => {
  console.log(`API disponível em http://${HOST}:${PORT}`)
})
