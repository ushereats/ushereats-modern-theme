import { h, dom, item, Meta, render } from '../../shared/runtime.js';

function ratingFor(value) {
  const rating = Number(value);
  return rating > 0 ? rating.toFixed(1) : '';
}

function release(card, record) {
  render(null, record.meta);
  record.meta.remove();
}

export function createSimilar(page) {
  const records = new Map();
  const ratings = new Map();
  const years = new Map();
  let pending = false;
  let destroyed = false;

  // The cards carry no rating or production year of their own, and Jellyfin renders them from a
  // different similar-items sample than any request returns, so the values are resolved from the
  // ids actually on screen.
  function loadValues(cards) {
    const client = window.ApiClient;
    if (!client || typeof client.getItems !== 'function') return;

    const ids = cards.map((card) => card.dataset.id).filter((id) => id && !ratings.has(id));
    if (!ids.length) return;

    // Ids are claimed before the request so a reconcile during the round trip cannot start a
    // duplicate one. Both values are written when the response arrives, so the meta line is
    // rebuilt once with the year and the rating together rather than in two passes.
    ids.forEach((id) => ratings.set(id, ''));
    pending = true;
    client
      .getItems(client.getCurrentUserId(), {
        EnableTotalRecordCount: false,
        Fields: 'CommunityRating,ProductionYear',
        Ids: ids.join(','),
      })
      .then((result) => {
        if (destroyed) return;
        (result.Items || []).forEach((mediaItem) => {
          ratings.set(mediaItem.Id, ratingFor(mediaItem.CommunityRating));
          years.set(mediaItem.Id, item.year(mediaItem));
        });
      })
      .catch(() => {})
      .then(() => {
        if (destroyed) return;
        pending = false;
        renderItems();
      });
  }

  function valuesFor(card) {
    const id = card.dataset.id;
    const values = [];
    const rating = ratings.get(id);
    if (rating) {
      values.push({ accent: true, icon: 'star', text: rating });
    }
    values.push({ text: years.get(id) || '' });
    values.push({ text: item.typeLabel(card.dataset.type) });
    return values;
  }

  function renderItems() {
    const cards = Array.from(page.querySelectorAll('#similarCollapsible .card[data-id]'));
    cards.forEach((card) => {
      const cardBox = card.querySelector('.cardBox');
      if (!cardBox || !dom.isConnected(card)) return;

      let record = records.get(card);
      if (record && record.meta.parentElement !== cardBox) {
        release(card, record);
        record = null;
      }
      if (!record) {
        const meta = document.createElement('div');
        meta.className = 'sleekfin-details-similar-meta sleekfin-meta';
        cardBox.appendChild(meta);
        record = { meta, rating: '', type: '', year: '' };
        records.set(card, record);
      }

      // A card is reused in place when Jellyfin repaints the row, so the meta line is rebuilt
      // only once one of its values, including a resolved rating or year, actually changes.
      const rating = ratings.get(card.dataset.id) || '';
      const year = years.get(card.dataset.id) || '';
      if (record.rating !== rating || record.type !== card.dataset.type || record.year !== year) {
        record.rating = rating;
        record.type = card.dataset.type;
        record.year = year;
        render(<Meta values={valuesFor(card)} />, record.meta);
      }
    });

    Array.from(records.keys()).forEach((card) => {
      if (!dom.isConnected(card)) {
        release(card, records.get(card));
        records.delete(card);
      }
    });

    if (!pending) loadValues(cards);
  }

  return {
    destroy() {
      // A response that arrives after the page is gone must not repopulate these maps or render
      // into the next detail page, which would leave that page with duplicated metadata.
      destroyed = true;
      records.forEach((record, card) => release(card, record));
      records.clear();
      ratings.clear();
      years.clear();
    },
    render() {
      renderItems();
    },
  };
}
