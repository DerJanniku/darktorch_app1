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
          <li key={item.path} style={indentStyle} {...filePathAttr} className="explorer-item flex items-center py-0.5 pr-2 hover:bg-gray-700 cursor-pointer">
            <span className={`explorer-item-icon ${iconClass} mr-1.5 w-5 h-5 flex items-center justify-center`}></span>
            <span className="explorer-item-name text-gray-200 text-sm">{name}</span>
            {isDir && Object.keys(item.children).length > 0 && (
              <ul className="list-none m-0 p-0">
                {generateFileExplorerItems(item.children, level + 1)}
              </ul>
            )}
          </li>
        );
      });
  };

  return (
    <ul className="list-none m-0 p-0">
      {generateFileExplorerItems(fileTree, level)}
    </ul>
  );
};

export default FileExplorer;
