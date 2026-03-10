export interface SessionResponse {
  did?: string;
  handle?: string;
  email?: string;
  emailConfirmed?: boolean;
}

export interface ListRecordsResponse<T = unknown> {
  records: Array<{ uri: string; cid: string; value: T }>;
  cursor?: string;
}

export interface PutRecordResponse {
  uri: string;
  cid: string;
}

export interface AppPassword {
  name: string;
  createdAt: string;
  privileged?: boolean;
}

export interface CreateAppPasswordResponse extends AppPassword {
  password: string;
}

export interface ListAppPasswordsResponse {
  passwords: AppPassword[];
}
