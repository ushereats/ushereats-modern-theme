import { h } from '../../shared/runtime.js';
import { DEFAULT_SETTINGS, SETTING_DEFINITIONS } from '../details/settings.js';

const DEFINITIONS = {};
SETTING_DEFINITIONS.forEach((definition) => { DEFINITIONS[definition.key] = definition; });
const SECTIONS = [
  { title: 'Layout & spacing', groups: [
    { keys: ['desktopHeight', 'mobileHeight', 'mobileMinHeight'], columns: 3 },
    { keys: ['contentAlignment'], standalone: true },
    { keys: ['verticalAlignment'], standalone: true },
    { keys: ['desktopSideInset', 'mobileSideInset'], columns: 2 },
    { keys: ['desktopBottomSpacing', 'mobileBottomSpacing'], columns: 2 },
    { keys: ['contentMaxWidth', 'buttonGroupSpacing'], columns: 2 },
    { keys: ['titleMetadataSpacing', 'metadataGenresSpacing', 'genresDescriptionSpacing', 'descriptionButtonSpacing'], columns: 4 },
  ] },
  { title: 'Artwork & trailer', groups: [
    { keys: ['backdropFit'], standalone: true },
    { keys: ['backdropFocusX', 'backdropFocusY', 'backdropOpacity'], columns: 3 },
    { keys: ['sideShading', 'bottomFade', 'fadeHeight', 'backdropBlur'], columns: 4 },
    { keys: ['trailerBackgroundEnabled'], standalone: true },
    { keys: ['trailerStartDelaySeconds', 'trailerAudio', 'trailerEndBehavior'], columns: 3 },
    { keys: ['backdropPauseEnabled'], standalone: true },
  ] },
  { title: 'Title & logo', groups: [
    { keys: ['titleTreatment'], standalone: true },
    { keys: ['showTitle'], standalone: true },
    { keys: ['desktopLogoMaxWidth', 'mobileLogoMaxWidth', 'desktopLogoHeight', 'mobileLogoHeight'], columns: 4 },
    { keys: ['desktopTitleSize', 'mobileTitleSize', 'titleWeight'], columns: 3 },
    { keys: ['titleCase'], standalone: true },
    { keys: ['titleColor', 'titleLineHeight', 'titleLetterSpacing', 'titleShadow'], columns: 4 },
    { keys: ['originalTitleMode'], standalone: true },
    { keys: ['originalTitleSize', 'originalTitleColor'], columns: 2 },
    { keys: ['showParentTitle'], standalone: true },
    { keys: ['parentTitleSize', 'parentTitleColor'], columns: 2 },
    { keys: ['desktopChildHeadingSize', 'mobileChildHeadingSize'], columns: 2 },
    { keys: ['childHeadingWeight', 'childHeadingLines', 'childHeadingColor'], columns: 3 },
  ] },
  { title: 'Metadata & description', groups: [
    { keys: ['showRating', 'showYear', 'showRuntime', 'showCertification', 'showAudioLanguages', 'showGenres'], columns: 2, inline: true },
    { keys: ['desktopMetadataSize', 'mobileMetadataSize', 'metadataWeight'], columns: 3 },
    { keys: ['metadataColor', 'ratingColor', 'genresColor'], columns: 3 },
    { keys: ['factSeparator'], standalone: true },
    { keys: ['showDescription'], standalone: true },
    { keys: ['desktopDescriptionSize', 'mobileDescriptionSize', 'descriptionWidth'], columns: 3 },
    { keys: ['descriptionLines', 'descriptionColor', 'descriptionWeight', 'descriptionLineHeight'], columns: 4 },
    { keys: ['descriptionExpandEnabled'], standalone: true },
  ] },
  { title: 'Button appearance', groups: [
    { keys: ['desktopButtonHeight', 'mobileButtonHeight', 'buttonSpacing'], columns: 3 },
    { keys: ['buttonContent'], standalone: true },
    { keys: ['buttonCornerStyle', 'iconButtonCornerStyle'], columns: 2 },
    { keys: ['primaryButtonBackgroundColor', 'primaryButtonTextColor', 'primaryButtonOpacity'], columns: 3 },
    { keys: ['secondaryButtonBackgroundColor', 'secondaryButtonTextColor', 'secondaryButtonOpacity'], columns: 3 },
    { keys: ['desktopPlayIconSize', 'mobilePlayIconSize'], columns: 2 },
    { keys: ['buttonBlur', 'controlIconSize', 'externalIconSize'], columns: 3 },
    { keys: ['buttonHoverOpacity', 'buttonHoverLift', 'buttonActiveColor'], columns: 3 },
    { keys: ['mobileActionGroups', 'buttonOverflow'], columns: 2 },
  ] },
  { title: 'Info & menus', groups: [
    { keys: ['dropdownStyle'], standalone: true },
    { keys: ['infoPanelMaxWidth'], columns: 1 },
    { keys: ['showVersionPicker', 'showVideoDetails', 'showAudioPicker', 'showSubtitlePicker', 'showItemMetadata', 'showExternalLinks'], columns: 2, inline: true },
  ] },
];

const HEX_COLOR = /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i;
const FUNCTIONAL_COLOR = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*(\d+(?:\.\d*)?|\.\d+))?\s*\)$/i;

function fieldId(definition) {
  return `ueTheme${definition.property}${['dropdownStyle', 'trailerBackgroundEnabled'].includes(definition.key) ? 'Builder' : ''}`;
}

function validColor(value) {
  const candidate = value.trim();
  if (['theme accent', 'theme muted', 'transparent'].includes(candidate.toLowerCase()) || HEX_COLOR.test(candidate)) return true;
  const match = FUNCTIONAL_COLOR.exec(candidate);
  return Boolean(match && match.slice(1, 4).every((component) => Number(component) <= 255) && (match[4] === undefined ? /^rgb\(/i.test(candidate) : /^rgba\(/i.test(candidate) && Number(match[4]) <= 1));
}

function validateField(input, definition) {
  let message = '';
  if (definition.type === 'color' && !validColor(input.value)) message = 'Enter a hex, rgb or rgba color, transparent, Theme accent, or Theme muted.';
  if (definition.type === 'autoLength') {
    const candidate = input.value.trim();
    const numeric = /^[+\-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(candidate) ? Number(candidate) : NaN;
    if (candidate.toLowerCase() !== 'auto' && (!Number.isFinite(numeric) || numeric < definition.min || numeric > definition.max)) message = `Enter Auto or a number from ${definition.min} to ${definition.max}.`;
  }
  input.setCustomValidity(message);
}

function revealField(event) {
  const details = event.currentTarget.closest('details');
  if (details) details.open = true;
}

function colorHex(value, fallback) {
  let candidate = String(value || '').trim();
  if (/^theme (accent|muted)$/i.test(candidate)) {
    const variable = candidate.toLowerCase() === 'theme accent' ? '--ue-accent' : '--ue-muted';
    candidate = window.getComputedStyle(document.getElementById('ueThemeDetailsBuilder') || document.documentElement).getPropertyValue(variable).trim() || (variable === '--ue-accent' ? '#dc2626' : '#969aa1');
  }
  if (HEX_COLOR.test(candidate)) {
    let hex = candidate.slice(1);
    if (hex.length <= 4) hex = hex.slice(0, 3).split('').map((digit) => digit + digit).join('');
    return `#${hex.slice(0, 6)}`;
  }
  const match = FUNCTIONAL_COLOR.exec(candidate);
  if (match && match.slice(1, 4).every((component) => Number(component) <= 255)) return `#${match.slice(1, 4).map((component) => Number(component).toString(16).padStart(2, '0')).join('')}`;
  return fallback && candidate !== fallback ? colorHex(fallback) : '#000000';
}

function ChoiceField({ definition, value, onChange }) {
  const id = fieldId(definition);
  const options = definition.type === 'boolean' ? [{ label: 'Off', value: false }, { label: 'On', value: true }] : definition.options;
  return <div class="ue-choice-group">{options.map((option) => <label class="ue-choice" key={String(option.value)}><input id={`${id}${String(option.value)}`} type="radio" name={id} value={String(option.value)} checked={value === option.value} onChange={() => onChange(definition.key, option.value)} /><span>{option.label}</span></label>)}</div>;
}

function ValueField({ definition, value, onChange }) {
  const id = fieldId(definition);
  const change = (event) => {
    validateField(event.currentTarget, definition);
    onChange(definition.key, event.currentTarget.value);
  };
  if (definition.type === 'weight') return <select id={id} class="ue-input ue-hero-setting-control" data-ue-details-field={definition.key} value={value} onChange={change} onInvalid={revealField}>{[100, 200, 300, 400, 500, 600, 700, 800, 900].map((weight) => <option value={weight} key={weight}>{weight}</option>)}</select>;
  if (definition.type === 'integer' || definition.type === 'number') return <div class="ue-input ue-hero-number-field ue-hero-setting-control"><input id={id} type="number" data-ue-details-field={definition.key} min={definition.min} max={definition.max} step={definition.type === 'number' ? 'any' : '1'} required value={value} onInput={change} onInvalid={revealField} /></div>;
  if (definition.type === 'color') return <div class="ue-details-builder-color ue-hero-setting-control"><input id={id} class="ue-input" type="text" data-ue-details-field={definition.key} required value={value} ref={(input) => { if (input) validateField(input, definition); }} onInput={change} onInvalid={revealField} /><input class="ue-details-builder-color-picker" type="color" value={colorHex(value, definition.default)} onInput={(event) => onChange(definition.key, event.currentTarget.value)} /></div>;
  return <input id={id} class="ue-input ue-hero-setting-control" type="text" data-ue-details-field={definition.key} required value={value} ref={(input) => { if (input) validateField(input, definition); }} onInput={change} onInvalid={revealField} />;
}

function Field({ definition, values, onChange, inline }) {
  const value = values[definition.key] ?? DEFAULT_SETTINGS[definition.key];
  const choices = definition.type === 'boolean' || definition.type === 'option';
  return <div class={inline ? 'ue-hero-setting-row' : 'ue-hero-setting-cell'}>{choices ? <span class="ue-hero-setting-label">{definition.label}</span> : <label class="ue-hero-setting-label" for={fieldId(definition)}>{definition.label}</label>}{choices ? <ChoiceField definition={definition} value={value} onChange={onChange} /> : <ValueField definition={definition} value={value} onChange={onChange} />}</div>;
}

export function SettingsFields({ values, onChange }) {
  return <div class="ue-hero-builder-content">{SECTIONS.map((section) => <details class="ue-hero-accordion" key={section.title}><summary>{section.title}</summary><div class="ue-hero-settings">{section.groups.map((group) => group.standalone ? <Field key={group.keys[0]} definition={DEFINITIONS[group.keys[0]]} values={values} onChange={onChange} inline /> : <div class={`ue-hero-setting-grid ue-hero-setting-grid--${group.columns}${group.inline ? ' ue-details-builder-inline-grid' : ''}`} key={group.keys.join(',')}>{group.keys.map((key) => <Field key={key} definition={DEFINITIONS[key]} values={values} onChange={onChange} inline={group.inline} />)}</div>)}</div></details>)}</div>;
}

export function validateFields(root) {
  const inputs = Array.from(root.querySelectorAll('[data-ue-details-field]'));
  let firstInvalid = null;
  inputs.forEach((input) => {
    const definition = DEFINITIONS[input.dataset.ueDetailsField];
    if (!definition) return;
    validateField(input, definition);
    if (!input.checkValidity() && !firstInvalid) firstInvalid = input;
  });
  if (!firstInvalid) return true;
  const details = firstInvalid.closest('details');
  if (details) details.open = true;
  firstInvalid.reportValidity();
  return false;
}
