import { GenericContainer, StartedTestContainer } from 'testcontainers';

type Network = 'mainnet' | 'testnet';

export interface StartOptions {
  name?: string;
  spec?: string;
  timeout?: number;
}

export abstract class MetaDContainer {
  public static readonly PREFIX = 'metachain-testcontainers-';

  public static get image(): string {
    if (process?.env?.METACHAIN_DOCKER_IMAGE !== undefined) {
      return process.env.METACHAIN_DOCKER_IMAGE;
    }
    return 'defi/metachain:master';
  }

  public static readonly MetaDPorts: Record<Network, number[]> = {
    mainnet: [9955],
    testnet: [19955]
  };

  public static readonly DefaultStartOptions = {
    user: 'testcontainers-user',
    password: 'testcontainers-password'
  };

  protected startOptions?: StartOptions;
  protected cachedRpcUrl?: string;
  protected docker: GenericContainer;
  protected container?: StartedTestContainer;

  /**
   * @param {Network} network of the container
   * @param {string} image docker image name
   */
  protected constructor(
    protected readonly network: Network,
    protected readonly image: string = MetaDContainer.image
  ) {
    this.docker = new GenericContainer(image);
  }

  /**
   * Convenience Cmd builder with StartOptions
   */
  protected getCmd(opts: StartOptions): string[] {
    return [
      `target/release/${opts.name}`,
      '--sealing=manual',
      '--execution=Native', // Faster execution compaire with `Wasm`
      '--no-telemetry',
      '--no-prometheus', // shortcut for `--name Alice --validator` with session keys for `Alice` added to keystore
      '--force-authoring', // enable authoring even when offline
      '--rpc-cors=all',
      '--alice',
      // TODO(canonbrother): set up chain spec for test
      // '--chain= ./spec.json',
      '--in-peers=0',
      '--out-peers=0',
      '--port=19955',
      '--rpc-port=19944',
      '--ws-port=19933',
      '--tmp'
    ];
  }

  /**
   * Create container and start it immediately waiting for defid to be ready
   */
  async start(startOptions: StartOptions = {}): Promise<void> {
    // TODO(canonbrother): support network
    // const network = await new Network().start();
    // this.network = network;
    // await this.docker.getNetwork(network.getId()).connect({ Container: targetId })

    this.startOptions = Object.assign(
      MetaDContainer.DefaultStartOptions,
      startOptions
    );
    const timeout =
      this.startOptions.timeout !== undefined
        ? this.startOptions.timeout
        : 20000;

    this.docker
      .withName(this.generateName())
      .withCmd(this.getCmd(this.startOptions))
      .withExposedPorts(...MetaDContainer.MetaDPorts[this.network])
      .withStartupTimeout(timeout)
      .start();

    // await this.waitForRpc(timeout);
  }

  /**
   * Stop the current node and their associated volumes.
   * Removal should be automatic based on testcontainers' implementation
   */
  async stop(): Promise<void> {
    await this.stop();
  }

  /**
   * Generate a name for a new docker container with network type and random number
   */
  generateName(): string {
    const rand = Math.floor(Math.random() * 10000000);
    return `${MetaDContainer.PREFIX}-${this.network}-${rand}`;
  }

  /**
   * Wait for rpc to be ready
   * @param {number} [timeout=20000] in millis
   */
  //   private async waitForRpc(timeout = 20000): Promise<void> {
  //     await waitForCondition(
  //       async () => {
  //         this.cachedRpcUrl = undefined;
  //         await this.getMiningInfo();
  //         return true;
  //       },
  //       timeout,
  //       500,
  //       'waitForRpc'
  //     );
  //   }
}
