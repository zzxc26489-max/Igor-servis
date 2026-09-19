export function createSerialQueue() {
  let tail: Promise<void> = Promise.resolve();

  return function enqueue<T>(job: () => Promise<T> | T): Promise<T> {
    const result = tail.then(job, job);
    tail = result.then(() => undefined, () => undefined);
    return result;
  };
}
