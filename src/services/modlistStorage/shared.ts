export interface ModRecord {
  id: string;
  name: string;
  hash?: string;
  md5?: string;
}

export interface OutputOptions {
  withHash?: boolean;
  withMd5?: boolean;
}

export function formatModForOutput(mod: any, options: OutputOptions = {}): ModRecord {
  const result: any = {
    id: String(mod.id),
    name: String(mod.name)
  };
  if (options.withHash && mod.hash) result.hash = mod.hash;
  if (options.withMd5 && mod.md5) result.md5 = mod.md5;
  return result as ModRecord;
} 