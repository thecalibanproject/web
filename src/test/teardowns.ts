/** Undone after each test (see setup.ts), before the auth state is reset. */
const teardowns: Array<() => void> = [];

export function addTeardown(fn: () => void) {
  teardowns.push(fn);
}

export function runTeardowns() {
  teardowns.splice(0).forEach((t) => t());
}
