'use client';

import React, { useState, useEffect } from 'react';
import type {
  CategoryDTO,
  TransactionType,
} from '@arth/contracts';
import {
  fetchCategories,
  createCategory,
  updateCategory,
  archiveCategory,
  reorderCategories,
} from '@/lib/api-client';

interface CategoryManagerProps {
  onCategoryChange?: () => void;
}

const PRESET_COLORS = [
  '#059669', // Emerald
  '#2563EB', // Blue
  '#7C3AED', // Violet
  '#D97706', // Amber
  '#E11D48', // Rose
  '#0891B2', // Cyan
  '#4F46E5', // Indigo
  '#64748B', // Slate
];

export function CategoryManager({ onCategoryChange }: CategoryManagerProps) {
  const [activeTab, setActiveTab] = useState<TransactionType>('expense');
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [archivedCategories, setArchivedCategories] = useState<CategoryDTO[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // New Category Form State
  const [isAddingNew, setIsAddingNew] = useState<boolean>(false);
  const [newName, setNewName] = useState<string>('');
  const [newColor, setNewColor] = useState<string>(PRESET_COLORS[0]);
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Editing State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  // Archiving confirmation state
  const [archivingCategory, setArchivingCategory] = useState<CategoryDTO | null>(null);
  const [isArchiving, setIsArchiving] = useState<boolean>(false);

  // Show/hide archived section
  const [showArchived, setShowArchived] = useState<boolean>(false);

  // Reorder loading indicator
  const [isReordering, setIsReordering] = useState<boolean>(false);
  const [loadTrigger, setLoadTrigger] = useState<number>(0);

  useEffect(() => {
    let isMounted = true;

    fetchCategories({ type: activeTab, include_archived: true })
      .then((res) => {
        if (!isMounted) return;
        const all = res.categories || [];
        setCategories(all.filter((c) => !c.archived_at));
        setArchivedCategories(all.filter((c) => !!c.archived_at));
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : 'Failed to load categories';
        setErrorMessage(msg);
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [activeTab, loadTrigger]);

  const showNotification = (msg: string) => {
    setSuccessBanner(msg);
    setTimeout(() => {
      setSuccessBanner(null);
    }, 3500);
  };

  // Reorder category up or down
  const handleMove = async (index: number, direction: 'up' | 'down') => {
    if (isReordering) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= categories.length) return;

    const previousList = [...categories];
    const updated = [...categories];
    const [movedItem] = updated.splice(index, 1);
    updated.splice(targetIndex, 0, movedItem);

    // Optimistic UI update
    setCategories(updated);
    setIsReordering(true);
    setErrorMessage(null);

    try {
      const category_ids = updated.map((c) => c.id);
      await reorderCategories({
        type: activeTab,
        category_ids,
      });
      onCategoryChange?.();
      showNotification(`Reordered ${movedItem.name}`);
    } catch (err: unknown) {
      // Rollback on failure
      setCategories(previousList);
      const msg = err instanceof Error ? err.message : 'Failed to save category order';
      setErrorMessage(msg);
    } finally {
      setIsReordering(false);
    }
  };

  // Create new category
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) {
      setCreateError('Category name is required');
      return;
    }

    setIsCreating(true);
    setCreateError(null);
    try {
      await createCategory({
        name: trimmed,
        type: activeTab,
        color: newColor || null,
      });

      setNewName('');
      setIsAddingNew(false);
      setLoadTrigger((prev) => prev + 1);
      onCategoryChange?.();
      showNotification(`Added category "${trimmed}"`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create category';
      setCreateError(msg);
    } finally {
      setIsCreating(false);
    }
  };

  // Start editing category
  const startEditing = (cat: CategoryDTO) => {
    setEditingId(cat.id);
    setEditingName(cat.name);
    setUpdateError(null);
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditingId(null);
    setEditingName('');
    setUpdateError(null);
  };

  // Save renamed category
  const handleUpdateSubmit = async (cat: CategoryDTO) => {
    const trimmed = editingName.trim();
    if (!trimmed) {
      setUpdateError('Category name cannot be empty');
      return;
    }
    if (trimmed === cat.name) {
      cancelEditing();
      return;
    }

    setIsUpdating(true);
    setUpdateError(null);
    try {
      await updateCategory(cat.id, { name: trimmed });
      cancelEditing();
      setLoadTrigger((prev) => prev + 1);
      onCategoryChange?.();
      showNotification(`Renamed to "${trimmed}"`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update category';
      setUpdateError(msg);
    } finally {
      setIsUpdating(false);
    }
  };

  // Archive category
  const confirmArchive = async () => {
    if (!archivingCategory) return;
    setIsArchiving(true);
    try {
      await archiveCategory(archivingCategory.id, true);
      const name = archivingCategory.name;
      setArchivingCategory(null);
      setLoadTrigger((prev) => prev + 1);
      onCategoryChange?.();
      showNotification(`Archived "${name}"`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to archive category';
      setErrorMessage(msg);
    } finally {
      setIsArchiving(false);
    }
  };

  // Restore archived category
  const handleRestore = async (cat: CategoryDTO) => {
    try {
      await archiveCategory(cat.id, false);
      setLoadTrigger((prev) => prev + 1);
      onCategoryChange?.();
      showNotification(`Restored "${cat.name}"`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to restore category';
      setErrorMessage(msg);
    }
  };

  return (
    <div className="space-y-6">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-hairline)] pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
            Category Management
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Organize, rename, and prioritize your personal financial taxonomy
          </p>
        </div>

        {/* Tab Switcher: Expense vs Income */}
        <div className="flex items-center p-1 bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] rounded-md self-start sm:self-auto">
          <button
            type="button"
            onClick={() => {
              setActiveTab('expense');
              setIsAddingNew(false);
              cancelEditing();
            }}
            className={`px-4 py-1.5 text-xs font-semibold rounded-xs transition-colors ${
              activeTab === 'expense'
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            Expense Categories
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('income');
              setIsAddingNew(false);
              cancelEditing();
            }}
            className={`px-4 py-1.5 text-xs font-semibold rounded-xs transition-colors ${
              activeTab === 'income'
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            Income Categories
          </button>
        </div>
      </div>

      {/* Notifications / Alerts */}
      {successBanner && (
        <div className="p-3 text-xs bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-200 rounded-md flex items-center justify-between transition-all">
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

      {/* Action Bar: Category Count + "+ Add Category" button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            Active {activeTab === 'expense' ? 'Expense' : 'Income'} Categories
          </span>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded-xs bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] text-[var(--text-secondary)]">
            {categories.length}
          </span>
        </div>

        {!isAddingNew && (
          <button
            type="button"
            onClick={() => {
              setIsAddingNew(true);
              setCreateError(null);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] rounded-md hover:bg-[var(--action-primary-hover)] transition-colors shadow-2xs"
          >
            <span className="text-sm leading-none">+</span>
            <span>Add Category</span>
          </button>
        )}
      </div>

      {/* Add New Category Form */}
      {isAddingNew && (
        <form
          onSubmit={handleCreateSubmit}
          className="p-4 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg space-y-4 shadow-2xs"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-primary)]">
              Create New {activeTab === 'expense' ? 'Expense' : 'Income'} Category
            </h3>
            <button
              type="button"
              onClick={() => {
                setIsAddingNew(false);
                setNewName('');
                setCreateError(null);
              }}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              Cancel
            </button>
          </div>

          {createError && (
            <div className="p-2 text-xs bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 rounded-md">
              {createError}
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label
                htmlFor="cat-name-input"
                className="block text-xs font-medium text-[var(--text-secondary)] mb-1"
              >
                Category Name
              </label>
              <input
                id="cat-name-input"
                type="text"
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Groceries, Gym, Subscriptions"
                maxLength={50}
                className="w-full px-3 py-2 text-sm bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-md text-[var(--text-primary)] focus:outline-hidden focus:border-[var(--border-strong)] transition-colors"
              />
            </div>

            <div>
              <span className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                Badge Color
              </span>
              <div className="flex items-center gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewColor(c)}
                    className={`w-6 h-6 rounded-full transition-transform ${
                      newColor === c
                        ? 'ring-2 ring-offset-2 ring-[var(--text-primary)] scale-110'
                        : 'opacity-70 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: c }}
                    aria-label={`Select color ${c}`}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-hairline)]">
            <button
              type="button"
              onClick={() => {
                setIsAddingNew(false);
                setNewName('');
                setCreateError(null);
              }}
              className="px-3 py-1.5 text-xs font-medium border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] rounded-md hover:text-[var(--text-primary)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreating || !newName.trim()}
              className="px-4 py-1.5 text-xs font-semibold bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] rounded-md hover:bg-[var(--action-primary-hover)] disabled:opacity-50 transition-colors shadow-2xs"
            >
              {isCreating ? 'Creating...' : 'Save Category'}
            </button>
          </div>
        </form>
      )}

      {/* Categories List */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-lg overflow-hidden divide-y divide-[var(--border-hairline)]">
        {isLoading ? (
          <div className="py-12 text-center text-xs text-[var(--text-muted)] font-mono">
            Loading categories...
          </div>
        ) : categories.length === 0 ? (
          <div className="py-12 text-center text-xs text-[var(--text-muted)] space-y-2">
            <p>No active {activeTab} categories found.</p>
            <p className="text-[11px]">Click &quot;Add Category&quot; above to create one.</p>
          </div>
        ) : (
          categories.map((cat, idx) => {
            const isEditing = editingId === cat.id;

            return (
              <div
                key={cat.id}
                className="flex items-center justify-between px-3 py-2.5 hover:bg-[var(--bg-surface-subtle)] transition-colors gap-3"
              >
                {/* Left side: Reorder controls + color + name */}
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  {/* Up / Down Reorder buttons */}
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      onClick={() => handleMove(idx, 'up')}
                      disabled={idx === 0 || isReordering}
                      aria-label={`Move ${cat.name} up`}
                      title="Move up"
                      className="w-5 h-4 flex items-center justify-center text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-20 disabled:hover:text-[var(--text-muted)] transition-colors rounded-xs border border-[var(--border-hairline)]"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMove(idx, 'down')}
                      disabled={idx === categories.length - 1 || isReordering}
                      aria-label={`Move ${cat.name} down`}
                      title="Move down"
                      className="w-5 h-4 flex items-center justify-center text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-20 disabled:hover:text-[var(--text-muted)] transition-colors rounded-xs border border-[var(--border-hairline)]"
                    >
                      ▼
                    </button>
                  </div>

                  {/* Rank / Order badge */}
                  <span className="font-mono text-[11px] text-[var(--text-muted)] w-4 text-center select-none">
                    {idx + 1}
                  </span>

                  {/* Color pill / chip */}
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: cat.color || '#78716C' }}
                  />

                  {/* Inline Edit Form vs Static Display */}
                  {isEditing ? (
                    <div className="flex items-center gap-2 flex-1 max-w-sm">
                      <input
                        type="text"
                        autoFocus
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleUpdateSubmit(cat);
                          if (e.key === 'Escape') cancelEditing();
                        }}
                        maxLength={50}
                        className="px-2 py-1 text-xs bg-[var(--bg-canvas)] border border-[var(--border-strong)] rounded-xs text-[var(--text-primary)] focus:outline-hidden w-full font-medium"
                      />
                      <button
                        type="button"
                        onClick={() => handleUpdateSubmit(cat)}
                        disabled={isUpdating || !editingName.trim()}
                        className="px-2 py-1 text-[11px] font-semibold bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] rounded-xs hover:bg-[var(--action-primary-hover)] shrink-0"
                      >
                        {isUpdating ? '...' : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={cancelEditing}
                        className="px-2 py-1 text-[11px] font-medium border border-[var(--border-subtle)] text-[var(--text-secondary)] rounded-xs hover:text-[var(--text-primary)] shrink-0"
                      >
                        Cancel
                      </button>
                      {updateError && (
                        <span className="text-[10px] text-red-600 truncate">{updateError}</span>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 truncate">
                      <span className="text-xs font-medium text-[var(--text-primary)] truncate">
                        {cat.name}
                      </span>
                      {cat.is_default && (
                        <span className="text-[9px] uppercase tracking-wider font-mono font-medium px-1.5 py-0.5 rounded-xs bg-[var(--bg-surface-subtle)] text-[var(--text-muted)] border border-[var(--border-hairline)] select-none">
                          Default
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Right side: Action buttons */}
                {!isEditing && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEditing(cat)}
                      className="px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-xs hover:bg-[var(--bg-surface)] transition-colors"
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => setArchivingCategory(cat)}
                      className="px-2 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 rounded-xs transition-colors"
                    >
                      Archive
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Collapsible Archived Categories Section */}
      <div className="border border-[var(--border-hairline)] rounded-lg bg-[var(--bg-surface)] overflow-hidden">
        <button
          type="button"
          onClick={() => setShowArchived((prev) => !prev)}
          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[var(--bg-surface-subtle)] transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[var(--text-secondary)]">
              Archived Categories
            </span>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-xs bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] text-[var(--text-muted)]">
              {archivedCategories.length}
            </span>
          </div>
          <span className="text-xs text-[var(--text-muted)]">
            {showArchived ? '▲ Hide' : '▼ Show'}
          </span>
        </button>

        {showArchived && (
          <div className="border-t border-[var(--border-hairline)] divide-y divide-[var(--border-hairline)] bg-[var(--bg-surface-subtle)]/40">
            {archivedCategories.length === 0 ? (
              <div className="py-6 text-center text-xs text-[var(--text-muted)]">
                No archived {activeTab} categories.
              </div>
            ) : (
              archivedCategories.map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center justify-between px-4 py-2.5 text-xs text-[var(--text-muted)]"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full opacity-50"
                      style={{ backgroundColor: cat.color || '#78716C' }}
                    />
                    <span className="line-through decoration-[var(--border-subtle)]">
                      {cat.name}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRestore(cat)}
                    className="px-2.5 py-1 text-[11px] font-medium text-[var(--text-primary)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-subtle)] rounded-xs transition-colors shadow-2xs"
                  >
                    Restore
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Non-Destructive Archive Confirmation Modal */}
      {archivingCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-2xs">
          <div className="w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg p-5 space-y-4 shadow-xl">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                Archive &quot;{archivingCategory.name}&quot;?
              </h3>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                Archiving hides this category from new entries and the Quick Add picker.
                All past transactions categorized as <strong>{archivingCategory.name}</strong> remain intact and unaffected.
              </p>
            </div>

            <div className="p-3 bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] rounded-md text-[11px] text-[var(--text-muted)]">
              ℹ You can restore an archived category at any time from the &quot;Archived Categories&quot; section below.
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setArchivingCategory(null)}
                disabled={isArchiving}
                className="px-3 py-1.5 text-xs font-medium border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-md"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmArchive}
                disabled={isArchiving}
                className="px-4 py-1.5 text-xs font-semibold bg-amber-600 text-white hover:bg-amber-700 rounded-md transition-colors shadow-2xs disabled:opacity-50"
              >
                {isArchiving ? 'Archiving...' : 'Confirm Archive'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
