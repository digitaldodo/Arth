export type PersonDirection = 'i_owe_them' | 'they_owe_me';

export type SettlementStatus = 'outstanding' | 'partially_settled' | 'settled';

export interface PersonMoneySettlementDTO {
  id: string;
  record_id: string;
  amount_paise: number;
  formatted_amount: string;
  settlement_date: string;
  notes: string | null;
  created_at: string;
}

export interface PersonMoneyRecordDTO {
  id: string;
  person_id: string;
  name: string;
  amount_paise: number;
  formatted_original: string;
  settled_paise: number;
  formatted_settled: string;
  remaining_paise: number;
  formatted_remaining: string;
  direction: PersonDirection;
  record_date: string;
  notes: string | null;
  status: SettlementStatus;
  settlements: PersonMoneySettlementDTO[];
  created_at: string;
  updated_at: string;
}

export interface PersonDTO {
  id: string;
  name: string;
  direction: PersonDirection;
  archived_at: string | null;
  is_archived: boolean;
  total_original_paise: number;
  total_settled_paise: number;
  outstanding_paise: number;
  formatted_outstanding: string;
  status_label: string; // e.g. "I owe Rahul ₹1,300.00" or "Rahul owes me ₹250.00"
  records_count: number;
  active_records_count: number;
  created_at: string;
  updated_at: string;
}

export interface PersonDetailDTO extends PersonDTO {
  records: PersonMoneyRecordDTO[];
}

export interface CreatePersonRequest {
  id?: string;
  name: string;
  direction: PersonDirection;
}

export interface CreatePersonResponse {
  person: PersonDTO;
}

export interface UpdatePersonRequest {
  name?: string;
  direction?: PersonDirection;
}

export interface UpdatePersonResponse {
  person: PersonDTO;
}

export interface ArchivePersonRequest {
  archived: boolean;
}

export interface ArchivePersonResponse {
  person: PersonDTO;
}

export interface CreatePersonRecordRequest {
  id?: string;
  name: string;
  amount: string; // decimal string in INR, e.g. "250.00"
  record_date?: string; // YYYY-MM-DD
  notes?: string | null;
}

export interface CreatePersonRecordResponse {
  record: PersonMoneyRecordDTO;
  person: PersonDTO;
}

export interface RecordSettlementRequest {
  id?: string;
  amount: string; // decimal string in INR, e.g. "100.00"
  settlement_date?: string; // YYYY-MM-DD
  notes?: string | null;
}

export interface RecordSettlementResponse {
  settlement: PersonMoneySettlementDTO;
  record: PersonMoneyRecordDTO;
  person: PersonDTO;
}

export interface PersonListQuery {
  search?: string;
  include_archived?: boolean;
  direction?: PersonDirection;
}

export interface PersonListResponse {
  people: PersonDTO[];
}

export interface PersonDetailResponse {
  person: PersonDetailDTO;
}
