import { useRef, useState, useEffect } from "react";
import QRCode from "react-qr-code"; // For QR code generation
// import { ZKPassport } from "@zkpassport/sdk";
import type { ZKPassport } from "@zkpassport/sdk";

import { loadOrInitializeEphemeralKey, signMessageSelfXyz } from "@/lib/zk-did";
import { LocalStorageKeys, SignedMessage } from "@/lib/types";
import { useLocalStorage } from "@uidotdev/usehooks";

let ZKPassportClass: any;

// export async function getZKPassport() {
//   if (!ZKPassportClass) {
//     try {
//       // Try ESM import first
//       const mod = await import('@zkpassport/sdk/dist/esm/index.js');
//       ZKPassportClass = mod.ZKPassport;
//     } catch (e) {
//       try {
//         // Fallback to CJS
//         const mod = await import('@zkpassport/sdk');
//         ZKPassportClass = mod.ZKPassport;
//       } catch (e2) {
//         console.error('Failed to load ZKPassport:', e2);
//         throw new Error('Failed to load ZKPassport');
//       }
//     }
//   }
//   return ZKPassportClass;
// }

function ZkPassportRegistration() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verificationStatus, setVerificationStatus] = useState("idle");
  const [error, setError] = useState("");
  const [verificationUrl, setVerificationUrl] = useState("");
  const [requestId, setRequestId] = useState("");
  const zkpassportRef = useRef<ZKPassport | null>(null);
  const [currentCountryId, setCurrentCountryId] = useLocalStorage<string | null>(
    LocalStorageKeys.CurrentCountryId,
    null
  );
  const [currentGender, setCurrentGender] = useLocalStorage<string | null>(
    LocalStorageKeys.CurrentGender,
    null
  );
  const [isAdult, setIsAdult] = useLocalStorage<boolean | null>(
    LocalStorageKeys.IsAdult,
    null
  );
  useEffect(() => {
    const initializeZKPassport = async () => {
      const { ZKPassport } = await import('@zkpassport/sdk');

      try {
        // Use require instead of dynamic import for CommonJS modules

        zkpassportRef.current = new ZKPassport();
      } catch (err) {
        console.error("Failed to initialize ZKPassport:", err);
        setError("Failed to initialize ZKPassport");
      }
    };
    initializeZKPassport();
  }, []);

  const handleSubmit = async (e: { preventDefault: () => void; }) => {
    e.preventDefault();
    setVerificationStatus("initiating");

    try {
      if (!zkpassportRef.current) {
        throw new Error("ZKPassport not initialized");
      }

      // Create a verification request
      const query = await zkpassportRef.current.request({
        name: "AFK",
        logo: "https://privacy.afk-community.xyz/logo.png",
        purpose: "Account verification for registration",
      });

      // Build your verification query - in this example we verify the user is 18+ and disclose nationality
      const {
        url,
        requestId,
        onRequestReceived,
        onGeneratingProof,
        onProofGenerated,
        onResult,
        onReject,
        onError,
      } = query
        // .gte("age", 18)
        .disclose("nationality")
        .disclose("birthdate")
        .disclose("gender")
        .done();

      // Save the URL and requestId to display and for potential cancellation
      setVerificationUrl(url);
      setRequestId(requestId);

      // Update status to show we're waiting for the user to scan the QR code
      setVerificationStatus("awaiting_scan");

      // Register event handlers
      onRequestReceived(() => {
        setVerificationStatus("request_received");
      });

      onGeneratingProof(() => {
        setVerificationStatus("generating_proof");
      });

      // Store the proofs and query result to send to the server
      const proofs: any[] = [];

      onProofGenerated((proof) => {
        proofs.push(proof);
      });

      onResult(async ({ verified, result: queryResult }) => {
        setVerificationStatus("proof_generated");

        if (!verified) {
          setError("Verification failed on client-side");
          setVerificationStatus("failed");
          return;
        }

        try {
          // Send the proofs and query result to your server for verification
          setVerificationStatus("sending_to_server");
          const { ephemeralKey, uuid } = await loadOrInitializeEphemeralKey();


          const messageObj = {
            id: crypto.randomUUID(),
            timestamp: new Date(),
            text: `link:zk-passport:${uuid}`,
            internal: false,
            likes: 0,
            replyCount: 0,
            parentId: null,
            anonGroupId: "zk-passport",
            anonGroupProvider: "zk-passport",
          };


          // Sign the message with the ephemeral key pair
          const { signature, ephemeralPubkey, ephemeralPubkeyExpiry } = await signMessageSelfXyz(messageObj);
          if (!signature || !ephemeralPubkey || !ephemeralPubkeyExpiry) {
            throw new Error("Failed to sign message");
          }
          const signedMessage: SignedMessage = {
            ...messageObj,
            signature: signature,
            ephemeralPubkey: BigInt(ephemeralPubkey),
            ephemeralPubkeyExpiry: ephemeralPubkeyExpiry,
          };

          const signedMessageFormated = {
            ...signedMessage,
            ephemeralPubkey: signedMessage?.ephemeralPubkey?.toString(),
            ephemeralPubkeyExpiry: signedMessage?.ephemeralPubkeyExpiry?.toString(),
            signature: signedMessage?.signature?.toString(),
            uuid: uuid,
            pubkey: ephemeralKey?.publicKey?.toString(),
          }
          const response = await fetch(process.env.ZK_PASSPORT_VERIFY_URL || "/api/register/zk-passport", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${signedMessage?.ephemeralPubkey?.toString}`,
            },
            body: JSON.stringify({
              email,
              password,
              verification: {
                proofs,
                queryResult,
              },
              signedMessage: signedMessageFormated
            }),
          });

          const data = await response.json();

          if (data.success) {
            setVerificationStatus("success");

            if(data?.data) {

              if(data?.data?.nationality) {
                setCurrentCountryId(data?.data?.nationality);
              }
              if(data?.data?.gender) {
                setCurrentGender(data?.data?.gender);
              }

              if(data?.data?.age) {
                setIsAdult(data?.data?.age >= 18);
              }
            }
            // Here you can redirect to the user's profile or home page
          } else {
            setError(data.error || "Registration failed");
            setVerificationStatus("failed");
          }
        } catch (err) {
          setError("Error communicating with server");
          setVerificationStatus("failed");
        }
      });

      onReject(() => {
        setError("Verification request was rejected");
        setVerificationStatus("rejected");
      });

      onError((error) => {
        setError(`Error during verification: ${error}`);
        setVerificationStatus("error")
        console.log("error", error);
      });
    } catch (err: any) {
      setError(`Failed to initialize verification: ${err.message}`);
      setVerificationStatus("error");
      console.log("error", err);
    }
  };

  // Function to cancel a verification request
  const cancelVerification = () => {
    if (requestId && zkpassportRef.current) {
      zkpassportRef.current.cancelRequest(requestId);
      setVerificationStatus("idle");
      setVerificationUrl("");
      setRequestId("");
    }
  };

  return (
    <div className="registration-form">
      <h2>Create an Account</h2>
      <form onSubmit={handleSubmit}>
        {/* <div>
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div> */}

        {verificationStatus === "idle" ? (
          <button type="submit">Verify with ZKPassport</button>
        ) : (
          <div className="verification-container">
            <div className="verification-status">
              <p>Status: {verificationStatus.replace(/_/g, " ")}</p>
            </div>

            {verificationUrl && verificationStatus === "awaiting_scan" && (
              <div className="qr-code-container">
                <h3 style={{ textAlign: "center", marginBottom: "10px" }}>Scan this QR code with the ZKPassport app</h3>
                <QRCode value={verificationUrl} size={300} />

                <div className="verification-options">
                  <p>
                    <a href={verificationUrl} target="_blank" rel="noopener noreferrer">
                      Open in ZKPassport app
                    </a>
                  </p>
                  <button type="button" onClick={cancelVerification} className="cancel-button">
                    Cancel Verification
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="error-message">
                <p>{error}</p>
                <button
                  type="button"
                  onClick={() => {
                    setError("");
                    setVerificationStatus("idle");
                    setVerificationUrl("");
                  }}
                >
                  Try Again
                </button>
              </div>
            )}
          </div>
        )}
      </form>
    </div>
  );
}

export default ZkPassportRegistration;