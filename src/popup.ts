import { Gantt } from './';
import { Task } from './task';

interface PopupAction {
  html: string | ((task: Task) => string);
  func: (task: Task, gantt: Gantt, event: MouseEvent) => void;
}

interface PopupElements {
  title: HTMLElement;
  subtitle: HTMLElement;
  details: HTMLElement;
  actions: HTMLElement;
}

interface PopupOptions {
  x: number;
  y: number;
  task: Task;
  target: SVGElement;
}

interface PopupFunction {
  (options: {
    task: Task;
    chart: Gantt;
    get_title: () => HTMLElement;
    set_title: (title: string) => void;
    get_subtitle: () => HTMLElement;
    set_subtitle: (subtitle: string) => void;
    get_details: () => HTMLElement;
    set_details: (details: string) => void;
    add_action: (
      html: string | ((task: Task) => string),
      func: (task: Task, gantt: Gantt, event: MouseEvent) => void,
    ) => void;
  }): string | false | void;
}

export default class Popup {
  public parent: HTMLElement;
  public popup_func: PopupFunction;
  public gantt: Gantt;
  public elements: PopupElements;

  constructor(parent: HTMLElement, popup_func: PopupFunction, gantt: Gantt) {
    this.parent = parent;
    this.popup_func = popup_func;
    this.gantt = gantt;
    this.elements = {
      title: document.createElement('div'),
      subtitle: document.createElement('div'),
      details: document.createElement('div'),
      actions: document.createElement('div'),
    };

    this.make();
  }

  private make(): void {
    this.parent.innerHTML = `
      <div class="title"></div>
      <div class="subtitle"></div>
      <div class="details"></div>
      <div class="actions"></div>
    `;
    this.hide();

    this.elements.title = this.parent.querySelector('.title') as HTMLElement;
    this.elements.subtitle = this.parent.querySelector('.subtitle') as HTMLElement;
    this.elements.details = this.parent.querySelector('.details') as HTMLElement;
    this.elements.actions = this.parent.querySelector('.actions') as HTMLElement;
  }

  public show({ x, y, task, target }: PopupOptions): void {
    this.elements.actions.innerHTML = '';

    const html = this.popup_func({
      task,
      chart: this.gantt,
      get_title: () => this.elements.title,
      set_title: (title: string) => (this.elements.title.innerHTML = title),
      get_subtitle: () => this.elements.subtitle,
      set_subtitle: (subtitle: string) => (this.elements.subtitle.innerHTML = subtitle),
      get_details: () => this.elements.details,
      set_details: (details: string) => (this.elements.details.innerHTML = details),
      add_action: (
        html: string | ((task: Task) => string),
        func: (task: Task, gantt: Gantt, event: MouseEvent) => void,
      ) => {
        const action = this.gantt.create_el({
          classes: 'action-btn',
          type: 'button',
          append_to: this.elements.actions,
        });
        const actionHtml = typeof html === 'function' ? html(task) : html;
        action.innerHTML = actionHtml;
        action.onclick = (e: MouseEvent) => func(task, this.gantt, e);
      },
    });

    if (html === false) return;
    if (typeof html === 'string') {
      this.parent.innerHTML = html;
    }

    if (this.elements.actions.innerHTML === '') {
      this.elements.actions.remove();
    } else {
      this.parent.appendChild(this.elements.actions);
    }

    this.parent.style.left = `${x + 10}px`;
    this.parent.style.top = `${y - 10}px`;
    this.parent.classList.remove('hide');
  }

  public hide(): void {
    this.parent.classList.add('hide');
  }
}
