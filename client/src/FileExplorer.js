import React from 'react';

const FileExplorer = ({ fileTree, level = 0 }) => {
  const generateFileExplorerItems = (fileTree, level) => {
    return Object.keys(fileTree)
      .sort((a, b) => {
        const itemA = fileTree[a];
        const itemB = fileTree[b];
        const isDirA = itemA.type === 'directory';
        const isDirB = itemB.type === 'directory';

        if (isDirA && !isDirB) return -1; // Directories first
        if (!isDirA && isDirB) return 1;  // Files after directories
        return a.localeCompare(b); // Alphabetical sort within type
      })
      .map((name) => {
        const item = fileTree[name];
        const isDir = item.type === 'directory';
        let iconClass = 'file';
        if (isDir) {
          iconClass = 'dir-closed';
        } else {
          const extension = name.split('.').pop().toLowerCase();
          const iconMap = {
            cs: 'cs', js: 'js', html: 'html', css: 'css', md: 'md',
            py: 'py', java: 'java', json: 'json', yaml: 'yaml', xml: 'xml',
            png: 'img', jpg: 'img', jpeg: 'img', gif: 'img', svg: 'img'
          };
          iconClass = iconMap[extension] || 'file';
        }

        const filePathAttr = isDir ? { 'data-dirpath': item.path } : { 'data-filepath': item.path };
        const indentStyle = { '--indent-level': level };

        return (
          <li key={item.path} style={indentStyle} {...filePathAttr} className="explorer-item">
            <span className={`explorer-item-icon ${iconClass}`}></span>
            <span className="explorer-item-name">{name}</span>
            {isDir && Object.keys(item.children).length > 0 && (
              <ul>
                {generateFileExplorerItems(item.children, level + 1)}
              </ul>
            )}
          </li>
        );
      });
  };

  return (
    <ul>
      {generateFileExplorerItems(fileTree, level)}
    </ul>
  );
};

export default FileExplorer;
