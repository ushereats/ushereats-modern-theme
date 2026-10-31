import { Button, IconButton, decorateNativeButton, restoreNativeButton } from '../components/Button.jsx';
import { Facts } from '../components/Facts.jsx';
import { Icon } from '../components/Icon.jsx';
import { Meta } from '../components/Meta.jsx';
import { SectionHeading } from '../components/SectionHeading.jsx';
import dom from '../shared/dom.js';
import item from '../shared/item.js';
import { Fragment, h, render } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';

const runtime = {
  Fragment,
  components: { Button, Facts, Icon, IconButton, Meta, SectionHeading, decorateNativeButton, restoreNativeButton },
  dom,
  h,
  hooks: { useEffect, useMemo, useRef, useState },
  item,
  render,
};

window.SleekFinRuntime = runtime;
