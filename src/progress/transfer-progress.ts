/** A transfer measurement. The total and percentage are absent when indeterminate. */
export interface TransferProgress {
  readonly direction: 'upload' | 'download'
  readonly loaded: number
  readonly total?: number
  readonly percentage?: number
}
