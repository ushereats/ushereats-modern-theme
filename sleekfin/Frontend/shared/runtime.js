const runtime = window.SleekFinRuntime;

if (!runtime) {
  throw new Error('SleekFin runtime must load before feature bundles.');
}

export const Fragment = runtime.Fragment;
export const h = runtime.h;
export const render = runtime.render;
export const useEffect = runtime.hooks.useEffect;
export const useMemo = runtime.hooks.useMemo;
export const useRef = runtime.hooks.useRef;
export const useState = runtime.hooks.useState;
export const dom = runtime.dom;
export const item = runtime.item;
export const Button = runtime.components.Button;
export const decorateNativeButton = runtime.components.decorateNativeButton;
export const Facts = runtime.components.Facts;
export const Icon = runtime.components.Icon;
export const IconButton = runtime.components.IconButton;
export const Meta = runtime.components.Meta;
export const SectionHeading = runtime.components.SectionHeading;
export const restoreNativeButton = runtime.components.restoreNativeButton;
