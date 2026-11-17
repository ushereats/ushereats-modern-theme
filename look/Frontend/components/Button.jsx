import { Icon, setIcon } from './Icon.jsx';
import { h } from 'preact';

const decorations = new WeakMap();

function classes(...values) {
  return values.filter(Boolean).join(' ');
}

export function Button({ variant, icon, label, class: classValue, ...props }) {
  return (
    <button type="button" class={classes('ue-button', `ue-button-${variant}`, variant === 'control' && 'ue-control-3d', classValue)} {...props}>
      <Icon name={icon} />
      <span class="ue-button-label">{label}</span>
    </button>
  );
}

export function IconButton({ icon, label, raised, strokeWidth, class: classValue, ...props }) {
  return (
    <button type="button" class={classes('ue-icon-button', raised && 'ue-control-3d', classValue)} title={label} {...props}>
      <Icon name={icon} strokeWidth={strokeWidth} />
    </button>
  );
}

function setNativeContent(parent, iconName, label) {
  setIcon(parent, iconName);
  let labelElement = parent.querySelector(':scope > .ue-button-label');
  if (!labelElement) {
    labelElement = document.createElement('span');
    labelElement.className = 'ue-button-label';
    labelElement.textContent = label;
    parent.appendChild(labelElement);
  } else if (labelElement.textContent !== label) {
    labelElement.textContent = label;
  }
}

export function restoreNativeButton(element) {
  const content = decorations.get(element);
  if (!content) return;

  element.classList.remove('ue-button', 'ue-button-primary', 'ue-button-control', 'ue-control-3d');
  content.classList.remove('ue-button-content');
  content.querySelector(':scope > .ue-icon')?.remove();
  content.querySelector(':scope > .ue-button-label')?.remove();
  decorations.delete(element);
}

export function decorateNativeButton(element, options) {
  const settings = options || {};
  const content = settings.content || element;
  const current = decorations.get(element);
  if (current && current !== content) {
    restoreNativeButton(element);
  }
  if (!decorations.has(element)) {
    decorations.set(element, content);
  }

  element.classList.remove('ue-button-primary', 'ue-button-control');
  element.classList.add('ue-button', `ue-button-${settings.variant}`);
  element.classList.toggle('ue-control-3d', settings.variant === 'control');
  content.classList.add('ue-button-content');
  setNativeContent(content, settings.icon, settings.label);
}
