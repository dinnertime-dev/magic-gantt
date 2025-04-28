type SVGAttributes = {
  append_to?: HTMLElement | SVGElement;
  innerHTML?: string;
  clipPath?: string;
  [key: string]: any;
};

type AnimationOptions = {
  dur?: string;
  begin?: string;
  calcMode?: string;
  values?: string;
  keyTimes?: string;
  keySplines?: string;
};

type CubicBezierPreset = 'ease' | 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';

interface DOMUtils {
  (expr: string | Element, con?: Document | Element): Element | null;
  on: (element: Element, event: string, selector: string | Function, callback?: Function) => void;
  off: (element: Element, event: string, handler: EventListener) => void;
  bind: (element: Element, event: string, callback: EventListener) => void;
  delegate: (
    element: Element,
    event: string,
    selector: string,
    callback: (e: Event, delegatedTarget: Element) => void,
  ) => void;
  closest: (selector: string, element: Element | null) => Element | null;
  attr: (element: Element, attr: string | Record<string, any>, value?: any) => string | void;
}

const $: DOMUtils = function (expr: string | Element, con?: Document | Element): Element | null {
  return typeof expr === 'string' ? (con || document).querySelector(expr) : expr || null;
} as DOMUtils;

$.on = function (element: Element, event: string, selector: string | Function, callback?: Function): void {
  if (!callback) {
    callback = selector as Function;
    $.bind(element, event, callback as EventListener);
  } else {
    $.delegate(element, event, selector as string, callback as (e: Event, delegatedTarget: Element) => void);
  }
};

$.off = function (element: Element, event: string, handler: EventListener): void {
  element.removeEventListener(event, handler);
};

$.bind = function (element: Element, event: string, callback: EventListener): void {
  event.split(/\s+/).forEach((eventName) => {
    element.addEventListener(eventName, callback);
  });
};

$.delegate = function (
  element: Element,
  event: string,
  selector: string,
  callback: (e: Event, delegatedTarget: Element) => void,
): void {
  element.addEventListener(event, (e: Event) => {
    const delegatedTarget = (e.target as Element).closest(selector);
    if (delegatedTarget) {
      (e as any).delegatedTarget = delegatedTarget;
      callback.call(this, e, delegatedTarget);
    }
  });
};

$.closest = function (selector: string, element: Element | null): Element | null {
  if (!element) return null;

  if (element.matches(selector)) {
    return element;
  }

  return $.closest(selector, element.parentElement);
};

$.attr = function (element: Element, attr: string | Record<string, any>, value?: any): string | void {
  if (!value && typeof attr === 'string') {
    return element.getAttribute(attr) || '';
  }

  if (typeof attr === 'object') {
    for (const [key, val] of Object.entries(attr)) {
      $.attr(element, key, val);
    }
    return;
  }

  element.setAttribute(attr, value);
};

export function createSVG(tag: string, attrs: SVGAttributes): SVGElement {
  const elem = document.createElementNS('http://www.w3.org/2000/svg', tag);

  for (const [attr, value] of Object.entries(attrs)) {
    if (attr === 'append_to') {
      const parent = value as HTMLElement;
      parent.appendChild(elem);
    } else if (attr === 'innerHTML') {
      elem.innerHTML = value as string;
    } else if (attr === 'clipPath') {
      elem.setAttribute('clip-path', `url(#${value})`);
    } else {
      elem.setAttribute(attr, value as string);
    }
  }

  return elem;
}

export function animateSVG(svgElement: SVGElement, attr: string, from: string | number, to: string | number): void {
  const animatedSvgElement = getAnimationElement(svgElement, attr, from, to);

  if (animatedSvgElement === svgElement) {
    const event = new Event('click', {
      bubbles: true,
      cancelable: true,
    });
    animatedSvgElement.dispatchEvent(event);
  }
}

function getAnimationElement(
  svgElement: SVGElement,
  attr: string,
  from: string | number,
  to: string | number,
  dur = '0.4s',
  begin = '0.1s',
): SVGElement {
  const animEl = svgElement.querySelector('animate');

  if (animEl) {
    $.attr(animEl, {
      attributeName: attr,
      from,
      to,
      dur,
      begin: `click + ${begin}`,
    });
    return svgElement;
  }

  const animateElement = createSVG('animate', {
    attributeName: attr,
    from,
    to,
    dur,
    begin,
    calcMode: 'spline',
    values: `${from};${to}`,
    keyTimes: '0; 1',
    keySplines: cubic_bezier('ease-out'),
  });

  svgElement.appendChild(animateElement);
  return svgElement;
}

function cubic_bezier(name: CubicBezierPreset): string {
  const presets: Record<CubicBezierPreset, string> = {
    ease: '.25 .1 .25 1',
    linear: '0 0 1 1',
    'ease-in': '.42 0 1 1',
    'ease-out': '0 0 .58 1',
    'ease-in-out': '.42 0 .58 1',
  };

  return presets[name];
}
export { $ };
