import date_utils, { TimeScale } from './date_utils';
import { $, createSVG } from './svg_utils';

import Arrow from './arrow';
import Bar from './bar';
import Popup from './popup';
import { Task } from './task';

import { DEFAULT_OPTIONS, DEFAULT_VIEW_MODES, ViewMode, GanttOptions } from './defaults';

type DateInfo = any;

export type GanttTask = Task;

interface GanttConfig {
  ignored_dates: Date[];
  ignored_positions: number[];
  ignored_function?: (date: Date) => boolean;
  extend_by_units: number;
  step: number;
  unit: TimeScale;
  column_width: number;
  header_height: number;
  date_format: string;
  view_mode: ViewMode;
}

interface GanttLayers {
  grid: SVGElement;
  arrow: SVGElement;
  progress: SVGElement;
  bar: SVGElement;
}

interface GanttElements {
  $container: HTMLElement;
  $svg: SVGElement;
  $popup_wrapper: HTMLElement;
  $header: HTMLElement;
  $upper_header: HTMLElement;
  $lower_header: HTMLElement;
  $side_header: HTMLElement;
  $extras: HTMLElement;
  $adjust: HTMLElement;
  $current_highlight: HTMLElement;
  $current_ball_highlight: HTMLElement;
  $current: HTMLElement;
  $today_button: HTMLElement | null;
}

export class Gantt {
  static VIEW_MODE = {
    HOUR: DEFAULT_VIEW_MODES[0],
    QUARTER_DAY: DEFAULT_VIEW_MODES[1],
    HALF_DAY: DEFAULT_VIEW_MODES[2],
    DAY: DEFAULT_VIEW_MODES[3],
    WEEK: DEFAULT_VIEW_MODES[4],
    MONTH: DEFAULT_VIEW_MODES[5],
    YEAR: DEFAULT_VIEW_MODES[6],
  };
  public $lower_header: HTMLElement | null = null;
  public $container: HTMLElement | null = null;
  public options: GanttOptions = {} as GanttOptions;
  public original_options: Partial<GanttOptions> = {} as Partial<GanttOptions>;
  public config: GanttConfig = {
    ignored_dates: [],
    ignored_positions: [],
    extend_by_units: 0,
    step: 0,
    unit: 'day',
    column_width: 0,
    header_height: 0,
    date_format: '',
    view_mode: {} as ViewMode,
  };
  public tasks: Task[] = [];
  public bars: Bar[] = [];
  public arrows: Arrow[] = [];
  public layers: GanttLayers = {
    grid: document.createElementNS('http://www.w3.org/2000/svg', 'g'),
    arrow: document.createElementNS('http://www.w3.org/2000/svg', 'g'),
    progress: document.createElementNS('http://www.w3.org/2000/svg', 'g'),
    bar: document.createElementNS('http://www.w3.org/2000/svg', 'g'),
  };
  public elements: GanttElements = {
    $container: document.createElement('div'),
    $svg: document.createElementNS('http://www.w3.org/2000/svg', 'svg'),
    $popup_wrapper: document.createElement('div'),
    $header: document.createElement('div'),
    $upper_header: document.createElement('div'),
    $lower_header: document.createElement('div'),
    $side_header: document.createElement('div'),
    $extras: document.createElement('div'),
    $adjust: document.createElement('div'),
    $current_highlight: document.createElement('div'),
    $current_ball_highlight: document.createElement('div'),
    $current: document.createElement('div'),
    $today_button: null,
  };
  public dates: Date[] = [];
  public gantt_start: Date = new Date();
  public gantt_end: Date = new Date();
  public current_date: Date = new Date();
  public upperTexts: HTMLElement[] = [];
  public dependency_map: Record<string, string[]> = {};
  public bar_being_dragged: boolean = false;
  public popup?: Popup;
  public grid_height: number = 0;

  constructor(wrapper: string | HTMLElement | SVGElement, tasks: Task[], options: Partial<GanttOptions>) {
    this.setup_wrapper(wrapper);
    this.setup_options(options);
    this.setup_tasks(tasks);
    this.change_view_mode();
    this.bind_events();
  }

  private setup_wrapper(element: string | HTMLElement | SVGElement): void {
    let svg_element: SVGElement | null = null;
    let wrapper_element: HTMLElement | null = null;

    if (typeof element === 'string') {
      const el = document.querySelector(element) as HTMLElement | SVGElement | null;
      if (!el) {
        throw new ReferenceError(`CSS selector "${element}" could not be found in DOM`);
      }
      element = el;
    }

    if (element instanceof HTMLElement) {
      wrapper_element = element;
      svg_element = element.querySelector('svg');
    } else if (element instanceof SVGElement) {
      svg_element = element;
    } else {
      throw new TypeError(
        'Frappe Gantt only supports usage of a string CSS selector,' +
          " HTML DOM element or SVG DOM element for the 'element' parameter",
      );
    }

    if (!svg_element) {
      this.elements.$svg = createSVG('svg', {
        append_to: wrapper_element!,
        class: 'gantt',
      });
    } else {
      this.elements.$svg = svg_element;
      this.elements.$svg.classList.add('gantt');
    }

    this.elements.$container = this.create_el({
      classes: 'gantt-container',
      append_to: this.elements.$svg.parentElement!,
    });

    this.elements.$container.appendChild(this.elements.$svg);
    this.elements.$popup_wrapper = this.create_el({
      classes: 'popup-wrapper',
      append_to: this.elements.$container,
    });
  }

  private setup_options(options: Partial<GanttOptions>): void {
    this.original_options = options;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    const CSS_VARIABLES = {
      'grid-height': 'container_height',
      'bar-height': 'bar_height',
      'lower-header-height': 'lower_header_height',
      'upper-header-height': 'upper_header_height',
    };

    for (const [name, setting] of Object.entries(CSS_VARIABLES)) {
      const value = this.options[setting as keyof GanttOptions];
      if (value !== 'auto') {
        this.elements.$container.style.setProperty('--gv-' + name, value + 'px');
      }
    }

    this.config = {
      ignored_dates: [],
      ignored_positions: [],
      extend_by_units: 10,
      step: 0,
      unit: 'day',
      column_width: 0,
      header_height: 0,
      date_format: '',
      view_mode: DEFAULT_VIEW_MODES[0],
    };

    if (typeof this.options.ignore !== 'function') {
      if (typeof this.options.ignore === 'string') {
        this.options.ignore = [this.options.ignore];
      }
      for (const option of this.options.ignore) {
        if (typeof option === 'function') {
          this.config.ignored_function = option;
          continue;
        }
        if (typeof option === 'string') {
          if (option === 'weekend') {
            this.config.ignored_function = (d: Date) => d.getDay() === 6 || d.getDay() === 0;
          } else {
            this.config.ignored_dates.push(new Date(option + ' '));
          }
        }
      }
    } else {
      this.config.ignored_function = this.options.ignore;
    }
  }

  update_options(options: Partial<GanttOptions>) {
    this.setup_options({ ...this.original_options, ...options });
    this.change_view_mode(undefined, true);
  }

  setup_tasks(tasks: Task[]) {
    let index = 0;

    this.tasks = tasks
      .map((task, i) => {
        if (!task.start) {
          console.error(`task "${task.id}" doesn't have a start date`);
          return false;
        }

        task._start = date_utils.parse(task.start);
        if (task.end === undefined && task.duration !== undefined) {
          task.end = task._start;
          let durations = task.duration.split(' ');

          durations.forEach((tmpDuration) => {
            let parsedDuration = date_utils.parse_duration(tmpDuration);
            if (!parsedDuration) return;

            const { duration, scale } = parsedDuration;
            task.end = date_utils.add(new Date(task.end || new Date()), duration, scale);
          });
        }
        if (!task.end) {
          console.error(`task "${task.id}" doesn't have an end date`);
          return false;
        }
        task._end = date_utils.parse(task.end);

        let diff = date_utils.diff(task._end, task._start, 'year');
        if (diff < 0) {
          console.error(`start of task can't be after end of task: in task "${task.id}"`);
          return false;
        }

        // make task invalid if duration too large
        if (date_utils.diff(task._end, task._start, 'year') > 10) {
          console.error(`the duration of task "${task.id}" is too long (above ten years)`);
          return false;
        }

        if (typeof task.group_index === 'number') {
          task._index = task.group_index;
        } else {
          task._index = index++;
        }

        // if hours is not set, assume the last day is full day
        // e.g: 2018-09-09 becomes 2018-09-09 23:59:59
        const task_end_values = date_utils.get_date_values(task._end);
        if (task_end_values.slice(3).every((d) => d === 0)) {
          task._end = date_utils.add(task._end, 24, 'hour');
        }

        // dependencies
        if (typeof task.dependencies === 'string' || !task.dependencies) {
          let deps: string[] = [];
          if (task.dependencies) {
            deps = (task.dependencies as string)
              .split(',')
              .map((d) => d.trim().replaceAll(' ', '_'))
              .filter((d) => d);
          }
          task.dependencies = deps;
        }

        // uids
        if (!task.id) {
          task.id = generate_id(task);
        } else if (typeof task.id === 'string') {
          task.id = task.id.replaceAll(' ', '_');
        } else {
          task.id = `${task.id}`;
        }

        return task;
      })
      .filter((t) => t) as Task[];
    this.setup_dependencies();
  }

  setup_dependencies() {
    this.dependency_map = {};
    for (let t of this.tasks) {
      for (let d of t?.dependencies || []) {
        this.dependency_map[d] = this.dependency_map[d] || [];
        this.dependency_map[d].push(t.id);
      }
    }
  }

  refresh(tasks: Task[]) {
    this.setup_tasks(tasks);
    this.change_view_mode();
  }

  update_task(id: string, new_details: Partial<Task>) {
    let task = this.tasks.find((t) => t.id === id);
    if (!task) return;
    let bar = this.bars[task._index!];
    Object.assign(task, new_details);
    bar.refresh();
  }

  change_view_mode(mode = this.options.view_mode, maintain_pos = false) {
    let _mode: ViewMode;
    if (typeof mode === 'string') {
      _mode = this.options.view_modes.find((d) => d.name === mode) as ViewMode;
    } else {
      _mode = mode;
    }
    let old_pos, old_scroll_op;
    if (maintain_pos) {
      old_pos = this.elements.$container.scrollLeft;
      old_scroll_op = this.options.scroll_to;
      this.options.scroll_to = null;
    }
    this.options.view_mode = _mode.name;
    this.config.view_mode = _mode;
    this.update_view_scale(_mode);
    this.setup_dates(maintain_pos);
    this.render();
    if (maintain_pos) {
      this.elements.$container.scrollLeft = old_pos || 0;
      this.options.scroll_to = old_scroll_op || null;
    }
    this.trigger_event('view_change', [mode]);
  }

  update_view_scale(mode: ViewMode) {
    let parsedDuration = date_utils.parse_duration(mode.step);
    if (!parsedDuration) return;
    const { duration, scale } = parsedDuration;
    this.config.step = duration;
    this.config.unit = scale;
    this.config.column_width = this.options.column_width || mode.column_width || 45;
    this.elements.$container.style.setProperty('--gv-column-width', this.config.column_width + 'px');
    this.config.header_height = this.options.lower_header_height + this.options.upper_header_height + 10;
  }

  setup_dates(refresh = false) {
    this.setup_gantt_dates(refresh);
    this.setup_date_values();
  }

  setup_gantt_dates(refresh: boolean) {
    let gantt_start, gantt_end;
    if (!this.tasks.length) {
      gantt_start = new Date();
      gantt_end = new Date();
    }

    for (let task of this.tasks) {
      if (!gantt_start || (task._start || new Date()) < gantt_start) {
        gantt_start = task._start || new Date();
      }
      if (!gantt_end || (task._end || new Date()) > gantt_end) {
        gantt_end = task._end || new Date();
      }
    }

    gantt_start = date_utils.start_of(gantt_start || new Date(), this.config.unit);
    gantt_end = date_utils.start_of(gantt_end || new Date(), this.config.unit);

    if (!refresh) {
      if (!this.options.infinite_padding) {
        if (typeof this.config.view_mode.padding === 'string')
          this.config.view_mode.padding = [this.config.view_mode.padding, this.config.view_mode.padding];

        let [padding_start, padding_end] = this.config.view_mode.padding.map(date_utils.parse_duration);
        this.gantt_start = date_utils.add(gantt_start, -(padding_start?.duration || 0), padding_start?.scale || 'day');
        this.gantt_end = date_utils.add(gantt_end, padding_end?.duration || 0, padding_end?.scale || 'day');
      } else {
        this.gantt_start = date_utils.add(gantt_start, -this.config.extend_by_units * 3, this.config.unit);
        this.gantt_end = date_utils.add(gantt_end, this.config.extend_by_units * 3, this.config.unit);
      }
    }
    this.config.date_format = this.config.view_mode.date_format || this.options.date_format;
    this.gantt_start.setHours(0, 0, 0, 0);
  }

  setup_date_values() {
    let cur_date = this.gantt_start;
    this.dates = [cur_date];

    while (cur_date < this.gantt_end) {
      cur_date = date_utils.add(cur_date, this.config.step, this.config.unit);
      this.dates.push(cur_date);
    }
  }

  bind_events() {
    this.bind_grid_click();
    this.bind_holiday_labels();
    this.bind_bar_events();
  }

  render() {
    this.clear();
    this.setup_layers();
    this.make_grid();
    this.make_dates();
    this.make_grid_extras();
    this.make_bars();
    this.make_arrows();
    this.map_arrows_on_bars();
    this.set_dimensions();
    this.set_scroll_position(this.options.scroll_to);
  }

  setup_layers() {
    this.layers = {} as GanttLayers;
    const layers = ['grid', 'arrow', 'progress', 'bar'] as const;
    // make group layers
    for (let layer of layers) {
      this.layers[layer] = createSVG('g', {
        class: layer,
        append_to: this.elements.$svg,
      });
    }
    this.elements.$extras = this.create_el({
      classes: 'extras',
      append_to: this.elements.$container,
    });
    this.elements.$adjust = this.create_el({
      classes: 'adjust hide',
      append_to: this.elements.$extras,
      type: 'button',
    });
    this.elements.$adjust.innerHTML = '&larr;';
  }

  make_grid() {
    this.make_grid_background();
    this.make_grid_rows();
    this.make_grid_header();
    this.make_side_header();
  }

  make_grid_extras() {
    this.make_grid_highlights();
    this.make_grid_ticks();
  }

  make_grid_background() {
    const grid_width = this.dates.length * this.config.column_width;

    const grid_height = Math.max(
      this.config.header_height +
        this.options.padding +
        (this.options.bar_height + this.options.padding) * new Set(this.tasks.map((t) => t._index)).size -
        10,
      this.options.container_height !== 'auto' ? (this.options.container_height as number) : 0,
    );

    createSVG('rect', {
      x: 0,
      y: 0,
      width: grid_width,
      height: grid_height,
      class: 'grid-background',
      append_to: this.elements.$svg,
    });

    $.attr(this.elements.$svg, {
      height: grid_height,
      width: '100%',
    });
    this.grid_height = grid_height;
    if (this.options.container_height === 'auto') this.elements.$container.style.height = grid_height + 'px';
  }

  make_grid_rows() {
    const rows_layer = createSVG('g', { append_to: this.layers.grid });

    const row_width = this.dates.length * this.config.column_width;
    const row_height = this.options.bar_height + this.options.padding;

    for (let y = this.config.header_height; y < this.grid_height; y += row_height) {
      console.log(y);
      createSVG('rect', {
        x: 0,
        y,
        width: row_width,
        height: row_height,
        class: 'grid-row',
        append_to: rows_layer,
      });
    }
  }

  make_grid_header() {
    this.elements.$header = this.create_el({
      width: this.dates.length * this.config.column_width,
      classes: 'grid-header',
      append_to: this.elements.$container,
    });

    this.elements.$upper_header = this.create_el({
      classes: 'upper-header',
      append_to: this.elements.$header,
    });
    this.elements.$lower_header = this.create_el({
      classes: 'lower-header',
      append_to: this.elements.$header,
    });
  }

  make_side_header() {
    this.elements.$side_header = this.create_el({ classes: 'side-header' });
    this.elements.$upper_header.prepend(this.elements.$side_header);

    // Create view mode change select
    if (this.options.view_mode_select) {
      const $select = document.createElement('select');
      $select.classList.add('viewmode-select');

      const $el = document.createElement('option');
      $el.selected = true;
      $el.disabled = true;
      $el.textContent = 'Mode';
      $select.appendChild($el);

      for (const mode of this.options.view_modes) {
        const $option = document.createElement('option');
        $option.value = mode.name;
        $option.textContent = mode.name;
        if (mode.name === this.config.view_mode.name) $option.selected = true;
        $select.appendChild($option);
      }

      $select.addEventListener('change', () => {
        this.change_view_mode($select.value, true);
      });
      this.elements.$side_header.appendChild($select);
    }

    // Create today button
    if (this.options.today_button) {
      let $today_button = document.createElement('button');
      $today_button.classList.add('today-button');
      $today_button.textContent = 'Today';
      $today_button.onclick = this.scroll_current.bind(this);
      this.elements.$side_header.prepend($today_button);
      this.elements.$today_button = $today_button;
    }
  }

  make_grid_ticks() {
    if (this.options.lines === 'none') return;
    let tick_x = 0;
    let tick_y = this.config.header_height;
    let tick_height = this.grid_height - this.config.header_height;

    let $lines_layer = createSVG('g', {
      class: 'lines_layer',
      append_to: this.layers.grid,
    });

    let row_y = this.config.header_height;

    const row_width = this.dates.length * this.config.column_width;
    const row_height = this.options.bar_height + this.options.padding;
    if (this.options.lines !== 'vertical') {
      for (let y = this.config.header_height; y < this.grid_height; y += row_height) {
        createSVG('line', {
          x1: 0,
          y1: row_y + row_height,
          x2: row_width,
          y2: row_y + row_height,
          class: 'row-line',
          append_to: $lines_layer,
        });
        row_y += row_height;
      }
    }
    if (this.options.lines === 'horizontal') return;

    for (let date of this.dates) {
      let tick_class = 'tick';
      if (this.config.view_mode.thick_line && this.config.view_mode.thick_line(date)) {
        tick_class += ' thick';
      }

      createSVG('path', {
        d: `M ${tick_x} ${tick_y} v ${tick_height}`,
        class: tick_class,
        append_to: this.layers.grid,
      });

      if (this.view_is('month')) {
        tick_x += (date_utils.get_days_in_month(date) * this.config.column_width) / 30;
      } else if (this.view_is('year')) {
        tick_x += (date_utils.get_days_in_year(date) * this.config.column_width) / 365;
      } else {
        tick_x += this.config.column_width;
      }
    }
  }

  highlight_holidays() {
    let labels: any = {};
    if (!this.options.holidays) return;

    for (let color in this.options.holidays) {
      let check_highlight: any = this.options.holidays[color];
      if (check_highlight === 'weekend') check_highlight = (d: Date) => d.getDay() === 0 || d.getDay() === 6;
      let extra_func;

      if (typeof check_highlight === 'object') {
        let f = check_highlight.find((k: any) => typeof k === 'function');
        if (f) {
          extra_func = f;
        }
        if (this.options.holidays.name) {
          let dateObj = new Date(check_highlight.date + ' ');
          check_highlight = (d: Date) => dateObj.getTime() === d.getTime();
          labels[dateObj as any] = check_highlight.name;
        } else {
          check_highlight = (d: Date) =>
            (this.options.holidays[color] as any)
              .filter((k: any) => typeof k !== 'function')
              .map((k: any) => {
                if (k.name) {
                  let dateObj = new Date(k.date + ' ');
                  labels[dateObj as any] = k.name;
                  return dateObj.getTime();
                }
                return new Date(k + ' ').getTime();
              })
              .includes(d.getTime());
        }
      }
      for (let d = new Date(this.gantt_start); d <= this.gantt_end; d.setDate(d.getDate() + 1)) {
        if (
          this.config.ignored_dates.find((k) => k.getTime() == d.getTime()) ||
          (this.config.ignored_function && this.config.ignored_function(d))
        )
          continue;
        if (check_highlight(d) || (extra_func && extra_func(d))) {
          const x =
            (date_utils.diff(d, this.gantt_start, this.config.unit) / this.config.step) * this.config.column_width;
          const height = this.grid_height - this.config.header_height;
          const d_formatted = date_utils.format(d, 'YYYY-MM-DD', this.options.language).replace(' ', '_');

          if (labels[d as any]) {
            let label = this.create_el({
              classes: 'holiday-label ' + 'label_' + d_formatted,
              append_to: this.elements.$extras,
            });
            label.textContent = labels[d as any];
          }
          createSVG('rect', {
            x: Math.round(x),
            y: this.config.header_height,
            width: this.config.column_width / date_utils.convert_scales(this.config.view_mode.step, 'day'),
            height,
            class: 'holiday-highlight ' + d_formatted,
            style: `fill: ${color};`,
            append_to: this.layers.grid,
          });
        }
      }
    }
  }

  /**
   * Compute the horizontal x-axis distance and associated date for the current date and view.
   *
   * @returns Object containing the x-axis distance and date of the current date, or null if the current date is out of the gantt range.
   */
  highlight_current() {
    const res = this.get_closest_date();
    if (!res) return;

    const [_, el] = res;
    el!.classList.add('current-date-highlight');

    const diff_in_units = date_utils.diff(new Date(), this.gantt_start, this.config.unit);

    const left = (diff_in_units / this.config.step) * this.config.column_width;

    this.elements.$current_highlight = this.create_el({
      top: this.config.header_height,
      left,
      height: this.grid_height - this.config.header_height,
      classes: 'current-highlight',
      append_to: this.elements.$container,
    });
    this.elements.$current_ball_highlight = this.create_el({
      top: this.config.header_height - 6,
      left: left - 2.5,
      width: 6,
      height: 6,
      classes: 'current-ball-highlight',
      append_to: this.elements.$header,
    });
  }

  make_grid_highlights() {
    this.highlight_holidays();
    this.config.ignored_positions = [];

    const height = (this.options.bar_height + this.options.padding) * this.tasks.length;
    this.layers.grid.innerHTML += `<pattern id="diagonalHatch" patternUnits="userSpaceOnUse" width="4" height="4">
          <path d="M-1,1 l2,-2
                   M0,4 l4,-4
                   M3,5 l2,-2"
                style="stroke:grey; stroke-width:0.3" />
        </pattern>`;

    for (let d = new Date(this.gantt_start); d <= this.gantt_end; d.setDate(d.getDate() + 1)) {
      if (
        !this.config.ignored_dates.find((k) => k.getTime() == d.getTime()) &&
        (!this.config.ignored_function || !this.config.ignored_function(d))
      )
        continue;
      let diff =
        date_utils.convert_scales(date_utils.diff(d, this.gantt_start) + 'd', this.config.unit) / this.config.step;

      this.config.ignored_positions.push(diff * this.config.column_width);
      createSVG('rect', {
        x: diff * this.config.column_width,
        y: this.config.header_height,
        width: this.config.column_width,
        height: height,
        class: 'ignored-bar',
        style: 'fill: url(#diagonalHatch);',
        append_to: this.elements.$svg,
      });
    }

    this.highlight_current();
  }

  create_el(options: {
    left?: number;
    top?: number;
    width?: number;
    height?: number;
    id?: string;
    classes?: string;
    append_to?: HTMLElement;
    type?: string;
  }): HTMLElement {
    const $el = document.createElement(options.type || 'div');
    if (options.classes) {
      for (const cls of options.classes.split(' ')) {
        $el.classList.add(cls);
      }
    }
    if (options.top !== undefined) $el.style.top = options.top + 'px';
    if (options.left !== undefined) $el.style.left = options.left + 'px';
    if (options.id) $el.id = options.id;
    if (options.width) $el.style.width = options.width + 'px';
    if (options.height) $el.style.height = options.height + 'px';
    if (options.append_to) options.append_to.appendChild($el);
    return $el;
  }

  make_dates() {
    this.get_dates_to_draw().forEach((date, i) => {
      if (date.lower_text) {
        let $lower_text = this.create_el({
          left: date.x,
          top: date.lower_y,
          classes: 'lower-text date_' + sanitize(date.formatted_date),
          append_to: this.elements.$lower_header,
        });
        $lower_text.innerText = date.lower_text;
      }

      if (date.upper_text) {
        let $upper_text = this.create_el({
          left: date.x,
          top: date.upper_y,
          classes: 'upper-text',
          append_to: this.elements.$upper_header,
        });
        $upper_text.innerText = date.upper_text;
      }
    });
    this.upperTexts = Array.from(this.elements.$container.querySelectorAll('.upper-text'));
  }

  get_dates_to_draw() {
    let last_date_info: DateInfo | null = null;
    const dates = this.dates.map((date, i) => {
      const d = this.get_date_info(date, last_date_info, i);
      last_date_info = d;
      return d;
    });
    return dates;
  }

  get_date_info(date: Date, last_date_info: DateInfo | null, index: number): DateInfo {
    let last_date = last_date_info ? last_date_info.date : null;

    let column_width = this.config.column_width;

    const x = last_date_info ? last_date_info.x + last_date_info.column_width : 0;

    let upper_text = this.config.view_mode.upper_text;
    let lower_text = this.config.view_mode.lower_text;

    if (!upper_text) {
      this.config.view_mode.upper_text = () => '';
    } else if (typeof upper_text === 'string') {
      this.config.view_mode.upper_text = (date) => date_utils.format(date, upper_text, this.options.language);
    }

    if (!lower_text) {
      this.config.view_mode.lower_text = () => '';
    } else if (typeof lower_text === 'string') {
      this.config.view_mode.lower_text = (date) => date_utils.format(date, lower_text, this.options.language);
    }

    return {
      date,
      formatted_date: sanitize(date_utils.format(date, this.config.date_format, this.options.language)),
      column_width: this.config.column_width,
      x,
      upper_text: this.config.view_mode.upper_text(date, last_date, this.options.language),
      lower_text:
        typeof this.config.view_mode.lower_text === 'function'
          ? this.config.view_mode.lower_text(date, last_date, this.options.language)
          : this.config.view_mode.lower_text,
      upper_y: 17,
      lower_y: this.options.upper_header_height + 5,
    };
  }

  make_bars() {
    this.bars = this.tasks.map((task) => {
      const bar = new Bar(this, task);
      this.layers.bar.appendChild(bar.group);
      return bar;
    });
  }

  make_arrows() {
    this.arrows = [];
    for (let task of this.tasks) {
      let arrows: Arrow[] = [];
      arrows = task
        .dependencies!.map((task_id) => {
          const dependency = this.get_task(task_id);
          if (!dependency) return;
          const fromIndex = dependency._index!;
          const arrow = new Arrow(
            this,
            this.bars[fromIndex], // from_task
            this.bars[task._index! as number], // to_task
          );
          this.layers.arrow.appendChild(arrow.element);
          return arrow;
        })
        .filter(Boolean) as Arrow[]; // filter falsy values
      this.arrows = this.arrows.concat(arrows);
    }
  }

  map_arrows_on_bars() {
    for (let bar of this.bars) {
      bar.arrows = this.arrows.filter((arrow) => {
        return arrow.from_task.task.id === bar.task.id || arrow.to_task.task.id === bar.task.id;
      });
    }
  }

  set_dimensions() {
    const { width: cur_width } = this.elements.$svg.getBoundingClientRect();
    const actual_width: number = this.elements.$svg.querySelector('.grid .grid-row')
      ? Number(this.elements.$svg.querySelector('.grid .grid-row')!.getAttribute('width'))
      : 0;
    if (cur_width < actual_width!) {
      this.elements.$svg.setAttribute('width', actual_width.toString());
    }
  }

  set_scroll_position(date: string | Date | null) {
    if (this.options.infinite_padding && (!date || date === 'start')) {
      let [min_start, ..._] = this.get_start_end_positions();
      this.elements.$container.scrollLeft = min_start;
      return;
    }
    if (!date || date === 'start') {
      date = this.gantt_start;
    } else if (date === 'end') {
      date = this.gantt_end;
    } else if (date === 'today') {
      return this.scroll_current();
    } else if (typeof date === 'string') {
      date = date_utils.parse(date);
    }

    // Weird bug where infinite padding results in one day offset in scroll
    // Related to header-body displacement
    const units_since_first_task = date_utils.diff(date, this.gantt_start, this.config.unit);
    const scroll_pos = (units_since_first_task / this.config.step) * this.config.column_width;

    this.elements.$container.scrollTo({
      left: scroll_pos - this.config.column_width / 6,
      behavior: 'smooth',
    });

    // Calculate current scroll position's upper text
    if (this.elements.$current) {
      this.elements.$current.classList.remove('current-upper');
    }

    this.current_date = date_utils.add(
      this.gantt_start,
      this.elements.$container.scrollLeft / this.config.column_width,
      this.config.unit,
    );

    let current_upper = this.config.view_mode.upper_text(this.current_date, null, this.options.language);
    let $el = this.upperTexts.find((el) => el.textContent === current_upper);

    // Recalculate
    this.current_date = date_utils.add(
      this.gantt_start,
      (this.elements.$container.scrollLeft + $el!.clientWidth) / this.config.column_width,
      this.config.unit,
    );
    current_upper = this.config.view_mode.upper_text(this.current_date, null, this.options.language);
    $el = this.upperTexts.find((el) => el.textContent === current_upper);
    $el!.classList.add('current-upper');
    this.elements.$current = $el!;
  }

  scroll_current() {
    let res = this.get_closest_date();
    if (res) this.set_scroll_position(res[0]);
  }

  get_closest_date() {
    let now = new Date();
    if (now < this.gantt_start || now > this.gantt_end) return null;

    let current = new Date(),
      el = this.elements.$container.querySelector(
        '.date_' + sanitize(date_utils.format(current, this.config.date_format, this.options.language)),
      );

    // safety check to prevent infinite loop
    let c = 0;
    while (!el && c < this.config.step) {
      current = date_utils.add(current, -1, this.config.unit);
      el = this.elements.$container.querySelector(
        '.date_' + sanitize(date_utils.format(current, this.config.date_format, this.options.language)),
      );
      c++;
    }
    return [new Date(date_utils.format(current, this.config.date_format, this.options.language) + ' '), el] as const;
  }

  bind_grid_click() {
    $.on(this.elements.$container, 'click', '.grid-row, .grid-header, .ignored-bar, .holiday-highlight', () => {
      this.unselect_all();
      this.hide_popup();
    });
  }

  bind_holiday_labels() {
    const $highlights = this.elements.$container.querySelectorAll('.holiday-highlight') as NodeListOf<HTMLElement>;
    for (let h of $highlights) {
      const label = this.elements.$container.querySelector('.label_' + h.classList[1]) as HTMLElement;
      if (!label) continue;
      let timeout: NodeJS.Timeout;
      h.onmouseenter = (e) => {
        timeout = setTimeout(() => {
          label.classList.add('show');
          label.style.left = (e.offsetX || e.layerX) + 'px';
          label.style.top = (e.offsetY || e.layerY) + 'px';
        }, 300);
      };

      h.onmouseleave = (e) => {
        clearTimeout(timeout);
        label.classList.remove('show');
      };
    }
  }

  get_start_end_positions() {
    if (!this.bars.length) return [0, 0, 0];
    let { x, width } = this.bars[0].group.getBBox()!;
    let min_start = x;
    let max_start = x;
    let max_end = x + width;
    Array.prototype.forEach.call(this.bars, function ({ group }, i) {
      let { x, width } = group.getBBox();
      if (x < min_start) min_start = x;
      if (x > max_start) max_start = x;
      if (x + width > max_end) max_end = x + width;
    });
    return [min_start, max_start, max_end];
  }

  bind_bar_events() {
    let is_dragging = false;
    let x_on_start = 0;
    let x_on_scroll_start = 0;
    let y_on_start = 0;
    let is_resizing_left = false;
    let is_resizing_right = false;
    let parent_bar_id: string | null = null;
    let bars: Bar[] = []; // instanceof Bar
    this.bar_being_dragged = false;

    const action_in_progress = () => is_dragging || is_resizing_left || is_resizing_right;

    this.elements.$svg.onclick = (e) => {
      if ((e.target as HTMLElement)?.classList.contains('grid-row')) this.unselect_all();
    };

    let pos = 0;
    $.on(this.elements.$svg, 'mousemove', '.bar-wrapper, .handle', (e: MouseEvent) => {
      if (this.bar_being_dragged === false && Math.abs((e.offsetX || e.layerX) - pos) > 10)
        this.bar_being_dragged = true;
    });

    $.on(this.elements.$svg, 'mousedown', '.bar-wrapper, .handle', (e: MouseEvent, element: HTMLElement) => {
      const bar_wrapper = $.closest('.bar-wrapper', element);
      if (element.classList.contains('left')) {
        is_resizing_left = true;
        element.classList.add('visible');
      } else if (element.classList.contains('right')) {
        is_resizing_right = true;
        element.classList.add('visible');
      } else if (element.classList.contains('bar-wrapper')) {
        is_dragging = true;
      }

      if (this.popup) this.popup.hide();

      x_on_start = e.offsetX || e.layerX;
      y_on_start = e.offsetY || e.layerY;

      parent_bar_id = bar_wrapper!.getAttribute('data-id') as string;
      let ids: string[];
      if (this.options.move_dependencies) {
        ids = [parent_bar_id, ...this.get_all_dependent_tasks(parent_bar_id)];
      } else {
        ids = [parent_bar_id];
      }
      bars = ids.map((id) => this.get_bar(id)!);

      this.bar_being_dragged = false;
      pos = x_on_start;

      bars.forEach((bar) => {
        const $bar = bar.$bar;
        $bar.ox = $bar.getX();
        $bar.oy = $bar.getY();
        $bar.owidth = $bar.getWidth();
        $bar.finaldx = 0;
      });
    });

    if (this.options.infinite_padding) {
      let extended = false;
      $.on(this.elements.$container, 'mousewheel', (e: WheelEvent) => {
        let trigger = this.elements.$container.scrollWidth / 2;
        if (!extended && (e.currentTarget as HTMLElement).scrollLeft <= trigger) {
          let old_scroll_left = (e.currentTarget as HTMLElement).scrollLeft;
          extended = true;

          this.gantt_start = date_utils.add(this.gantt_start, -this.config.extend_by_units, this.config.unit);
          this.setup_date_values();
          this.render();
          (e.currentTarget as HTMLElement).scrollLeft =
            old_scroll_left + this.config.column_width * this.config.extend_by_units;
          setTimeout(() => (extended = false), 300);
        }

        if (
          !extended &&
          (e.currentTarget as HTMLElement).scrollWidth -
            ((e.currentTarget as HTMLElement).scrollLeft + (e.currentTarget as HTMLElement).clientWidth) <=
            trigger
        ) {
          let old_scroll_left = (e.currentTarget as HTMLElement).scrollLeft;
          extended = true;
          this.gantt_end = date_utils.add(this.gantt_end, this.config.extend_by_units, this.config.unit);
          this.setup_date_values();
          this.render();
          (e.currentTarget as HTMLElement).scrollLeft = old_scroll_left;
          setTimeout(() => (extended = false), 300);
        }
      });
    }

    $.on(this.elements.$container, 'scroll', (e: WheelEvent) => {
      let localBars = [];
      const ids = this.bars.map(({ group }) => group.getAttribute('data-id'));
      let dx;
      if (x_on_scroll_start) {
        dx = (e.currentTarget as HTMLElement).scrollLeft - x_on_scroll_start;
      }

      // Calculate current scroll position's upper text
      this.current_date = date_utils.add(
        this.gantt_start,
        ((e.currentTarget as HTMLElement).scrollLeft / this.config.column_width) * this.config.step,
        this.config.unit,
      );

      let current_upper = this.config.view_mode.upper_text(this.current_date, null, this.options.language);
      let $el = this.upperTexts.find((el) => el.textContent === current_upper);

      // Recalculate for smoother experience
      this.current_date = date_utils.add(
        this.gantt_start,
        (((e.currentTarget as HTMLElement).scrollLeft + $el!.clientWidth) / this.config.column_width) *
          this.config.step,
        this.config.unit,
      );
      current_upper = this.config.view_mode.upper_text(this.current_date, null, this.options.language);
      $el = this.upperTexts.find((el) => el.textContent === current_upper);

      if ($el !== this.elements.$current) {
        if (this.elements.$current) this.elements.$current.classList.remove('current-upper');

        $el!.classList.add('current-upper');
        this.elements.$current = $el!;
      }

      x_on_scroll_start = (e.currentTarget as HTMLElement).scrollLeft;
      let [min_start, max_start, max_end] = this.get_start_end_positions();

      if (x_on_scroll_start > max_end + 100) {
        this.elements.$adjust.innerHTML = '&larr;';
        this.elements.$adjust.classList.remove('hide');
        this.elements.$adjust.onclick = () => {
          this.elements.$container.scrollTo({
            left: max_start,
            behavior: 'smooth',
          });
        };
      } else if (x_on_scroll_start + (e.currentTarget as HTMLElement).offsetWidth < min_start - 100) {
        this.elements.$adjust.innerHTML = '&rarr;';
        this.elements.$adjust.classList.remove('hide');
        this.elements.$adjust.onclick = () => {
          this.elements.$container.scrollTo({
            left: min_start,
            behavior: 'smooth',
          });
        };
      } else {
        this.elements.$adjust.classList.add('hide');
      }

      if (dx) {
        localBars = ids.map((id) => this.get_bar(id!));
        if (this.options.auto_move_label) {
          localBars.forEach((bar) => {
            bar!.update_label_position_on_horizontal_scroll({
              x: dx,
              sx: (e.currentTarget as HTMLElement).scrollLeft,
            });
          });
        }
      }
    });

    $.on(this.elements.$svg, 'mousemove', (e: MouseEvent) => {
      if (!action_in_progress()) return;
      const dx = (e.offsetX || e.layerX) - x_on_start;

      bars.forEach((bar) => {
        const $bar = bar.$bar;
        $bar.finaldx = this.get_snap_position(dx, $bar.ox);
        this.hide_popup();
        if (is_resizing_left) {
          if (parent_bar_id === bar.task.id) {
            bar.update_bar_position({
              x: $bar.ox + $bar.finaldx,
              width: $bar.owidth - $bar.finaldx,
            });
          } else {
            bar.update_bar_position({
              x: $bar.ox + $bar.finaldx,
            });
          }
        } else if (is_resizing_right) {
          if (parent_bar_id === bar.task.id) {
            bar.update_bar_position({
              width: $bar.owidth + $bar.finaldx,
            });
          }
        } else if (is_dragging && !this.options.readonly && !this.options.readonly_dates) {
          bar.update_bar_position({ x: $bar.ox + $bar.finaldx });
        }
      });
    });

    document.addEventListener('mouseup', () => {
      is_dragging = false;
      is_resizing_left = false;
      is_resizing_right = false;
      this.elements.$container.querySelector('.visible')?.classList?.remove?.('visible');
    });

    $.on(this.elements.$svg, 'mouseup', () => {
      this.bar_being_dragged = false;
      bars.forEach((bar) => {
        const $bar = bar.$bar;
        if (!$bar.finaldx) return;
        bar.date_changed();
        bar.compute_progress();
        bar.set_action_completed();
      });
    });

    this.bind_bar_progress();
  }

  bind_bar_progress() {
    let x_on_start = 0;
    let y_on_start = 0;
    let is_resizing = false;
    let bar: Bar | null = null;
    let $bar_progress: SVGElement | null = null;
    let $bar: SVGElement | null = null;

    $.on(this.elements.$svg, 'mousedown', '.handle.progress', (e: MouseEvent, handle: HTMLElement) => {
      is_resizing = true;
      x_on_start = e.offsetX || e.layerX;
      y_on_start = e.offsetY || e.layerY;

      const $bar_wrapper = $.closest('.bar-wrapper', handle);
      const id = $bar_wrapper!.getAttribute('data-id');
      bar = this.get_bar(id!)!;

      $bar_progress = bar.$bar_progress;
      $bar = bar.$bar;

      $bar_progress.finaldx = 0;
      $bar_progress.owidth = $bar_progress.getWidth();
      $bar_progress.min_dx = -$bar_progress.owidth;
      $bar_progress.max_dx = $bar.getWidth() - $bar_progress.getWidth();
    });

    const range_positions = this.config.ignored_positions.map((d) => [d, d + this.config.column_width]);

    $.on(this.elements.$svg, 'mousemove', (e: MouseEvent) => {
      if (!is_resizing) return;
      let now_x = e.offsetX || e.layerX;

      let moving_right = now_x > x_on_start;
      if (moving_right) {
        let k = range_positions.find(([begin, end]) => now_x >= begin && now_x < end);
        while (k) {
          now_x = k[1];
          k = range_positions.find(([begin, end]) => now_x >= begin && now_x < end);
        }
      } else {
        let k = range_positions.find(([begin, end]) => now_x > begin && now_x <= end);
        while (k) {
          now_x = k[0];
          k = range_positions.find(([begin, end]) => now_x > begin && now_x <= end);
        }
      }

      let dx = now_x - x_on_start;
      if (dx > $bar_progress!.max_dx) {
        dx = $bar_progress!.max_dx;
      }
      if (dx < $bar_progress!.min_dx) {
        dx = $bar_progress!.min_dx;
      }

      $bar_progress!.setAttribute('width', ($bar_progress!.owidth + dx).toString());
      $.attr(bar!.$handle_progress!, 'cx', $bar_progress!.getEndX());

      $bar_progress!.finaldx = dx;
    });

    $.on(this.elements.$svg, 'mouseup', () => {
      is_resizing = false;
      if (!($bar_progress && $bar_progress!.finaldx)) return;

      $bar_progress!.finaldx = 0;
      bar!.progress_changed();
      bar!.set_action_completed();
      bar = null;
      $bar_progress = null;
      $bar = null;
    });
  }

  get_all_dependent_tasks(task_id: string) {
    let out: string[] = [];
    let to_process: string[] = [task_id];
    while (to_process.length) {
      const deps = to_process.reduce((acc: string[], curr: string) => {
        acc = acc.concat(this.dependency_map[curr]);
        return acc;
      }, []);

      out = out.concat(deps);
      to_process = deps.filter((d) => !to_process.includes(d));
    }

    return out.filter(Boolean);
  }

  get_snap_position(dx: number, ox: number) {
    let unit_length = 1;
    const default_snap = this.options.snap_at || this.config.view_mode.snap_at || '1d';

    if (default_snap !== 'unit') {
      const parsedDuration = date_utils.parse_duration(default_snap);
      if (!parsedDuration) return 1;

      const { duration, scale } = parsedDuration;
      unit_length = date_utils.convert_scales(this.config.view_mode.step, scale) / duration;
    }

    const rem = dx % (this.config.column_width / unit_length);

    let final_dx =
      dx - rem + (rem < (this.config.column_width / unit_length) * 2 ? 0 : this.config.column_width / unit_length);
    let final_pos = ox + final_dx;

    const drn = final_dx > 0 ? 1 : -1;
    let ignored_regions = this.get_ignored_region(final_pos, drn);
    while (ignored_regions.length) {
      final_pos += this.config.column_width * drn;
      ignored_regions = this.get_ignored_region(final_pos, drn);
      if (!ignored_regions.length) final_pos -= this.config.column_width * drn;
    }
    return final_pos - ox;
  }

  get_ignored_region(pos: number, drn = 1) {
    if (drn === 1) {
      return this.config.ignored_positions.filter((val) => {
        return pos > val && pos <= val + this.config.column_width;
      });
    } else {
      return this.config.ignored_positions.filter((val) => pos >= val && pos < val + this.config.column_width);
    }
  }

  unselect_all() {
    if (this.popup) this.popup.parent.classList.add('hide');
    this.elements.$container.querySelectorAll('.date-range-highlight').forEach((k) => k.classList.add('hide'));
  }

  view_is(modes: string | ViewMode | string[]) {
    if (typeof modes === 'string') {
      return this.config.view_mode.name === modes;
    }

    if (Array.isArray(modes)) {
      return modes.some((mode) => this.config.view_mode.name === mode);
    }

    return this.config.view_mode.name === modes.name;
  }

  get_task(id: string) {
    return this.tasks.find((task) => {
      return task.id === id;
    });
  }

  get_bar(id: string) {
    return this.bars.find((bar) => {
      return bar.task.id === id;
    });
  }

  show_popup(opts: any) {
    if (!this.popup) {
      this.popup = new Popup(this.elements.$popup_wrapper, this.options.popup, this);
    }
    this.popup.show(opts);
  }

  hide_popup() {
    this.popup && this.popup.hide();
  }

  trigger_event(event: string, args: any[]) {
    if (this.options['on_' + event]) {
      this.options['on_' + event].apply(this, args);
    }
  }

  /**
   * Gets the oldest starting date from the list of tasks
   *
   * @returns Date
   * @memberof Gantt
   */
  get_oldest_starting_date() {
    if (!this.tasks.length) return new Date();
    return this.tasks
      .map((task) => task._start)
      .reduce((prev_date, cur_date) => (cur_date! <= prev_date! ? cur_date : prev_date));
  }

  /**
   * Clear all elements from the parent svg element
   *
   * @memberof Gantt
   */
  clear() {
    this.elements.$svg.innerHTML = '';
    this.elements.$header?.remove?.();
    this.elements.$side_header?.remove?.();
    this.elements.$current_highlight?.remove?.();
    this.elements.$extras?.remove?.();
    this.popup?.hide?.();
  }
}

function generate_id(task: Task) {
  return task.name + '_' + Math.random().toString(36).slice(2, 12);
}

function sanitize(s: string) {
  return s.replaceAll(' ', '_').replaceAll(':', '_').replaceAll('.', '_');
}
