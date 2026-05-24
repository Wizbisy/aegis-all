import { executeContractCall } from './dcw.js';

export async function executeContract(input: {
  walletId: string;
  contractAddress: string;
  abiFunction: string;
  args?: unknown[];
  idempotencyKey?: string;
}): Promise<any> {
  const request: {
    walletId: string;
    contractAddress: string;
    abiFunctionSignature: string;
    abiParameters: unknown[];
    idempotencyKey?: string;
  } = {
    walletId: input.walletId,
    contractAddress: input.contractAddress,
    abiFunctionSignature: input.abiFunction,
    abiParameters: input.args ?? [],
  };

  if (input.idempotencyKey) {
    request.idempotencyKey = input.idempotencyKey;
  }

  return executeContractCall(request);
}
