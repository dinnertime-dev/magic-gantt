export interface ViewMode {
  name: string;
  step: string;
  column_width: number;
  date_format?: string;
  padding?: string | [string, string];
  upper_text?: string | ((date: Date, last_date: Date | null, language: string) => string);
  lower_text?: string | ((date: Date, last_date: Date | null, language: string) => string);
  thick_line?: (date: Date) => boolean;
  snap_at?: string;
}
