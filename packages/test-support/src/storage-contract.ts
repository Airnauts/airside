// packages/test-support/src/storage-contract.ts — placeholder until Task 8
export type ReadBackFn = (url: string) => Promise<Uint8Array>
export function storageContract(
  _name: string,
  _make: () => Promise<unknown>,
  _readBack: ReadBackFn,
): void {
  // intentionally empty until Task 8 fills this in
}
