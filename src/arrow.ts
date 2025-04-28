import { createSVG } from './svg_utils';

interface GanttOptions {
  padding: number;
  bar_height: number;
  arrow_curve: number;
}

interface GanttConfig {
  header_height: number;
}

interface Task {
  id: string;
  _index?: number;
}

interface Bar {
  getX(): number;
  getY(): number;
  getWidth(): number;
  getHeight(): number;
}

interface GanttTask {
  task: Task;
  $bar: Bar;
}

interface Gantt {
  options: GanttOptions;
  config: GanttConfig;
}

export default class Arrow {
  public gantt: Gantt;
  public from_task: GanttTask;
  public to_task: GanttTask;
  public path: string = '';
  public element!: SVGElement;

  constructor(gantt: Gantt, from_task: GanttTask, to_task: GanttTask) {
    this.gantt = gantt;
    this.from_task = from_task;
    this.to_task = to_task;

    this.calculate_path();
    this.draw();
  }

  private calculate_path(): void {
    let start_x = this.from_task.$bar.getX() + this.from_task.$bar.getWidth() / 2;

    const condition = (): boolean =>
      this.to_task.$bar.getX() < start_x + this.gantt.options.padding &&
      start_x > this.from_task.$bar.getX() + this.gantt.options.padding;

    while (condition()) {
      start_x -= 10;
    }
    start_x -= 10;

    const start_y =
      this.gantt.config.header_height +
      this.gantt.options.bar_height +
      (this.gantt.options.padding + this.gantt.options.bar_height) * this.from_task.task._index! +
      this.gantt.options.padding / 2;

    const end_x = this.to_task.$bar.getX() - 13;
    const end_y =
      this.gantt.config.header_height +
      this.gantt.options.bar_height / 2 +
      (this.gantt.options.padding + this.gantt.options.bar_height) * this.to_task.task._index! +
      this.gantt.options.padding / 2;

    const from_is_below_to = this.from_task.task._index! > this.to_task.task._index!;
    const clockwise = from_is_below_to ? 1 : 0;

    let curve = this.gantt.options.arrow_curve;
    let curve_y = from_is_below_to ? -curve : curve;

    if (this.to_task.$bar.getX() <= this.from_task.$bar.getX() + this.gantt.options.padding) {
      let down_1 = this.gantt.options.padding / 2 - curve;
      if (down_1 < 0) {
        down_1 = 0;
        curve = this.gantt.options.padding / 2;
        curve_y = from_is_below_to ? -curve : curve;
      }
      const down_2 = this.to_task.$bar.getY() + this.to_task.$bar.getHeight() / 2 - curve_y;
      const left = this.to_task.$bar.getX() - this.gantt.options.padding;

      this.path = `
        M ${start_x} ${start_y}
        v ${down_1}
        a ${curve} ${curve} 0 0 1 ${-curve} ${curve}
        H ${left}
        a ${curve} ${curve} 0 0 ${clockwise} ${-curve} ${curve_y}
        V ${down_2}
        a ${curve} ${curve} 0 0 ${clockwise} ${curve} ${curve_y}
        L ${end_x} ${end_y}
        m -5 -5
        l 5 5
        l -5 5`;
    } else {
      if (end_x < start_x + curve) {
        curve = end_x - start_x;
      }

      const offset = from_is_below_to ? end_y + curve : end_y - curve;

      this.path = `
        M ${start_x} ${start_y}
        V ${offset}
        a ${curve} ${curve} 0 0 ${clockwise} ${curve} ${curve}
        L ${end_x} ${end_y}
        m -5 -5
        l 5 5
        l -5 5`;
    }
  }

  private draw(): void {
    this.element = createSVG('path', {
      d: this.path,
      'data-from': this.from_task.task.id,
      'data-to': this.to_task.task.id,
    });
  }

  public update(): void {
    this.calculate_path();
    this.element.setAttribute('d', this.path);
  }
}
