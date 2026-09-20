"""Hub methods use the existing RPC bridge, with blocking work off the event loop."""
import asyncio

from analysis.hub.catalog import CATALOG
from analysis.hub.markets import MarketService
from analysis.hub.repository import HubRepository


def repository():
    return HubRepository()


def _params(params, allowed):
    if not isinstance(params, dict) or set(params) - set(allowed):
        raise ValueError('Unsupported Hub parameters')


async def catalog(params):
    _params(params, [])
    return {'items': CATALOG}


async def markets(params):
    _params(params, ['refresh'])
    refresh = params.get('refresh', False)
    if not isinstance(refresh, bool):
        raise ValueError('refresh must be boolean')
    return await asyncio.to_thread(lambda: MarketService(repository()).get(refresh))


async def archive_list(params):
    _params(params, [])
    return await asyncio.to_thread(lambda: {'items': repository().archive()})


def _item_id(params):
    _params(params, ['item_id'])
    item_id = params.get('item_id')
    if not isinstance(item_id, str) or not 1 <= len(item_id) <= 160:
        raise ValueError('item_id must be a nonempty string up to 160 characters')
    return item_id


def _save(item_id):
    repo = repository()
    item = next((entry for entry in CATALOG if entry['id'] == item_id), None)
    if item is None:
        quote = next((entry for entry in (repo.cached() or {}).get('quotes', [])
                      if entry['id'] == item_id), None)
        if quote:
            item = {'id': quote['id'], 'section': 'markets',
                    'title': f"{quote['metal']} · {quote['observed_at']}",
                    'summary': f"{quote['value']:.4f} {quote['unit']}. Observación diaria BCRP.",
                    'source': quote['source'], 'url': quote['url'], 'tags': [quote['metal']],
                    'published_at': quote['observed_at'], 'kind': 'Observación de mercado'}
    if item is None:
        raise ValueError('Entry not found in verified catalog or cached market observations')
    repo.save(item)
    return {'items': repo.archive()}


async def archive_save(params):
    return await asyncio.to_thread(_save, _item_id(params))


async def archive_remove(params):
    item_id = _item_id(params)
    def remove():
        repo = repository()
        repo.remove(item_id)
        return {'items': repo.archive()}
    return await asyncio.to_thread(remove)


HUB_METHODS = {
    'hub.catalog': catalog,
    'hub.markets': markets,
    'hub.archive.list': archive_list,
    'hub.archive.save': archive_save,
    'hub.archive.remove': archive_remove,
}
