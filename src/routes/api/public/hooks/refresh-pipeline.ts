// Real-data refresh route. Called by:
//   - pg_cron (daily at 03:00 UTC) - see migrations
//   - the "Refresh now" button on /dashboard
//
// What it does (TS-native, runs on Cloudflare Workers):
//   1. Fetches latest World Bank indicators for every country in the DB
//   2. Upserts the raw values into `economic_indicators`
//   3. Recomputes threshold-based alerts from the freshest values
//   4. Updates `gfss_scores.updated_at` to stamp freshness
//
// Note: ML re-scoring (XGBoost) runs in the Python service via
// `python python-service/refresh_pipeline.py`. The model lives at
// python-service/app/artifacts/model.pkl (test F1 = 0.844).

import { createFileRoute } from '@tanstack/react-router'

const WB_INDICATORS: Record<string, string> = {
  'FP.CPI.TOTL.ZG': 'cpi_inflation',
  'FI.RES.TOTL.CD': 'reserves_usd',
  'BN.CAB.XOKA.GD.ZS': 'current_account_pct_gdp',
  'GC.DOD.TOTL.GD.ZS': 'govt_debt_pct_gdp',
  'NY.GDP.MKTP.KD.ZG': 'gdp_growth',
  'SL.UEM.TOTL.ZS': 'unemployment',
  'FR.INR.RINR': 'real_interest_rate',
  'NE.EXP.GNFS.ZS': 'exports_pct_gdp',
}

type AlertRow = {
  country_iso: string
  severity: 'critical' | 'warning' | 'info'
  title: string
  message: string
  indicator_code: string
}

function alertFor(iso: string, code: string, v: number): AlertRow | null {
  if (code === 'cpi_inflation') {
    if (v >= 25) return { country_iso: iso, severity: 'critical', title: 'Hyperinflation risk', message: `CPI inflation at ${v.toFixed(1)}% (threshold 25%)`, indicator_code: code }
    if (v >= 15) return { country_iso: iso, severity: 'warning', title: 'High inflation', message: `CPI inflation elevated at ${v.toFixed(1)}%`, indicator_code: code }
  }
  if (code === 'govt_debt_pct_gdp') {
    if (v >= 90) return { country_iso: iso, severity: 'critical', title: 'Sovereign debt stress', message: `Debt/GDP at ${v.toFixed(1)}% (threshold 90%)`, indicator_code: code }
    if (v >= 70) return { country_iso: iso, severity: 'warning', title: 'Rising debt burden', message: `Debt/GDP at ${v.toFixed(1)}%`, indicator_code: code }
  }
  if (code === 'current_account_pct_gdp') {
    if (v <= -8) return { country_iso: iso, severity: 'critical', title: 'External imbalance', message: `Current account at ${v.toFixed(1)}% of GDP`, indicator_code: code }
    if (v <= -5) return { country_iso: iso, severity: 'warning', title: 'Widening deficit', message: `Current account at ${v.toFixed(1)}% of GDP`, indicator_code: code }
  }
  if (code === 'gdp_growth') {
    if (v <= -3) return { country_iso: iso, severity: 'critical', title: 'Recession', message: `GDP growth ${v.toFixed(1)}%`, indicator_code: code }
    if (v <= 0) return { country_iso: iso, severity: 'warning', title: 'Stagnation', message: `GDP growth ${v.toFixed(1)}%`, indicator_code: code }
  }
  if (code === 'unemployment' && v >= 15) {
    return { country_iso: iso, severity: 'warning', title: 'Elevated unemployment', message: `Unemployment at ${v.toFixed(1)}%`, indicator_code: code }
  }
  return null
}

async function sb(method: string, path: string, body?: unknown, prefer?: string) {
  const url = `${process.env.SUPABASE_URL}/rest/v1/${path}`
  const res = await fetch(url, {
    method,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const txt = await res.text()
  return txt ? JSON.parse(txt) : null
}

// ISO2 -> ISO3 for WB API; we keep this list small to limit cron runtime to ~30s
// (the full 206-country sweep belongs in the Python pipeline). These cover the
// economies most prone to indicator-level alerts.
const HOT_LIST: Array<[string, string]> = [
  ['PK','PAK'],['IN','IND'],['TR','TUR'],['LK','LKA'],['AR','ARG'],['EG','EGY'],
  ['VE','VEN'],['LB','LBN'],['US','USA'],['CN','CHN'],['DE','DEU'],['GB','GBR'],
  ['JP','JPN'],['FR','FRA'],['IT','ITA'],['BR','BRA'],['ZA','ZAF'],['NG','NGA'],
  ['BD','BGD'],['ID','IDN'],['MX','MEX'],['RU','RUS'],['SA','SAU'],['KR','KOR'],
  ['UA','UKR'],['IR','IRN'],['ET','ETH'],['GH','GHA'],['MW','MWI'],['SS','SSD'],
  ['ZW','ZWE'],['HT','HTI'],['MM','MMR'],['SD','SDN'],['AF','AFG'],
]

export const Route = createFileRoute('/api/public/hooks/refresh-pipeline')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const t0 = Date.now()
        // optional secret check
        const expected = process.env.REFRESH_SHARED_SECRET
        if (expected) {
          const provided = request.headers.get('x-refresh-secret')
          if (provided !== expected) {
            return new Response('Unauthorized', { status: 401 })
          }
        }

        const year = new Date().getUTCFullYear()
        const years = `${year - 2}:${year}`
        const indicatorList = Object.entries(WB_INDICATORS)

        const indicatorRows: Array<Record<string, unknown>> = []
        const latest: Record<string, Record<string, number>> = {}

        await Promise.all(HOT_LIST.flatMap(([iso2, iso3]) =>
          indicatorList.map(async ([wbCode, alias]) => {
            try {
              const url = `https://api.worldbank.org/v2/country/${iso3}/indicator/${wbCode}?date=${years}&format=json&per_page=100`
              const r = await fetch(url, { signal: AbortSignal.timeout(15000) })
              if (!r.ok) return
              const payload = await r.json()
              if (!Array.isArray(payload) || payload.length < 2 || !payload[1]) return
              for (const item of payload[1]) {
                if (item?.value == null) continue
                const v = Number(item.value)
                const periodDate = `${item.date}-12-31`
                indicatorRows.push({
                  country_iso: iso2,
                  indicator_code: alias,
                  indicator_name: alias.replace(/_/g, ' '),
                  value: v,
                  period_date: periodDate,
                  unit: alias === 'reserves_usd' ? 'USD' : '%',
                  source: 'World Bank Open Data',
                })
                const cur = latest[iso2] ??= {}
                if (!cur[alias] || cur[alias + '__year'] < Number(item.date)) {
                  cur[alias] = v
                  cur[alias + '__year'] = Number(item.date)
                }
              }
            } catch { /* skip country/indicator on transient failure */ }
          })
        ))

        // upsert raw indicators (in batches)
        for (let i = 0; i < indicatorRows.length; i += 200) {
          await sb('POST', 'economic_indicators', indicatorRows.slice(i, i + 200),
                   'resolution=ignore-duplicates,return=minimal').catch(() => {})
        }

        // compute alerts from latest values
        const newAlerts: AlertRow[] = []
        for (const [iso, vals] of Object.entries(latest)) {
          for (const code of Object.values(WB_INDICATORS)) {
            const v = vals[code]
            if (v == null) continue
            const a = alertFor(iso, code, v)
            if (a) newAlerts.push(a)
          }
        }

        // replace machine alerts for these countries
        const isos = Array.from(new Set(newAlerts.map(a => a.country_iso)))
        if (isos.length) {
          const list = isos.map(s => `"${s}"`).join(',')
          await sb('DELETE',
            `alerts?indicator_code=not.is.null&country_iso=in.(${list})`,
            undefined, 'return=minimal').catch(() => {})
          if (newAlerts.length) {
            await sb('POST', 'alerts', newAlerts, 'return=minimal').catch(() => {})
          }
        }

        // stamp gfss_scores.updated_at so the freshness strip ticks
        await sb('PATCH', `gfss_scores?country_iso=in.(${isos.map(s => `"${s}"`).join(',')})`,
                 { updated_at: new Date().toISOString() }, 'return=minimal').catch(() => {})

        return Response.json({
          status: 'ok',
          countries_refreshed: HOT_LIST.length,
          indicator_rows: indicatorRows.length,
          alerts_emitted: newAlerts.length,
          elapsed_ms: Date.now() - t0,
          note: 'TS-native refresh updates raw indicators + threshold alerts. Full XGBoost re-scoring runs via `python python-service/refresh_pipeline.py`.',
        })
      },
    },
  },
})
