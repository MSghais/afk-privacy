"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import { fetchMessagesCountry } from "../../lib/country/index";
import { getMyDataMessageCountry } from "../../lib/profile/index";
import CountryMessageCard from "./country-message-card";
import { LocalStorageKeys, Message, SignedMessageWithProof } from "../../lib/types";
import CountryMessageForm from "./country-message-form";
import { useLocalStorage } from "@uidotdev/usehooks";

const MESSAGES_PER_PAGE = 30;
const INITIAL_POLL_INTERVAL = 10000; // 10 seconds
const MAX_POLL_INTERVAL = 100000; // 100 seconds

type MessageListProps = {
  isInternal?: boolean;
  showMessageForm?: boolean;
  groupId?: string;
};

const MessageListCountry: React.FC<MessageListProps> = ({
  isInternal,
  showMessageForm,
  groupId,
}) => {
  // State
  const [messages, setMessages] = useState<SignedMessageWithProof[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState("");
  const [pollInterval, setPollInterval] = useState(INITIAL_POLL_INTERVAL);

  // Refs
  const observer = useRef<IntersectionObserver | null>(null);
  const messageListRef = useRef<HTMLDivElement>(null);

  const [isVerified, setIsVerified] = useLocalStorage(LocalStorageKeys.IsVerified, false);

  const [myData, setMyData] = useState<any>(null);

  const isRegistered = useMemo(() => {
    if (myData && myData?.is_verified && myData?.nationality) {
      return true;
    }
    return false;
  }, [myData]);

  const currentKyc = useMemo(() => {
    if (myData && myData?.is_verified && myData?.nationality) {
      return myData;
    }
    return null;
  }, [myData]);

  useEffect(() => {
    const fetchMyData = async () => {
      const message = "getMyData";
      const messageObj: Message = {
        // id: crypto.randomUUID().split("-").slice(0, 2).join(""),
        id: crypto.randomUUID(),
        timestamp: new Date(),
        text: message,
        internal: !!isInternal,
        likes: 0,
        anonGroupId: "selfxyz",
        anonGroupProvider: "selfxyz",
      };

      console.log("messageObj", messageObj);
      const res = await getMyDataMessageCountry(messageObj);

      const myData = res?.credentialSubject;
      console.log("myData", myData);
      if(myData?.is_verified) {
        setIsVerified(true);
      }
      setMyData(myData);
    };
    fetchMyData();
  }, []);

  // Ref to keep track of the last message element (to load more messages on scroll)
  const lastMessageElementRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (loading) return;
      if (observer.current) observer.current.disconnect();
      observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMore) {
          loadMessages(messages[messages.length - 1]?.timestamp.getTime());
        }
      });
      if (node) observer.current.observe(node);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [messages, loading, hasMore]
  );

  // Cached helpers
  const loadMessages = useCallback(
    async (beforeTimestamp: number | null = null) => {
      if (isInternal && !groupId) return;
      setLoading(true);

      try {
        const fetchedMessages = await fetchMessagesCountry({
          isInternal: !!isInternal,
          limit: MESSAGES_PER_PAGE,
          beforeTimestamp,
          groupId,
        });

        console.log("fetchedMessages", fetchedMessages);

        const existingMessageIds: Record<string, boolean> = {};
        messages.forEach((m) => {
          existingMessageIds[m.id!] = true;
        });
        const cleanedMessages = fetchedMessages.filter(
          (m: SignedMessageWithProof) => !existingMessageIds[m.id!]
        );

        setMessages((prevMessages) => [...prevMessages, ...cleanedMessages]);
        setHasMore(fetchedMessages.length === MESSAGES_PER_PAGE);
      } catch (error) {
        setError((error as Error)?.message);
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groupId, isInternal]
  );

  const checkForNewMessages = useCallback(async () => {
    if (isInternal && !groupId) return;

    try {
      const newMessages = await fetchMessagesCountry({
        groupId,
        isInternal: !!isInternal,
        limit: MESSAGES_PER_PAGE,
        afterTimestamp: messages[0]?.timestamp.getTime(),
      });

      if (newMessages.length > 0) {
        setMessages((prevMessages) => [...newMessages, ...prevMessages]);
        setPollInterval(INITIAL_POLL_INTERVAL);
      } else {
        setPollInterval((prevInterval) =>
          Math.min(prevInterval + 10000, MAX_POLL_INTERVAL)
        );
      }
    } catch (error) {
      console.error("Error checking for new messages:", error);
    }
  }, [groupId, isInternal, messages]);

  // Effects
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    const startPolling = () => {
      intervalId = setInterval(() => {
        if (messageListRef.current && messageListRef.current.scrollTop === 0) {
          checkForNewMessages();
        }
      }, pollInterval);
    };

    startPolling();

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [pollInterval, checkForNewMessages]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Handlers
  function onNewMessageSubmit(signedMessage: SignedMessageWithProof) {
    setMessages((prevMessages) => [signedMessage, ...prevMessages]);
  }

  // Render helpers
  function renderLoading() {
    return (
      <div className="skeleton-loader">
        {[...Array(4)].map((_, index) => (
          <div key={index} className="message-card-skeleton">
            <div className="message-card-skeleton-header">
              <div className="skeleton-text skeleton-short"></div>
            </div>
            <div className="skeleton-text skeleton-long mt-1"></div>
            <div className="skeleton-text skeleton-long mt-05"></div>
          </div>
        ))}
      </div>
    );
  }

  function renderNoMessages() {
    if (!groupId) return null;

    return (
      <div className="article text-center">
        <p className="title">No messages yet</p>
        <p className="mb-05">
          Are you a member of <span>{groupId}</span>?
        </p>
        {!isInternal ? (
          <p>
            Head over to the <Link href="/">homepage</Link> to send an anonymous
            message by proving you are a member of <span>{groupId}</span>!
          </p>
        ) : (
          <p>
            No messages yet. Be the first one to send anonymous messages to your
            teammates.
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      {showMessageForm && (
        <CountryMessageForm
          isRegisteredProps={isRegistered}
          connectedKyc={currentKyc}
          isInternal={isInternal} onSubmit={onNewMessageSubmit} />
      )}

      <div className="message-list" ref={messageListRef}>
        {messages.map((message, index) => {
          // console.log("message", message);
          return (
            <div
              key={message.id || index}
              ref={index === messages.length - 1 ? lastMessageElementRef : null}
            >
              <CountryMessageCard
                message={message as SignedMessageWithProof}
                isInternal={isInternal}
              />
            </div>
          )
        })}
        {loading && renderLoading()}
        {!loading && !error && messages.length === 0 && renderNoMessages()}
      </div>

      {error && <div className="error-message">{error}</div>}
    </>
  );
};

export default MessageListCountry;
