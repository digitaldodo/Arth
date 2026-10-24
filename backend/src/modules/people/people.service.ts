import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { v7 as uuidv7 } from 'uuid';
import {
  formatPaiseToINR,
  type PersonDTO,
  type PersonDetailDTO,
  type PersonMoneyRecordDTO,
  type PersonMoneySettlementDTO,
  type PersonListResponse,
  type PersonDetailResponse,
  type CreatePersonRecordResponse,
  type RecordSettlementResponse,
  type PersonDirection,
  type SettlementStatus,
} from '@arth/contracts';
import type { AppConfig } from '../../config/index.js';
import {
  ValidationError,
  ConflictError,
  NotFoundError,
  type ValidatedCreatePersonInput,
  type ValidatedUpdatePersonInput,
  type ValidatedArchivePersonInput,
  type ValidatedCreatePersonRecordInput,
  type ValidatedRecordSettlementInput,
  type ValidatedPersonListQuery,
} from './people.validation.js';

export interface StoredPersonRecord {
  id: string;
  user_id: string;
  name: string;
  direction: PersonDirection;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StoredPersonMoneyRecord {
  id: string;
  user_id: string;
  person_id: string;
  name: string;
  amount_paise: number;
  direction: PersonDirection;
  record_date: string;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StoredPersonMoneySettlement {
  id: string;
  user_id: string;
  record_id: string;
  amount_paise: number;
  settlement_date: string;
  notes: string | null;
  created_at: string;
}

export function computeStatusLabel(
  name: string,
  direction: PersonDirection,
  outstandingPaise: number
): string {
  const formatted = formatPaiseToINR(outstandingPaise);
  if (direction === 'i_owe_them') {
    return `I owe ${name} ${formatted}`;
  }
  return `${name} owes me ${formatted}`;
}

export function computeRecordStatus(
  amountPaise: number,
  settledPaise: number
): SettlementStatus {
  if (settledPaise <= 0) return 'outstanding';
  if (settledPaise >= amountPaise) return 'settled';
  return 'partially_settled';
}

export function mapToSettlementDTO(
  row: StoredPersonMoneySettlement
): PersonMoneySettlementDTO {
  return {
    id: row.id,
    record_id: row.record_id,
    amount_paise: Number(row.amount_paise),
    formatted_amount: formatPaiseToINR(row.amount_paise),
    settlement_date: row.settlement_date,
    notes: row.notes,
    created_at: row.created_at,
  };
}

export function mapToRecordDTO(
  row: StoredPersonMoneyRecord,
  settlements: StoredPersonMoneySettlement[]
): PersonMoneyRecordDTO {
  const totalSettled = settlements.reduce(
    (acc, s) => acc + Number(s.amount_paise),
    0
  );
  const remaining = Math.max(0, Number(row.amount_paise) - totalSettled);
  const status = computeRecordStatus(Number(row.amount_paise), totalSettled);

  return {
    id: row.id,
    person_id: row.person_id,
    name: row.name,
    amount_paise: Number(row.amount_paise),
    formatted_original: formatPaiseToINR(row.amount_paise),
    settled_paise: totalSettled,
    formatted_settled: formatPaiseToINR(totalSettled),
    remaining_paise: remaining,
    formatted_remaining: formatPaiseToINR(remaining),
    direction: row.direction,
    record_date: row.record_date,
    notes: row.notes,
    status,
    settlements: settlements.map(mapToSettlementDTO),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function mapToPersonDTO(
  person: StoredPersonRecord,
  records: StoredPersonMoneyRecord[],
  settlementsByRecordId: Map<string, StoredPersonMoneySettlement[]>
): PersonDTO {
  let totalOriginal = 0;
  let totalSettled = 0;
  let activeRecordsCount = 0;

  for (const r of records) {
    if (r.archived_at) continue;
    const original = Number(r.amount_paise);
    const settlements = settlementsByRecordId.get(r.id) || [];
    const settled = settlements.reduce((acc, s) => acc + Number(s.amount_paise), 0);
    const remaining = Math.max(0, original - settled);

    totalOriginal += original;
    totalSettled += settled;
    if (remaining > 0) {
      activeRecordsCount += 1;
    }
  }

  const outstanding = Math.max(0, totalOriginal - totalSettled);

  return {
    id: person.id,
    name: person.name,
    direction: person.direction,
    archived_at: person.archived_at,
    is_archived: person.archived_at !== null,
    total_original_paise: totalOriginal,
    total_settled_paise: totalSettled,
    outstanding_paise: outstanding,
    formatted_outstanding: formatPaiseToINR(outstanding),
    status_label: computeStatusLabel(person.name, person.direction, outstanding),
    records_count: records.length,
    active_records_count: activeRecordsCount,
    created_at: person.created_at,
    updated_at: person.updated_at,
  };
}

export interface IPeopleService {
  listPeople(
    userId: string,
    query: ValidatedPersonListQuery,
    token?: string
  ): Promise<PersonListResponse>;

  getPerson(
    userId: string,
    personId: string,
    token?: string
  ): Promise<PersonDetailResponse>;

  createPerson(
    userId: string,
    input: ValidatedCreatePersonInput,
    token?: string
  ): Promise<PersonDTO>;

  updatePerson(
    userId: string,
    personId: string,
    input: ValidatedUpdatePersonInput,
    token?: string
  ): Promise<PersonDTO>;

  archivePerson(
    userId: string,
    personId: string,
    input: ValidatedArchivePersonInput,
    token?: string
  ): Promise<PersonDTO>;

  createRecord(
    userId: string,
    personId: string,
    input: ValidatedCreatePersonRecordInput,
    token?: string
  ): Promise<CreatePersonRecordResponse>;

  recordSettlement(
    userId: string,
    recordId: string,
    input: ValidatedRecordSettlementInput,
    token?: string
  ): Promise<RecordSettlementResponse>;
}

/**
 * Production implementation using user-scoped Supabase client carrying caller's Bearer JWT.
 */
export class SupabasePeopleService implements IPeopleService {
  private config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
  }

  private getClient(token?: string): SupabaseClient {
    if (!this.config.supabaseUrl || !this.config.supabaseAnonKey) {
      throw new Error(
        'Supabase URL and Anon Key must be configured for people operations'
      );
    }

    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    return createClient(this.config.supabaseUrl, this.config.supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: { headers },
    });
  }

  async listPeople(
    userId: string,
    query: ValidatedPersonListQuery,
    token?: string
  ): Promise<PersonListResponse> {
    const client = this.getClient(token);

    // 1. Fetch people
    let peopleQuery = client
      .from('people')
      .select('id, user_id, name, direction, archived_at, created_at, updated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (!query.include_archived) {
      peopleQuery = peopleQuery.is('archived_at', null);
    }
    if (query.direction) {
      peopleQuery = peopleQuery.eq('direction', query.direction);
    }
    if (query.search) {
      peopleQuery = peopleQuery.ilike('name', `%${query.search}%`);
    }

    const { data: peopleData, error: peopleError } = await peopleQuery;
    if (peopleError) {
      throw new Error(`Failed to list people: ${peopleError.message}`);
    }

    const peopleList: StoredPersonRecord[] = peopleData || [];
    if (peopleList.length === 0) {
      return { people: [] };
    }

    const personIds = peopleList.map((p) => p.id);

    // 2. Fetch all records for these people
    const { data: recordsData, error: recordsError } = await client
      .from('person_money_records')
      .select('id, user_id, person_id, name, amount_paise, direction, record_date, notes, archived_at, created_at, updated_at')
      .in('person_id', personIds);

    if (recordsError) {
      throw new Error(`Failed to load records for people: ${recordsError.message}`);
    }

    const records: StoredPersonMoneyRecord[] = recordsData || [];
    const recordIds = records.map((r) => r.id);

    // 3. Fetch settlements for all these records
    let settlements: StoredPersonMoneySettlement[] = [];
    if (recordIds.length > 0) {
      const { data: settlementsData, error: settlementsError } = await client
        .from('person_money_settlements')
        .select('id, user_id, record_id, amount_paise, settlement_date, notes, created_at')
        .in('record_id', recordIds);

      if (settlementsError) {
        throw new Error(`Failed to load settlements: ${settlementsError.message}`);
      }
      settlements = settlementsData || [];
    }

    // Map settlements by record_id
    const settlementsByRecord = new Map<string, StoredPersonMoneySettlement[]>();
    for (const s of settlements) {
      const arr = settlementsByRecord.get(s.record_id) || [];
      arr.push(s);
      settlementsByRecord.set(s.record_id, arr);
    }

    // Map records by person_id
    const recordsByPerson = new Map<string, StoredPersonMoneyRecord[]>();
    for (const r of records) {
      const arr = recordsByPerson.get(r.person_id) || [];
      arr.push(r);
      recordsByPerson.set(r.person_id, arr);
    }

    const result = peopleList.map((p) =>
      mapToPersonDTO(
        p,
        recordsByPerson.get(p.id) || [],
        settlementsByRecord
      )
    );

    return { people: result };
  }

  async getPerson(
    userId: string,
    personId: string,
    token?: string
  ): Promise<PersonDetailResponse> {
    const client = this.getClient(token);

    const { data: person, error: personError } = await client
      .from('people')
      .select('id, user_id, name, direction, archived_at, created_at, updated_at')
      .eq('id', personId)
      .eq('user_id', userId)
      .maybeSingle();

    if (personError) {
      throw new Error(`Failed to fetch person: ${personError.message}`);
    }
    if (!person) {
      throw new NotFoundError('Person not found');
    }

    const { data: recordsData, error: recordsError } = await client
      .from('person_money_records')
      .select('id, user_id, person_id, name, amount_paise, direction, record_date, notes, archived_at, created_at, updated_at')
      .eq('person_id', personId)
      .eq('user_id', userId)
      .order('record_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (recordsError) {
      throw new Error(`Failed to fetch person records: ${recordsError.message}`);
    }

    const records: StoredPersonMoneyRecord[] = recordsData || [];
    const recordIds = records.map((r) => r.id);

    let settlements: StoredPersonMoneySettlement[] = [];
    if (recordIds.length > 0) {
      const { data: settlementsData, error: settlementsError } = await client
        .from('person_money_settlements')
        .select('id, user_id, record_id, amount_paise, settlement_date, notes, created_at')
        .in('record_id', recordIds)
        .order('settlement_date', { ascending: false });

      if (settlementsError) {
        throw new Error(`Failed to fetch settlements: ${settlementsError.message}`);
      }
      settlements = settlementsData || [];
    }

    const settlementsByRecord = new Map<string, StoredPersonMoneySettlement[]>();
    for (const s of settlements) {
      const arr = settlementsByRecord.get(s.record_id) || [];
      arr.push(s);
      settlementsByRecord.set(s.record_id, arr);
    }

    const basePersonDTO = mapToPersonDTO(person, records, settlementsByRecord);
    const recordsDTO = records.map((r) =>
      mapToRecordDTO(r, settlementsByRecord.get(r.id) || [])
    );

    return {
      person: {
        ...basePersonDTO,
        records: recordsDTO,
      },
    };
  }

  async createPerson(
    userId: string,
    input: ValidatedCreatePersonInput,
    token?: string
  ): Promise<PersonDTO> {
    const client = this.getClient(token);
    const newId = input.id || uuidv7();

    const { data, error } = await client
      .from('people')
      .insert({
        id: newId,
        user_id: userId,
        name: input.name,
        direction: input.direction,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create person: ${error.message}`);
    }

    return mapToPersonDTO(data, [], new Map());
  }

  async updatePerson(
    userId: string,
    personId: string,
    input: ValidatedUpdatePersonInput,
    token?: string
  ): Promise<PersonDTO> {
    const client = this.getClient(token);

    // 1. Fetch current person
    const { data: current, error: getErr } = await client
      .from('people')
      .select('*')
      .eq('id', personId)
      .eq('user_id', userId)
      .maybeSingle();

    if (getErr || !current) {
      throw new NotFoundError('Person not found');
    }

    // 2. If direction change requested, verify ALL records are fully settled
    if (input.direction && input.direction !== current.direction) {
      const { data: records } = await client
        .from('person_money_records')
        .select('id, amount_paise, archived_at')
        .eq('person_id', personId)
        .is('archived_at', null);

      if (records && records.length > 0) {
        const recordIds = records.map((r) => r.id);
        const { data: settlements } = await client
          .from('person_money_settlements')
          .select('record_id, amount_paise')
          .in('record_id', recordIds);

        const settledMap = new Map<string, number>();
        (settlements || []).forEach((s) => {
          settledMap.set(
            s.record_id,
            (settledMap.get(s.record_id) || 0) + Number(s.amount_paise)
          );
        });

        for (const r of records) {
          const original = Number(r.amount_paise);
          const settled = settledMap.get(r.id) || 0;
          if (original > settled) {
            throw new ConflictError(
              'Cannot change direction while person has outstanding records. All records must be fully settled first.'
            );
          }
        }
      }
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (input.name !== undefined) updates.name = input.name;
    if (input.direction !== undefined) updates.direction = input.direction;

    const { data: updated, error: updateErr } = await client
      .from('people')
      .update(updates)
      .eq('id', personId)
      .eq('user_id', userId)
      .select()
      .single();

    if (updateErr) {
      throw new Error(`Failed to update person: ${updateErr.message}`);
    }

    const detail = await this.getPerson(userId, personId, token);
    return detail.person;
  }

  async archivePerson(
    userId: string,
    personId: string,
    input: ValidatedArchivePersonInput,
    token?: string
  ): Promise<PersonDTO> {
    const client = this.getClient(token);

    const { data: current, error: getErr } = await client
      .from('people')
      .select('*')
      .eq('id', personId)
      .eq('user_id', userId)
      .maybeSingle();

    if (getErr || !current) {
      throw new NotFoundError('Person not found');
    }

    const archivedAt = input.archived ? new Date().toISOString() : null;

    const { data: updated, error: updateErr } = await client
      .from('people')
      .update({
        archived_at: archivedAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', personId)
      .eq('user_id', userId)
      .select()
      .single();

    if (updateErr) {
      throw new Error(`Failed to archive person: ${updateErr.message}`);
    }

    const detail = await this.getPerson(userId, personId, token);
    return detail.person;
  }

  async createRecord(
    userId: string,
    personId: string,
    input: ValidatedCreatePersonRecordInput,
    token?: string
  ): Promise<CreatePersonRecordResponse> {
    const client = this.getClient(token);

    // Verify person exists and belongs to user
    const { data: person, error: personErr } = await client
      .from('people')
      .select('id, name, direction, archived_at')
      .eq('id', personId)
      .eq('user_id', userId)
      .maybeSingle();

    if (personErr || !person) {
      throw new NotFoundError('Person not found');
    }

    if (person.archived_at) {
      throw new ConflictError('Cannot add money record to an archived person');
    }

    const newRecordId = input.id || uuidv7();

    const { data: newRecord, error: recordErr } = await client
      .from('person_money_records')
      .insert({
        id: newRecordId,
        user_id: userId,
        person_id: personId,
        name: input.name,
        amount_paise: input.amount_paise.toString(),
        direction: person.direction, // Inherited from person
        record_date: input.record_date,
        notes: input.notes,
      })
      .select()
      .single();

    if (recordErr) {
      throw new Error(`Failed to create record: ${recordErr.message}`);
    }

    // Touch person updated_at
    await client
      .from('people')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', personId);

    const recordDTO = mapToRecordDTO(newRecord, []);
    const detail = await this.getPerson(userId, personId, token);

    return {
      record: recordDTO,
      person: detail.person,
    };
  }

  async recordSettlement(
    userId: string,
    recordId: string,
    input: ValidatedRecordSettlementInput,
    token?: string
  ): Promise<RecordSettlementResponse> {
    const client = this.getClient(token);
    const settlementId = input.id || uuidv7();

    // Call atomic stored procedure
    const { data, error } = await client.rpc('fn_record_person_settlement', {
      p_id: settlementId,
      p_record_id: recordId,
      p_amount_paise: input.amount_paise.toString(),
      p_settlement_date: input.settlement_date,
      p_notes: input.notes,
    });

    if (error) {
      if (error.message.includes('exceeds remaining outstanding balance')) {
        throw new ConflictError(error.message);
      }
      if (error.code === '23505' || error.message.includes('already exists with different attributes')) {
        throw new ConflictError(error.message);
      }
      if (error.code === 'P0002') {
        throw new NotFoundError('Money record not found');
      }
      throw new Error(`Failed to record settlement: ${error.message}`);
    }

    // Fetch updated record and person details
    const { data: recRow } = await client
      .from('person_money_records')
      .select('person_id')
      .eq('id', recordId)
      .single();

    const personDetail = await this.getPerson(userId, recRow!.person_id, token);
    const updatedRecord = personDetail.person.records.find((r) => r.id === recordId)!;

    return {
      settlement: mapToSettlementDTO(data),
      record: updatedRecord,
      person: personDetail.person,
    };
  }
}

/**
 * High-fidelity in-memory implementation for automated tests, CI, and local emulation.
 */
export class InMemoryPeopleService implements IPeopleService {
  public people: StoredPersonRecord[] = [];
  public records: StoredPersonMoneyRecord[] = [];
  public settlements: StoredPersonMoneySettlement[] = [];

  async listPeople(
    userId: string,
    query: ValidatedPersonListQuery
  ): Promise<PersonListResponse> {
    let list = this.people.filter((p) => p.user_id === userId);

    if (!query.include_archived) {
      list = list.filter((p) => p.archived_at === null);
    }
    if (query.direction) {
      list = list.filter((p) => p.direction === query.direction);
    }
    if (query.search) {
      const q = query.search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }

    list.sort((a, b) => b.created_at.localeCompare(a.created_at));

    const settlementsByRecord = new Map<string, StoredPersonMoneySettlement[]>();
    for (const s of this.settlements.filter((s) => s.user_id === userId)) {
      const arr = settlementsByRecord.get(s.record_id) || [];
      arr.push(s);
      settlementsByRecord.set(s.record_id, arr);
    }

    const recordsByPerson = new Map<string, StoredPersonMoneyRecord[]>();
    for (const r of this.records.filter((r) => r.user_id === userId)) {
      const arr = recordsByPerson.get(r.person_id) || [];
      arr.push(r);
      recordsByPerson.set(r.person_id, arr);
    }

    const peopleDTOs = list.map((p) =>
      mapToPersonDTO(
        p,
        recordsByPerson.get(p.id) || [],
        settlementsByRecord
      )
    );

    return { people: peopleDTOs };
  }

  async getPerson(
    userId: string,
    personId: string
  ): Promise<PersonDetailResponse> {
    const person = this.people.find(
      (p) => p.id === personId && p.user_id === userId
    );

    if (!person) {
      throw new NotFoundError('Person not found');
    }

    const records = this.records
      .filter((r) => r.person_id === personId && r.user_id === userId)
      .sort((a, b) => {
        const d = b.record_date.localeCompare(a.record_date);
        if (d !== 0) return d;
        return b.created_at.localeCompare(a.created_at);
      });

    const settlementsByRecord = new Map<string, StoredPersonMoneySettlement[]>();
    for (const s of this.settlements.filter((s) => s.user_id === userId)) {
      const arr = settlementsByRecord.get(s.record_id) || [];
      arr.push(s);
      settlementsByRecord.set(s.record_id, arr);
    }

    const basePersonDTO = mapToPersonDTO(person, records, settlementsByRecord);
    const recordsDTO = records.map((r) =>
      mapToRecordDTO(r, settlementsByRecord.get(r.id) || [])
    );

    return {
      person: {
        ...basePersonDTO,
        records: recordsDTO,
      },
    };
  }

  async createPerson(
    userId: string,
    input: ValidatedCreatePersonInput
  ): Promise<PersonDTO> {
    const now = new Date().toISOString();
    const newPerson: StoredPersonRecord = {
      id: input.id || uuidv7(),
      user_id: userId,
      name: input.name,
      direction: input.direction,
      archived_at: null,
      created_at: now,
      updated_at: now,
    };

    this.people.push(newPerson);
    return mapToPersonDTO(newPerson, [], new Map());
  }

  async updatePerson(
    userId: string,
    personId: string,
    input: ValidatedUpdatePersonInput
  ): Promise<PersonDTO> {
    const person = this.people.find(
      (p) => p.id === personId && p.user_id === userId
    );

    if (!person) {
      throw new NotFoundError('Person not found');
    }

    // Direction change validation: all active records must have remaining = 0
    if (input.direction && input.direction !== person.direction) {
      const personRecords = this.records.filter(
        (r) => r.person_id === personId && r.user_id === userId && r.archived_at === null
      );

      for (const r of personRecords) {
        const settled = this.settlements
          .filter((s) => s.record_id === r.id && s.user_id === userId)
          .reduce((acc, s) => acc + s.amount_paise, 0);

        if (r.amount_paise > settled) {
          throw new ConflictError(
            'Cannot change direction while person has outstanding records. All records must be fully settled first.'
          );
        }
      }
    }

    if (input.name !== undefined) person.name = input.name;
    if (input.direction !== undefined) person.direction = input.direction;
    person.updated_at = new Date().toISOString();

    const detail = await this.getPerson(userId, personId);
    return detail.person;
  }

  async archivePerson(
    userId: string,
    personId: string,
    input: ValidatedArchivePersonInput
  ): Promise<PersonDTO> {
    const person = this.people.find(
      (p) => p.id === personId && p.user_id === userId
    );

    if (!person) {
      throw new NotFoundError('Person not found');
    }

    person.archived_at = input.archived ? new Date().toISOString() : null;
    person.updated_at = new Date().toISOString();

    const detail = await this.getPerson(userId, personId);
    return detail.person;
  }

  async createRecord(
    userId: string,
    personId: string,
    input: ValidatedCreatePersonRecordInput
  ): Promise<CreatePersonRecordResponse> {
    const person = this.people.find(
      (p) => p.id === personId && p.user_id === userId
    );

    if (!person) {
      throw new NotFoundError('Person not found');
    }

    if (person.archived_at) {
      throw new ConflictError('Cannot add money record to an archived person');
    }

    const now = new Date().toISOString();
    const newRecord: StoredPersonMoneyRecord = {
      id: input.id || uuidv7(),
      user_id: userId,
      person_id: personId,
      name: input.name,
      amount_paise: Number(input.amount_paise),
      direction: person.direction, // Inherited from person
      record_date: input.record_date,
      notes: input.notes,
      archived_at: null,
      created_at: now,
      updated_at: now,
    };

    this.records.push(newRecord);
    person.updated_at = now;

    const recordDTO = mapToRecordDTO(newRecord, []);
    const detail = await this.getPerson(userId, personId);

    return {
      record: recordDTO,
      person: detail.person,
    };
  }

  async recordSettlement(
    userId: string,
    recordId: string,
    input: ValidatedRecordSettlementInput
  ): Promise<RecordSettlementResponse> {
    const record = this.records.find(
      (r) => r.id === recordId && r.user_id === userId
    );

    if (!record) {
      throw new NotFoundError('Money record not found');
    }

    if (record.archived_at) {
      throw new ConflictError('Cannot record settlement for an archived record');
    }

    // Idempotency check: if explicit settlement ID provided, check for existing
    if (input.id) {
      const existingSettlement = this.settlements.find(
        (s) => s.id === input.id && s.user_id === userId
      );

      if (existingSettlement) {
        if (
          existingSettlement.record_id === recordId &&
          existingSettlement.amount_paise === Number(input.amount_paise) &&
          existingSettlement.settlement_date === input.settlement_date
        ) {
          const personDetail = await this.getPerson(userId, record.person_id);
          const currentRecord = personDetail.person.records.find((r) => r.id === recordId)!;
          return {
            settlement: mapToSettlementDTO(existingSettlement),
            record: currentRecord,
            person: personDetail.person,
          };
        }

        throw new ConflictError(
          'A settlement with this ID already exists with different attributes'
        );
      }
    }

    const alreadySettled = this.settlements
      .filter((s) => s.record_id === recordId && s.user_id === userId)
      .reduce((acc, s) => acc + s.amount_paise, 0);

    const remaining = record.amount_paise - alreadySettled;
    const amountToSettle = Number(input.amount_paise);

    if (amountToSettle > remaining) {
      throw new ConflictError(
        `Settlement amount (${amountToSettle} paise) exceeds remaining outstanding balance (${remaining} paise)`
      );
    }

    const now = new Date().toISOString();
    const newSettlement: StoredPersonMoneySettlement = {
      id: input.id || uuidv7(),
      user_id: userId,
      record_id: recordId,
      amount_paise: amountToSettle,
      settlement_date: input.settlement_date,
      notes: input.notes,
      created_at: now,
    };

    this.settlements.push(newSettlement);
    record.updated_at = now;

    const person = this.people.find((p) => p.id === record.person_id);
    if (person) person.updated_at = now;

    const personDetail = await this.getPerson(userId, record.person_id);
    const updatedRecord = personDetail.person.records.find((r) => r.id === recordId)!;

    return {
      settlement: mapToSettlementDTO(newSettlement),
      record: updatedRecord,
      person: personDetail.person,
    };
  }
}
