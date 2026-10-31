// Your picture (or initial) at the right of the header, and the user menu it opens.
// Drawn by the header itself from a saved copy of your user, so it is there on the very first frame;
// the saved copy is refreshed in the background.

const ID = 'tb-header-avatar';
const HEAD = 'tb-um-head';
const CACHE = 'tb-user:';

const LETTER = (() => {
  try {
    return new RegExp('[\\p{L}\\p{N}]', 'u');
  } catch (error) {
    return /[0-9A-Za-zÀ-ɏͰ-ϿЀ-ӿ֐-ۿऀ-෿぀-ヿ㐀-鿿가-힯]/;
  }
})();

let refreshing = '';
let refreshedAt = 0;

function currentUserId() {
  try {
    const id = window.ApiClient?.getCurrentUserId?.();
    if (id) return id;
  } catch (error) {}
  try {
    const credentials = JSON.parse(window.localStorage.getItem('jellyfin_credentials') || '{}');
    const server = (credentials.Servers || []).find((entry) => entry.UserId && entry.AccessToken);
    return server ? server.UserId : '';
  } catch (error) {
    return '';
  }
}

function readCache(userId) {
  try {
    return JSON.parse(window.localStorage.getItem(CACHE + userId) || 'null');
  } catch (error) {
    return null;
  }
}

function writeCache(userId, user) {
  try {
    window.localStorage.setItem(CACHE + userId, JSON.stringify(user));
  } catch (error) {}
}

function apiUrl(path, query) {
  try {
    if (window.ApiClient?.getUrl) return window.ApiClient.getUrl(path, query);
  } catch (error) {}
  const url = new URL('../' + path, document.baseURI);
  Object.keys(query || {}).forEach((key) => url.searchParams.set(key, query[key]));
  return url.toString();
}

function hue(text) {
  let value = 0;
  for (let index = 0; index < text.length; index += 1) value = (value * 31 + text.charCodeAt(index)) >>> 0;
  return value % 360;
}

function initialOf(name) {
  return Array.from((name || '').trim()).find((character) => LETTER.test(character)) || '?';
}

function isVideoPage() {
  return /^#\/?video/i.test(window.location.hash);
}

function picture(userId, user, size) {
  if (user.tag) {
    const image = document.createElement('img');
    image.alt = '';
    image.src = apiUrl(`Users/${userId}/Images/Primary`, { tag: user.tag, quality: 90, maxHeight: size });
    return image;
  }
  return null;
}

function modeOf(userId, user) {
  return user.tag ? `img:${userId}:${user.tag}` : `txt:${initialOf(user.name)}:${user.name}`;
}

function draw(header, userId, user) {
  const mode = modeOf(userId, user);
  let element = document.getElementById(ID);
  if (element && element.parentElement === header && element.dataset.mode === mode) return;
  element?.remove();

  // a real button with Jellyfin's "focusable" class, so TV remotes and controllers reach it
  element = document.createElement('button');
  element.id = ID;
  element.type = 'button';
  element.className = 'focusable';
  element.title = 'Profile';
  element.setAttribute('aria-label', 'User menu');
  element.dataset.mode = mode;
  element.addEventListener('click', openMenu);

  const image = picture(userId, user, 96);
  if (image) {
    image.onerror = () => draw(header, userId, { name: user.name, admin: user.admin });
    element.appendChild(image);
  } else {
    const letter = document.createElement('span');
    letter.className = 'tb-av-initial';
    letter.textContent = initialOf(user.name);
    element.style.background = `hsl(${hue(user.name || userId)}, 45%, 38%)`;
    element.appendChild(letter);
  }
  header.appendChild(element);
}

function refresh(header, userId) {
  const now = Date.now();
  if (refreshing === userId && now - refreshedAt < 10000) return;
  refreshing = userId;
  refreshedAt = now;
  const request = window.tbShared?.user ? window.tbShared.user() : window.ApiClient?.getUser?.(userId);
  if (!request || typeof request.then !== 'function') {
    refreshing = '';
    return;
  }
  request
    .then((answer) => {
      if (!answer || answer.Id !== userId) return;
      const user = { name: answer.Name || '', tag: answer.PrimaryImageTag || '', admin: Boolean(answer.Policy?.IsAdministrator) };
      const before = readCache(userId);
      writeCache(userId, user);
      if (!before || before.name !== user.name || before.tag !== user.tag) {
        if (header.isConnected) draw(header, userId, user);
      }
    })
    .catch(() => {
      refreshing = '';
    });
}

/** Puts the avatar in the header (called whenever the header is built or checked). */
export function syncAvatar(header) {
  const existing = document.getElementById(ID);
  if (!header || isVideoPage()) {
    existing?.remove();
    return;
  }
  const userId = currentUserId();
  if (!userId) {
    existing?.remove();
    return;
  }
  const user = readCache(userId);
  if (user) draw(header, userId, user);
  refresh(header, userId);
}

export function removeAvatar() {
  document.getElementById(ID)?.remove();
}

// ── the menu ──

function nativeMenuButton() {
  const selectors = ['[data-sleekfin-header-profile] button', "button[aria-controls='app-user-menu']", "button[aria-label='User Menu']", '.headerUserButton'];
  for (const selector of selectors) {
    const button = document.querySelector(selector);
    if (button && button.id !== ID) return button;
  }
  return null;
}

function menuHead(userId, user) {
  const head = document.createElement('div');
  head.className = HEAD;
  head.setAttribute('aria-hidden', 'true');
  let pic = picture(userId, user, 120);
  if (pic) {
    pic.className = 'tb-um-pic';
  } else {
    pic = document.createElement('div');
    pic.className = 'tb-um-pic tb-um-initial';
    pic.textContent = initialOf(user.name).toUpperCase();
    pic.style.background = `hsl(${hue(user.name || userId)}, 45%, 38%)`;
  }
  const text = document.createElement('div');
  text.className = 'tb-um-text';
  const name = document.createElement('div');
  name.className = 'tb-um-name';
  name.textContent = user.name;
  const sub = document.createElement('div');
  sub.className = 'tb-um-sub';
  sub.textContent = user.admin ? 'Administrator' : 'Signed in';
  text.append(name, sub);
  head.append(pic, text);
  return head;
}

// puts your picture and name on top of the opened menu
function placeMenu(tries) {
  const avatar = document.getElementById(ID);
  const paper = document.querySelector('#app-user-menu .MuiPaper-root');
  if (!avatar || !paper || !paper.offsetWidth) {
    if (tries > 0) window.requestAnimationFrame(() => placeMenu(tries - 1));
    return;
  }
  const userId = currentUserId();
  const user = readCache(userId);
  if (user && !paper.querySelector(`.${HEAD}`)) paper.insertBefore(menuHead(userId, user), paper.firstChild);
  // (where it opens, under the avatar, is set in the stylesheet: Jellyfin's own positioning can't move it)
}

function openMenu(event) {
  event.preventDefault();
  event.stopPropagation();
  const button = nativeMenuButton();
  if (!button) {
    window.location.hash = '#/mypreferencesmenu';
    return;
  }
  button.click();
  placeMenu(30);
}
