export type TargetKind = 'file' | 'dir' | 'app' | 'url';

/** Which tier produced a candidate. Reported by `--dry-run`, and never sent to a model. */
export type TargetSource =
  | 'literal' | 'alias' | 'dir-index' | 'doc-index'
  | 'lazy-child' | 'spotlight' | 'app-index' | 'link-index';

export interface Target {
  readonly kind: TargetKind;
  /** Absolute path for file/dir/app; the absolute URL for 'url'. */
  readonly ref: string;
  /** What the matcher scores against: a basename, an app's display name, a bookmark title. */
  readonly name: string;
  /** mtime in milliseconds, or a last-visit epoch for a url; 0 when unknown. */
  readonly mtime: number;
  readonly source: TargetSource;
}

export interface ScoredTarget {
  readonly target: Target;
  readonly score: number;
  /** Match class before contextual bonuses; a stronger name match always ranks first. */
  readonly quality: number;
}

export const isPathTarget = (target: Target): boolean => target.kind !== 'url';
