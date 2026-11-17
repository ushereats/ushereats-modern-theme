import { Icon } from './Icon.jsx';
import { h } from 'preact';

export function Meta({ values }) {
  const visibleValues = (values || []).filter((value) => value?.text);
  return visibleValues.map((value, index) => (
    <span class="ue-meta-item" key={`${value.text}-${index}`}>
      {index > 0 && <span class="ue-meta-separator">·</span>}
      <span class={`ue-meta-content${value.accent ? ' ue-meta-accent' : ''}`}>
        {value.icon && <Icon name={value.icon} />}
        {String(value.text)}
      </span>
    </span>
  ));
}
