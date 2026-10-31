// src/lib/meta-online.js - ONLINE MODE (Beneran call Meta)
export async function postToMetaAPI(tabData, accessToken) {
  try {
    const response = await fetch(`https://graph.facebook.com/v20.0/me/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `My new guitar tab: ${tabData.title}\n${tabData.content}`,
        access_token: accessToken
      })
    });
    
    const result = await response.json();
    if (result.error) throw new Error(result.error.message);
    
    console.log("✅ Online: Berhasil post ke Meta", result.id);
    return { success: true, id: result.id };
  } catch (error) {
    console.error("❌ Online gagal, lempar ke offline queue:", error);
    // Kalau gagal, lempar ke offline
    const { saveOffline } = await import('./meta-offline.js');
    saveOffline(tabData);
    return { success: false, offline: true };
  }
      }
