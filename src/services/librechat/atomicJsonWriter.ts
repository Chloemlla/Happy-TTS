import { randomUUID } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

/**
 * Serializes writes within the process and atomically replaces the destination
 * with a fully written temporary file from the same directory.
 */
export class SerialAtomicJsonWriter {
  private queue: Promise<void> = Promise.resolve();

  public write(filePath: string, value: unknown): Promise<void> {
    const payload = JSON.stringify(value, null, 2);
    const operation = this.queue.catch(() => undefined).then(async () => {
      const directory = dirname(filePath);
      const temporaryPath = join(directory, `.${basename(filePath)}.${randomUUID()}.tmp`);
      await mkdir(directory, { recursive: true });

      try {
        await writeFile(temporaryPath, payload, { encoding: "utf8", flag: "wx" });
        await rename(temporaryPath, filePath);
      } catch (error) {
        await unlink(temporaryPath).catch(() => undefined);
        throw error;
      }
    });

    this.queue = operation.catch(() => undefined);
    return operation;
  }

  public waitForIdle(): Promise<void> {
    return this.queue;
  }
}
