import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import * as fs from 'fs';

describe('Firestore Security Rules — Dirty Dozen Verification', () => {
  let testEnv: any;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'western-correlate-nkm1r',
      firestore: {
        rules: fs.readFileSync('firestore.rules', 'utf8'),
      },
    });
  });

  afterAll(async () => {
    if (testEnv) await testEnv.cleanup();
  });

  test('1. Rejects shadow field injection on Conversation create', async () => {
    const visitorDb = testEnv.unauthenticatedContext().firestore();
    const vid = 'visitor_abcdef1234567890';
    await assertFails(
      setDoc(doc(visitorDb, 'conversations', vid), {
        visitorId: vid,
        lastMessage: 'Hi',
        lastSender: 'visitor',
        unreadForAdmin: 1,
        unreadForVisitor: 0,
        status: 'active',
        createdAt: serverTimestamp(),
        lastMessageAt: serverTimestamp(),
        isVerifiedAdmin: true,
      })
    );
  });

  test('2. Rejects oversized text on ChatMessage create', async () => {
    const visitorDb = testEnv.unauthenticatedContext().firestore();
    const vid = 'visitor_abcdef1234567890';
    await assertFails(
      setDoc(doc(visitorDb, 'conversations', vid, 'messages', 'msg_12345678'), {
        messageId: 'msg_12345678',
        visitorId: vid,
        sender: 'visitor',
        text: 'a'.repeat(4500),
        type: 'text',
        read: false,
        timestamp: serverTimestamp(),
      })
    );
  });

  test('3. Rejects poisoned conversation ID', async () => {
    const visitorDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      setDoc(doc(visitorDb, 'conversations', 'bad_id'), {
        visitorId: 'bad_id',
        lastMessage: 'Hi',
        lastSender: 'visitor',
        unreadForAdmin: 1,
        unreadForVisitor: 0,
        status: 'active',
        createdAt: serverTimestamp(),
        lastMessageAt: serverTimestamp(),
      })
    );
  });

  test('4. Rejects spoofed admin sender from unauthenticated visitor', async () => {
    const visitorDb = testEnv.unauthenticatedContext().firestore();
    const vid = 'visitor_abcdef1234567890';
    await assertFails(
      setDoc(doc(visitorDb, 'conversations', vid, 'messages', 'msg_12345678'), {
        messageId: 'msg_12345678',
        visitorId: vid,
        sender: 'admin',
        text: 'Spoofed admin',
        type: 'text',
        read: false,
        timestamp: serverTimestamp(),
      })
    );
  });

  test('5. Rejects unverified admin email spoof', async () => {
    const spoofDb = testEnv.authenticatedContext('spoof_uid', {
      email: 'chitronbhattacharjee@gmail.com',
      email_verified: false,
    }).firestore();
    await assertFails(getDocs(collection(spoofDb, 'conversations')));
  });

  test('6. Rejects client-spoofed timestamp on create', async () => {
    const visitorDb = testEnv.unauthenticatedContext().firestore();
    const vid = 'visitor_abcdef1234567890';
    await assertFails(
      setDoc(doc(visitorDb, 'conversations', vid), {
        visitorId: vid,
        lastMessage: 'Hi',
        lastSender: 'visitor',
        unreadForAdmin: 1,
        unreadForVisitor: 0,
        status: 'active',
        createdAt: new Date('2020-01-01'),
        lastMessageAt: serverTimestamp(),
      })
    );
  });

  test('12. Rejects non-admin creating admin document', async () => {
    const userDb = testEnv.authenticatedContext('user_123', {
      email: 'attacker@example.com',
      email_verified: true,
    }).firestore();
    await assertFails(
      setDoc(doc(userDb, 'admins', 'user_123'), {
        uid: 'user_123',
        email: 'attacker@example.com',
        createdAt: serverTimestamp(),
      })
    );
  });
});
