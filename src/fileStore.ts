import type { BackupFile } from "./types";

const DB_NAME = "focus-vault-files";
const STORE_NAME = "files";
const DB_VERSION = 1;

export type StoredFileRecord = {
  id: string;
  name: string;
  size: number;
  mime: string;
  createdAt: string;
  blob: Blob;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available in this browser."));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open file database."));
  });
}

function putRecord(record: StoredFileRecord): Promise<void> {
  return new Promise((resolve, reject) => {
    openDb()
      .then((db) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        transaction.objectStore(STORE_NAME).put(record);
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
        transaction.onerror = () => {
          db.close();
          reject(transaction.error ?? new Error("Unable to save file."));
        };
      })
      .catch(reject);
  });
}

export async function putStoredFile(id: string, file: File): Promise<StoredFileRecord> {
  const record: StoredFileRecord = {
    id,
    name: file.name,
    size: file.size,
    mime: file.type || "application/octet-stream",
    createdAt: new Date().toISOString(),
    blob: file,
  };
  await putRecord(record);
  return record;
}

export function getStoredFile(id: string): Promise<StoredFileRecord | undefined> {
  return new Promise((resolve, reject) => {
    openDb()
      .then((db) => {
        const transaction = db.transaction(STORE_NAME, "readonly");
        const request = transaction.objectStore(STORE_NAME).get(id);

        request.onsuccess = () => resolve(request.result as StoredFileRecord | undefined);
        transaction.oncomplete = () => db.close();
        transaction.onerror = () => {
          db.close();
          reject(transaction.error ?? new Error("Unable to read file."));
        };
      })
      .catch(reject);
  });
}

export function deleteStoredFile(id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    openDb()
      .then((db) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        transaction.objectStore(STORE_NAME).delete(id);
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
        transaction.onerror = () => {
          db.close();
          reject(transaction.error ?? new Error("Unable to delete file."));
        };
      })
      .catch(reject);
  });
}

export function clearStoredFiles(): Promise<void> {
  return new Promise((resolve, reject) => {
    openDb()
      .then((db) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        transaction.objectStore(STORE_NAME).clear();
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
        transaction.onerror = () => {
          db.close();
          reject(transaction.error ?? new Error("Unable to clear stored files."));
        };
      })
      .catch(reject);
  });
}

export async function exportStoredFiles(ids: string[]): Promise<BackupFile[]> {
  const uniqueIds = Array.from(new Set(ids));
  const records = await Promise.all(uniqueIds.map((id) => getStoredFile(id)));
  const files = await Promise.all(
    records.filter(isStoredFileRecord).map(async (record) => ({
      id: record.id,
      name: record.name,
      size: record.size,
      mime: record.mime,
      createdAt: record.createdAt,
      dataUrl: await blobToDataUrl(record.blob),
    })),
  );
  return files;
}

function isStoredFileRecord(record: StoredFileRecord | undefined): record is StoredFileRecord {
  return Boolean(record);
}

export async function importStoredFiles(files: BackupFile[] = []) {
  await Promise.all(
    files.map(async (file) => {
      const blob = dataUrlToBlob(file.dataUrl, file.mime);
      await putRecord({
        id: file.id,
        name: file.name,
        size: file.size,
        mime: file.mime,
        createdAt: file.createdAt,
        blob,
      });
    }),
  );
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read file for export."));
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl: string, fallbackMime: string) {
  const [header, encoded] = dataUrl.split(",");
  const mime = header.match(/data:(.*?);base64/)?.[1] || fallbackMime || "application/octet-stream";
  const binary = atob(encoded ?? "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mime });
}
