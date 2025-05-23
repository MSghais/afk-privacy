import type { Message, SignedMessage, SignedMessageWithProof } from "./types";
import { createMembership, createMessage } from "./api";
import { generateEphemeralKey, signMessage, verifyMessageSignature } from "./ephemeral-key";
import { initProver } from "./lazy-modules";
import { Providers } from "./providers";
import { k12 } from "@noble/hashes/sha3-addons";
import { loadOrInitializeEphemeralKey } from "./zk-did";

export async function generateKeyPairAndRegister(
  providerName: keyof typeof Providers
) {
  // Initialize prover without await to preload aztec bundle
  initProver();

  // Generate ephemeral key pair and a random salt
  // const {ephemeralKey:ephemeralKeyProps, uuid} = await generateEphemeralKey();
  const {ephemeralKey:ephemeralKeyProps, uuid} = await loadOrInitializeEphemeralKey();

  const ephemeralKey = {
    publicKey: BigInt(ephemeralKeyProps.publicKey),
    privateKey: BigInt(ephemeralKeyProps.privateKey),
    salt: BigInt(ephemeralKeyProps.salt),
    expiry: new Date(ephemeralKeyProps.expiry),
    ephemeralPubkeyHash: BigInt(ephemeralKeyProps.ephemeralPubkeyHash),
  };
  // Ask the AnonGroup provider to generate a proof
  const provider = Providers[providerName];
  const { anonGroup, proof, proofArgs } = await provider.generateProof(ephemeralKey);

  // Send proof to server to create an AnonGroup membership
  await createMembership({
    ephemeralPubkey: ephemeralKey.publicKey.toString(),
    ephemeralPubkeyExpiry: ephemeralKey.expiry,
    groupId: anonGroup.id,
    provider: providerName,
    proof,
    proofArgs,
  });

  return { anonGroup, ephemeralPubkey: ephemeralKey.publicKey.toString(), proofArgs, uuid };
}

export async function postMessage(message: Message, options?: {
  imageFile?: File,
  videoFile?: File,
  imageUrl?: string,
  videoUrl?: string
}) {
  // Sign the message with the ephemeral key pair
  const { signature, ephemeralPubkey, ephemeralPubkeyExpiry } = await signMessage(message);
  const signedMessage: SignedMessage = {
    ...message,
    signature: signature,
    ephemeralPubkey: ephemeralPubkey,
    ephemeralPubkeyExpiry: ephemeralPubkeyExpiry,
  };

  // Send the signed message to the server
  await createMessage(signedMessage, options);

  return signedMessage;
}

export async function verifyMessage(message: SignedMessageWithProof, options?: {
  proof?:any,
  proofArgs?:any
}) {
  try {
    if (new Date(message.timestamp).getTime() < new Date("2025-02-23").getTime()) {
      throw new Error(
        "Messages generated before 2025-02-23 are not verifiable due to major changes in the circuit. " +
        "Future versions of this app will be backward compatible."
      );
    }

    // Verify the message signature (signed with sender's ephemeral pubkey)
    console.log("message", message);
    let isValid = await verifyMessageSignature(message);
    console.log("isValid", isValid);
    if (!isValid) {
      throw new Error("Signature verification failed for the message");
    }

    // Verify the proof that the sender (their ephemeral pubkey) belongs to the AnonGroup
    const provider = Providers[message.anonGroupProvider];
    // console.log("message.anonGroupProvider", message.anonGroupProvider);
    // console.log("provider", provider);
    // console.log("message.proof", message.proof);
    // console.log("options?.proof", options?.proof);
    isValid = await provider.verifyProof(
      options?.proof|| message.proof,
      message.anonGroupId,
      message.ephemeralPubkey,
      message.ephemeralPubkeyExpiry,
      options?.proofArgs || message.proofArgs
    );
    console.log("isValid by provider", isValid);
    return isValid;
  } catch (error) {
    console.log("error", error);
    // @ts-expect-error - error is an unknown type
    alert(error.message);
    // @ts-expect-error - error is an unknown type
    throw new Error(error.message);
  }
}
