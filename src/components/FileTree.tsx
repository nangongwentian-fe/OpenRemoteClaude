import { useEffect } from "react";
import { FileTreeNode } from "./FileTreeNode";
import type { FileTreeEntry } from "@/types/messages";

interface Props {
  rootPath: string;
  tree: Map<string, FileTreeEntry[]>;
  expandedPaths: Set<string>;
  loadingPaths: Set<string>;
  onLoadDirectory: (path: string) => void;
  onToggleExpand: (path: string) => void;
  onFileSelect: (path: string) => void;
  onAddFileReference: (path: string, name: string) => void;
  onAddFolderReference: (path: string, name: string) => void;
  onDeleteFile: (path: string, parentPath: string) => void;
  onDeleteFolder: (path: string, parentPath: string) => void;
}

function DirectoryContents({
  parentPath,
  depth,
  tree,
  expandedPaths,
  loadingPaths,
  onLoadDirectory,
  onToggleExpand,
  onFileSelect,
  onAddFileReference,
  onAddFolderReference,
  onDeleteFile,
  onDeleteFolder,
}: {
  parentPath: string;
  depth: number;
} & Omit<Props, "rootPath">) {
  const entries = tree.get(parentPath);

  if (!entries) {
    return null;
  }

  return (
    <div>
      {entries.map((entry) => {
        const fullPath = `${parentPath}/${entry.name}`;
        const isExpanded = expandedPaths.has(fullPath);
        const isLoading = loadingPaths.has(fullPath);

        return (
          <FileTreeNode
            key={entry.name}
            entry={entry}
            path={fullPath}
            parentPath={parentPath}
            depth={depth}
            isExpanded={isExpanded}
            isLoading={isLoading}
            onToggleExpand={(path) => {
              onToggleExpand(path);
              // Load directory contents on first expand
              if (!expandedPaths.has(path) && !tree.has(path)) {
                onLoadDirectory(path);
              }
            }}
            onFileSelect={onFileSelect}
            onAddFileReference={onAddFileReference}
            onAddFolderReference={onAddFolderReference}
            onDeleteFile={onDeleteFile}
            onDeleteFolder={onDeleteFolder}
          >
            {entry.isDirectory && isExpanded && (
              <DirectoryContents
                parentPath={fullPath}
                depth={depth + 1}
                tree={tree}
                expandedPaths={expandedPaths}
                loadingPaths={loadingPaths}
                onLoadDirectory={onLoadDirectory}
                onToggleExpand={onToggleExpand}
                onFileSelect={onFileSelect}
                onAddFileReference={onAddFileReference}
                onAddFolderReference={onAddFolderReference}
                onDeleteFile={onDeleteFile}
                onDeleteFolder={onDeleteFolder}
              />
            )}
          </FileTreeNode>
        );
      })}
    </div>
  );
}

export function FileTree({
  rootPath,
  tree,
  expandedPaths,
  loadingPaths,
  onLoadDirectory,
  onToggleExpand,
  onFileSelect,
  onAddFileReference,
  onAddFolderReference,
  onDeleteFile,
  onDeleteFolder,
}: Props) {
  // Load root directory on mount
  useEffect(() => {
    if (rootPath && !tree.has(rootPath)) {
      onLoadDirectory(rootPath);
    }
  }, [rootPath, tree, onLoadDirectory]);

  if (!tree.has(rootPath)) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground/50 text-sm">
        Loading...
      </div>
    );
  }

  return (
    <div className="py-1">
      <DirectoryContents
        parentPath={rootPath}
        depth={0}
        tree={tree}
        expandedPaths={expandedPaths}
        loadingPaths={loadingPaths}
        onLoadDirectory={onLoadDirectory}
        onToggleExpand={onToggleExpand}
        onFileSelect={onFileSelect}
        onAddFileReference={onAddFileReference}
        onAddFolderReference={onAddFolderReference}
        onDeleteFile={onDeleteFile}
        onDeleteFolder={onDeleteFolder}
      />
    </div>
  );
}
