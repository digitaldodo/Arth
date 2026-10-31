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
import {
  PRESET_CATEGORY_ICONS,
  resolveCategoryIcon,
} from './category-icons';
import { getCachedCategories, setCachedCategories } from '@/lib/offline-db';
import { useStandalonePwa } from '@/features/pwa/useStandalonePwa';

interface CategoryManagerProps {
  userId: string;
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

export function CategoryManager({ userId, onCategoryChange }: CategoryManagerProps) {
  const isPwa = useStandalonePwa();
  const [activeTab, setActiveTab] = useState<TransactionType>('expense');
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [archivedCategories, setArchivedCategories] = useState<CategoryDTO[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // New Category Form State
  const [isAddingNew, setIsAddingNew] = useState<boolean>(false);
  const [newName, setNewName] = useState<string>('');
  const [newIcon, setNewIcon] = useState<string>('');
  const [newColor, setNewColor] = useState<string>(PRESET_COLORS[0]);
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Editing State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>('');
  const [editingIcon, setEditingIcon] = useState<string>('');
  const [editingColor, setEditingColor] = useState<string>(PRESET_COLORS[0]);
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
    if (isPwa) void getCachedCategories(userId).then((cached) => {
      if (!isMounted || !cached.length) return;
      const matching = cached.filter((category) => category.type === activeTab);
      setCategories(matching.filter((c) => !c.archived_at));
      setArchivedCategories(matching.filter((c) => !!c.archived_at));
      setIsLoading(false);
    });
    fetchCategories({ type: activeTab, include_archived: true })
      .then((res) => {
        if (!isMounted) return;
        const all = res.categories || [];
        void setCachedCategories(all, userId);
        setCategories(all.filter((c) => !c.archived_at));
        setArchivedCategories(all.filter((c) => !!c.archived_at));
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : 'Failed to load categories';
        if (!isPwa) { setErrorMessage(msg); setIsLoading(false); return; }
        void getCachedCategories(userId).then((cached) => {
          if (!isMounted || cached.length) return;
          setErrorMessage(`${msg}. No saved offline copy is available.`);
        });
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [activeTab, loadTrigger, userId, isPwa]);

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
      setCreateError('Category name is required.');
      return;
    }
    if (trimmed.length > 50) {
      setCreateError('Category name cannot exceed 50 characters.');
      return;
    }

    // Check for local active duplicate
    const duplicate = categories.some(
      (c) => c.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (duplicate) {
      setCreateError(`An active ${activeTab} category named "${trimmed}" already exists.`);
      return;
    }

    setIsCreating(true);
    setCreateError(null);
    try {
      const resolvedIcon = newIcon.trim() || null;
      await createCategory({
        name: trimmed,
        type: activeTab,
        color: newColor || null,
        icon: resolvedIcon,
      });

      setNewName('');
      setNewIcon('');
      setIsAddingNew(false);
      setLoadTrigger((prev) => prev + 1);
      onCategoryChange?.();
      showNotification(`Added category "${trimmed}"`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create category';
      if (msg.toLowerCase().includes('already exists') || msg.toLowerCase().includes('conflict')) {
        setCreateError(`A category with the name "${trimmed}" already exists.`);
      } else {
        setCreateError(msg);
      }
    } finally {
      setIsCreating(false);
    }
  };

  // Start editing category
  const startEditing = (cat: CategoryDTO) => {
    setEditingId(cat.id);
    setEditingName(cat.name);
    setEditingIcon(cat.icon || '');
    setEditingColor(cat.color || PRESET_COLORS[0]);
    setUpdateError(null);
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditingId(null);
    setEditingName('');
    setEditingIcon('');
    setUpdateError(null);
  };

  // Save updated category
  const handleUpdateSubmit = async (cat: CategoryDTO) => {
    const trimmed = editingName.trim();
    if (!trimmed) {
      setUpdateError('Category name cannot be empty.');
      return;
    }
    if (trimmed.length > 50) {
      setUpdateError('Category name cannot exceed 50 characters.');
      return;
    }

    const trimmedIcon = editingIcon.trim() || null;
    const sameName = trimmed === cat.name;
    const sameIcon = (trimmedIcon || null) === (cat.icon || null);
    const sameColor = (editingColor || null) === (cat.color || null);

    if (sameName && sameIcon && sameColor) {
      cancelEditing();
      return;
    }

    // Check for duplicate name if renamed
    if (!sameName) {
      const duplicate = categories.some(
        (c) => c.id !== cat.id && c.name.toLowerCase() === trimmed.toLowerCase()
      );
      if (duplicate) {
        setUpdateError(`An active category named "${trimmed}" already exists.`);
        return;
      }
    }

    setIsUpdating(true);
    setUpdateError(null);
    try {
      await updateCategory(cat.id, {
        name: trimmed,
        icon: trimmedIcon,
        color: editingColor || null,
      });
      cancelEditing();
      setLoadTrigger((prev) => prev + 1);
      onCategoryChange?.();
      showNotification(`Updated category "${trimmed}"`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update category';
      if (msg.toLowerCase().includes('already exists') || msg.toLowerCase().includes('conflict')) {
        setUpdateError(`A category named "${trimmed}" already exists.`);
      } else {
        setUpdateError(msg);
      }
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
            Organize, rename, customize icons, and prioritize your personal financial taxonomy
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
            className={`px-4 py-1.5 text-xs font-semibold rounded-xs transition-colors cursor-pointer ${
              activeTab === 'expense'
                ? 'bg-[var(--bg-surface)] text-[var(--expense-fg)] shadow-2xs'
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
            className={`px-4 py-1.5 text-xs font-semibold rounded-xs transition-colors cursor-pointer ${
              activeTab === 'income'
                ? 'bg-[var(--bg-surface)] text-[var(--income-fg)] shadow-2xs'
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
            className="text-emerald-600 dark:text-emerald-400 font-bold ml-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="p-3 text-xs bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-800 dark:text-red-200 rounded-md flex items-center justify-between">
          <span>⚠️ {errorMessage}</span>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-red-600 dark:text-red-400 font-bold ml-2 cursor-pointer"
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
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] rounded-md hover:bg-[var(--action-primary-hover)] transition-colors shadow-2xs cursor-pointer"
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
                setNewIcon('');
                setCreateError(null);
              }}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              Cancel
            </button>
          </div>

          {createError && (
            <div className="p-2 text-xs bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 rounded-md">
              {createError}
            </div>
          )}

          <div className="space-y-4">
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

            {/* Icon Picker */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-[var(--text-secondary)]">
                  Category Icon
                </span>
                <span className="text-[11px] text-[var(--text-muted)]">
                  Preview:{' '}
                  <span className="text-sm">
                    {resolveCategoryIcon(newIcon, newName, activeTab)}
                  </span>
                  {!newIcon && (
                    <span className="text-[10px] italic ml-1">(auto default)</span>
                  )}
                </span>
              </div>

              {/* Curated Presets Palette */}
              <div className="flex flex-wrap items-center gap-1.5 p-2 bg-[var(--bg-canvas)] border border-[var(--border-hairline)] rounded-md max-h-24 overflow-y-auto">
                {PRESET_CATEGORY_ICONS.map((icon) => (
                  <button
                    key={icon}
                    type="button"
                    onClick={() => setNewIcon(icon)}
                    className={`w-7 h-7 rounded-sm flex items-center justify-center text-sm transition-all cursor-pointer ${
                      newIcon === icon
                        ? 'bg-[var(--bg-surface-elevated)] ring-2 ring-[var(--text-primary)] scale-110 shadow-xs'
                        : 'hover:bg-[var(--bg-surface)] opacity-80 hover:opacity-100'
                    }`}
                    title={`Select ${icon}`}
                  >
                    {icon}
                  </button>
                ))}
              </div>

              {/* Custom Emoji / Text Input */}
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="text"
                  value={newIcon}
                  onChange={(e) => setNewIcon(e.target.value)}
                  placeholder="Or enter custom emoji (e.g. 🍔, ☕)"
                  maxLength={10}
                  className="px-2.5 py-1.5 text-xs bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-md text-[var(--text-primary)] w-48 focus:outline-hidden focus:border-[var(--border-strong)]"
                />
                {newIcon && (
                  <button
                    type="button"
                    onClick={() => setNewIcon('')}
                    className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] underline cursor-pointer"
                  >
                    Reset to Auto
                  </button>
                )}
              </div>
            </div>

            {/* Color Palette */}
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
                    className={`w-6 h-6 rounded-full transition-transform cursor-pointer ${
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
                setNewIcon('');
                setCreateError(null);
              }}
              className="px-3 py-1.5 text-xs font-medium border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] rounded-md hover:text-[var(--text-primary)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreating || !newName.trim()}
              className="px-4 py-1.5 text-xs font-semibold bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] rounded-md hover:bg-[var(--action-primary-hover)] disabled:opacity-50 transition-colors shadow-2xs cursor-pointer"
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
                className="flex flex-col sm:flex-row sm:items-center justify-between p-3 hover:bg-[var(--bg-surface-subtle)] transition-colors gap-3"
              >
                {/* Left side: Reorder controls + icon + color + name */}
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  {/* Up / Down Reorder buttons */}
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleMove(idx, 'up')}
                      disabled={idx === 0 || isReordering}
                      aria-label={`Move ${cat.name} up`}
                      title="Move up"
                      className="w-5 h-4 flex items-center justify-center text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-20 disabled:hover:text-[var(--text-muted)] transition-colors rounded-xs border border-[var(--border-hairline)] cursor-pointer"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMove(idx, 'down')}
                      disabled={idx === categories.length - 1 || isReordering}
                      aria-label={`Move ${cat.name} down`}
                      title="Move down"
                      className="w-5 h-4 flex items-center justify-center text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-20 disabled:hover:text-[var(--text-muted)] transition-colors rounded-xs border border-[var(--border-hairline)] cursor-pointer"
                    >
                      ▼
                    </button>
                  </div>

                  {/* Rank / Order badge */}
                  <span className="font-mono text-[11px] text-[var(--text-muted)] w-4 text-center select-none shrink-0">
                    {idx + 1}
                  </span>

                  {/* Icon badge + Color dot */}
                  <div className="relative flex items-center justify-center w-7 h-7 rounded-md bg-[var(--bg-canvas)] border border-[var(--border-subtle)] shrink-0 text-sm select-none">
                    <span>
                      {isEditing
                        ? resolveCategoryIcon(editingIcon, editingName, cat.type)
                        : resolveCategoryIcon(cat.icon, cat.name, cat.type)}
                    </span>
                    <span
                      className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-[var(--bg-surface)] ring-1 ring-[var(--border-hairline)]"
                      style={{
                        backgroundColor: isEditing
                          ? editingColor || '#78716C'
                          : cat.color || '#78716C',
                      }}
                      title={`Color: ${cat.color || 'Default'}`}
                    />
                  </div>

                  {/* Edit Form vs Static Display */}
                  {isEditing ? (
                    <div className="flex flex-col gap-2 flex-1 max-w-md">
                      <div className="flex items-center gap-2">
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
                          placeholder="Category name"
                          className="px-2 py-1 text-xs bg-[var(--bg-canvas)] border border-[var(--border-strong)] rounded-xs text-[var(--text-primary)] focus:outline-hidden w-full font-medium"
                        />
                        <button
                          type="button"
                          onClick={() => handleUpdateSubmit(cat)}
                          disabled={isUpdating || !editingName.trim()}
                          className="px-2.5 py-1 text-[11px] font-semibold bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] rounded-xs hover:bg-[var(--action-primary-hover)] shrink-0 cursor-pointer"
                        >
                          {isUpdating ? '...' : 'Save'}
                        </button>
                        <button
                          type="button"
                          onClick={cancelEditing}
                          className="px-2 py-1 text-[11px] font-medium border border-[var(--border-subtle)] text-[var(--text-secondary)] rounded-xs hover:text-[var(--text-primary)] shrink-0 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>

                      {/* Icon & Color controls while editing */}
                      <div className="flex items-center gap-3 pt-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-[var(--text-muted)]">Icon:</span>
                          <input
                            type="text"
                            value={editingIcon}
                            onChange={(e) => setEditingIcon(e.target.value)}
                            placeholder="Emoji"
                            maxLength={10}
                            className="w-16 px-1.5 py-0.5 text-xs bg-[var(--bg-canvas)] border border-[var(--border-hairline)] rounded text-center"
                          />
                          {editingIcon && (
                            <button
                              type="button"
                              onClick={() => setEditingIcon('')}
                              className="text-[10px] text-[var(--text-muted)] hover:underline cursor-pointer"
                            >
                              Auto
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-[var(--text-muted)]">Color:</span>
                          <div className="flex items-center gap-1">
                            {PRESET_COLORS.map((c) => (
                              <button
                                key={c}
                                type="button"
                                onClick={() => setEditingColor(c)}
                                className={`w-3.5 h-3.5 rounded-full cursor-pointer ${
                                  editingColor === c ? 'ring-2 ring-[var(--text-primary)] scale-110' : 'opacity-70 hover:opacity-100'
                                }`}
                                style={{ backgroundColor: c }}
                              />
                            ))}
                          </div>
                        </div>
                      </div>

                      {updateError && (
                        <span className="text-[10px] text-red-600 dark:text-red-400 font-medium">
                          ⚠️ {updateError}
                        </span>
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
                  <div className="flex items-center gap-1 shrink-0 self-end sm:self-auto">
                    <button
                      type="button"
                      onClick={() => startEditing(cat)}
                      className="px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-xs hover:bg-[var(--bg-surface)] transition-colors cursor-pointer"
                    >
                      Rename &amp; Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setArchivingCategory(cat)}
                      className="px-2 py-1 text-[11px] font-medium text-amber-800 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-950/40 rounded-xs transition-colors cursor-pointer"
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
          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[var(--bg-surface-subtle)] transition-colors cursor-pointer"
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
                  className="flex items-center justify-between px-4 py-2.5 opacity-70 hover:opacity-100 transition-opacity"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="flex items-center justify-center w-6 h-6 rounded-md bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-xs select-none">
                      <span>{resolveCategoryIcon(cat.icon, cat.name, cat.type)}</span>
                    </div>
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: cat.color || '#78716C' }}
                    />
                    <span className="text-xs font-medium text-[var(--text-muted)] line-through">
                      {cat.name}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRestore(cat)}
                    className="px-2 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 rounded-xs transition-colors cursor-pointer"
                  >
                    Restore
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Confirmation Modal for Archiving */}
      {archivingCategory && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
        >
          <div className="w-full max-w-sm p-5 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl space-y-4 shadow-xl">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                Archive &ldquo;{archivingCategory.name}&rdquo;?
              </h3>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                Archiving hides this category from transaction selectors. Existing transactions in this category will preserve their classification and history.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-hairline)]">
              <button
                type="button"
                onClick={() => setArchivingCategory(null)}
                disabled={isArchiving}
                className="px-3 py-1.5 text-xs font-medium border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] rounded-md hover:text-[var(--text-primary)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmArchive}
                disabled={isArchiving}
                className="px-4 py-1.5 text-xs font-semibold bg-amber-800 text-white hover:bg-amber-900 rounded-md transition-colors cursor-pointer disabled:opacity-50"
              >
                {isArchiving ? 'Archiving...' : 'Archive Category'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
