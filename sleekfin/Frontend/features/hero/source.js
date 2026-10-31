import { normalizeSettings } from './settings.js';

const ITEM_FIELDS = 'Overview,Genres';

export function loadSettings(client) {
  return client.ajax({
    type: 'GET',
    url: client.getUrl('SleekFin/Hero/Settings'),
    dataType: 'json',
  }).then(normalizeSettings);
}

function itemQuery(client, options) {
  const query = Object.assign({}, options, {
    EnableTotalRecordCount: false,
    Fields: ITEM_FIELDS,
    Limit: 10,
    Recursive: true,
  });
  return client.getItems(client.getCurrentUserId(), query).then((result) => result.Items || []);
}

function loadSource(client, source) {
  switch (source) {
    case 'ContinueWatching':
      return itemQuery(client, {
        Filters: 'IsResumable',
        IncludeItemTypes: 'Movie,Episode',
        SortBy: 'DatePlayed',
        SortOrder: 'Descending',
      });
    case 'NextUp':
      return client
        .getNextUpEpisodes({
          EnableTotalRecordCount: false,
          Fields: ITEM_FIELDS,
          Limit: 10,
          UserId: client.getCurrentUserId(),
        })
        .then((result) => result.Items || []);
    case 'LatestMovies':
      return itemQuery(client, {
        IncludeItemTypes: 'Movie',
        SortBy: 'DateCreated',
        SortOrder: 'Descending',
      });
    case 'LatestShows':
      return itemQuery(client, {
        IncludeItemTypes: 'Series',
        SortBy: 'DateCreated',
        SortOrder: 'Descending',
      });
    case 'Favorites':
      return itemQuery(client, {
        Filters: 'IsFavorite',
        IncludeItemTypes: 'Movie,Series',
        SortBy: 'SortName',
        SortOrder: 'Ascending',
      });
  }
}

function shuffle(items) {
  const shuffled = items.slice();
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    const value = shuffled[index];
    shuffled[index] = shuffled[randomIndex];
    shuffled[randomIndex] = value;
  }
  return shuffled;
}

function collect(client, settings) {
  return Promise.all(settings.contentOrder.map((source) => loadSource(client, source).catch(() => []))).then((sources) => {
    const seen = new Set();
    const items = [];
    sources.forEach((sourceItems) => {
      sourceItems.forEach((item) => {
        const identity = item.Type === 'Episode' && item.SeriesId ? item.SeriesId : item.Id;
        if (identity && !seen.has(identity)) {
          seen.add(identity);
          items.push(item);
        }
      });
    });
    return (settings.randomized ? shuffle(items) : items).slice(0, settings.slidesShown);
  });
}

function prepare(client, item) {
  const displayPromise = item.Type === 'Episode' && item.SeriesId ? client.getItem(client.getCurrentUserId(), item.SeriesId).catch(() => item) : Promise.resolve(item);
  return displayPromise.then((displayItem) => ({ display: displayItem, play: item }));
}

export function loadEntries(client, settings) {
  if (!settings.contentOrder.length) return Promise.resolve([]);
  return collect(client, settings).then((items) => Promise.all(items.map((item) => prepare(client, item))));
}
