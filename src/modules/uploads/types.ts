export interface ParseResult<T> {
  data: T[];
  errors: ParseError[];
}

export interface ParseError {
  row: number; // 1-based 資料列（不含表頭）
  field?: string;
  message: string;
}

export interface UploadResult {
  success: boolean;
  batchId?: string;
  importedCount: number;
  failedCount: number;
  errors: ParseError[];
}
