import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  backNavigationManager,
  type BackHandlerRegistration,
} from '../src/features/navigation/BackNavigationManager';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

describe('Android PWA Back Navigation Architecture & Hierarchy', () => {
  test('1. BackNavigationManager enforces strict priority: dialog > modal > subscreen > tab', () => {
    // Reset manager state
    backNavigationManager.destroy();

    const orderLog: string[] = [];

    const unregTab = backNavigationManager.registerHandler('tab-ledger', 'tab', () => {
      orderLog.push('tab-ledger');
      return true;
    });

    const unregSubscreen = backNavigationManager.registerHandler('subscreen-settings', 'subscreen', () => {
      orderLog.push('subscreen-settings');
      return true;
    });

    const unregModal = backNavigationManager.registerHandler('modal-quick-add', 'modal', () => {
      orderLog.push('modal-quick-add');
      return true;
    });

    const unregDialog = backNavigationManager.registerHandler('dialog-unsaved', 'dialog', () => {
      orderLog.push('dialog-unsaved');
      return true;
    });

    const sorted = backNavigationManager.getSortedHandlers();
    assert.equal(sorted[0].id, 'dialog-unsaved', 'Dialog must have highest priority');
    assert.equal(sorted[1].id, 'modal-quick-add', 'Modal must have second priority');
    assert.equal(sorted[2].id, 'subscreen-settings', 'Subscreen must have third priority');
    assert.equal(sorted[3].id, 'tab-ledger', 'Tab must have lowest priority');

    // Trigger back: dialog should execute first
    const res1 = backNavigationManager.triggerBack();
    assert.equal(res1, true);
    assert.deepEqual(orderLog, ['dialog-unsaved']);

    unregDialog();
    unregModal();
    unregSubscreen();
    unregTab();
    backNavigationManager.destroy();
  });

  test('2. Scenario A — Main Tab Navigation: Ledger -> Dashboard -> Native exit', () => {
    backNavigationManager.destroy();

    let activeView: 'home' | 'ledger' | 'people' | 'more' = 'home';

    // 1. Open Arth on Dashboard
    assert.equal(activeView, 'home');
    assert.equal(backNavigationManager.getSortedHandlers().length, 0);
    // At root dashboard, triggerBack returns false (allows native PWA exit)
    assert.equal(backNavigationManager.triggerBack(), false);

    // 2. Navigate to Ledger
    activeView = 'ledger';
    const unregTab = backNavigationManager.registerHandler('tab-main', 'tab', () => {
      activeView = 'home';
      return true;
    });

    assert.equal(backNavigationManager.getSortedHandlers().length, 1);

    // 3. Press Android Back
    const backHandled = backNavigationManager.triggerBack();
    assert.equal(backHandled, true);
    // 4. Expected: Dashboard opens, PWA remains active
    assert.equal(activeView, 'home');
    unregTab();

    // 5. Press Android Back again
    const finalBack = backNavigationManager.triggerBack();
    // 6. Expected: At Dashboard, triggerBack returns false so native Android PWA exit/minimize occurs
    assert.equal(finalBack, false);

    backNavigationManager.destroy();
  });

  test('3. Scenario B — Nested More Settings: More -> Settings -> Appearance -> Settings -> More -> Dashboard -> Exit', () => {
    backNavigationManager.destroy();

    let activeView: 'home' | 'more' = 'home';
    let moreSubView: 'hub' | 'settings' | 'appearance' = 'hub';

    // 1. Open More
    activeView = 'more';
    moreSubView = 'hub';
    const unregTab = backNavigationManager.registerHandler('tab-main', 'tab', () => {
      activeView = 'home';
      return true;
    });

    // 2. Open Settings
    moreSubView = 'settings';
    const unregSettings = backNavigationManager.registerHandler('subscreen-more-settings', 'subscreen', () => {
      moreSubView = 'hub';
      return true;
    });

    // 3. Open Appearance
    moreSubView = 'appearance';
    const unregAppearance = backNavigationManager.registerHandler('subscreen-more-appearance', 'subscreen', () => {
      moreSubView = 'settings';
      return true;
    });

    // 4. Press Back -> Return to Settings
    assert.equal(backNavigationManager.triggerBack(), true);
    assert.equal(moreSubView, 'settings');
    assert.equal(activeView, 'more');
    unregAppearance();

    // 6. Press Back -> Return to More
    assert.equal(backNavigationManager.triggerBack(), true);
    assert.equal(moreSubView, 'hub');
    assert.equal(activeView, 'more');
    unregSettings();

    // 8. Press Back -> Return to Dashboard
    assert.equal(backNavigationManager.triggerBack(), true);
    assert.equal(activeView, 'home');
    unregTab();

    // 10. Press Back -> Native PWA exit/minimize
    assert.equal(backNavigationManager.triggerBack(), false);

    backNavigationManager.destroy();
  });

  test('4. Scenario C — Ledger Editing: Ledger -> Details -> Edit -> Ledger -> Dashboard', () => {
    backNavigationManager.destroy();

    let activeView: 'home' | 'ledger' = 'ledger';
    let isDetailsOpen = false;
    let isEditOpen = false;

    const unregTab = backNavigationManager.registerHandler('tab-main', 'tab', () => {
      activeView = 'home';
      return true;
    });

    // 2. Open transaction details
    isDetailsOpen = true;
    const unregDetail = backNavigationManager.registerHandler('drawer-transaction-detail', 'modal', () => {
      isDetailsOpen = false;
      return true;
    });

    // 3. Open edit mode (details closes, edit opens)
    isDetailsOpen = false;
    unregDetail();
    isEditOpen = true;
    const unregEdit = backNavigationManager.registerHandler('modal-edit-transaction', 'modal', () => {
      isEditOpen = false;
      return true;
    });

    // 4. Press Back
    assert.equal(backNavigationManager.triggerBack(), true);
    // 5. Expected: Close editor and remain on Ledger
    assert.equal(isEditOpen, false);
    assert.equal(activeView, 'ledger');
    unregEdit();

    // 6. Press Back again
    assert.equal(backNavigationManager.triggerBack(), true);
    // 7. Expected: Dashboard opens
    assert.equal(activeView, 'home');
    unregTab();

    backNavigationManager.destroy();
  });

  test('5. Scenario D — Unsaved Changes: Dirty editor -> Confirmation -> Cancel -> Discard -> Ledger', () => {
    backNavigationManager.destroy();

    let isEditorOpen = true;
    let amount = '500';
    const originalAmount = '200';
    let isConfirmationOpen = false;

    const confirmCleaner = { clean: () => {} };

    const unregEdit = backNavigationManager.registerHandler('modal-edit-transaction', 'modal', () => {
      const isDirty = amount !== originalAmount;
      if (isDirty) {
        isConfirmationOpen = true;
        const unreg = backNavigationManager.registerHandler('dialog-unsaved', 'dialog', () => {
          isConfirmationOpen = false;
          return true;
        });
        confirmCleaner.clean = unreg;
        return 'prevented';
      }
      isEditorOpen = false;
      return true;
    });

    // 3. Press Back with modified amount
    const back1 = backNavigationManager.triggerBack();
    // 4. Expected: Back is intercepted, confirmation dialog appears
    assert.equal(back1, 'prevented');
    assert.equal(isConfirmationOpen, true);
    assert.equal(isEditorOpen, true);

    // 5. Select Cancel (Keep Editing)
    confirmCleaner.clean();
    isConfirmationOpen = false;
    // 6. Expected: Remain in the editor with entered amount intact
    assert.equal(isEditorOpen, true);
    assert.equal(amount, '500');

    // 7. Press Back again
    const back2 = backNavigationManager.triggerBack();
    assert.equal(back2, 'prevented');
    assert.equal(isConfirmationOpen, true);

    // 8. Select Discard
    confirmCleaner.clean();
    isConfirmationOpen = false;
    amount = originalAmount;
    isEditorOpen = false;
    unregEdit();

    // Expected: Return to Ledger without saving changes
    assert.equal(isEditorOpen, false);
    assert.equal(isConfirmationOpen, false);

    backNavigationManager.destroy();
  });

  test('6. Scenario E — Quick Add from Dashboard closes modal and preserves Dashboard', () => {
    backNavigationManager.destroy();

    let isQuickAddOpen = false;
    let activeView: 'home' | 'ledger' = 'home';

    // 2. Open Quick Add
    isQuickAddOpen = true;
    const unregQuickAdd = backNavigationManager.registerHandler('modal-quick-add', 'modal', () => {
      isQuickAddOpen = false;
      return true;
    });

    // 3. Press Back
    assert.equal(backNavigationManager.triggerBack(), true);
    // 4. Expected: Quick Add closes and Dashboard remains visible
    assert.equal(isQuickAddOpen, false);
    assert.equal(activeView, 'home');
    unregQuickAdd();

    // 5. Press Back again
    const finalBack = backNavigationManager.triggerBack();
    // 6. Expected: At Dashboard, triggerBack returns false so native Android PWA exit occurs
    assert.equal(finalBack, false);

    backNavigationManager.destroy();
  });

  test('7. Architecture Audit: No window.close() force-kill and no pagehide/visibilitychange logout triggers', () => {
    const srcPath = path.join(projectRoot, 'src');
    const readAllFiles = (dir: string): string[] => {
      let results: string[] = [];
      const list = fs.readdirSync(dir);
      for (const file of list) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          results = results.concat(readAllFiles(fullPath));
        } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
          results.push(fullPath);
        }
      }
      return results;
    };

    const files = readAllFiles(srcPath);

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      assert.ok(
        !content.includes('window.close()'),
        `File ${path.relative(projectRoot, file)} must not use window.close()`
      );
      assert.ok(
        !content.includes("addEventListener('pagehide', handleSignOut") &&
        !content.includes("addEventListener('visibilitychange', handleSignOut"),
        `File ${path.relative(projectRoot, file)} must not use pagehide/visibilitychange as logout trigger`
      );
    }
  });

  test('8. RootLayout wraps application in BackNavigationProvider', () => {
    const layoutPath = path.join(projectRoot, 'src', 'app', 'layout.tsx');
    const content = fs.readFileSync(layoutPath, 'utf8');

    assert.ok(
      content.includes('<BackNavigationProvider>'),
      'RootLayout must wrap tree in BackNavigationProvider'
    );
  });
});
