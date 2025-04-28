export interface Task {
  id: string;
  name: string;
  start: string | Date;
  end?: string | Date;
  duration?: string;
  progress?: number;
  dependencies?: string[];
  _start?: Date;
  _end?: Date;
  _index?: number;
  group_index?: number;
  invalid?: boolean;
  custom_class?: string;
  color?: string;
  color_progress?: string;
  thumbnail?: string;
  actual_duration?: number;
  ignored_duration?: number;
  expected_progress?: number;
}
