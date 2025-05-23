// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import "../src/zkVoteExample.sol";
import "../src/verifiers/Verifier.sol";

contract VotingExampleTest is Test {
    zkVoteExample public voteContract;
    HonkVerifier public verifier;

    bytes proofBytes;
    uint256 deadline = block.timestamp + 10000000;

    bytes32 merkleRoot;
    bytes32 nullifierHash;

    function readInputs() internal view returns (string memory) {
        string memory inputDir = string.concat(vm.projectRoot(), "/data/input");
        return vm.readFile(string.concat(inputDir, ".json"));
    }

    function setUp() public {
        string memory inputs = readInputs();

        merkleRoot = bytes32(vm.parseJson(inputs, ".merkleRoot"));
        nullifierHash = bytes32(vm.parseJson(inputs, ".nullifierHash"));

        verifier = new HonkVerifier();
        voteContract = new zkVoteExample(merkleRoot, address(verifier));
        voteContract.propose("First proposal", deadline);

        string memory proofFilePath = "../../circuits/zk_vote/target/proof/calldata.txt";
        // string memory proofFilePath = "../../circuits/zk_vote/target/proof/proof";
        string memory proofData = vm.readLine(proofFilePath);
        proofBytes = vm.parseBytes(proofData);
    }

    function test_validVote() public {
        voteContract.castVote(proofBytes, 0, 1, nullifierHash);
    }

    function test_invalidProof() public {
        vm.expectRevert();
        voteContract.castVote(hex"12", 0, 1, nullifierHash);
    }

    function test_doubleVoting() public {
        voteContract.castVote(proofBytes, 0, 1, nullifierHash);

        vm.expectRevert("Proof has been already submitted");
        voteContract.castVote(proofBytes, 0, 1, nullifierHash);
    }

    function test_changedVote() public {
        vm.expectRevert();

        voteContract.castVote(proofBytes, 0, 0, nullifierHash);
    }
}