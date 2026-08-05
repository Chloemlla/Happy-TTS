import { useCallback, useState } from 'react';

export interface UseEnvSectionOptions<T, S> {
  fetchData: () => Promise<T>;
  saveData: (data: S) => Promise<void>;
  deleteData?: () => Promise<void>;
  initialInput?: Partial<S>;
}

export interface UseEnvSectionResult<T, S> {
  data: T | null;
  setData: React.Dispatch<React.SetStateAction<T | null>>;
  loading: boolean;
  saving: boolean;
  deleting: boolean;
  input: S;
  setInput: React.Dispatch<React.SetStateAction<S>>;
  refresh: () => Promise<void>;
  save: (data: S) => Promise<void>;
  remove: () => Promise<void>;
  resetInput: () => void;
}

export function useEnvSection<T, S extends Record<string, unknown>>({
  fetchData,
  saveData,
  deleteData,
  initialInput = {} as Partial<S>,
}: UseEnvSectionOptions<T, S>): UseEnvSectionResult<T, S> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [input, setInput] = useState<S>(initialInput as S);

  const resetInput = useCallback(() => {
    setInput(initialInput as S);
  }, [initialInput]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchData();
      setData(result);
    } finally {
      setLoading(false);
    }
  }, [fetchData]);

  const save = useCallback(
    async (saveInput: S) => {
      setSaving(true);
      try {
        await saveData(saveInput);
      } finally {
        setSaving(false);
      }
    },
    [saveData],
  );

  const remove = useCallback(async () => {
    if (!deleteData) return;
    setDeleting(true);
    try {
      await deleteData();
    } finally {
      setDeleting(false);
    }
  }, [deleteData]);

  return {
    data,
    setData,
    loading,
    saving,
    deleting,
    input,
    setInput,
    refresh,
    save,
    remove,
    resetInput,
  };
}