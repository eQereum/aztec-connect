// SPDX-License-Identifier: GPL-2.0-only
// Copyright 2020 Spilsbury Holdings Ltd
pragma solidity >=0.6.10;

import {SafeMath} from '@openzeppelin/contracts/math/SafeMath.sol';
import {Types} from '../verifier/cryptography/Types.sol';
import {Bn254Crypto} from '../verifier/cryptography/Bn254Crypto.sol';
import {Decoder} from '../Decoder.sol';
import 'hardhat/console.sol';

import {IVerifier} from '../interfaces/IVerifier.sol';

contract HashInputs is Decoder {
    IVerifier public verifier;

    constructor(address _verifierAddress) public {
        verifier = IVerifier(_verifierAddress);
    }

    function computePublicInputHash(
        bytes calldata /* encodedProofData */
    ) external returns (bytes32) {
        decodeProof(rollupHeaderInputLength, txNumPubInputs);
        return 0;
    }

    function verifyProofTest(
        bytes calldata /* encodedProofData */
    ) external {
        (, , uint256 publicInputsHash) = decodeProof(rollupHeaderInputLength, txNumPubInputs);
        uint256 broadcastedDataSize = rollupHeaderInputLength + 4;
        uint256 rollupHeaderInputLengthLocal = rollupHeaderInputLength;
        bool proof_verified;
        assembly {
            /**
             * Validate correctness of zk proof.
             *
             * 1st Item is to format verifier calldata.
             **/

            // Our first input param `encodedProofData` contains the concatenation of
            // encoded 'broadcasted inputs' and the actual zk proof data.
            // (The `boadcasted inputs` is converted into a 32-byte SHA256 hash, which is
            // validated to equal the first public inputs of the zk proof. This is done in `Decoder.sol`).
            // We need to identify the location in calldata that points to the start of the zk proof data.

            // Step 1: compute size of zk proof data and its calldata pointer.
            /**
                Data layout for `bytes encodedProofData`...

                0x00 : 0x20 : length of array
                0x20 : 0x20 + header : root rollup header data
                0x20 + header : 0x24 + header : X, the length of encoded inner join-split public inputs
                0x24 + header : 0x24 + header + X : (inner join-split public inputs)
                0x24 + header + X : 0x28 + header + X : Y, the length of the zk proof data
                0x28 + header + X : 0x28 + haeder + X + Y : zk proof data

                We need to recover the numeric value of `0x28 + header + X` and `Y`
             **/
            // Begin by getting length of encoded inner join-split public inputs.
            // `calldataload(0x04)` points to start of bytes array. Add 0x24 to skip over length param and function signature.
            // The calldata param *after* the header is the length of the pub inputs array. However it is a packed 4-byte param.
            // To extract it, we subtract 28 bytes from the calldata pointer and mask off all but the 4 least significant bytes.
            let encodedInnerDataSize := and(
                calldataload(add(add(calldataload(0x04), 0x24), sub(rollupHeaderInputLengthLocal, 0x1c))),
                0xffffffff
            )

            // broadcastedDataSize = inner join-split pubinput size + header size + 4 bytes (skip over zk proof length param)
            broadcastedDataSize := add(broadcastedDataSize, encodedInnerDataSize)

            // Compute zk proof data size by subtracting broadcastedDataSize from overall length of bytes encodedProofsData
            let zkProofDataSize := sub(calldataload(add(calldataload(0x04), 0x04)), broadcastedDataSize)

            // Compute calldata pointer to start of zk proof data by adding calldata offset to broadcastedDataSize
            // (+0x24 skips over function signature and length param of bytes encodedProofData)
            let zkProofDataPtr := add(broadcastedDataSize, add(calldataload(0x04), 0x24))

            // Step 2: Format calldata for verifier contract call.

            // Get free memory pointer - we copy calldata into memory starting here
            let dataPtr := mload(0x40)

            // We call the function `verify(bytes,uint256,uint256)`
            // The function signature is 0x198e744a
            // Calldata map is:
            // 0x00 - 0x04 : 0x198e744a
            // 0x04 - 0x24 : 0x40 (number of bytes between 0x04 and the start of the `proofData` array at 0x44)
            // 0x24 - 0x44 : numTxs
            // 0x44 - .... : proofData
            mstore8(dataPtr, 0x19)
            mstore8(add(dataPtr, 0x01), 0x8e)
            mstore8(add(dataPtr, 0x02), 0x74)
            mstore8(add(dataPtr, 0x03), 0x4a)
            mstore(add(dataPtr, 0x04), 0x60)
            mstore(add(dataPtr, 0x24), calldataload(add(calldataload(0x04), 0x44))) // numTxs
            mstore(add(dataPtr, 0x44), publicInputsHash)
            mstore(add(dataPtr, 0x64), zkProofDataSize) // length of zkProofData bytes array
            calldatacopy(add(dataPtr, 0x84), zkProofDataPtr, zkProofDataSize) // copy the zk proof data into memory

            // Step 3: Call our verifier contract. If does not return any values, but will throw an error if the proof is not valid
            // i.e. verified == false if proof is not valid
            proof_verified := staticcall(gas(), sload(verifier_slot), dataPtr, add(zkProofDataSize, 0x84), 0x00, 0x00)
        }
        require(proof_verified, 'proof verification failed');
    }
}
