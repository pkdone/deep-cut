import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import type { Playlist, PlaylistTreeNode } from '../../../domain/schemas/playlist.js';
import { uniqueNewPlaylistName } from '../../../shared/playlist-naming.js';

function flattenPlaylistIds(nodes: readonly PlaylistTreeNode[]): string[] {
  const ids: string[] = [];
  const visit = (node: PlaylistTreeNode): void => {
    if (node.type === 'playlist' && node.playlistId !== undefined) {
      ids.push(node.playlistId);
    }
    for (const child of node.children) {
      visit(child);
    }
  };
  for (const node of nodes) {
    visit(node);
  }
  return ids;
}

function sortTree(nodes: readonly PlaylistTreeNode[]): PlaylistTreeNode[] {
  return [...nodes]
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
    .map((node) => ({
      ...node,
      children: sortTree(node.children),
    }));
}

export function PlaylistsPage(): React.ReactElement {
  const [nodes, setNodes] = useState<PlaylistTreeNode[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const navigate = useNavigate();

  const playlistNameSet = useMemo(() => playlists.map((playlist) => playlist.name), [playlists]);

  const reload = (): void => {
    void Promise.all([
      window.deepcut.getPlaylistTree(),
      window.deepcut.getPlaylists(),
    ]).then(([tree, playlistList]) => {
      setNodes(sortTree(tree));
      setPlaylists(playlistList);
    });
  };

  useEffect(() => {
    reload();
  }, []);

  const ensurePlaylistNode = async (playlistId: string, playlistName: string): Promise<void> => {
    const existingIds = new Set(flattenPlaylistIds(nodes));
    if (existingIds.has(playlistId)) {
      return;
    }
    const appended: PlaylistTreeNode[] = [
      ...nodes,
      {
        nodeId: uuidv4(),
        name: playlistName,
        type: 'playlist',
        playlistId,
        children: [],
        order: nodes.length,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    setNodes(appended);
    await window.deepcut.savePlaylistTree({ nodes: appended });
  };

  const createPlaylistAtRoot = async (): Promise<void> => {
    const playlistId = uuidv4();
    const playlistName = uniqueNewPlaylistName(playlistNameSet);
    await window.deepcut.savePlaylist({
      playlistId,
      name: playlistName,
      entries: [],
    });
    await ensurePlaylistNode(playlistId, playlistName);
    reload();
    await navigate(`/playlist/${playlistId}`);
  };

  const createFolderAtRoot = async (): Promise<void> => {
    const folderName = window.prompt('Folder name', 'New folder');
    if (folderName === null || folderName.trim() === '') {
      return;
    }
    const appended: PlaylistTreeNode[] = [
      ...nodes,
      {
        nodeId: uuidv4(),
        name: folderName.trim(),
        type: 'folder',
        children: [],
        order: nodes.length,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    setNodes(appended);
    await window.deepcut.savePlaylistTree({ nodes: appended });
    reload();
  };

  const persistTree = async (next: PlaylistTreeNode[]): Promise<void> => {
    setNodes(next);
    await window.deepcut.savePlaylistTree({ nodes: next });
    reload();
  };

  const renameNode = async (nodeId: string): Promise<void> => {
    const renameRec = (tree: PlaylistTreeNode[]): PlaylistTreeNode[] =>
      tree.map((node) => {
        if (node.nodeId === nodeId) {
          const nextName = window.prompt('Rename', node.name);
          if (nextName === null || nextName.trim() === '') {
            return node;
          }
          return { ...node, name: nextName.trim(), updatedAt: new Date() };
        }
        return { ...node, children: renameRec(node.children) };
      });
    await persistTree(renameRec(nodes));
  };

  const deleteNode = async (nodeId: string): Promise<void> => {
    const prune = (tree: PlaylistTreeNode[]): PlaylistTreeNode[] =>
      tree
        .filter((node) => node.nodeId !== nodeId)
        .map((node) => ({ ...node, children: prune(node.children) }));
    await persistTree(prune(nodes));
  };

  const reorderNodeDown = async (nodeId: string): Promise<void> => {
    const reorderRec = (tree: PlaylistTreeNode[]): PlaylistTreeNode[] => {
      const index = tree.findIndex((node) => node.nodeId === nodeId);
      if (index >= 0 && index + 1 < tree.length) {
        const clone = [...tree];
        const current = clone[index];
        clone[index] = clone[index + 1];
        clone[index + 1] = current;
        return clone.map((node, order) => ({ ...node, order }));
      }
      return tree.map((node) => ({ ...node, children: reorderRec(node.children) }));
    };
    await persistTree(reorderRec(nodes));
  };

  const createChild = async (parentNodeId: string, type: 'folder' | 'playlist'): Promise<void> => {
    const insertRec = async (tree: PlaylistTreeNode[]): Promise<PlaylistTreeNode[]> => {
      const out: PlaylistTreeNode[] = [];
      for (const node of tree) {
        if (node.nodeId !== parentNodeId) {
          out.push({ ...node, children: await insertRec(node.children) });
          continue;
        }
        if (type === 'folder') {
          const name = window.prompt('New sub-folder name', 'New folder');
          if (name !== null && name.trim() !== '') {
            out.push({
              ...node,
              children: [
                ...node.children,
                {
                  nodeId: uuidv4(),
                  name: name.trim(),
                  type: 'folder',
                  children: [],
                  order: node.children.length,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                },
              ],
            });
            continue;
          }
          out.push(node);
          continue;
        }
        const playlistId = uuidv4();
        const playlistName = uniqueNewPlaylistName(playlistNameSet);
        await window.deepcut.savePlaylist({
          playlistId,
          name: playlistName,
          entries: [],
        });
        out.push({
          ...node,
          children: [
            ...node.children,
            {
              nodeId: uuidv4(),
              name: playlistName,
              type: 'playlist',
              playlistId,
              children: [],
              order: node.children.length,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
        });
      }
      return out;
    };
    const next = await insertRec(nodes);
    await persistTree(next);
  };

  const renderNode = (node: PlaylistTreeNode): React.ReactElement => (
    <li key={node.nodeId} className="panel">
      <div className="list-row">
        <div>
          <strong>{node.type === 'folder' ? 'Folder' : 'Playlist'}</strong>
          {' '}
          {node.type === 'playlist' && node.playlistId !== undefined ? (
            <Link to={`/playlist/${node.playlistId}`}>{node.name}</Link>
          ) : (
            <span>{node.name}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
          {node.type === 'folder' ? (
            <>
              <button type="button" className="ghost" onClick={() => { void createChild(node.nodeId, 'folder'); }}>
                + Folder
              </button>
              <button type="button" className="ghost" onClick={() => { void createChild(node.nodeId, 'playlist'); }}>
                + Playlist
              </button>
            </>
          ) : null}
          <button type="button" className="ghost" onClick={() => { void renameNode(node.nodeId); }}>
            Rename
          </button>
          <button type="button" className="ghost" onClick={() => { void reorderNodeDown(node.nodeId); }}>
            Move down
          </button>
          <button type="button" className="ghost" onClick={() => { void deleteNode(node.nodeId); }}>
            Delete
          </button>
        </div>
      </div>
      {node.children.length > 0 ? <ul>{node.children.map((child) => renderNode(child))}</ul> : null}
    </li>
  );

  return (
    <div>
      <div className="panel">
        <h1>Playlists</h1>
        <p className="subtitle">Hierarchical folders and playlists with inline actions.</p>
        <div className="settings-actions">
          <button type="button" className="primary" onClick={() => { void createFolderAtRoot(); }}>
            New folder
          </button>
          <button type="button" className="primary" onClick={() => { void createPlaylistAtRoot(); }}>
            New playlist
          </button>
        </div>
      </div>
      <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
        {nodes.length > 0 ? nodes.map((node) => renderNode(node)) : <p className="subtitle">No folders/playlists yet.</p>}
      </ul>
    </div>
  );
}
