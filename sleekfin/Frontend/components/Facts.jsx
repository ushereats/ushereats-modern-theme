import { Icon } from './Icon.jsx';
import { Fragment, h } from 'preact';

export function Facts({ values }) {
  const visibleValues = (values || []).filter((value) => value?.text);
  return visibleValues.map((value, index) => (
    <Fragment key={`${value.text}-${index}`}>
      {index > 0 && <span class="sleekfin-fact-dot">·</span>}
      <span class={`sleekfin-fact${value.className ? ` ${value.className}` : ''}`}>
        {value.icon && <Icon name={value.icon} />}
        {String(value.text)}
      </span>
    </Fragment>
  ));
}
