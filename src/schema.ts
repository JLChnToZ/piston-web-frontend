export type PistonVersions = PistonVersion[];

export interface PistonVersion {
  name: string;
  alias: string[];
  version: string;
  runtime?: string;
}

export interface PistonExecuteRequest {
  language: string;
  version: string;
  files: PistonFileEntry[];
  stdin?: string;
  args?: string[];
  run_timeout?: number;
  compile_memory_limit?: number;
  run_memory_limit?: number;
}

export interface PistonFileEntry {
  name?: string;
  content: string;
  encoding?: 'base64' | 'hex' | 'utf8';
}

export interface PistonExecuteResponse {
  ran: boolean;
  language: string;
  version: string;
  run: PistonExecutionResult;
  compile?: PistonExecutionResult;
}

export interface PistonExecutionResult {
  stdout: string;
  stderr: string;
  output: string;
  code: number | null;
  signal: string | null;
}

export interface PistonExecuteFailure {
  message: string;
}
