import { h, useEffect, useRef } from '../../shared/runtime.js';
import { cloneSourceTemplate } from './inventory.js';
import { layoutMode } from './shared.js';

function OverflowItemVisual({ record }) {
  const element = useRef(null);

  useEffect(() => {
    const holder = element.current;
    if (!holder) return;

    const visual = cloneSourceTemplate(record.template);
    holder.textContent = '';
    while (visual.firstChild) holder.appendChild(visual.firstChild);
  }, [record.template]);

  return <span ref={element} data-ue-header-overflow-visual />;
}

export function HeaderOverflowDrawer({ anchor, onActivate, onClose, records }) {
  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === 'Escape') onClose();
    }

    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const bar = anchor.closest('[data-ue-header-proxy]') || anchor;
  const barBounds = bar.getBoundingClientRect();
  const compact = layoutMode() === 'compact';
  const style = compact
    ? { bottom: `${window.innerHeight - barBounds.top + 8}px`, left: `${barBounds.left}px`, width: `${barBounds.width}px` }
    : { left: `${barBounds.left}px`, top: `${barBounds.bottom + 8}px`, width: `${barBounds.width}px` };

  return (
    <div data-ue-header-overflow-layer>
      <div data-ue-header-overflow-backdrop onClick={onClose} />
      <div data-ue-header-overflow-drawer onClick={(event) => event.stopPropagation()} style={style}>
        {records.map((record, index) => {
          if (record.key === 'separator') return <div data-ue-header-overflow-separator key={`${record.key}-${index}`} />;
          if (record.key === 'space') return <div data-ue-header-overflow-space key={`${record.key}-${index}`} />;
          const iconOnly = record.template.getAttribute('data-ue-header-source-visual') === 'icon-only';
          return (
            <button
              type="button"
              data-ue-current={record.current ? 'true' : 'false'}
              data-ue-header-overflow-full={iconOnly ? 'true' : 'false'}
              data-ue-header-overflow-item={record.key}
              disabled={record.disabled}
              key={`${record.key}-${index}`}
              onClick={(event) => onActivate(record, event.currentTarget)}
            >
              <OverflowItemVisual record={record} />
              {iconOnly ? <span>{record.caption}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
