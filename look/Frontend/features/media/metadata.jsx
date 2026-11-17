import { dom, h, item, Meta, render } from '../../shared/runtime.js';

function facts(mediaItem, type, original) {
  const values = [];
  const score = Number(mediaItem?.CommunityRating || 0);
  const episode = mediaItem?.ParentIndexNumber && mediaItem?.IndexNumber ? `S${mediaItem.ParentIndexNumber}:E${mediaItem.IndexNumber}` : '';
  const date = /^\d{4}(?:\s*-\s*(?:\d{4}|Present))?$/.test(original) ? original : item.year(mediaItem);
  const fallback = item.formatRuntime(mediaItem?.RunTimeTicks) || mediaItem?.OfficialRating || mediaItem?.Status || '';

  if (score > 0) {
    values.push({ accent: true, icon: 'star', text: score.toFixed(1) });
  }
  if (type === 'Episode' && episode) {
    values.push({ text: episode });
  } else if (date) {
    values.push({ text: date });
  }
  if (values.length < 2 && fallback) {
    values.push({ text: fallback });
  }
  values.push({ text: item.typeLabel(type) });
  return values.slice(0, 3);
}

function unmountMetadata(element) {
  render(null, element);
  element.remove();
}

export function cleanupMetadata(scope = document) {
  scope.querySelectorAll('[data-ue-media-meta]').forEach(unmountMetadata);
  scope.querySelectorAll('.ue-media-meta-source').forEach((element) => {
    element.classList.remove('ue-media-meta-source');
  });
}

export function cleanupInactiveMetadata(activeCards) {
  document.querySelectorAll('[data-ue-media-meta], .ue-media-meta-source').forEach((element) => {
    const card = element.closest('.card');
    if (!card || !activeCards.has(card)) {
      if (element.matches('[data-ue-media-meta]')) {
        unmountMetadata(element);
      } else {
        element.classList.remove('ue-media-meta-source');
      }
    }
  });
}

function sourceElement(card) {
  return Array.from(card.querySelectorAll('.cardText-secondary')).find((element) => !element.hasAttribute('data-ue-media-meta')) || null;
}

function metadataElement(card, source) {
  let element = card.querySelector('[data-ue-media-meta]');
  if (!element) {
    element = document.createElement('div');
    element.className = 'cardText cardText-secondary ue-meta';
    element.dataset.ueMediaMeta = 'true';
  }
  element.classList.add('ue-meta');

  card.querySelectorAll('.ue-media-meta-source').forEach((candidate) => {
    if (candidate !== source) {
      candidate.classList.remove('ue-media-meta-source');
    }
  });
  if (source) {
    source.classList.add('ue-media-meta-source');
    if (element.previousElementSibling !== source) {
      dom.insertAfter(source, element);
    }
  } else if (!dom.isConnected(element)) {
    const title = card.querySelector('.cardText-first');
    if (title) {
      dom.insertAfter(title, element);
    }
  }
  return element;
}

// Ushereats: rows that show titles (Continue Watching) show only "S1 · E1" for episodes, the year for films.
function shortFacts(mediaItem, type, original) {
  if (type === 'Episode' && mediaItem?.ParentIndexNumber != null && mediaItem?.IndexNumber != null) {
    return [{ text: `S${mediaItem.ParentIndexNumber} \u00b7 E${mediaItem.IndexNumber}` }];
  }
  const year = /^\d{4}(?:\s*-\s*(?:\d{4}|Present))?$/.test(original) ? original : item.year(mediaItem);
  return year ? [{ text: String(year).slice(0, 4) }] : [];
}

export function renderMetadata(card, mediaItem) {
  const type = mediaItem?.Type || card.dataset.type || '';
  if (!item.typeLabel(type) || type === 'CollectionFolder') {
    cleanupMetadata(card);
    return;
  }

  const source = sourceElement(card);
  const element = metadataElement(card, source);
  if (!dom.isConnected(element)) return;

  const original = source?.textContent.trim() || '';
  render(<Meta values={card.closest('.show-card-titles') ? shortFacts(mediaItem, type, original) : facts(mediaItem, type, original)} />, element);
}
