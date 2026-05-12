export interface ListRecordsResponse<T = unknown> {
  records: Array<{ uri: string; cid: string; value: T }>;
  cursor?: string;
}

export interface PutRecordResponse {
  uri: string;
  cid: string;
}
