import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind class names with conflict resolution.
 * Preserves the later/explicit classes via tailwind-merge while clsx
 * handles conditional/falsey entries.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export { type ClassValue };
