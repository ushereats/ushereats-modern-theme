import { Icon } from './Icon.jsx';
import { h } from 'preact';

export function Meta({ values }) {
  const visibleValues = (values || []).filter((value) => value?.text);
  return visibleValues.map((value, index) => (
    <span class="sleekfin-meta-item" key={`${value.text}-${index}`}>
      {index > 0 && <span class="sleekfin-meta-separator">·</span>}
      <span class={`sleekfin-meta-content${value.accent ? ' sleekfin-meta-accent' : ''}`}>
        {value.icon && <Icon name={value.icon} />}
        {String(value.text)}
      </span>
    </span>
  ));
}
