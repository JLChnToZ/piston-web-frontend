export type PistonVersions = PistonVersion[];

export interface PistonVersion {
  name: string;
  alias: string[];
  version: string;
}

export interface PistonExecuteRequest {
  language: string;
  source: string;
  stdin?: string;
  args?: string[];
}

export interface PistonExecuteResponse {
  ran: boolean;
  language: string;
  version: string;
  output: string;
  stdout: string;
  stderr: string;
}

export interface PistonExecuteFailure {
  message: string;
}
