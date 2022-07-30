import { CInternalDevContext } from './DevTestContext';
import {
  createWeb3,
  createEthers,
  createPolkadotApi,
  startDevNode
} from './utils';

let context: CInternalDevContext;

beforeAll(async () => {
  const runningNode = await startDevNode(false);
  const web3 = await createWeb3();
  const ethers = await createEthers();
  const polkadotApi = await createPolkadotApi();
  context = new CInternalDevContext(web3, ethers, polkadotApi, runningNode);
});

afterAll(async () => {
  await context.clear();
});

it('should create block', async () => {
  const countBefore = await context.web3.eth.getBlockNumber();
  expect(countBefore).toStrictEqual(0);

  await context.createBlock();

  const countAfter = await context.web3.eth.getBlockNumber();
  expect(countAfter).toStrictEqual(1);
});
