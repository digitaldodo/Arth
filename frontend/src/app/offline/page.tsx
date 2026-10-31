import { OfflinePwaEntry } from './OfflinePwaEntry';

// This route is a public static bootstrap only; financial data is loaded from the
// account-scoped IndexedDB snapshot by the client after runtime verification.
export const dynamic = 'force-static';

export default function OfflinePage() {
  return <OfflinePwaEntry />;
}
