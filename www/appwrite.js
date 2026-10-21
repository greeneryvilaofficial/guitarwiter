import { Client, Databases, ID } from 'https://cdn.jsdelivr.net/npm/appwrite@16.0.2/+esm';

const client = new Client()
    .setEndpoint('https://cloud.appwrite.io/v1')
    .setProject('6ad939930010447e87e4');

const databases = new Databases(client);
const DATABASE_ID = '6ad93aa60033d2fb31ae';
const COLLECTION_ID = '6ad93c150007e3eb6d58';

// Simpan nada yang ditekan di gitar
export async function saveNada(string, fret, nada) {
    return await databases.createDocument(
        DATABASE_ID, COLLECTION_ID, ID.unique(),
        { string: string, fret: fret, nada: nada, timestamp: new Date() }
    );
}

// Ambil riwayat nada
export async function getRiwayatNada() {
    const res = await databases.listDocuments(DATABASE_ID, COLLECTION_ID);
    return res.documents;
        }
