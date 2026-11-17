import { Fragment, h } from 'preact';

export function SectionHeading({ title, subtitle, contentsOnly }) {
  const contents = (
    <Fragment>
      <span class="ue-section-rail" />
      <div class="ue-section-copy">
        {typeof title === 'string' ? <h2 class="ue-section-title">{title}</h2> : title}
        {subtitle && (typeof subtitle === 'string' ? <p class="ue-section-subtitle">{subtitle}</p> : subtitle)}
      </div>
    </Fragment>
  );

  return contentsOnly ? contents : <div class="ue-section-heading">{contents}</div>;
}
