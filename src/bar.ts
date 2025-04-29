import { Gantt } from '.';
import date_utils from './date_utils';
import { $, createSVG, animateSVG } from './svg_utils';
import { Task } from './task';

interface SVGElementMethods {
  getX(): number;
  getY(): number;
  getWidth(): number;
  getHeight(): number;
  getEndX(): number;
  getBBox(): DOMRect;
}

declare global {
  interface SVGElement extends SVGElementMethods {
    ox: number;
    oy: number;
    owidth: number;
    finaldx: number;
    min_dx: number;
    max_dx: number;
  }
  interface Element {
    getX(): number;
    getY(): number;
    getWidth(): number;
    getHeight(): number;
    getEndX(): number;
    getBBox(): DOMRect | null;
  }
}

export default class Bar {
  public gantt: Gantt;
  public task: Task;
  public name: string = '';
  public action_completed: boolean = false;
  public group!: SVGElement;
  public bar_group!: SVGElement;
  public handle_group!: SVGElement;
  public $bar!: SVGElement;
  public $bar_progress!: SVGElement;
  public $expected_bar_progress?: SVGElement;
  public $handle_progress?: SVGElement;
  public $date_highlight!: HTMLElement;
  public handles: SVGElement[] = [];
  public arrows: any[] = [];
  public invalid: boolean = false;
  public height: number = 0;
  public image_size: number = 0;
  public x: number = 0;
  public y: number = 0;
  public width: number = 0;
  public progress_width: number = 0;
  public expected_progress_width: number = 0;
  public expected_progress: number = 0;
  public duration: number = 0;
  public actual_duration_raw: number = 0;
  public ignored_duration_raw: number = 0;
  public corner_radius: number = 0;

  constructor(gantt: Gantt, task: Task) {
    this.gantt = gantt;
    this.task = task;

    this.prepare_wrappers();
    this.prepare_helpers();
    this.refresh();
  }

  private prepare_wrappers(): void {
    this.group = createSVG('g', {
      class: 'bar-wrapper' + (this.task.custom_class ? ' ' + this.task.custom_class : ''),
      'data-id': this.task.id,
    });
    this.bar_group = createSVG('g', {
      class: 'bar-group',
      append_to: this.group,
    });
    this.handle_group = createSVG('g', {
      class: 'handle-group',
      append_to: this.group,
    });
  }

  private prepare_helpers(): void {
    Element.prototype.getX = function (): number {
      const x = this.getAttribute('x');
      return x !== null ? +x : 0;
    };
    Element.prototype.getY = function (): number {
      const y = this.getAttribute('y');
      return y !== null ? +y : 0;
    };
    Element.prototype.getWidth = function (): number {
      const width = this.getAttribute('width');
      return width !== null ? +width : 0;
    };
    Element.prototype.getHeight = function (): number {
      const height = this.getAttribute('height');
      return height !== null ? +height : 0;
    };
    Element.prototype.getEndX = function (): number {
      return this.getX() + this.getWidth();
    };
    Element.prototype.getBBox = function (): DOMRect | null {
      try {
        if (this instanceof SVGGraphicsElement) {
          return this.getBBox();
        }
        return this.getBoundingClientRect();
      } catch {
        return null;
      }
    };
  }

  public refresh(): void {
    this.bar_group.innerHTML = '';
    this.handle_group.innerHTML = '';
    if (this.task.custom_class) {
      this.group.classList.add(this.task.custom_class);
    } else {
      this.group.classList.add('bar-wrapper');
    }

    this.prepare_values();
    this.draw();
    this.bind();
  }

  private prepare_values(): void {
    this.invalid = this.task.invalid || false;
    this.height = this.gantt.options.bar_height;
    this.image_size = this.height - 5;
    this.task._start = new Date(this.task.start);
    this.task._end = new Date(this.task.end || new Date());
    this.compute_x();
    this.compute_y();
    this.compute_duration();
    this.corner_radius = this.gantt.options.bar_corner_radius;
    this.width = this.gantt.config.column_width * this.duration;
    if (!this.task.progress || this.task.progress < 0) this.task.progress = 0;
    if (this.task.progress > 100) this.task.progress = 100;
  }

  private draw(): void {
    this.draw_bar();
    this.draw_progress_bar();
    if (this.gantt.options.show_expected_progress) {
      this.prepare_expected_progress_values();
      this.draw_expected_progress_bar();
    }
    this.draw_label();
    this.draw_resize_handles();

    if (this.task.thumbnail) {
      this.draw_thumbnail();
    }
  }

  private draw_bar(): void {
    this.$bar = createSVG('rect', {
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      rx: this.corner_radius,
      ry: this.corner_radius,
      class: 'bar',
      append_to: this.bar_group,
    });
    if (this.task.color) this.$bar.style.fill = this.task.color;
    animateSVG(this.$bar, 'width', 0, this.width);

    if (this.invalid) {
      this.$bar.classList.add('bar-invalid');
    }
  }

  private draw_progress_bar(): void {
    if (this.invalid) return;
    this.progress_width = this.calculate_progress_width();
    let r = this.corner_radius;
    if (!/^((?!chrome|android).)*safari/i.test(navigator.userAgent)) r = this.corner_radius + 2;
    this.$bar_progress = createSVG('rect', {
      x: this.x,
      y: this.y,
      width: this.progress_width,
      height: this.height,
      rx: r,
      ry: r,
      class: 'bar-progress',
      append_to: this.bar_group,
    });
    if (this.task.color_progress) this.$bar_progress.style.fill = this.task.color_progress;
    const x =
      (date_utils.diff(this.task._start || new Date(), this.gantt.gantt_start, this.gantt.config.unit) /
        this.gantt.config.step) *
      this.gantt.config.column_width;

    let $date_highlight = this.gantt.create_el({
      classes: `date-range-highlight hide highlight-${this.task.id}`,
      width: this.width,
      left: x,
    });
    this.$date_highlight = $date_highlight;
    this.gantt.$lower_header?.prepend(this.$date_highlight);

    animateSVG(this.$bar_progress, 'width', 0, this.progress_width);
  }

  private draw_expected_progress_bar(): void {
    if (this.invalid) return;
    this.$expected_bar_progress = createSVG('rect', {
      x: this.x,
      y: this.y,
      width: this.expected_progress_width,
      height: this.height,
      rx: this.corner_radius,
      ry: this.corner_radius,
      class: 'bar-expected-progress',
      append_to: this.bar_group,
    });

    animateSVG(this.$expected_bar_progress, 'width', 0, this.expected_progress_width);
  }

  private draw_label(): void {
    let x_coord = this.x + this.$bar.getWidth() / 2;

    if (this.task.thumbnail) {
      x_coord = this.x + this.image_size + 5;
    }

    createSVG('text', {
      x: x_coord,
      y: this.y + this.height / 2,
      innerHTML: this.task.name,
      class: 'bar-label',
      append_to: this.bar_group,
    });
    // labels get BBox in the next tick
    requestAnimationFrame(() => this.update_label_position());
  }

  private draw_thumbnail(): void {
    let x_offset = 10,
      y_offset = 2;
    let defs, clipPath;

    defs = createSVG('defs', {
      append_to: this.bar_group,
    });

    createSVG('rect', {
      id: 'rect_' + this.task.id,
      x: this.x + x_offset,
      y: this.y + y_offset,
      width: this.image_size,
      height: this.image_size,
      rx: '15',
      class: 'img_mask',
      append_to: defs,
    });

    clipPath = createSVG('clipPath', {
      id: 'clip_' + this.task.id,
      append_to: defs,
    });

    createSVG('use', {
      href: '#rect_' + this.task.id,
      append_to: clipPath,
    });

    createSVG('image', {
      x: this.x + x_offset,
      y: this.y + y_offset,
      width: this.image_size,
      height: this.image_size,
      class: 'bar-img',
      href: this.task.thumbnail,
      clipPath: 'clip_' + this.task.id,
      append_to: this.bar_group,
    });
  }

  private draw_resize_handles(): void {
    if (this.invalid || this.gantt.options.readonly) return;

    const bar = this.$bar;
    const handle_width = 3;
    this.handles = [];
    if (!this.gantt.options.readonly_dates) {
      this.handles.push(
        createSVG('rect', {
          x: bar.getEndX() - handle_width / 2,
          y: bar.getY() + this.height / 4,
          width: handle_width,
          height: this.height / 2,
          rx: 2,
          ry: 2,
          class: 'handle right',
          append_to: this.handle_group,
        }),
      );

      this.handles.push(
        createSVG('rect', {
          x: bar.getX() - handle_width / 2,
          y: bar.getY() + this.height / 4,
          width: handle_width,
          height: this.height / 2,
          rx: 2,
          ry: 2,
          class: 'handle left',
          append_to: this.handle_group,
        }),
      );
    }
    if (!this.gantt.options.readonly_progress) {
      const bar_progress = this.$bar_progress;
      this.$handle_progress = createSVG('circle', {
        cx: bar_progress.getEndX(),
        cy: bar_progress.getY() + bar_progress.getHeight() / 2,
        r: 4.5,
        class: 'handle progress',
        append_to: this.handle_group,
      });
      this.handles.push(this.$handle_progress);
    }

    for (let handle of this.handles) {
      $.on(handle, 'mouseenter', () => handle.classList.add('active'));
      $.on(handle, 'mouseleave', () => handle.classList.remove('active'));
    }
  }

  private bind(): void {
    if (this.invalid) return;
    this.setup_click_event();
  }

  private setup_click_event(): void {
    let task_id = this.task.id;
    $.on(this.group, 'mouseover', (e: MouseEvent) => {
      this.gantt.trigger_event('hover', [this.task, e.screenX, e.screenY, e]);
    });

    if (this.gantt.options.popup_on === 'click') {
      $.on(this.group, 'mouseup', (e: MouseEvent) => {
        const posX = e.offsetX || e.layerX;
        if (this.$handle_progress) {
          const cx = this.$handle_progress.getAttribute('cx');
          if (cx && +cx > posX - 1 && +cx < posX + 1) return;
          if (this.gantt.bar_being_dragged) return;
        }
        this.gantt.show_popup({
          x: e.offsetX || e.layerX,
          y: e.offsetY || e.layerY,
          task: this.task,
          target: this.$bar,
        });
      });
    }
    let timeout: number;
    $.on(this.group, 'mouseenter', (e: MouseEvent) => {
      timeout = window.setTimeout(() => {
        if (this.gantt.options.popup_on === 'hover')
          this.gantt.show_popup({
            x: e.offsetX || e.layerX,
            y: e.offsetY || e.layerY,
            task: this.task,
            target: this.$bar,
          });
        this.gantt.$container?.querySelector(`.highlight-${task_id}`)?.classList.remove('hide');
      }, 200);
    });
    $.on(this.group, 'mouseleave', () => {
      window.clearTimeout(timeout);
      if (this.gantt.options.popup_on === 'hover') this.gantt.popup?.hide?.();
      this.gantt.$container?.querySelector(`.highlight-${task_id}`)?.classList.add('hide');
    });

    $.on(this.group, 'click', () => {
      this.gantt.trigger_event('click', [this.task]);
    });

    $.on(this.group, 'dblclick', () => {
      if (this.action_completed) {
        // just finished a move action, wait for a few seconds
        return;
      }
      this.group.classList.remove('active');
      if (this.gantt.popup) this.gantt.popup.parent.classList.remove('hide');

      this.gantt.trigger_event('double_click', [this.task]);
    });

    let tapedTwice = false;
    $.on(this.group, 'touchstart', (e: TouchEvent) => {
      if (!tapedTwice) {
        tapedTwice = true;
        setTimeout(function () {
          tapedTwice = false;
        }, 300);
        return false;
      }
      e.preventDefault();
      //action on double tap goes below

      if (this.action_completed) {
        // just finished a move action, wait for a few seconds
        return;
      }
      this.group.classList.remove('active');
      if (this.gantt.popup) this.gantt.popup.parent.classList.remove('hide');

      this.gantt.trigger_event('double_click', [this.task]);
    });
  }

  public update_bar_position({ x = null, width = null }: { x?: number | null; width?: number | null }): void {
    const bar = this.$bar;

    if (x !== null) {
      const xs =
        this.task.dependencies?.map((dep) => {
          return this.gantt?.get_bar(dep)?.$bar.getX();
        }) || [];
      const valid_x = xs.reduce((prev, curr) => {
        return prev && x >= (curr || 0);
      }, true);
      if (!valid_x) return;
      this.update_attr(bar, 'x', x);
      this.x = x;
      this.$date_highlight.style.left = x + 'px';
    }
    if (width !== null && width > 0) {
      this.update_attr(bar, 'width', width);
      this.$date_highlight.style.width = width + 'px';
    }

    this.update_label_position();
    this.update_handle_position();
    this.date_changed();
    this.compute_duration();

    if (this.gantt.options.show_expected_progress) {
      this.update_expected_progressbar_position();
    }

    this.update_progressbar_position();
    this.update_arrow_position();
  }

  public update_label_position_on_horizontal_scroll({ x, sx }: { x: number; sx: number }): void {
    const container = this.gantt.$container!.querySelector('.gantt-container');
    const label = this.group.querySelector('.bar-label') as SVGElement;
    const img = this.group.querySelector('.bar-img') as SVGElement;
    const img_mask = this.bar_group.querySelector('.img_mask') as SVGElement;

    let barWidthLimit = this.$bar.getX() + this.$bar.getWidth();
    let newLabelX = label?.getX() + x || 0;
    let newImgX = (img && img.getX() + x) || 0;
    let imgWidth = (img && (img.getBBox()?.width || 0) + 7) || 7;
    let labelEndX = newLabelX + (label?.getBBox()?.width || 0) + 7;
    let viewportCentral = sx + (container?.clientWidth || 0) / 2;

    if (label?.classList.contains('big')) return;

    if (labelEndX < barWidthLimit && x > 0 && labelEndX < viewportCentral) {
      label?.setAttribute('x', newLabelX.toString());
      if (img) {
        img.setAttribute('x', newImgX.toString());
        img_mask?.setAttribute('x', newImgX.toString());
      }
    } else if (newLabelX - imgWidth > this.$bar.getX() && x < 0 && labelEndX > viewportCentral) {
      label?.setAttribute('x', newLabelX.toString());
      if (img) {
        img.setAttribute('x', newImgX.toString());
        img_mask?.setAttribute('x', newImgX.toString());
      }
    }
  }

  public date_changed(): void {
    let changed = false;
    const { new_start_date, new_end_date } = this.compute_start_end_date();
    if (Number(this.task._start) !== Number(new_start_date)) {
      changed = true;
      this.task._start = new_start_date;
    }

    if (Number(this.task._end) !== Number(new_end_date)) {
      changed = true;
      this.task._end = new_end_date;
    }

    if (!changed) return;

    this.gantt.trigger_event('date_change', [this.task, new_start_date, date_utils.add(new_end_date, -1, 'second')]);
  }

  public progress_changed(): void {
    this.task.progress = this.compute_progress();
    this.gantt.trigger_event('progress_change', [this.task, this.task.progress]);
  }

  public set_action_completed(): void {
    this.action_completed = true;
    setTimeout(() => (this.action_completed = false), 1000);
  }

  private compute_start_end_date(): { new_start_date: Date; new_end_date: Date } {
    const bar = this.$bar;
    const x_in_units = bar.getX() / this.gantt.config.column_width;
    let new_start_date = date_utils.add(
      this.gantt.gantt_start,
      x_in_units * this.gantt.config.step,
      this.gantt.config.unit,
    );

    const width_in_units = bar.getWidth() / this.gantt.config.column_width;
    const new_end_date = date_utils.add(
      new_start_date,
      width_in_units * this.gantt.config.step,
      this.gantt.config.unit,
    );

    return { new_start_date, new_end_date };
  }

  public compute_progress(): number {
    this.progress_width = this.$bar_progress.getWidth();
    const bbox = this.$bar_progress.getBBox();
    this.x = bbox ? bbox.x : 0;
    const progress_area = this.x + this.progress_width;
    const progress =
      this.progress_width -
      this.gantt.config.ignored_positions.reduce((acc: number, val: number) => {
        return acc + (val >= this.x && val <= progress_area ? 1 : 0);
      }, 0) *
        this.gantt.config.column_width;
    if (progress < 0) return 0;
    const total = this.$bar.getWidth() - this.ignored_duration_raw * this.gantt.config.column_width;
    return Math.round((progress / total) * 100);
  }

  private compute_expected_progress(): void {
    this.expected_progress = date_utils.diff(date_utils.today(), this.task._start!, 'hour') / this.gantt.config.step;
    this.expected_progress =
      ((this.expected_progress < this.duration ? this.expected_progress : this.duration) * 100) / this.duration;
  }

  private compute_x(): void {
    const { column_width } = this.gantt.config;
    const task_start = this.task._start;
    const gantt_start = this.gantt.gantt_start;

    const diff = date_utils.diff(task_start!, gantt_start, this.gantt.config.unit) / this.gantt.config.step;

    let x = diff * column_width;

    this.x = x;
  }

  private compute_y(): void {
    this.y =
      this.gantt.config.header_height +
      this.gantt.options.padding / 2 +
      this.task._index! * (this.height + this.gantt.options.padding);
  }

  private compute_duration(): void {
    let actual_duration_in_days = 0,
      duration_in_days = 0;
    for (let d = new Date(this.task._start!); d < this.task._end!; d.setDate(d.getDate() + 1)) {
      duration_in_days++;
      if (
        !this.gantt.config.ignored_dates.find((k) => k.getTime() === d.getTime()) &&
        (!this.gantt.config.ignored_function || !this.gantt.config.ignored_function(d))
      ) {
        actual_duration_in_days++;
      }
    }
    this.task.actual_duration = actual_duration_in_days;
    this.task.ignored_duration = duration_in_days - actual_duration_in_days;

    this.duration = date_utils.convert_scales(duration_in_days + 'd', this.gantt.config.unit) / this.gantt.config.step;

    this.actual_duration_raw =
      date_utils.convert_scales(actual_duration_in_days + 'd', this.gantt.config.unit) / this.gantt.config.step;

    this.ignored_duration_raw = this.duration - this.actual_duration_raw;
  }

  private update_attr(element: SVGElement, attr: string, value: number): SVGElement {
    value = +value;
    if (!isNaN(value)) {
      element.setAttribute(attr, value.toString());
    }
    return element;
  }

  private update_expected_progressbar_position(): void {
    if (this.invalid || !this.$expected_bar_progress) return;
    this.$expected_bar_progress.setAttribute('x', this.$bar.getX().toString());
    this.compute_expected_progress();
    this.$expected_bar_progress.setAttribute(
      'width',
      (this.gantt.config.column_width * this.actual_duration_raw * (this.expected_progress / 100) || 0).toString(),
    );
  }

  private update_progressbar_position(): void {
    if (this.invalid || this.gantt.options.readonly) return;
    this.$bar_progress.setAttribute('x', this.$bar.getX().toString());
    this.$bar_progress.setAttribute('width', this.calculate_progress_width().toString());
  }

  private update_label_position(): void {
    const img_mask = this.bar_group.querySelector('.img_mask');
    const bar = this.$bar;
    const label = this.group.querySelector('.bar-label');
    const img = this.group.querySelector('.bar-img');

    if (!label) return;

    let padding = 5;
    let x_offset_label_img = this.image_size + 10;
    const bbox = label.getBBox();
    const labelWidth = bbox ? bbox.width : 0;
    const barWidth = bar.getWidth();

    if (labelWidth > barWidth) {
      label.classList.add('big');
      if (img) {
        const endX = bar.getEndX();
        img.setAttribute('x', (endX + padding).toString());
        img_mask?.setAttribute('x', (endX + padding).toString());
        label.setAttribute('x', (endX + x_offset_label_img).toString());
      } else {
        label.setAttribute('x', (bar.getEndX() + padding).toString());
      }
    } else {
      label.classList.remove('big');
      if (img) {
        const startX = bar.getX();
        img.setAttribute('x', (startX + padding).toString());
        img_mask?.setAttribute('x', (startX + padding).toString());
        label.setAttribute('x', (startX + barWidth / 2 + x_offset_label_img).toString());
      } else {
        label.setAttribute('x', (bar.getX() + barWidth / 2 - labelWidth / 2).toString());
      }
    }
  }

  private update_handle_position(): void {
    if (this.invalid || this.gantt.options.readonly) return;
    const bar = this.$bar;
    const leftHandle = this.handle_group.querySelector('.handle.left');
    const rightHandle = this.handle_group.querySelector('.handle.right');
    const progressHandle = this.group.querySelector('.handle.progress');

    if (leftHandle) leftHandle.setAttribute('x', bar.getX().toString());
    if (rightHandle) rightHandle.setAttribute('x', bar.getEndX().toString());
    if (progressHandle) progressHandle.setAttribute('cx', this.$bar_progress.getEndX().toString());
  }

  private update_arrow_position(): void {
    this.arrows = this.arrows || [];
    for (let arrow of this.arrows) {
      arrow.update();
    }
  }

  private calculate_progress_width(): number {
    const width = this.$bar.getWidth();
    const ignored_end = this.x + width;
    const total_ignored_area =
      this.gantt.config.ignored_positions.reduce((acc: number, val: number) => {
        return acc + (val >= this.x && val < ignored_end ? 1 : 0);
      }, 0) * this.gantt.config.column_width;
    let progress_width = ((width - total_ignored_area) * this.task.progress!) / 100;
    const progress_end = this.x + progress_width;
    const total_ignored_progress =
      this.gantt.config.ignored_positions.reduce((acc: number, val: number) => {
        return acc + (val >= this.x && val < progress_end ? 1 : 0);
      }, 0) * this.gantt.config.column_width;

    progress_width += total_ignored_progress;

    let ignored_regions = this.gantt.get_ignored_region(this.x + progress_width) || [];

    while (ignored_regions.length > 0) {
      progress_width += this.gantt.config.column_width;
      ignored_regions = this.gantt.get_ignored_region(this.x + progress_width) || [];
    }
    this.progress_width = progress_width;
    return progress_width;
  }

  private prepare_expected_progress_values(): void {
    this.compute_expected_progress();
    this.expected_progress_width = this.gantt.config.column_width * this.duration * (this.expected_progress / 100) || 0;
  }
}
