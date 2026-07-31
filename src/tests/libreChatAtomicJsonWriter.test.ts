import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "@jest/globals";
import { SerialAtomicJsonWriter } from "../services/librechat/atomicJsonWriter";

describe("SerialAtomicJsonWriter", () => {
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  });

  it("serializes concurrent writes and leaves no partial temporary file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "librechat-history-"));
    directories.push(directory);
    const filePath = join(directory, "history.json");
    const writer = new SerialAtomicJsonWriter();

    await Promise.all(Array.from({ length: 25 }, (_, sequence) => writer.write(filePath, { sequence })));

    await expect(readFile(filePath, "utf8").then((content) => JSON.parse(content))).resolves.toEqual({ sequence: 24 });
    expect((await readdir(directory)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });
});
