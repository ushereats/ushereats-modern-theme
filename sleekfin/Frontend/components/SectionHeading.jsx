import { Fragment, h } from 'preact';

export function SectionHeading({ title, subtitle, contentsOnly }) {
  const contents = (
    <Fragment>
      <span class="sleekfin-section-rail" />
      <div class="sleekfin-section-copy">
        {typeof title === 'string' ? <h2 class="sleekfin-section-title">{title}</h2> : title}
        {subtitle && (typeof subtitle === 'string' ? <p class="sleekfin-section-subtitle">{subtitle}</p> : subtitle)}
      </div>
    </Fragment>
  );

  return contentsOnly ? contents : <div class="sleekfin-section-heading">{contents}</div>;
}
