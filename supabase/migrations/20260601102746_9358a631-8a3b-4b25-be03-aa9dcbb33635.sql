
-- ============= ENUMS =============
CREATE TYPE public.crisis_type AS ENUM (
  'currency_crisis','sovereign_debt','banking_crisis','imf_bailout','capital_flight','bop_crisis'
);
CREATE TYPE public.risk_level AS ENUM ('LOW','MODERATE','HIGH','CRITICAL');
CREATE TYPE public.alert_severity AS ENUM ('info','warning','critical');
CREATE TYPE public.gfss_category AS ENUM ('critical','weak','vulnerable','stable','strong');

-- ============= COUNTRIES =============
CREATE TABLE public.countries (
  iso_code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  region TEXT NOT NULL,
  sub_region TEXT,
  flag_emoji TEXT,
  population BIGINT,
  gdp_usd_bn NUMERIC,
  currency_code TEXT,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_countries_region ON public.countries(region);
CREATE INDEX idx_countries_slug ON public.countries(slug);

GRANT SELECT ON public.countries TO anon, authenticated;
GRANT ALL ON public.countries TO service_role;
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read countries" ON public.countries FOR SELECT USING (true);

-- ============= ECONOMIC INDICATORS =============
CREATE TABLE public.economic_indicators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_iso TEXT NOT NULL REFERENCES public.countries(iso_code) ON DELETE CASCADE,
  indicator_code TEXT NOT NULL,
  indicator_name TEXT NOT NULL,
  period_date DATE NOT NULL,
  value NUMERIC NOT NULL,
  unit TEXT,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (country_iso, indicator_code, period_date)
);
CREATE INDEX idx_ind_country_code ON public.economic_indicators(country_iso, indicator_code);
CREATE INDEX idx_ind_period ON public.economic_indicators(period_date DESC);

GRANT SELECT ON public.economic_indicators TO anon, authenticated;
GRANT ALL ON public.economic_indicators TO service_role;
ALTER TABLE public.economic_indicators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read indicators" ON public.economic_indicators FOR SELECT USING (true);

-- ============= RISK SCORES =============
CREATE TABLE public.risk_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_iso TEXT NOT NULL REFERENCES public.countries(iso_code) ON DELETE CASCADE,
  crisis_type public.crisis_type NOT NULL,
  horizon_months INT NOT NULL CHECK (horizon_months IN (6,12,24)),
  probability NUMERIC NOT NULL CHECK (probability >= 0 AND probability <= 1),
  risk_level public.risk_level NOT NULL,
  ci_lower NUMERIC,
  ci_upper NUMERIC,
  top_drivers JSONB NOT NULL DEFAULT '[]'::jsonb,
  model_version TEXT NOT NULL DEFAULT 'v1.0',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (country_iso, crisis_type, horizon_months)
);
CREATE INDEX idx_risk_country ON public.risk_scores(country_iso);

GRANT SELECT ON public.risk_scores TO anon, authenticated;
GRANT ALL ON public.risk_scores TO service_role;
ALTER TABLE public.risk_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read risk" ON public.risk_scores FOR SELECT USING (true);

-- ============= GFSS (Global Financial Stability Score) =============
CREATE TABLE public.gfss_scores (
  country_iso TEXT PRIMARY KEY REFERENCES public.countries(iso_code) ON DELETE CASCADE,
  score NUMERIC NOT NULL CHECK (score >= 0 AND score <= 100),
  category public.gfss_category NOT NULL,
  trend_30d NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gfss_scores TO anon, authenticated;
GRANT ALL ON public.gfss_scores TO service_role;
ALTER TABLE public.gfss_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read gfss" ON public.gfss_scores FOR SELECT USING (true);

-- ============= FORECASTS =============
CREATE TABLE public.forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_iso TEXT NOT NULL REFERENCES public.countries(iso_code) ON DELETE CASCADE,
  indicator_code TEXT NOT NULL,
  horizon_months INT NOT NULL,
  forecast_date DATE NOT NULL,
  point_value NUMERIC NOT NULL,
  ci_lower NUMERIC NOT NULL,
  ci_upper NUMERIC NOT NULL,
  model TEXT NOT NULL DEFAULT 'holt-winters',
  mape NUMERIC,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_forecast_country ON public.forecasts(country_iso, indicator_code);
GRANT SELECT ON public.forecasts TO anon, authenticated;
GRANT ALL ON public.forecasts TO service_role;
ALTER TABLE public.forecasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read forecasts" ON public.forecasts FOR SELECT USING (true);

-- ============= CRISIS EVENTS =============
CREATE TABLE public.crisis_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  country_iso TEXT REFERENCES public.countries(iso_code) ON DELETE SET NULL,
  region TEXT,
  start_date DATE NOT NULL,
  end_date DATE,
  crisis_type public.crisis_type NOT NULL,
  severity public.alert_severity NOT NULL,
  description TEXT NOT NULL,
  outcome TEXT,
  warning_signals JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_crisis_date ON public.crisis_events(start_date DESC);
GRANT SELECT ON public.crisis_events TO anon, authenticated;
GRANT ALL ON public.crisis_events TO service_role;
ALTER TABLE public.crisis_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read crises" ON public.crisis_events FOR SELECT USING (true);

-- ============= NEWS =============
CREATE TABLE public.news_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_iso TEXT REFERENCES public.countries(iso_code) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT,
  source TEXT,
  published_at TIMESTAMPTZ NOT NULL,
  summary TEXT,
  sentiment NUMERIC CHECK (sentiment >= -1 AND sentiment <= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_news_country_date ON public.news_articles(country_iso, published_at DESC);
GRANT SELECT ON public.news_articles TO anon, authenticated;
GRANT ALL ON public.news_articles TO service_role;
ALTER TABLE public.news_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read news" ON public.news_articles FOR SELECT USING (true);

CREATE TABLE public.sentiment_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_iso TEXT NOT NULL REFERENCES public.countries(iso_code) ON DELETE CASCADE,
  period_date DATE NOT NULL,
  score NUMERIC NOT NULL CHECK (score >= -1 AND score <= 1),
  article_count INT NOT NULL DEFAULT 0,
  UNIQUE (country_iso, period_date)
);
GRANT SELECT ON public.sentiment_index TO anon, authenticated;
GRANT ALL ON public.sentiment_index TO service_role;
ALTER TABLE public.sentiment_index ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read sentiment" ON public.sentiment_index FOR SELECT USING (true);

-- ============= ALERTS =============
CREATE TABLE public.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_iso TEXT NOT NULL REFERENCES public.countries(iso_code) ON DELETE CASCADE,
  severity public.alert_severity NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  indicator_code TEXT,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX idx_alerts_triggered ON public.alerts(triggered_at DESC);
GRANT SELECT ON public.alerts TO anon, authenticated;
GRANT ALL ON public.alerts TO service_role;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read alerts" ON public.alerts FOR SELECT USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;

-- ============= MODEL REGISTRY =============
CREATE TABLE public.model_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crisis_type public.crisis_type NOT NULL,
  version TEXT NOT NULL,
  algorithm TEXT NOT NULL,
  roc_auc NUMERIC,
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  trained_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (crisis_type, version)
);
GRANT SELECT ON public.model_versions TO anon, authenticated;
GRANT ALL ON public.model_versions TO service_role;
ALTER TABLE public.model_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read models" ON public.model_versions FOR SELECT USING (true);
