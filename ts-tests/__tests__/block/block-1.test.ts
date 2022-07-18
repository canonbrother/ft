import Web3 from 'web3';
import { HttpProvider } from 'web3-core';
import { JsonRpcResponse } from 'web3-core-helpers';
import { ethers } from 'ethers';
import { ApiPromise, Keyring, WsProvider } from '@polkadot/api';
import { ChildProcess, spawn } from 'child_process';
import { ApiTypes, SubmittableExtrinsic } from '@polkadot/api/types';
import { GenericExtrinsic } from '@polkadot/types/extrinsic';
import { CreatedBlock } from '@polkadot/types/interfaces';
import { AnyTuple, RegistryError } from '@polkadot/types/types';
import { DispatchError, EventRecord } from '@polkadot/types/interfaces';

const keyringEth = new Keyring({ type: 'ethereum' });

export const BINARY_PATH =
  process.env.BINARY_PATH || `../target/release/frontier-template-node`;
export const DISPLAY_LOG = process.env.FRONTIER_LOG || false;
export const SPAWNING_TIME = 20000;
export const ALITH_PRIVATE_KEY =
  '0x5fb92d6e98884f76de468fa3f6278f8807c48bebc13595d45af5bdc4da702133';
export const alith = keyringEth.addFromUri(ALITH_PRIVATE_KEY);

const port = 19955;
const rpcPort = 19944;
const wsPort = 19933;

let nodeStarted = false;

type EthTransactionType = 'Legacy' | 'EIP2930' | 'EIP1559';

export type EnhancedWeb3 = Web3 & {
  customRequest: (method: string, params: any[]) => Promise<JsonRpcResponse>;
};

export interface BlockCreation {
  parentHash?: string;
  finalize?: boolean;
}

export interface BlockCreationResponse<
  ApiType extends ApiTypes,
  Call extends
    | SubmittableExtrinsic<ApiType>
    | string
    | (SubmittableExtrinsic<ApiType> | string)[]
> {
  block: {
    duration: number;
    hash: string;
  };
  result: Call extends (string | SubmittableExtrinsic<ApiType>)[]
    ? ExtrinsicCreation[]
    : ExtrinsicCreation;
}

export interface ExtrinsicCreation {
  extrinsic: GenericExtrinsic<AnyTuple> | null;
  events: EventRecord[];
  error: RegistryError | undefined;
  successful: boolean;
  hash: string;
}

export interface DevTestContext {
  createWeb3: (protocol?: 'ws' | 'http') => Promise<EnhancedWeb3>;
  createEthers: () => Promise<ethers.providers.JsonRpcProvider>;
  createPolkadotApi: () => Promise<ApiPromise>;

  // createBlock<
  //   ApiType extends ApiTypes,
  //   Call extends
  //     | SubmittableExtrinsic<ApiType>
  //     | Promise<SubmittableExtrinsic<ApiType>>
  //     | string
  //     | Promise<string>,
  //   Calls extends Call | Call[]
  // >(
  //   transactions?: Calls,
  //   options?: BlockCreation
  // ): Promise<
  //   BlockCreationResponse<
  //     ApiType,
  //     Calls extends Call[] ? Awaited<Call>[] : Awaited<Call>
  //   >
  // >;

  // We also provided singleton providers for simplicity
  web3: EnhancedWeb3;
  // ethers: ethers.providers.JsonRpcProvider;
  polkadotApi: ApiPromise;
  // rpcPort: number;
  ethTransactionType?: EthTransactionType;
}

interface InternalDevTestContext extends DevTestContext {
  _polkadotApis: ApiPromise[];
  _web3Providers: HttpProvider[];
}

export async function startDevNode(): Promise<ChildProcess> {
  while (nodeStarted) {
    // Wait 100ms to see if the node is free
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
  }
  nodeStarted = true;

  const args = [
    // withWasm ? `--execution=Wasm` : `--execution=Native`, // Faster execution using native
    // process.env.FORCE_COMPILED_WASM
    //   ? `--wasm-execution=compiled`
    //   : `--wasm-execution=interpreted-i-know-what-i-do`,
    // ETHAPI_CMD != "" ? `${ETHAPI_CMD}` : `--ethapi=txpool`,
    `--name=canonbrother`,
    `--no-telemetry`, // disable connecting to substrate telemtry server
    `--no-prometheus`, // do not expose a Prometheus exporter endpoint
    `--force-authoring`, // enable authoring even when offline
    `--rpc-cors=all`,
    `--alice`, // shortcut for `--name Alice --validator` with session keys for `Alice` added to keystore
    // '--chain= ./specs/chain_spec.json',
    // `--sealing=manual`, // mb feat
    `--in-peers=0`,
    `--out-peers=0`,
    // `-l${MOONBEAM_LOG}`,
    `--port=${port}`,
    `--rpc-port=${rpcPort}`,
    `--ws-port=${wsPort}`,
    `--tmp` // run a temporary node
  ];

  const onProcessExit = function () {
    runningNode && runningNode.kill();
  };
  const onProcessInterrupt = function () {
    process.exit(2);
  };

  process.once('SIGINT', onProcessInterrupt);
  process.once('exit', onProcessExit);
  const runningNode = spawn(BINARY_PATH, args);

  process.once('exit', () => {
    process.removeListener('exit', onProcessExit);
    process.removeListener('SIGINT', onProcessInterrupt);
    nodeStarted = false;
  });

  runningNode.on('error', (err) => {
    console.error('runningNode err: ', err);
    process.exit(1);
  });

  const binaryLogs: any[] = [];
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      console.error(`Failed to start Frontier Test Node.`);
      console.error(`Command: ${BINARY_PATH} ${args.join(' ')}`);
      console.error(`Logs:`);
      console.error(binaryLogs.map((chunk) => chunk.toString()).join('\n'));
      throw new Error('Failed to launch node');
    }, SPAWNING_TIME - 2000);

    const onData = async (chunk: any) => {
      console.log(chunk.toString());
      if (DISPLAY_LOG) {
        console.log(chunk.toString());
      }
      binaryLogs.push(chunk);
      if (chunk.toString().match(/Listening for new connections/)) {
        clearTimeout(timer);
        if (!DISPLAY_LOG) {
          runningNode.stderr?.off('data', onData);
          runningNode.stdout?.off('data', onData);
        }
        resolve();
      }
    };
    runningNode.stderr?.on('data', onData);
    runningNode.stdout?.on('data', onData);
  });

  return runningNode;
}

export const provideWeb3Api = async (
  port: number,
  protocol: 'ws' | 'http' = 'http'
) => {
  const web3 =
    protocol == 'ws'
      ? new Web3(`ws://localhost:${port}`) // TODO: restore support for
      : new Web3(`http://localhost:${port}`);

  // Adding genesis account for convenience
  web3.eth.accounts.wallet.add(ALITH_PRIVATE_KEY);

  // Hack to add customRequest method.
  (web3 as any).customRequest = (method: string, params: any[]) =>
    customWeb3Request(web3, method, params);

  return web3 as EnhancedWeb3;
};

export async function customWeb3Request(
  web3: Web3,
  method: string,
  params: any[]
) {
  return new Promise<JsonRpcResponse>((resolve, reject) => {
    (web3.currentProvider as any).send(
      {
        jsonrpc: '2.0',
        id: 1,
        method,
        params
      },
      (error: Error | null, result: JsonRpcResponse) => {
        if (error) {
          reject(
            `Failed to send custom request (${method} (${params
              .map((p) => {
                const str = p.toString();
                return str.length > 128
                  ? `${str.slice(0, 96)}...${str.slice(-28)}`
                  : str;
              })
              .join(',')})): ${error.message || error.toString()}`
          );
        }
        resolve(result);
      }
    );
  });
}

// export async function createAndFinalizeBlock(
//   api: ApiPromise,
//   parentHash?: string,
//   finalize: boolean = true
// ): Promise<{
//   duration: number;
//   hash: string;
// }> {
//   console.log('createAndFinalizeBlock api: ');
//   const startTime: number = Date.now();

//   let block: CreatedBlock;

//   try {
//     block = parentHash
//       ? await api.rpc.engine.createBlock(true, finalize, parentHash)
//       : await api.rpc.engine.createBlock(true, finalize);
//     console.log('block: ', block);
//   } catch (err) {
//     console.log('err: ', err);
//   }

//   return {
//     duration: Date.now() - startTime,
//     hash: block!.get('hash')!.toString()
//   };
// }

export const providePolkadotApi = async (port: number) => {
  return await ApiPromise.create({
    provider: new WsProvider(`ws://localhost:${port}`)
    // typesBundle: typesBundlePre900 as any,
  });
};

export const provideEthersApi = async (port: number) => {
  return new ethers.providers.JsonRpcProvider(`http://localhost:${port}`);
};

export function filterAndApply<T>(
  events: EventRecord[],
  section: string,
  methods: string[],
  onFound: (record: EventRecord) => T
): T[] {
  return events
    .filter(
      ({ event }) => section === event.section && methods.includes(event.method)
    )
    .map((record) => onFound(record));
}

export function getDispatchError({
  event: {
    data: [dispatchError]
  }
}: EventRecord): DispatchError {
  return dispatchError as DispatchError;
}

export function extractError(
  events: EventRecord[] = []
): DispatchError | undefined {
  return filterAndApply(
    events,
    'system',
    ['ExtrinsicFailed'],
    getDispatchError
  )[0];
}

// The context is initialized empty to allow passing a reference
// and to be filled once the node information is retrieved
let context: InternalDevTestContext = {
  ethTransactionType: 'Legacy'
} as InternalDevTestContext;

// The currently running node for this describe
let runningNode: ChildProcess | null;

// Making sure the node has started
beforeAll(async () => {
  // Set timeout to 5000 for all tests.
  jest.setTimeout(5000);

  jest.setTimeout(SPAWNING_TIME);
  runningNode = await startDevNode();

  // context.rpcPort = init.rpcPort;

  // Context is given prior to this assignement, so doing
  // context = init.context will fail because it replace the variable;

  context._polkadotApis = [];
  context._web3Providers = [];

  context.createWeb3 = async (protocol: 'ws' | 'http' = 'http') => {
    const provider =
      protocol == 'ws'
        ? await provideWeb3Api(wsPort, 'ws')
        : await provideWeb3Api(rpcPort, 'http');
    context._web3Providers.push((provider as any)._provider);
    return provider;
  };
  context.createEthers = async () => provideEthersApi(rpcPort);
  context.createPolkadotApi = async () => {
    const apiPromise = await providePolkadotApi(wsPort);
    // We keep track of the polkadotApis to close them at the end of the test
    context._polkadotApis.push(apiPromise);
    await apiPromise.isReady;
    // Necessary hack to allow polkadotApi to finish its internal metadata loading
    // apiPromise.isReady unfortunately doesn't wait for those properly
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });

    return apiPromise;
  };

  context.polkadotApi = await context.createPolkadotApi();
  context.web3 = await context.createWeb3();
  // context.ethers = await context.createEthers();

  // context.createBlock = async <
  //   ApiType extends ApiTypes,
  //   Call extends
  //     | SubmittableExtrinsic<ApiType>
  //     | Promise<SubmittableExtrinsic<ApiType>>
  //     | string
  //     | Promise<string>,
  //   Calls extends Call | Call[]
  // >(
  //   transactions?: Calls,
  //   options: BlockCreation = {}
  // ) => {
  //   console.log('context.createBlock');
  //   const results: (
  //     | { type: 'eth'; hash: string }
  //     | { type: 'sub'; hash: string }
  //   )[] = [];
  //   const txs =
  //     transactions == undefined
  //       ? []
  //       : Array.isArray(transactions)
  //       ? transactions
  //       : [transactions];

  //   for await (const call of txs) {
  //     if (typeof call == 'string') {
  //       // Ethereum
  //       results.push({
  //         type: 'eth',
  //         hash: (
  //           await customWeb3Request(context.web3, 'eth_sendRawTransaction', [
  //             call
  //           ])
  //         ).result
  //       });
  //     } else if (call.isSigned) {
  //       results.push({
  //         type: 'sub',
  //         hash: (await call.send()).toString()
  //       });
  //     } else {
  //       results.push({
  //         type: 'sub',
  //         hash: (await call.signAndSend(alith)).toString()
  //       });
  //     }
  //   }

  //   const { parentHash, finalize } = options;
  //   const blockResult = await createAndFinalizeBlock(
  //     context.polkadotApi,
  //     parentHash,
  //     finalize
  //   );
  //   console.log('blockResult: ', blockResult);

  //   // No need to extract events if no transactions
  //   if (results.length == 0) {
  //     return {
  //       block: blockResult,
  //       result: null
  //     };
  //   }

  //   // We retrieve the events for that block
  //   const allRecords: EventRecord[] = (await (
  //     await context.polkadotApi.at(blockResult.hash)
  //   ).query.system.events()) as any;
  //   // We retrieve the block (including the extrinsics)
  //   const blockData = await context.polkadotApi.rpc.chain.getBlock(
  //     blockResult.hash
  //   );

  //   const a: Awaited<Promise<number>> = 0;

  //   const result: ExtrinsicCreation[] = results.map((result) => {
  //     let extrinsicIndex =
  //       result.type == 'eth'
  //         ? allRecords
  //             .find(
  //               ({ phase, event: { section, method, data } }) =>
  //                 phase.isApplyExtrinsic &&
  //                 section == 'ethereum' &&
  //                 method == 'Executed' &&
  //                 data[3].toString() &&
  //                 result.hash
  //             )
  //             ?.phase?.asApplyExtrinsic?.toNumber() ?? 0
  //         : blockData.block.extrinsics.findIndex(
  //             (ext) => ext.hash.toHex() == result.hash
  //           );

  //     // We retrieve the events associated with the extrinsic
  //     const events = allRecords.filter(
  //       ({ phase }) =>
  //         phase.isApplyExtrinsic &&
  //         phase.asApplyExtrinsic.toNumber() === extrinsicIndex
  //     );
  //     const failed = extractError(events);
  //     return {
  //       extrinsic:
  //         extrinsicIndex >= 0
  //           ? blockData.block.extrinsics[extrinsicIndex]
  //           : null,
  //       events,
  //       error:
  //         failed &&
  //         ((failed.isModule &&
  //           context.polkadotApi.registry.findMetaError(failed.asModule)) ||
  //           ({ name: failed.toString() } as RegistryError)),
  //       successful: !failed,
  //       hash: result.hash
  //     };
  //   });

  //   // Adds extra time to avoid empty transaction when querying it
  //   if (results.find((r) => r.type == 'eth')) {
  //     await new Promise((resolve) => setTimeout(resolve, 2));
  //   }
  //   return {
  //     block: blockResult,
  //     result: Array.isArray(transactions) ? result : (result[0] as any)
  //   };
  // };

  // debug(
  //   `Setup ready [${/:([0-9]+)$/.exec((context.web3.currentProvider as any).host)[1]}] for ${
  //     this.currentTest.title
  //   }`
  // );
});

afterAll(async function () {
  console.log('afterAll');
  await Promise.all(context._web3Providers.map((p) => p.disconnect()));
  await Promise.all(context._polkadotApis.map((p) => p.disconnect()));

  console.log('runningNode 0: ', runningNode);

  if (runningNode) {
    await new Promise((resolve) => {
      runningNode?.once('exit', resolve);
      runningNode?.kill();
      runningNode = null;
      console.log('afterAll runningNode null');
    });
  }
  console.log('runningNode 1: ', runningNode);
});

it('', async () => {
  console.log('it 0');
  // await context.createBlock();
  console.log(
    'getBalance',
    await context.web3.eth.getBalance(alith.address, 0)
  );
  console.log('it 1');
});
