/** The router awaits updateCallbackDone. Also handle skipped visual snapshots. */
export function guardViewTransitions(target: Document) {
  if (!target.startViewTransition) return;
  const start = target.startViewTransition.bind(target);
  target.startViewTransition = (...args: Parameters<Document['startViewTransition']>) => {
    const transition = start(...args);
    // Rapid navigation, hidden tabs and reduced motion may abort a snapshot.
    // Keep updateCallbackDone intact so actual rendering errors still propagate.
    void transition.ready.catch(() => {});
    void transition.finished.catch(() => {});
    return transition;
  };
}
