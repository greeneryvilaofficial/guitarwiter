// src/lib/meta-offline.js - OFFLINE MODE (Beneran nyimpen & sync)
const QUEUE_KEY = 'guitarwiter_offline_queue';

export function saveOffline(tabData) {
  const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  queue.push({ ...tabData, timestamp: Date.now(), synced: false });
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  console.log("💾 Offline: Disimpen lokal", tabData.title);
  
  // Daftarin sync pas online lagi
  window.addEventListener('online', syncOfflineQueue, { once: true });
}

export async function syncOfflineQueue() {
  const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  const unsynced = queue.filter(item => !item.synced);
  
  if (unsynced.length === 0) return;
  
  console.log(`🔄 Online lagi! Sync ${unsynced.length} tab...`);
  
  const { postToMetaAPI } = await import('./meta-online.js');
  const token = import.meta.env.VITE_META_TOKEN;
  
  for (const item of unsynced) {
    await postToMetaAPI(item, token);
    item.synced = true;
  }
  
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  console.log("✅ Semua offline queue berhasil di-sync ke Meta!");
}

export function getOfflineTabs() {
  return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    }
