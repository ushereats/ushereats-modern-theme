import { dom } from '../../shared/runtime.js';
import { syncAvatar } from './avatar.js';
import { applyIcon } from './FallbackBrand.jsx';
import { createHeaderProxy, needsProxyReplacement, refreshHeaderProxy } from './proxy.js';
import { settingsSignature } from './settings.js';
import { applySettings, cleanup as cleanupShared, createMount, directChildren, layoutMode, mark, updateScrolledState } from './shared.js';

function updateActiveControls(mount) {
  const links = mount.header.querySelectorAll('[data-ue-header-segment] a[href]:not([data-ue-header-brand])');
  links.forEach((link) => {
    const href = link.getAttribute('href') || '';
    mark(mount, link, 'data-ue-current', href && window.location.href.includes(href) ? 'true' : 'false');
  });
  mount.header.querySelectorAll('button[id*="-link-"]').forEach((button) => {
    const tab = document.getElementById(button.id.replace('-link-', '-btn-'));
    mark(mount, button, 'data-ue-current', tab?.classList.contains('emby-tab-button-active') ? 'true' : 'false');
  });
}

function findParts(toolbar) {
  const children = directChildren(toolbar);
  const menu = children.find((element) => element.matches('button') && Boolean(element.querySelector('svg[data-testid="MenuIcon"]'))) || null;
  const nav = children.find((element) => element.classList.contains('MuiStack-root')) || null;
  const brand =
    nav &&
    Array.from(nav.querySelectorAll('a[href]')).find((link) => {
      const href = link.getAttribute('href') || '';
      return href === '#/' || /#\/$/.test(href);
    });
  const boxes = children.filter((element) => element.classList.contains('MuiBox-root'));
  const profile = boxes.find((box) => Boolean(box.querySelector('button[aria-controls="app-user-menu"]'))) || null;
  const actions = boxes.find((box) => box !== profile && Boolean(box.querySelector('button, a[href]'))) || null;
  return { actions, brand, menu, nav, profile };
}

function scheduleMeasurement(mount) {
  if (!mount.active || mount.animationFrame) return;

  mount.animationFrame = window.requestAnimationFrame(() => {
    mount.animationFrame = 0;
    if (!mount.active || !dom.isConnected(mount.toolbar)) return;
    if (mount.layoutMode === 'compact') {
      mark(mount, mount.toolbar, 'data-ue-header-measured', 'false');
      return;
    }
    const candidates = mount.clusterItems.filter((element) => dom.isVisible(element) && element.getAttribute('data-ue-header-all-proxied') !== 'true');
    if (!candidates.length) {
      mark(mount, mount.toolbar, 'data-ue-header-measured', 'false');
      return;
    }

    const toolbarRect = mount.toolbar.getBoundingClientRect();
    const firstRect = candidates[0].getBoundingClientRect();
    const lastRect = candidates[candidates.length - 1].getBoundingClientRect();
    const left = firstRect.left - toolbarRect.left;
    const width = lastRect.right - toolbarRect.left - left;
    if (!Number.isFinite(left) || !Number.isFinite(width)) {
      mark(mount, mount.toolbar, 'data-ue-header-measured', 'false');
      return;
    }

    const nextLeft = `${Math.round(left)}px`;
    const nextWidth = `${Math.max(40, Math.round(width))}px`;
    if (mount.lastMeasurement?.left !== nextLeft) {
      mount.toolbar.style.setProperty('--ue-header-pill-left', nextLeft);
    }
    if (mount.lastMeasurement?.width !== nextWidth) {
      mount.toolbar.style.setProperty('--ue-header-pill-width', nextWidth);
    }
    mount.lastMeasurement = { left: nextLeft, width: nextWidth };
    mark(mount, mount.toolbar, 'data-ue-header-measured', 'true');
  });
}

export function createModernAdapter(brand) {
  function mount(header, settings) {
    const toolbar = header.querySelector('.MuiToolbar-root');
    const parts = findParts(toolbar);
    const headerMount = createMount({
      actions: parts.actions,
      brand: parts.brand,
      clusterItems: [],
      header,
      kind: 'modern',
      layoutMode: layoutMode(),
      menu: parts.menu,
      nav: parts.nav,
      navLinkCount: parts.nav ? parts.nav.querySelectorAll('a[href]').length : 0,
      profile: parts.profile,
      settingsSignature: settingsSignature(settings),
      toolbar,
    });

    applySettings(headerMount, settings);
    mark(headerMount, header, 'data-ue-header', 'modern');
    mark(headerMount, toolbar, 'data-ue-header-toolbar');
    if (parts.brand) {
      brand.useNative(headerMount, parts.brand);
    } else if (parts.menu) {
      brand.ensureFallback();
    }
    if (parts.nav) {
      mark(headerMount, parts.nav, 'data-ue-header-segment');
      mark(headerMount, parts.nav, 'data-ue-header-nav');
      parts.nav.querySelectorAll('a[href]').forEach((link) => {
        if (link !== parts.brand) {
          mark(headerMount, link, 'data-ue-header-link');
        }
      });
    }
    if (parts.actions) {
      mark(headerMount, parts.actions, 'data-ue-header-segment');
      mark(headerMount, parts.actions, 'data-ue-header-actions');
    }
    if (parts.profile) {
      mark(headerMount, parts.profile, 'data-ue-header-segment');
      mark(headerMount, parts.profile, 'data-ue-header-profile');
    }

    headerMount.proxy = createHeaderProxy(headerMount, toolbar, parts.actions || parts.profile, settings);
    headerMount.updateBrandOverlap = () => brand.updateOverlap(headerMount);
    headerMount.clusterItems = headerMount.proxy
      ? [parts.nav, headerMount.proxy, parts.actions, parts.profile].filter(Boolean)
      : directChildren(toolbar).filter((child) => child === parts.actions || child === parts.profile || (child === parts.nav && headerMount.layoutMode === 'desktop'));
    mark(headerMount, headerMount.clusterItems[0], 'data-ue-header-first-cluster');
    mark(headerMount, headerMount.clusterItems[headerMount.clusterItems.length - 1], 'data-ue-header-last-cluster');
    syncAvatar(header);
    if (typeof window.ResizeObserver === 'function') {
      headerMount.resizeObserver = new window.ResizeObserver(() => scheduleMeasurement(headerMount));
      headerMount.resizeObserver.observe(toolbar);
    }
    return headerMount;
  }

  function needsReplacement(mount, surface, settings) {
    if (mount.header !== surface.header || !dom.isConnected(mount.toolbar) || !mount.toolbar.hasAttribute('data-ue-header-toolbar')) return true;
    if (mount.layoutMode !== layoutMode()) return true;
    if (mount.settingsSignature !== settingsSignature(settings) || needsProxyReplacement(mount, settings)) return true;

    const parts = findParts(mount.toolbar);
    return (
      mount.actions !== parts.actions ||
      mount.brand !== parts.brand ||
      mount.menu !== parts.menu ||
      mount.nav !== parts.nav ||
      mount.profile !== parts.profile ||
      mount.navLinkCount !== (parts.nav ? parts.nav.querySelectorAll('a[href]').length : 0) ||
      mount.clusterItems.some((element) => !dom.isConnected(element))
    );
  }

  function refresh(mount) {
    applyIcon(mount.brand);
    syncAvatar(mount.header);
    updateScrolledState(mount);
    brand.updateOffset(mount);
    updateActiveControls(mount);
    refreshHeaderProxy(mount);
    scheduleMeasurement(mount);
  }

  function cleanup(mount) {
    cleanupShared(mount);
    mount.toolbar.style.removeProperty('--ue-header-pill-left');
    mount.toolbar.style.removeProperty('--ue-header-pill-width');
  }

  return { cleanup, mount, needsReplacement, refresh };
}
