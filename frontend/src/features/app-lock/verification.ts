/** Never call the unlock transition unless the verifier resolves successfully. */
export async function unlockAfterVerification(
  verify: () => Promise<void>,
  unlock: () => void,
): Promise<void> {
  await verify();
  unlock();
}
