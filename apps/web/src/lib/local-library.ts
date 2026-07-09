import { db } from './library.js';
import { isAudioFile, localTrackId, parseTrackFilename } from './local-files.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Dossier musique surveillé (handle persistable dans IndexedDB, Chromium). */
export interface LocalFolder {
  id: string;
  name: string;
  /** Handle File System Access (absent pour un import ponctuel Firefox). */
  handle?: FileSystemDirectoryHandle;
  trackCount: number;
  scannedAt: number;
}

/** Morceau local : soit un handle de fichier (dossier), soit le File lui-même (import). */
export interface LocalTrack {
  id: string;
  folderId: string;
  relPath: string;
  artist: string;
  title: string;
  ext: string;
  size: number;
  handle?: FileSystemFileHandle;
  file?: File;
}

/** Permission de lecture d'un dossier (silencieux, puis prompt si nécessaire). */
export async function ensureFolderPermission(folder: LocalFolder, ask = false): Promise<boolean> {
  const handle = folder.handle as any;
  if (!handle?.queryPermission) return !folder.handle; // import ponctuel : Files déjà en base
  if ((await handle.queryPermission({ mode: 'read' })) === 'granted') return true;
  if (!ask) return false;
  return (await handle.requestPermission({ mode: 'read' })) === 'granted';
}

/** Scan récursif d'un dossier : chaque fichier audio devient un LocalTrack. */
async function collect(
  dir: FileSystemDirectoryHandle,
  folderId: string,
  prefix: string,
  out: LocalTrack[],
): Promise<void> {
  for await (const entry of (dir as any).values()) {
    if (entry.kind === 'directory') {
      await collect(entry, folderId, `${prefix}${entry.name}/`, out);
    } else if (isAudioFile(entry.name)) {
      const relPath = `${prefix}${entry.name}`;
      const file: File = await entry.getFile();
      const { artist, title } = parseTrackFilename(entry.name);
      out.push({
        id: localTrackId(folderId, relPath),
        folderId,
        relPath,
        artist,
        title,
        ext: entry.name.split('.').pop()!.toLowerCase(),
        size: file.size,
        handle: entry,
      });
    }
  }
}

/** Ajoute un dossier (File System Access) et le scanne. */
export async function addFolder(handle: FileSystemDirectoryHandle): Promise<LocalFolder> {
  const folder: LocalFolder = {
    id: crypto.randomUUID(),
    name: handle.name,
    handle,
    trackCount: 0,
    scannedAt: 0,
  };
  await db.localFolders.put(folder);
  await rescanFolder(folder);
  return (await db.localFolders.get(folder.id))!;
}

/** (Re)scanne un dossier : remplace ses morceaux (les métadonnées DJ, clés par id stable, survivent). */
export async function rescanFolder(folder: LocalFolder): Promise<number> {
  if (!folder.handle) return folder.trackCount;
  if (!(await ensureFolderPermission(folder, true))) return folder.trackCount;
  const tracks: LocalTrack[] = [];
  await collect(folder.handle, folder.id, '', tracks);
  await db.localTracks.where('folderId').equals(folder.id).delete();
  await db.localTracks.bulkPut(tracks);
  await db.localFolders.update(folder.id, { trackCount: tracks.length, scannedAt: Date.now() });
  return tracks.length;
}

/** Import ponctuel (Firefox : input webkitdirectory) — les File sont stockés en base. */
export async function importFiles(files: FileList | File[]): Promise<LocalFolder> {
  const list = [...files].filter((f) => isAudioFile(f.name));
  const name = (list[0] as any)?.webkitRelativePath?.split('/')[0] ?? 'Import';
  const folder: LocalFolder = {
    id: crypto.randomUUID(),
    name,
    trackCount: list.length,
    scannedAt: Date.now(),
  };
  await db.localFolders.put(folder);
  await db.localTracks.bulkPut(
    list.map((file) => {
      const relPath = (file as any).webkitRelativePath || file.name;
      const { artist, title } = parseTrackFilename(file.name);
      return {
        id: localTrackId(folder.id, relPath),
        folderId: folder.id,
        relPath,
        artist,
        title,
        ext: file.name.split('.').pop()!.toLowerCase(),
        size: file.size,
        file,
      } satisfies LocalTrack;
    }),
  );
  return folder;
}

export async function listFolders(): Promise<LocalFolder[]> {
  return db.localFolders.orderBy('name').toArray();
}

export async function listLocalTracks(): Promise<LocalTrack[]> {
  return db.localTracks.orderBy('relPath').toArray();
}

export async function removeFolder(folderId: string): Promise<void> {
  await db.localTracks.where('folderId').equals(folderId).delete();
  await db.localFolders.delete(folderId);
}

/** Le File d'un morceau local (permission redemandée au besoin). */
export async function getLocalFile(trackId: string): Promise<File | null> {
  const record = await db.localTracks.get(trackId);
  if (!record) return null;
  if (record.file) return record.file;
  if (record.handle) {
    const folder = await db.localFolders.get(record.folderId);
    if (folder && !(await ensureFolderPermission(folder, true))) return null;
    return record.handle.getFile();
  }
  return null;
}
