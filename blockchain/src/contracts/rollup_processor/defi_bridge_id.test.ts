import { EthAddress } from '@aztec/barretenberg/address';
import { AssetId } from '@aztec/barretenberg/asset';
import { BridgeId } from '@aztec/barretenberg/bridge_id';
import { Signer } from 'ethers';
import { ethers } from 'hardhat';
import { createRollupProof, createSendProof, DefiInteractionData } from './fixtures/create_mock_proof';
import { deployMockBridge, MockBridgeParams } from './fixtures/setup_defi_bridges';
import { setupTestRollupProcessor } from './fixtures/setup_test_rollup_processor';
import { RollupProcessor } from './rollup_processor';

describe('rollup_processor: defi bridge', () => {
  let rollupProcessor: RollupProcessor;
  let signers: Signer[];
  let rollupProvider: Signer;
  let assetAddresses: EthAddress[];

  const dummyProof = () => createSendProof(AssetId.ETH);

  const mockBridge = async (params: MockBridgeParams = {}) =>
    deployMockBridge(rollupProvider, rollupProcessor, assetAddresses, params);

  beforeEach(async () => {
    signers = await ethers.getSigners();
    rollupProvider = signers[0];
    ({ rollupProcessor, assetAddresses } = await setupTestRollupProcessor(signers));
  });

  const cloneId = (
    bridgeId: BridgeId,
    {
      address,
      secondAssetValid,
      secondAssetVirtual,
      inputAssetId,
      outputAssetIdA,
      outputAssetIdB,
    }: Partial<BridgeId> = {},
  ) => {
    return new BridgeId(
      address || bridgeId.address,
      inputAssetId !== undefined ? inputAssetId : bridgeId.inputAssetId,
      outputAssetIdA !== undefined ? outputAssetIdA : bridgeId.outputAssetIdA,
      outputAssetIdB !== undefined ? outputAssetIdB : bridgeId.outputAssetIdB,
      bridgeId.openingNonce,
      secondAssetValid !== undefined ? secondAssetValid : bridgeId.secondAssetValid,
      secondAssetVirtual !== undefined ? secondAssetVirtual : bridgeId.secondAssetVirtual,
      bridgeId.auxData,
    );
  };

  it('revert if output assets are the same', async () => {
    const bridgeId = await mockBridge({
      secondAssetValid: true,
      outputAssetIdA: AssetId.renBTC,
      outputAssetIdB: AssetId.renBTC,
    });
    const { proofData } = await createRollupProof(rollupProvider, dummyProof(), {
      defiInteractionData: [new DefiInteractionData(bridgeId, 1n)],
    });
    const tx = await rollupProcessor.createEscapeHatchProofTx(proofData, [], []);
    await expect(rollupProcessor.sendTx(tx)).rejects.toThrow('Rollup Processor: INVALID_BRIDGE');
  });
});