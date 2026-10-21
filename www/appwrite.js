// GuitarWiter - Appwrite Sync
import { Client, Databases, ID } from 'https://cdn.jsdelivr.net/npm/appwrite@16.0.2/+esm';

const client = new Client()
    .setEndpoint('https://cloud.appwrite.io/v1')
    .setProject('6ad939930010447e87e4');

const databases = new Databases(client);

const DATABASE_ID = '6ad93aa60033d2fb31ae';
const COLLECTION_ID = '6ad93c150007e3eb6d58';

// Buat simpan lagu
export async function saveSong(judul, lirik, chord) {
    try {
        const result = await databases.createDocument(
            DATABASE_ID,
            COLLECTION_ID,
            ID.unique(),
            { judul, lirik, chord }
        );
        console.log('Lagu kesimpen!', result);
        return result;
    } catch (e) {
        console.error('Gagal simpen:', e);
    }
}

// Buat ambil semua lagu
export async function getSongs() {
    try {
        const result = await databases.listDocuments(DATABASE_ID, COLLECTION_ID);
        return result.documents;
    } catch (e) {
        console.error('Gagal ambil:', e);
        return [];
    }
  }
