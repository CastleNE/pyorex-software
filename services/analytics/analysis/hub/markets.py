"""Official BCRP daily observations, not streaming or real-time prices."""
import json
import math
import threading
from datetime import date
from urllib.request import Request, urlopen

from analysis.hub.repository import now_iso

SERIES = (
    ('PD04701XD', 'Cobre', 'US cents / lb'),
    ('PD04702XD', 'Plata', 'USD / troy oz'),
    ('PD04703XD', 'Zinc', 'US cents / lb'),
    ('PD04704XD', 'Oro', 'USD / troy oz'),
)
BASE = 'https://estadisticas.bcrp.gob.pe/estadisticas/series'
API_URL = BASE + '/api/' + '-'.join(s[0] for s in SERIES) + '/json'
_LOCK = threading.Lock()
MONTHS = {name: i + 1 for i, name in enumerate(
    ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'])}
MONTHS.update({'jan': 1, 'apr': 4, 'aug': 8, 'sep': 9, 'dec': 12})


def fetch_bcrp():
    request = Request(API_URL, headers={'Accept': 'application/json', 'User-Agent': 'PyOrex/0.1'})
    with urlopen(request, timeout=15) as response:
        raw = response.read(2_000_001)
    if len(raw) > 2_000_000:
        raise ValueError('BCRP response too large')
    return json.loads(raw.decode('utf-8-sig'))


def observation_date(value):
    day, month, year = value.split('.')
    year_int = int(year)
    return date(year_int + 2000 if year_int < 100 else year_int,
                MONTHS[month.lower()], int(day)).isoformat()


def normalize(payload):
    config = payload.get('config', {}).get('series', [])
    if len(config) != len(SERIES):
        raise ValueError('BCRP series count changed')
    for meta, (_, metal, _) in zip(config, SERIES):
        if metal.casefold() not in meta.get('name', '').casefold():
            raise ValueError('BCRP series order changed')
    points = [{} for _ in SERIES]
    for period in payload.get('periods', []):
        values = period.get('values', [])
        if len(values) != len(SERIES):
            raise ValueError('Incomplete BCRP period')
        observed = observation_date(period['name'])
        for index, raw in enumerate(values):
            try:
                number = float(raw)
            except (TypeError, ValueError):
                continue
            if math.isfinite(number) and number > 0:
                points[index][observed] = number
    quotes = []
    for (code, metal, unit), history in zip(SERIES, points):
        if not history:
            raise ValueError(f'No valid BCRP observations for {metal}')
        ordered = sorted(history.items())
        observed, value = ordered[-1]
        previous = ordered[-2] if len(ordered) > 1 else None
        quotes.append({
            'id': f'market:{code}:{observed}', 'series': code, 'metal': metal,
            'unit': unit, 'value': value, 'observed_at': observed,
            'previous_at': previous[0] if previous else None,
            'change_pct': round((value / previous[1] - 1) * 100, 4) if previous else None,
            'source': 'BCRPData', 'url': f'{BASE}/diarias/resultados/{code}/html',
            'history': [{'date': d, 'value': v} for d, v in ordered[-30:]],
        })
    return quotes


class MarketService:
    def __init__(self, repository, fetch=fetch_bcrp):
        self.repository = repository
        self.fetch = fetch

    def get(self, refresh=False):
        with _LOCK:
            cached = self.repository.cached()
            warning = None
            if refresh:
                try:
                    quotes = normalize(self.fetch())
                    cached = {'quotes': quotes, 'fetched_at': now_iso()}
                    self.repository.cache(cached)
                    return {**cached, 'status': 'updated', 'warning': None}
                except (OSError, ValueError, KeyError, TypeError, AttributeError):
                    warning = 'No se pudo actualizar BCRP. Revisa la conexión e inténtalo de nuevo.'
            if cached:
                return {**cached, 'status': 'cached', 'warning': warning}
            return {'quotes': [], 'fetched_at': None,
                    'status': 'unavailable' if refresh else 'empty', 'warning': warning}
