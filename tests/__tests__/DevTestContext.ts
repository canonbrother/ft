import { ethers } from 'ethers';
import {
  RPC_PORT,
  BlockCreation,
  DevTestContext,
  EnhancedWeb3,
  EthTransactionType,
  ExtrinsicCreation,
  alith,
  createAndFinalizeBlock,
  customWeb3Request,
  extractError
} from './utils';
import { ApiPromise } from '@polkadot/api';
import { HttpProvider } from 'web3-core';
import { ChildProcess } from 'child_process';
import { ApiTypes, SubmittableExtrinsic } from '@polkadot/api/types';
import { EventRecord } from '@polkadot/types/interfaces';
import { RegistryError } from '@polkadot/types/types';

export class CInternalDevContext implements DevTestContext {
  web3: EnhancedWeb3;
  ethers: ethers.providers.JsonRpcProvider;
  polkadotApi: ApiPromise;
  runningNode: ChildProcess;
  ethTransactionType?: EthTransactionType = 'Legacy';
  rpcPort: number = RPC_PORT;

  constructor(
    web3: EnhancedWeb3,
    ethers: ethers.providers.JsonRpcProvider,
    polkadotApi: ApiPromise,
    runningNode: ChildProcess,
    ethTransactionType?: EthTransactionType
  ) {
    this.web3 = web3;
    this.ethers = ethers;
    this.polkadotApi = polkadotApi;
    this.runningNode = runningNode;
    if (ethTransactionType !== undefined) {
      this.ethTransactionType = ethTransactionType;
    }
  }

  async clear() {
    ((this.web3 as any)._provider as HttpProvider).disconnect();
    this.polkadotApi.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 1000));

    await new Promise((resolve) => {
      this.runningNode.once('exit', resolve);
      this.runningNode.kill();
    });
  }

  async createBlock<
    ApiType extends ApiTypes,
    Call extends
      | SubmittableExtrinsic<ApiType>
      | Promise<SubmittableExtrinsic<ApiType>>
      | string
      | Promise<string>,
    Calls extends Call | Call[]
  >(transactions?: Calls, options: BlockCreation = {}) {
    const results: (
      | { type: 'eth'; hash: string }
      | { type: 'sub'; hash: string }
    )[] = [];
    const txs =
      transactions == undefined
        ? []
        : Array.isArray(transactions)
        ? transactions
        : [transactions];

    for await (const call of txs) {
      if (typeof call == 'string') {
        // Ethereum
        results.push({
          type: 'eth',
          hash: (
            await customWeb3Request(this.web3, 'eth_sendRawTransaction', [call])
          ).result
        });
      } else if (call.isSigned) {
        results.push({
          type: 'sub',
          hash: (await call.send()).toString()
        });
      } else {
        results.push({
          type: 'sub',
          hash: (await call.signAndSend(alith)).toString()
        });
      }
    }

    const { parentHash, finalize } = options;
    const blockResult = await createAndFinalizeBlock(
      this.polkadotApi,
      parentHash,
      finalize
    );

    // No need to extract events if no transactions
    if (results.length == 0) {
      return {
        block: blockResult,
        result: null
      };
    }

    // We retrieve the events for that block
    const allRecords: EventRecord[] = (await (
      await this.polkadotApi.at(blockResult.hash)
    ).query.system.events()) as any;
    // We retrieve the block (including the extrinsics)
    const blockData = await this.polkadotApi.rpc.chain.getBlock(
      blockResult.hash
    );

    const result: ExtrinsicCreation[] = results.map((result) => {
      let extrinsicIndex =
        result.type == 'eth'
          ? allRecords
              .find(
                ({ phase, event: { section, method, data } }) =>
                  phase.isApplyExtrinsic &&
                  section == 'ethereum' &&
                  method == 'Executed' &&
                  data[3].toString() &&
                  result.hash
              )
              ?.phase?.asApplyExtrinsic?.toNumber() ?? 0
          : blockData.block.extrinsics.findIndex(
              (ext) => ext.hash.toHex() == result.hash
            );

      // We retrieve the events associated with the extrinsic
      const events = allRecords.filter(
        ({ phase }) =>
          phase.isApplyExtrinsic &&
          phase.asApplyExtrinsic.toNumber() === extrinsicIndex
      );
      const failed = extractError(events);
      return {
        extrinsic:
          extrinsicIndex >= 0
            ? blockData.block.extrinsics[extrinsicIndex]
            : null,
        events,
        error:
          failed &&
          ((failed.isModule &&
            this.polkadotApi.registry.findMetaError(failed.asModule)) ||
            ({ name: failed.toString() } as RegistryError)),
        successful: !failed,
        hash: result.hash
      };
    });

    // Adds extra time to avoid empty transaction when querying it
    if (results.find((r) => r.type == 'eth')) {
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    return {
      block: blockResult,
      result: Array.isArray(transactions) ? result : (result[0] as any)
    };
  }
}
