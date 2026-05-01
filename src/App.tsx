import { useState, useEffect } from 'react';
import { db } from './lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Dashboard } from './components/Dashboard';

const DEFAULT_HOUSEHOLD_ID = 'DEFAULT_HOUSEHOLD';
const USER_ID_KEY = 'couple_user_id';

export default function App() {
  const [user, setUser] = useState<{uid: string, displayName: string} | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let localUid = localStorage.getItem(USER_ID_KEY);
    if (!localUid) {
      localUid = Math.random().toString(36).substring(2, 15);
      localStorage.setItem(USER_ID_KEY, localUid);
    }
    setUser({ uid: localUid, displayName: 'Local User' });

    // Initialize Default Household
    const initHousehold = async () => {
      try {
        const hDoc = doc(db, 'households', DEFAULT_HOUSEHOLD_ID);
        const snap = await getDoc(hDoc);
        if (!snap.exists()) {
          await setDoc(hDoc, {
            memberIds: [localUid],
            createdAt: serverTimestamp()
          });
        }
      } catch (err) {
        console.error("Initialization error:", err);
      } finally {
        setLoading(false);
      }
    };

    initHousehold();
  }, []);

  if (loading) return <div className="min-h-screen bg-[#0F1115] flex items-center justify-center text-white/40">Carregando...</div>;

  if (!user) return null;

  return <Dashboard householdId={DEFAULT_HOUSEHOLD_ID} user={user} />;
}
