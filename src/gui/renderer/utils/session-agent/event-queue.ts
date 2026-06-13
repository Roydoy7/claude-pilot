/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Sequential event queue - processes items one at a time, in the order
 * they were enqueued, even if new items arrive while a previous item is
 * still being handled.
 */

export class SequentialEventQueue<T> {
  private queue: T[] = [];
  private isProcessing = false;

  constructor(private readonly handler: (item: T) => void) {}

  enqueue(item: T): void {
    this.queue.push(item);
    this.process();
  }

  private process(): void {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    try {
      while (this.queue.length > 0) {
        const item = this.queue.shift();
        if (item === undefined) continue;
        this.handler(item);
      }
    } finally {
      this.isProcessing = false;
    }
  }
}
