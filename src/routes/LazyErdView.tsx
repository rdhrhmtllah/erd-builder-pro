import React, { Suspense } from 'react';

const ERDView = React.lazy(() => import('@/components/views/ERDView').then(m => ({ default: m.ERDView })));

/**
 * The ERD canvas, loaded on demand.
 *
 * ERDView reaches the DBML parser, the code panel and the migration planner, so
 * importing it statically put all of that in the entry chunk and made opening a
 * note pay for the ERD. The notes and drawings views are already lazy for the
 * same reason; this keeps the two routes that render the canvas sharing one
 * chunk and one fallback.
 *
 * Callers may still pass `key`: React remounts this wrapper, and the canvas with
 * it, exactly as it did when the import was static.
 */
export function LazyErdView(props: React.ComponentProps<typeof ERDView>) {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex flex-col items-center justify-center border rounded-xl bg-muted/20">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="mt-4 text-sm font-medium text-muted-foreground animate-pulse">Loading diagram...</p>
        </div>
      }
    >
      <ERDView {...props} />
    </Suspense>
  );
}
