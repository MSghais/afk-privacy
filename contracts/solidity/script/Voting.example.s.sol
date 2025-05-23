// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.18;

import "forge-std/Script.sol";
import "../src/zkVoteExample.sol";

contract DeploymentScript is Script {
    function readInputs() internal view returns (string memory) {
        string memory inputDir = string.concat(vm.projectRoot(), "/data/input");

        return vm.readFile(string.concat(inputDir, ".json"));
    }

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        HonkVerifier verifier = new HonkVerifier();

        string memory inputs = readInputs();

        bytes memory merkleRoot = vm.parseJson(inputs, ".merkleRoot");

        zkVoteExample voting = new zkVoteExample(bytes32(merkleRoot), address(verifier));

        vm.stopBroadcast();
    }
}