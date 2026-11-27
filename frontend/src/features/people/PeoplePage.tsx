'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Badge } from '@/components/ui/Badge';
import type {
  PersonDTO,
  PersonDetailDTO,
  PersonMoneyRecordDTO,
  PersonDirection,
} from '@arth/contracts';
import {
  fetchPeople,
  fetchPersonDetail,
  createPerson,
  updatePerson,
  archivePerson,
  createPersonRecord,
  recordSettlement,
} from '@/lib/api-client';
import { getTodayIST, formatPaiseToINR } from '@/lib/format';
import { getCachedPeople, setCachedPeople, getCachedPersonDetail, setCachedPersonDetail } from '@/lib/offline-db';
import { useStandalonePwa } from '@/features/pwa/useStandalonePwa';
import { useBackHandler } from '@/features/navigation';
import { sanitizeUserFacingError } from '@/lib/error-utils';

interface PeoplePageProps {
  userId: string;
  onRefreshShell?: () => void;
}

export function PeoplePage({ userId, onRefreshShell }: PeoplePageProps) {
  const isPwa = useStandalonePwa();
  const [people, setPeople] = useState<PersonDTO[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [loadTrigger, setLoadTrigger] = useState<number>(0);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [directionFilter, setDirectionFilter] = useState<'all' | PersonDirection>('all');
  const [showArchived, setShowArchived] = useState<boolean>(false);

  // Modals & Sub-views
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [personDetail, setPersonDetail] = useState<PersonDetailDTO | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState<boolean>(false);
  const [isAddPersonOpen, setIsAddPersonOpen] = useState<boolean>(false);

  // Add Record Modal
  const [isAddRecordOpen, setIsAddRecordOpen] = useState<boolean>(false);
  const [newRecordName, setNewRecordName] = useState<string>('');
  const [newRecordAmount, setNewRecordAmount] = useState<string>('');
  const [newRecordDate, setNewRecordDate] = useState<string>(() => getTodayIST());
  const [newRecordNotes, setNewRecordNotes] = useState<string>('');
  const [recordError, setRecordError] = useState<string | null>(null);
  const [isSubmittingRecord, setIsSubmittingRecord] = useState<boolean>(false);

  // Record Settlement Modal
  const [settlingRecord, setSettlingRecord] = useState<PersonMoneyRecordDTO | null>(null);
  const [settlementAmount, setSettlementAmount] = useState<string>('');
  const [settlementDate, setSettlementDate] = useState<string>(() => getTodayIST());
  const [settlementNotes, setSettlementNotes] = useState<string>('');
  const [settlementError, setSettlementError] = useState<string | null>(null);
  const [isSubmittingSettlement, setIsSubmittingSettlement] = useState<boolean>(false);

  // Rename Person Modal
  const [isRenameOpen, setIsRenameOpen] = useState<boolean>(false);
  const [editName, setEditName] = useState<string>('');
  const [renameError, setRenameError] = useState<string | null>(null);

  // Change Direction Modal
  const [isChangeDirOpen, setIsChangeDirOpen] = useState<boolean>(false);
  const [changeDirError, setChangeDirError] = useState<string | null>(null);

  // Archive Confirm Modal
  const [isArchiveConfirmOpen, setIsArchiveConfirmOpen] = useState<boolean>(false);

  // Add Person Form State
  const [newPersonName, setNewPersonName] = useState<string>('');
  const [newPersonDirection, setNewPersonDirection] = useState<PersonDirection>('they_owe_me');
  const [addPersonError, setAddPersonError] = useState<string | null>(null);
  const [isCreatingPerson, setIsCreatingPerson] = useState<boolean>(false);

  // Record filter within detail view
  const [recordStatusFilter, setRecordStatusFilter] = useState<'all' | 'unsettled' | 'settled'>('all');
  // Priority 1: Back handler for archive confirmation
  useBackHandler({
    id: 'dialog-archive-person',
    priority: 'dialog',
    enabled: isArchiveConfirmOpen,
    onBack: () => {
      setIsArchiveConfirmOpen(false);
      return true;
    },
  });

  // Priority 1: Back handler for change direction confirmation
  useBackHandler({
    id: 'dialog-change-direction',
    priority: 'dialog',
    enabled: isChangeDirOpen,
    onBack: () => {
      setIsChangeDirOpen(false);
      return true;
    },
  });

  // Priority 1b: Back handler for settling money record
  useBackHandler({
    id: 'modal-settle-record',
    priority: 'modal',
    enabled: Boolean(settlingRecord),
    onBack: () => {
      setSettlingRecord(null);
      return true;
    },
  });

  // Priority 1b: Back handler for rename person modal
  useBackHandler({
    id: 'modal-rename-person',
    priority: 'modal',
    enabled: isRenameOpen,
    onBack: () => {
      setIsRenameOpen(false);
      return true;
    },
  });

  // Priority 1b: Back handler for add record modal
  useBackHandler({
    id: 'modal-add-record',
    priority: 'modal',
    enabled: isAddRecordOpen,
    onBack: () => {
      setIsAddRecordOpen(false);
      return true;
    },
  });

  // Priority 1b: Back handler for person details drawer/modal
  useBackHandler({
    id: 'modal-person-detail',
    priority: 'modal',
    enabled: Boolean(personDetail),
    onBack: () => {
      setPersonDetail(null);
      setSelectedPersonId(null);
      return true;
    },
  });

  // Priority 1b: Back handler for add person modal
  useBackHandler({
    id: 'modal-add-person',
    priority: 'modal',
    enabled: isAddPersonOpen,
    onBack: () => {
      setIsAddPersonOpen(false);
      return true;
    },
  });

  // Load people list
  useEffect(() => {
    let isMounted = true;

    if (isPwa) void getCachedPeople(userId).then((cached) => {
      if (isMounted && cached.length) { setPeople(cached); setIsLoading(false); }
    });

    fetchPeople({
      include_archived: showArchived,
      direction: directionFilter === 'all' ? undefined : directionFilter,
    })
      .then((res) => {
        if (!isMounted) return;
        setPeople(res.people || []);
        void setCachedPeople(userId, res.people || []);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        const msg = sanitizeUserFacingError(err, 'Failed to load people. Check your connection.');
        if (!isPwa) { setErrorMessage(msg); setIsLoading(false); return; }
        void getCachedPeople(userId).then((cached) => {
          if (!isMounted || cached.length) return;
          setErrorMessage(`${msg}. No saved offline copy is available.`);
        });
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [directionFilter, showArchived, loadTrigger, userId, isPwa]);

  // Load single person details when selected
  useEffect(() => {
    if (!selectedPersonId) return;

    let isMounted = true;

    if (isPwa) void getCachedPersonDetail(userId, selectedPersonId).then((cached) => {
      if (isMounted && cached) { setPersonDetail(cached); setIsDetailLoading(false); }
    });
    fetchPersonDetail(selectedPersonId)
      .then((res) => {
        if (!isMounted) return;
        setPersonDetail(res.person);
        void setCachedPersonDetail(userId, selectedPersonId, res.person);
        setIsDetailLoading(false);
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        const msg = sanitizeUserFacingError(err, 'Failed to load person details. Check your connection.');
        if (!isPwa) { setErrorMessage(msg); setIsDetailLoading(false); return; }
        void getCachedPersonDetail(userId, selectedPersonId).then((cached) => {
          if (!isMounted || cached) return;
          setErrorMessage(`${msg}. No saved offline copy is available.`);
        });
        setIsDetailLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedPersonId, loadTrigger, userId, isPwa]);

  const showNotification = (msg: string) => {
    setSuccessBanner(msg);
    setTimeout(() => {
      setSuccessBanner(null);
    }, 4000);
  };

  const closePersonDetail = () => {
    setSelectedPersonId(null);
    setPersonDetail(null);
  };

  // Filtered people by search query
  const filteredPeople = useMemo(() => {
    if (!searchQuery.trim()) return people;
    const q = searchQuery.toLowerCase().trim();
    return people.filter((p) => p.name.toLowerCase().includes(q));
  }, [people, searchQuery]);

  // Filtered records within detail view
  const visibleRecords = useMemo(() => {
    if (!personDetail) return [];
    if (recordStatusFilter === 'all') return personDetail.records;
    if (recordStatusFilter === 'unsettled') {
      return personDetail.records.filter((r) => r.status !== 'settled');
    }
    return personDetail.records.filter((r) => r.status === 'settled');
  }, [personDetail, recordStatusFilter]);

  // Handle Add Person Submit
  const handleAddPersonSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newPersonName.trim();
    if (!trimmed) {
      setAddPersonError('Person name is required');
      return;
    }

    setIsCreatingPerson(true);
    setAddPersonError(null);
    try {
      const res = await createPerson({
        name: trimmed,
        direction: newPersonDirection,
      });

      setNewPersonName('');
      setIsAddPersonOpen(false);
      setLoadTrigger((prev) => prev + 1);
      onRefreshShell?.();
      showNotification(`Added ${res.person.name}`);
      setSelectedPersonId(res.person.id);
    } catch (err: unknown) {
      setAddPersonError(sanitizeUserFacingError(err, 'Failed to add person. Please try again.'));
    } finally {
      setIsCreatingPerson(false);
    }
  };

  // Handle Add Record Submit
  const handleAddRecordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!personDetail) return;
    const trimmed = newRecordName.trim();
    if (!trimmed) {
      setRecordError('Transaction name is required');
      return;
    }
    if (!newRecordAmount || Number(newRecordAmount) <= 0) {
      setRecordError('Please enter a valid positive amount');
      return;
    }

    setIsSubmittingRecord(true);
    setRecordError(null);
    try {
      await createPersonRecord(personDetail.id, {
        name: trimmed,
        amount: newRecordAmount,
        record_date: newRecordDate,
        notes: newRecordNotes.trim() || null,
      });

      setNewRecordName('');
      setNewRecordAmount('');
      setNewRecordNotes('');
      setIsAddRecordOpen(false);
      setLoadTrigger((prev) => prev + 1);
      onRefreshShell?.();
      showNotification(`Recorded ${trimmed}`);
    } catch (err: unknown) {
      setRecordError(sanitizeUserFacingError(err, 'Failed to create record. Please try again.'));
    } finally {
      setIsSubmittingRecord(false);
    }
  };

  // Open Settlement Modal
  const openSettlement = (record: PersonMoneyRecordDTO) => {
    setSettlingRecord(record);
    const remainingDecimal = (record.remaining_paise / 100).toFixed(2);
    setSettlementAmount(remainingDecimal);
    setSettlementDate(getTodayIST());
    setSettlementNotes('');
    setSettlementError(null);
  };

  // Handle Settlement Submit
  const handleSettlementSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settlingRecord) return;

    if (!settlementAmount || Number(settlementAmount) <= 0) {
      setSettlementError('Please enter a valid positive settlement amount');
      return;
    }

    setIsSubmittingSettlement(true);
    setSettlementError(null);
    try {
      await recordSettlement(settlingRecord.id, {
        amount: settlementAmount,
        settlement_date: settlementDate,
        notes: settlementNotes.trim() || null,
      });

      setSettlingRecord(null);
      setLoadTrigger((prev) => prev + 1);
      onRefreshShell?.();
      showNotification('Settlement recorded successfully');
    } catch (err: unknown) {
      setSettlementError(sanitizeUserFacingError(err, 'Failed to record settlement. Please try again.'));
    } finally {
      setIsSubmittingSettlement(false);
    }
  };

  // Handle Rename Submit
  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!personDetail) return;
    const trimmed = editName.trim();
    if (!trimmed) {
      setRenameError('Name cannot be empty');
      return;
    }

    try {
      await updatePerson(personDetail.id, { name: trimmed });
      setIsRenameOpen(false);
      setLoadTrigger((prev) => prev + 1);
      showNotification(`Renamed to "${trimmed}"`);
    } catch (err: unknown) {
      setRenameError(sanitizeUserFacingError(err, 'Failed to rename person. Please try again.'));
    }
  };

  // Handle Direction Change Submit
  const handleChangeDirectionSubmit = async () => {
    if (!personDetail) return;
    const targetDirection: PersonDirection =
      personDetail.direction === 'i_owe_them' ? 'they_owe_me' : 'i_owe_them';

    try {
      await updatePerson(personDetail.id, { direction: targetDirection });
      setIsChangeDirOpen(false);
      setLoadTrigger((prev) => prev + 1);
      showNotification(
        `Direction changed to "${targetDirection === 'i_owe_them' ? 'I owe them' : 'They owe me'}"`
      );
    } catch (err: unknown) {
      setChangeDirError(sanitizeUserFacingError(err, 'Failed to change direction. Please try again.'));
    }
  };

  // Handle Archive / Restore
  const handleArchiveToggle = async () => {
    if (!personDetail) return;
    try {
      const targetState = !personDetail.is_archived;
      await archivePerson(personDetail.id, targetState);
      setIsArchiveConfirmOpen(false);
      setLoadTrigger((prev) => prev + 1);
      showNotification(targetState ? `Archived ${personDetail.name}` : `Restored ${personDetail.name}`);
    } catch (err: unknown) {
      setErrorMessage(sanitizeUserFacingError(err, 'Failed to update person. Please try again.'));
    }
  };

  return (
    <div className="space-y-6">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-hairline)] pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
            People
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Track individual money obligations, repayments, and outstanding balances
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setIsAddPersonOpen(true);
            setAddPersonError(null);
          }}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] rounded-md hover:bg-[var(--action-primary-hover)] transition-colors shadow-2xs self-start sm:self-auto"
        >
          <span className="text-sm leading-none">+</span>
          <span>Add Person</span>
        </button>
      </div>

      {/* Notifications */}
      {successBanner && (
        <div className="p-3 text-xs bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-200 rounded-md flex items-center justify-between">
          <span>✓ {successBanner}</span>
          <button
            onClick={() => setSuccessBanner(null)}
            className="text-emerald-600 dark:text-emerald-400 font-bold ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="p-3 text-xs bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-800 dark:text-red-200 rounded-md flex items-center justify-between">
          <span>⚠ {errorMessage}</span>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-red-600 dark:text-red-400 font-bold ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Search and Filters Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search input */}
        <div className="relative flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by person name..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-md text-[var(--text-primary)] focus:outline-hidden focus:border-[var(--border-strong)] transition-colors"
          />
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)] select-none">
            🔍
          </span>
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              ✕
            </button>
          )}
        </div>

        {/* Direction Filter Tabs */}
        <div className="flex items-center gap-1 bg-[var(--bg-surface-subtle)] p-1 rounded-md border border-[var(--border-hairline)] self-start sm:self-auto shrink-0">
          <button
            type="button"
            onClick={() => setDirectionFilter('all')}
            className={`px-3 py-1 text-xs font-semibold rounded-xs transition-colors ${
              directionFilter === 'all'
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setDirectionFilter('they_owe_me')}
            className={`px-3 py-1 text-xs font-semibold rounded-xs transition-colors ${
              directionFilter === 'they_owe_me'
                ? 'bg-[var(--bg-surface)] text-emerald-700 dark:text-emerald-400 shadow-2xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            They owe me
          </button>
          <button
            type="button"
            onClick={() => setDirectionFilter('i_owe_them')}
            className={`px-3 py-1 text-xs font-semibold rounded-xs transition-colors ${
              directionFilter === 'i_owe_them'
                ? 'bg-[var(--bg-surface)] text-red-700 dark:text-red-400 shadow-2xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            I owe them
          </button>
        </div>

        {/* Include Archived Toggle */}
        <button
          type="button"
          onClick={() => setShowArchived((prev) => !prev)}
          className={`px-2.5 py-1 text-xs font-medium border rounded-md transition-colors self-start sm:self-auto ${
            showArchived
              ? 'bg-[var(--bg-surface)] border-[var(--border-strong)] text-[var(--text-primary)]'
              : 'border-[var(--border-hairline)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
          }`}
        >
          {showArchived ? 'Archived included' : 'Archived hidden'}
        </button>
      </div>

      {/* People Grid / List */}
      {isLoading ? (
        <div className="py-16 text-center text-xs text-[var(--text-muted)] font-mono">
          Loading people...
        </div>
      ) : filteredPeople.length === 0 ? (
        <div className="py-16 text-center px-4 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl space-y-3">
          <span className="text-3xl select-none">👥</span>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            No people found
          </h2>
          <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto">
            {searchQuery
              ? `No one matching "${searchQuery}". Clear your search to see all people.`
              : 'Add your first person to start tracking who you owe money to and who owes you.'}
          </p>
          <div>
            <button
              type="button"
              onClick={() => {
                setIsAddPersonOpen(true);
                setAddPersonError(null);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] rounded-md hover:bg-[var(--action-primary-hover)] transition-colors shadow-2xs"
            >
              <span className="text-sm leading-none">+</span>
              <span>Add First Person</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filteredPeople.map((person) => {
            const isIOweThem = person.direction === 'i_owe_them';
            const isSettled = person.outstanding_paise === 0;

            let cardAccentClass = '';
            let labelClass = '';
            let amountClass = '';

            if (isSettled) {
              cardAccentClass = 'border-[var(--border-hairline)]';
              labelClass = 'text-[var(--text-muted)]';
              amountClass = 'text-[var(--text-secondary)]';
            } else if (isIOweThem) {
              cardAccentClass =
                'border-red-200 dark:border-red-900/60 bg-red-50/20 dark:bg-red-950/10 hover:border-red-300 dark:hover:border-red-800';
              labelClass = 'text-red-700 dark:text-red-400 font-medium';
              amountClass = 'text-red-700 dark:text-red-400 font-bold';
            } else {
              cardAccentClass =
                'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/20 dark:bg-emerald-950/10 hover:border-emerald-300 dark:hover:border-emerald-800';
              labelClass = 'text-emerald-700 dark:text-emerald-400 font-medium';
              amountClass = 'text-emerald-700 dark:text-emerald-400 font-bold';
            }

            return (
              <div
                key={person.id}
                onClick={() => setSelectedPersonId(person.id)}
                className={`p-4 bg-[var(--bg-surface)] border rounded-lg transition-all cursor-pointer hover:shadow-xs flex flex-col justify-between gap-3 ${cardAccentClass}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-[var(--text-primary)] truncate">
                        {person.name}
                      </h3>
                      {person.is_archived && (
                        <span className="text-[9px] uppercase tracking-wider font-mono font-medium px-1.5 py-0.5 rounded-xs bg-[var(--bg-surface-subtle)] text-[var(--text-muted)] border border-[var(--border-hairline)]">
                          Archived
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-[var(--text-secondary)]">
                      {isIOweThem ? 'I owe them' : 'They owe me'} • {person.records_count} {person.records_count === 1 ? 'record' : 'records'}
                    </span>
                  </div>

                  <Badge variant={isIOweThem ? 'expense' : 'income'} size="xs" dot={true}>
                    {isIOweThem ? 'I Owe' : 'Owes Me'}
                  </Badge>
                </div>

                <div className="pt-2 border-t border-[var(--border-hairline)] flex items-baseline justify-between">
                  <span className={`text-xs ${labelClass}`}>
                    {person.status_label}
                  </span>
                  <span className={`text-base font-mono ${amountClass}`}>
                    {person.formatted_outstanding}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── ADD PERSON MODAL ─── */}
      {isAddPersonOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-2xs">
          <form
            onSubmit={handleAddPersonSubmit}
            className="w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg p-5 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-[var(--border-hairline)] pb-3">
              <h2 className="text-sm font-bold text-[var(--text-primary)]">
                Add Person
              </h2>
              <button
                type="button"
                onClick={() => setIsAddPersonOpen(false)}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                ✕
              </button>
            </div>

            {addPersonError && (
              <div className="p-2.5 text-xs bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 rounded-md">
                {addPersonError}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label
                  htmlFor="person-name-input"
                  className="block text-xs font-medium text-[var(--text-secondary)] mb-1"
                >
                  Person Name
                </label>
                <input
                  id="person-name-input"
                  type="text"
                  autoFocus
                  required
                  value={newPersonName}
                  onChange={(e) => setNewPersonName(e.target.value)}
                  placeholder="e.g. Rahul, Amit, Priya"
                  maxLength={100}
                  className="w-full px-3 py-2 text-sm bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-md text-[var(--text-primary)] focus:outline-hidden focus:border-[var(--border-strong)] transition-colors"
                />
              </div>

              <div>
                <span className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  Relationship Direction
                </span>
                <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewPersonDirection('they_owe_me')}
                    className={`p-3 text-left border rounded-md transition-all flex flex-col gap-1 ${
                      newPersonDirection === 'they_owe_me'
                        ? 'border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/30 ring-1 ring-emerald-500'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]'
                    }`}
                  >
                    <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                      They owe me
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)] leading-tight">
                      Green accent • Money this person borrowed from me
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewPersonDirection('i_owe_them')}
                    className={`p-3 text-left border rounded-md transition-all flex flex-col gap-1 ${
                      newPersonDirection === 'i_owe_them'
                        ? 'border-red-500 bg-red-50/40 dark:bg-red-950/30 ring-1 ring-red-500'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]'
                    }`}
                  >
                    <span className="text-xs font-bold text-red-700 dark:text-red-400">
                      I owe them
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)] leading-tight">
                      Red accent • Money I borrowed from this person
                    </span>
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border-hairline)]">
              <button
                type="button"
                onClick={() => setIsAddPersonOpen(false)}
                className="px-3 py-1.5 text-xs font-medium border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-md"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isCreatingPerson || !newPersonName.trim()}
                className="px-4 py-1.5 text-xs font-semibold bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] rounded-md hover:bg-[var(--action-primary-hover)] disabled:opacity-50 transition-colors shadow-2xs"
              >
                {isCreatingPerson ? 'Adding...' : 'Add Person'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ─── PERSON DETAILS MODAL / DRAWER ─── */}
      {selectedPersonId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl shadow-2xl overflow-hidden my-auto max-h-[90vh] flex flex-col">
            {/* Detail Header */}
            {personDetail ? (
              <div
                className={`p-4 sm:p-5 border-b flex flex-col gap-3 ${
                  personDetail.direction === 'i_owe_them'
                    ? 'border-red-200 dark:border-red-900/50 bg-red-50/20 dark:bg-red-950/20'
                    : 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/20 dark:bg-emerald-950/20'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={closePersonDetail}
                      className="px-2 py-1 text-xs font-medium border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-md mr-1"
                    >
                      &larr; Back
                    </button>
                    <h2 className="text-lg font-bold text-[var(--text-primary)] truncate">
                      {personDetail.name}
                    </h2>
                    {personDetail.is_archived && (
                      <span className="text-[9px] uppercase tracking-wider font-mono font-medium px-1.5 py-0.5 rounded-xs bg-[var(--bg-surface-subtle)] text-[var(--text-muted)] border border-[var(--border-hairline)]">
                        Archived
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setEditName(personDetail.name);
                        setRenameError(null);
                        setIsRenameOpen(true);
                      }}
                      className="px-2.5 py-1 text-xs font-medium border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-md transition-colors"
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setChangeDirError(null);
                        setIsChangeDirOpen(true);
                      }}
                      disabled={personDetail.active_records_count > 0}
                      title={
                        personDetail.active_records_count > 0
                          ? 'Cannot change direction while person has unsettled records'
                          : 'Change relationship direction'
                      }
                      className="px-2.5 py-1 text-xs font-medium border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 rounded-md transition-colors"
                    >
                      Change Direction
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsArchiveConfirmOpen(true)}
                      className="px-2.5 py-1 text-xs font-medium border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-md transition-colors"
                    >
                      {personDetail.is_archived ? 'Restore' : 'Archive'}
                    </button>
                    <button
                      type="button"
                      onClick={closePersonDetail}
                      className="w-7 h-7 flex items-center justify-center text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Outstanding Balance Banner: Strictly ONE direction and ONE balance */}
                <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 pt-2 border-t border-[var(--border-hairline)]">
                  <div>
                    <span
                      className={`text-xs font-bold ${
                        personDetail.direction === 'i_owe_them'
                          ? 'text-red-700 dark:text-red-400'
                          : 'text-emerald-700 dark:text-emerald-400'
                      }`}
                    >
                      {personDetail.status_label}
                    </span>
                    <span className="block text-[11px] text-[var(--text-secondary)] mt-0.5">
                      Total: {formatPaiseToINR(personDetail.total_original_paise)} • Settled: {formatPaiseToINR(personDetail.total_settled_paise)}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={`text-2xl font-mono font-bold ${
                        personDetail.direction === 'i_owe_them'
                          ? 'text-red-700 dark:text-red-400'
                          : 'text-emerald-700 dark:text-emerald-400'
                      }`}
                    >
                      {personDetail.formatted_outstanding}
                    </span>

                    {!personDetail.is_archived && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddRecordOpen(true);
                          setRecordError(null);
                        }}
                        className="px-3 py-1.5 text-xs font-semibold bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] rounded-md hover:bg-[var(--action-primary-hover)] transition-colors shadow-2xs shrink-0"
                      >
                        + Add Record
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-[var(--text-muted)] font-mono">
                {isDetailLoading ? 'Loading details...' : 'Person details unavailable'}
              </div>
            )}

            {/* Filter Tabs for Records */}
            {personDetail && (
              <div className="p-3 border-b border-[var(--border-hairline)] flex items-center justify-between gap-2 bg-[var(--bg-surface-subtle)]/40">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setRecordStatusFilter('all')}
                    className={`px-2.5 py-1 text-xs font-medium rounded-xs transition-colors ${
                      recordStatusFilter === 'all'
                        ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xs font-semibold'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    All Records ({personDetail.records.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecordStatusFilter('unsettled')}
                    className={`px-2.5 py-1 text-xs font-medium rounded-xs transition-colors ${
                      recordStatusFilter === 'unsettled'
                        ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xs font-semibold'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    Outstanding ({personDetail.active_records_count})
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecordStatusFilter('settled')}
                    className={`px-2.5 py-1 text-xs font-medium rounded-xs transition-colors ${
                      recordStatusFilter === 'settled'
                        ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xs font-semibold'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    Settled ({personDetail.records.length - personDetail.active_records_count})
                  </button>
                </div>

                <span className="text-[11px] text-[var(--text-muted)] font-mono">
                  {visibleRecords.length} shown
                </span>
              </div>
            )}

            {/* Records Feed */}
            <div className="p-4 overflow-y-auto space-y-3 flex-1">
              {personDetail && visibleRecords.length === 0 ? (
                <div className="py-12 text-center text-xs text-[var(--text-muted)] space-y-2">
                  <p>No records in this category.</p>
                  {!personDetail.is_archived && (
                    <button
                      type="button"
                      onClick={() => setIsAddRecordOpen(true)}
                      className="text-xs font-semibold text-[var(--text-primary)] underline"
                    >
                      Add a record now
                    </button>
                  )}
                </div>
              ) : (
                visibleRecords.map((record) => {
                  const isRecordSettled = record.status === 'settled';
                  const isRecordPartial = record.status === 'partially_settled';

                  return (
                    <div
                      key={record.id}
                      className="p-3.5 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-lg space-y-2 hover:border-[var(--border-subtle)] transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-[var(--text-primary)]">
                              {record.name}
                            </span>
                            <Badge
                              variant={
                                isRecordSettled
                                  ? 'success'
                                  : isRecordPartial
                                  ? 'warning'
                                  : 'neutral'
                              }
                              size="xs"
                              dot={true}
                            >
                              {record.status === 'settled'
                                ? 'Settled'
                                : record.status === 'partially_settled'
                                ? 'Partially Settled'
                                : 'Outstanding'}
                            </Badge>
                          </div>
                          <span className="text-[11px] text-[var(--text-muted)] font-mono">
                            {record.record_date}
                          </span>
                        </div>

                        <div className="text-right">
                          <span className="block text-sm font-mono font-bold text-[var(--text-primary)]">
                            {record.formatted_remaining}
                          </span>
                          <span className="text-[10px] text-[var(--text-muted)] font-mono">
                            Original: {record.formatted_original}
                          </span>
                        </div>
                      </div>

                      {record.notes && (
                        <p className="text-xs text-[var(--text-secondary)] bg-[var(--bg-surface-subtle)]/50 p-2 rounded-xs border border-[var(--border-hairline)]">
                          {record.notes}
                        </p>
                      )}

                      <div className="flex items-center justify-between pt-2 border-t border-[var(--border-hairline)] text-xs">
                        <span className="text-[11px] text-[var(--text-muted)] font-mono">
                          Settled: {record.formatted_settled}
                        </span>

                        {!isRecordSettled && !personDetail?.is_archived && (
                          <button
                            type="button"
                            onClick={() => openSettlement(record)}
                            className="px-3 py-1 text-xs font-semibold bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] rounded-xs hover:bg-[var(--action-primary-hover)] transition-colors shadow-2xs"
                          >
                            {personDetail?.direction === 'i_owe_them'
                              ? 'Record payment'
                              : 'Record money received'}
                          </button>
                        )}
                      </div>

                      {record.settlements.length > 0 && (
                        <div className="pt-2 border-t border-[var(--border-hairline)] space-y-1">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                            Settlement History
                          </span>
                          {record.settlements.map((s) => (
                            <div
                              key={s.id}
                              className="flex items-center justify-between text-[11px] text-[var(--text-secondary)] font-mono py-0.5"
                            >
                              <span>
                                {s.settlement_date} {s.notes ? `• ${s.notes}` : ''}
                              </span>
                              <span className="text-[var(--income-fg)] font-semibold">
                                +{s.formatted_amount}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── ADD MONEY RECORD MODAL ─── */}
      {isAddRecordOpen && personDetail && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-2xs">
          <form
            onSubmit={handleAddRecordSubmit}
            className="w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg p-5 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-[var(--border-hairline)] pb-3">
              <div>
                <h3 className="text-sm font-bold text-[var(--text-primary)]">
                  Add Money Record
                </h3>
                <span className="text-[11px] text-[var(--text-secondary)]">
                  For {personDetail.name} • Direction: {personDetail.direction === 'i_owe_them' ? 'I owe them' : 'They owe me'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsAddRecordOpen(false)}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                ✕
              </button>
            </div>

            {recordError && (
              <div className="p-2.5 text-xs bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 rounded-md">
                {recordError}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label
                  htmlFor="record-name-input"
                  className="block text-xs font-medium text-[var(--text-secondary)] mb-1"
                >
                  Transaction Name
                </label>
                <input
                  id="record-name-input"
                  type="text"
                  autoFocus
                  required
                  value={newRecordName}
                  onChange={(e) => setNewRecordName(e.target.value)}
                  placeholder="e.g. Lunch, Movie Tickets, Room Rent"
                  maxLength={100}
                  className="w-full px-3 py-2 text-sm bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-md text-[var(--text-primary)] focus:outline-hidden focus:border-[var(--border-strong)] transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="record-amount-input"
                    className="block text-xs font-medium text-[var(--text-secondary)] mb-1"
                  >
                    Amount (₹)
                  </label>
                  <input
                    id="record-amount-input"
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={newRecordAmount}
                    onChange={(e) => setNewRecordAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 text-sm font-mono bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-md text-[var(--text-primary)] focus:outline-hidden focus:border-[var(--border-strong)] transition-colors"
                  />
                </div>

                <div>
                  <label
                    htmlFor="record-date-input"
                    className="block text-xs font-medium text-[var(--text-secondary)] mb-1"
                  >
                    Date
                  </label>
                  <input
                    id="record-date-input"
                    type="date"
                    required
                    value={newRecordDate}
                    onChange={(e) => setNewRecordDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-md text-[var(--text-primary)] focus:outline-hidden focus:border-[var(--border-strong)] transition-colors"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="record-notes-input"
                  className="block text-xs font-medium text-[var(--text-secondary)] mb-1"
                >
                  Optional Note
                </label>
                <textarea
                  id="record-notes-input"
                  rows={2}
                  value={newRecordNotes}
                  onChange={(e) => setNewRecordNotes(e.target.value)}
                  placeholder="Additional context or reference..."
                  maxLength={500}
                  className="w-full px-3 py-2 text-xs bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-md text-[var(--text-primary)] focus:outline-hidden focus:border-[var(--border-strong)] transition-colors"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border-hairline)]">
              <button
                type="button"
                onClick={() => setIsAddRecordOpen(false)}
                className="px-3 py-1.5 text-xs font-medium border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-md"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingRecord || !newRecordName.trim() || !newRecordAmount}
                className="px-4 py-1.5 text-xs font-semibold bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] rounded-md hover:bg-[var(--action-primary-hover)] disabled:opacity-50 transition-colors shadow-2xs"
              >
                {isSubmittingRecord ? 'Saving...' : 'Save Record'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ─── RECORD SETTLEMENT MODAL ─── */}
      {settlingRecord && personDetail && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-2xs">
          <form
            onSubmit={handleSettlementSubmit}
            className="w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg p-5 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-[var(--border-hairline)] pb-3">
              <div>
                <h3 className="text-sm font-bold text-[var(--text-primary)]">
                  {personDetail.direction === 'i_owe_them' ? 'Record Payment' : 'Record Money Received'}
                </h3>
                <span className="text-[11px] text-[var(--text-secondary)]">
                  For &quot;{settlingRecord.name}&quot; ({personDetail.name})
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSettlingRecord(null)}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                ✕
              </button>
            </div>

            <div className="p-3 bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] rounded-md flex items-center justify-between">
              <span className="text-xs text-[var(--text-secondary)]">
                Remaining to settle:
              </span>
              <span className="text-sm font-mono font-bold text-[var(--text-primary)]">
                {settlingRecord.formatted_remaining}
              </span>
            </div>

            {settlementError && (
              <div className="p-2.5 text-xs bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 rounded-md">
                {settlementError}
              </div>
            )}

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="settle-amount-input"
                    className="block text-xs font-medium text-[var(--text-secondary)] mb-1"
                  >
                    Settlement Amount (₹)
                  </label>
                  <input
                    id="settle-amount-input"
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={(settlingRecord.remaining_paise / 100).toFixed(2)}
                    required
                    value={settlementAmount}
                    onChange={(e) => setSettlementAmount(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-md text-[var(--text-primary)] focus:outline-hidden focus:border-[var(--border-strong)] transition-colors"
                  />
                </div>

                <div>
                  <label
                    htmlFor="settle-date-input"
                    className="block text-xs font-medium text-[var(--text-secondary)] mb-1"
                  >
                    Settlement Date
                  </label>
                  <input
                    id="settle-date-input"
                    type="date"
                    required
                    value={settlementDate}
                    onChange={(e) => setSettlementDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-md text-[var(--text-primary)] focus:outline-hidden focus:border-[var(--border-strong)] transition-colors"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="settle-notes-input"
                  className="block text-xs font-medium text-[var(--text-secondary)] mb-1"
                >
                  Optional Note (UPI ref, cash, etc.)
                </label>
                <input
                  id="settle-notes-input"
                  type="text"
                  value={settlementNotes}
                  onChange={(e) => setSettlementNotes(e.target.value)}
                  placeholder="e.g. UPI transfer, Cash payment"
                  maxLength={500}
                  className="w-full px-3 py-2 text-xs bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-md text-[var(--text-primary)] focus:outline-hidden focus:border-[var(--border-strong)] transition-colors"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border-hairline)]">
              <button
                type="button"
                onClick={() => setSettlingRecord(null)}
                className="px-3 py-1.5 text-xs font-medium border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-md"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingSettlement || !settlementAmount}
                className="px-4 py-1.5 text-xs font-semibold bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] rounded-md hover:bg-[var(--action-primary-hover)] disabled:opacity-50 transition-colors shadow-2xs"
              >
                {isSubmittingSettlement ? 'Recording...' : 'Confirm Settlement'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ─── RENAME PERSON MODAL ─── */}
      {isRenameOpen && personDetail && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-2xs">
          <form
            onSubmit={handleRenameSubmit}
            className="w-full max-w-sm bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg p-5 space-y-4 shadow-xl"
          >
            <h3 className="text-sm font-bold text-[var(--text-primary)]">
              Rename Person
            </h3>

            {renameError && (
              <div className="p-2 text-xs bg-red-50 text-red-700 rounded-md">
                {renameError}
              </div>
            )}

            <div>
              <label
                htmlFor="rename-input"
                className="block text-xs font-medium text-[var(--text-secondary)] mb-1"
              >
                New Name
              </label>
              <input
                id="rename-input"
                type="text"
                autoFocus
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                maxLength={100}
                className="w-full px-3 py-2 text-sm bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-md text-[var(--text-primary)] focus:outline-hidden"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsRenameOpen(false)}
                className="px-3 py-1.5 text-xs font-medium border rounded-md"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs font-semibold bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] rounded-md"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ─── CHANGE DIRECTION CONFIRMATION MODAL ─── */}
      {isChangeDirOpen && personDetail && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-2xs">
          <div className="w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg p-5 space-y-4 shadow-xl">
            <h3 className="text-sm font-bold text-[var(--text-primary)]">
              Change Relationship Direction?
            </h3>

            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Current direction: <strong>{personDetail.direction === 'i_owe_them' ? 'I owe them' : 'They owe me'}</strong>.
              <br />
              Switch to: <strong>{personDetail.direction === 'i_owe_them' ? 'They owe me' : 'I owe them'}</strong>.
            </p>

            <div className="p-3 bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] rounded-md text-[11px] text-[var(--text-muted)]">
              ℹ Direction can only be changed when all existing records are fully settled (balance = ₹0.00).
              All historical records retain their original direction and settlement details.
            </div>

            {changeDirError && (
              <div className="p-2 text-xs bg-red-50 text-red-700 rounded-md">
                {changeDirError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsChangeDirOpen(false)}
                className="px-3 py-1.5 text-xs font-medium border rounded-md"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleChangeDirectionSubmit}
                className="px-4 py-1.5 text-xs font-semibold bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] rounded-md"
              >
                Confirm Direction Change
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── ARCHIVE CONFIRMATION MODAL ─── */}
      {isArchiveConfirmOpen && personDetail && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-2xs">
          <div className="w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg p-5 space-y-4 shadow-xl">
            <h3 className="text-sm font-bold text-[var(--text-primary)]">
              {personDetail.is_archived ? `Restore ${personDetail.name}?` : `Archive ${personDetail.name}?`}
            </h3>

            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {personDetail.is_archived
                ? `Restoring ${personDetail.name} will return them to your active people list.`
                : `Archiving hides ${personDetail.name} from the default list. All historical records, balances, and settlement history are permanently preserved.`}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsArchiveConfirmOpen(false)}
                className="px-3 py-1.5 text-xs font-medium border rounded-md"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleArchiveToggle}
                className={`px-4 py-1.5 text-xs font-semibold text-white rounded-md ${
                  personDetail.is_archived ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-600 hover:bg-amber-700'
                }`}
              >
                {personDetail.is_archived ? 'Confirm Restore' : 'Confirm Archive'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
