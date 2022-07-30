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
let nodeStarted = false;

// constants
export const RPC_PORT = 19944;
export const WS_PORT = 19933;
export const BINARY_PATH =
  process.env.BINARY_PATH || '../target/release/frontier-template-node';
export const DISPLAY_LOG = process.env.FRONTIER_LOG || false;
export const SPAWNING_TIME = 20000;
export const ALITH_PRIVATE_KEY =
  '0x5fb92d6e98884f76de468fa3f6278f8807c48bebc13595d45af5bdc4da702133';
export const alith = keyringEth.addFromUri(ALITH_PRIVATE_KEY);

// providers
export type EnhancedWeb3 = Web3 & {
  customRequest: (method: string, params: any[]) => Promise<JsonRpcResponse>;
};

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

export const providePolkadotApi = async (port: number) => {
  return await ApiPromise.create({
    initWasm: false,
    provider: new WsProvider(`ws://localhost:${port}`)
    // typesBundle: typesBundlePre900 as any,
  });
};

export const provideEthersApi = async (port: number) => {
  return new ethers.providers.JsonRpcProvider(`http://localhost:${port}`);
};

// setup dev test
export type EthTransactionType = 'Legacy' | 'EIP2930' | 'EIP1559';

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

// substrate rpc
export interface ExtrinsicCreation {
  extrinsic: GenericExtrinsic<AnyTuple> | null;
  events: EventRecord[];
  error: RegistryError | undefined;
  successful: boolean;
  hash: string;
}

// error
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

export interface DevTestContext {
  // createWeb3: (protocol?: 'ws' | 'http') => Promise<EnhancedWeb3>;
  // createEthers: () => Promise<ethers.providers.JsonRpcProvider>;
  // createPolkadotApi: () => Promise<ApiPromise>;

  createBlock<
    ApiType extends ApiTypes,
    Call extends
      | SubmittableExtrinsic<ApiType>
      | Promise<SubmittableExtrinsic<ApiType>>
      | string
      | Promise<string>,
    Calls extends Call | Call[]
  >(
    transactions?: Calls,
    options?: BlockCreation
  ): Promise<
    BlockCreationResponse<
      ApiType,
      Calls extends Call[] ? Awaited<Call>[] : Awaited<Call>
    >
  >;

  // We also provided singleton providers for simplicity
  web3: EnhancedWeb3;
  ethers: ethers.providers.JsonRpcProvider;
  polkadotApi: ApiPromise;
  rpcPort: number;
  ethTransactionType?: EthTransactionType;
}

export async function createWeb3(
  protocol: 'ws' | 'http' = 'http'
): Promise<EnhancedWeb3> {
  const provider =
    protocol == 'ws'
      ? await provideWeb3Api(WS_PORT, 'ws')
      : await provideWeb3Api(RPC_PORT, 'http');
  // web3Providers.push((provider as any)._provider);
  return provider;
}

export async function createEthers(
  rpcPort = 19944
): Promise<ethers.providers.JsonRpcProvider> {
  return provideEthersApi(rpcPort);
}

export async function createPolkadotApi(wsPort = WS_PORT) {
  const apiPromise = await providePolkadotApi(wsPort);
  // polkadotApis.push(apiPromise)
  await apiPromise.isReady;

  return apiPromise;
}

export async function startDevNode(
  withWasm = true,
  opts?: any
): Promise<ChildProcess> {
  while (nodeStarted) {
    // Wait 100ms to see if the node is free
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
  }
  nodeStarted = true;

  let args = [
    withWasm ? `--execution=Wasm` : `--execution=Native`, // Faster execution using native
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
    // '--chain= ./test-spec.json',
    `--sealing=manual`,
    `--in-peers=0`,
    `--out-peers=0`,
    `--port=19955`,
    `--rpc-port=19944`,
    `--ws-port=19933`,
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
      if (DISPLAY_LOG) {
        console.log(chunk.toString());
      }
      binaryLogs.push(chunk);
      if (chunk.toString().match(/Manual Seal Ready/)) {
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

export async function createAndFinalizeBlock(
  api: ApiPromise,
  parentHash?: string,
  finalize: boolean = true
): Promise<{
  duration: number;
  hash: string;
}> {
  console.log('createAndFinalizeBlock api: ');
  const startTime: number = Date.now();

  let block: CreatedBlock;

  try {
    block = parentHash
      ? await api.rpc.engine.createBlock(true, finalize, parentHash)
      : await api.rpc.engine.createBlock(true, finalize);
  } catch (err) {
    console.log('err: ', err);
  }

  return {
    duration: Date.now() - startTime,
    hash: block!.get('blockHash')!.toString()
  };
}
