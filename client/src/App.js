import React, { useState, useRef, useEffect } from 'react';
import './App.css';
import * as monaco from 'monaco-editor';
import CytoscapeComponent from 'react-cytoscapejs';
import FileExplorer from './FileExplorer'; // Assuming this component exists

// Define Cytoscape stylesheet and layout as constants outside the component
const cytoscapeStylesheet = [
    { selector: 'node', style: { 'background-color': '#888', 'label': 'data(name)', 'color': '#ccc', 'text-valign': 'bottom', 'text-halign': 'center', 'text-margin-y': 5, 'font-size': '9px', 'text-wrap': 'wrap', 'text-max-width': '80px', 'shape': 'ellipse', 'width': '20px', 'height': '20px', 'transition-property': 'background-color, border-color, width, height', 'transition-duration': '0.2s' } },
    { selector: 'node[isParent]', style: { 'background-color': '#252526', 'border-color': '#444', 'border-width': 1, 'label': 'data(name)', 'color': '#aaa', 'font-size': '12px', 'font-weight': 'normal', 'shape': 'round-rectangle', 'padding': '25px', 'text-valign': 'center', 'text-halign': 'center', 'background-opacity': 0.7, 'transition-property': 'background-color, border-color', 'transition-duration': '0.2s' } },
    { selector: 'node[type="javascript"]', style: { 'background-color': '#f1e05a' } },
    { selector: 'node[type="html"]', style: { 'background-color': '#e34c26' } },
    { selector: 'node[type="css"]', style: { 'background-color': '#563d7c' } },
    { selector: 'node[type="markdown"]', style: { 'background-color': '#608b4e' } },
    { selector: 'node[type="json"]', style: { 'background-color': '#f1e05a' } },
    { selector: 'node[type="csharp"]', style: { 'background-color': '#178600' } },
    { selector: 'node[type="python"]', style: { 'background-color': '#3572A5' } },
    { selector: 'node[type="java"]', style: { 'background-color': '#b07219' } },
    { selector: 'node[type="xml"]', style: { 'background-color': '#555555' } },
    { selector: 'node[type="yaml"]', style: { 'background-color': '#cb171e' } },
    { selector: 'node[type="plaintext"]', style: { 'background-color': '#888888' } },
    { selector: 'edge[connectionType="contains"]', style: { 'width': 0.7, 'line-color': '#505050', 'curve-style': 'bezier', 'opacity': 0.3, 'target-arrow-shape': 'none' } },
    { selector: 'edge[connectionType="mentions"]', style: { 'width': 0.9, 'line-color': '#8a6d9e', 'line-style': 'dashed', 'curve-style': 'bezier', 'opacity': 0.6, 'target-arrow-shape': 'triangle', 'target-arrow-color': '#8a6d9e', 'arrow-scale': 0.6 } },
    { selector: 'edge[connectionType="starts"]', style: { 'width': 0.9, 'line-color': '#b5cea8', 'target-arrow-color': '#b5cea8', 'target-arrow-shape': 'triangle', 'arrow-scale': 0.6 } },
    { selector: 'edge[connectionType="uses"]', style: { 'width': 0.9, 'line-color': '#4e9a9a', 'target-arrow-color': '#4e9a9a', 'target-arrow-shape': 'triangle', 'arrow-scale': 0.6 } },
    { selector: ':selected', style: { 'width': '28px', 'height': '28px', 'background-color': '#007acc', 'border-color': '#ffffff', 'border-width': 2, 'line-color': '#0099ff', 'target-arrow-color': '#0099ff', 'opacity': 1, 'color': '#ffffff', 'font-weight': 'bold' } },
    { selector: 'node[isParent]:selected', style: { 'background-color': '#094771', 'border-color': '#007acc', 'border-width': 2, 'padding': '27px', 'color': '#ffffff' } },
    { selector: '.highlight', style: { 'width': '24px', 'height': '24px', 'background-color': '#007acc', 'border-color': '#cccccc', 'border-width': 1, 'line-color': '#008ae6', 'target-arrow-color': '#008ae6', 'opacity': 0.8, 'color': '#eeeeee', 'transition-property': 'background-color, border-color, line-color, opacity, width, height', 'transition-duration': '0.2s' } }
];

const cytoscapeLayout = {
    name: 'cose',
    animate: 'end',
    animationDuration: 500,
    animationEasing: 'ease-out',
    randomize: false,
    padding: 80,
    nodeRepulsion: (node) => 40000,
    idealEdgeLength: (edge) => 100,
    edgeElasticity: (edge) => 100,
    nestingFactor: 1.2,
    gravity: 80,
    numIter: 1000,
    initialTemp: 200,
    coolingFactor: 0.95,
    minTemp: 1.0,
    nodeOverlap: 20,
    fit: true,
    nodeDimensionsIncludeLabels: true
};


// Global vars (consider moving to state or refs if more complexity arises)
let editor = null; // Monaco Editor instance
const notes = {}; // Store notes in memory for now { fileId: noteContent }
let selectedFileId = null; // Currently selected file ID (full path)
let uploadedFilesContent = {}; // Store content of uploaded files { path: content }
let allFilePaths = []; // Store all available file paths for mention suggestions

let noteEditorElement = null;
let mentionSuggestionsElement = null;
let currentMentionQuery = '';
let activeSuggestionIndex = -1;

function App() {
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [sidebarWidth, setSidebarWidth] = useState(280); // Initial width in pixels
    const [isResizing, setIsResizing] = useState(false);
    const [activeTab, setActiveTab] = useState('graph');
    const [elements, setElements] = useState([]);
    const [fileTree, setFileTree] = useState({});
    const [cyInstance, setCyInstance] = useState(null); // State for Cytoscape core instance
    // const cyRef = useRef(null); // This was for Cytoscape, now using state
    const editorRef = useRef(null);

    useEffect(() => {
        noteEditorElement = document.getElementById('note-editor');
        mentionSuggestionsElement = document.getElementById('mention-suggestions');

        const handleNoteInput = (event) => {
            const text = event.target.value;
            const cursorPos = event.target.selectionStart;
            const textBeforeCursor = text.substring(0, cursorPos);
            const lastAtSymbolIndex = textBeforeCursor.lastIndexOf('@');
            if (lastAtSymbolIndex !== -1 && (lastAtSymbolIndex === 0 || textBeforeCursor[lastAtSymbolIndex - 1].match(/\s/))) {
                const potentialQuery = textBeforeCursor.substring(lastAtSymbolIndex + 1);
                if (!potentialQuery.includes('[')) {
                    showMentionSuggestions(potentialQuery);
                } else {
                    hideMentionSuggestions();
                }
            } else {
                hideMentionSuggestions();
            }
        };

        const handleNoteKeyDown = (event) => {
             if (mentionSuggestionsElement && !mentionSuggestionsElement.classList.contains('hidden')) {
                const handled = handleMentionKeyDown(event);
                if (handled) {
                    event.preventDefault();
                    event.stopPropagation();
                }
            }
        };

        const handleNoteBlur = (event) => {
            setTimeout(() => {
                 if (!mentionSuggestionsElement || !mentionSuggestionsElement.contains(document.activeElement)) {
                    hideMentionSuggestions();
                }
            }, 150);
        };

        if (noteEditorElement) {
            noteEditorElement.addEventListener('input', handleNoteInput);
            noteEditorElement.addEventListener('keydown', handleNoteKeyDown);
            noteEditorElement.addEventListener('blur', handleNoteBlur);
        }

        return () => {
            if (noteEditorElement) {
                noteEditorElement.removeEventListener('input', handleNoteInput);
                noteEditorElement.removeEventListener('keydown', handleNoteKeyDown);
                noteEditorElement.removeEventListener('blur', handleNoteBlur);
            }
            if (editor) {
                editor.dispose();
                editor = null;
            }
            // Cytoscape instance cleanup is handled by react-cytoscapejs component or its own useEffect
        };
    }, []);


    // Effect for Cytoscape event listeners
    useEffect(() => {
        if (!cyInstance) return;

        // Clear previous listeners
        cyInstance.removeAllListeners();

        cyInstance.on('tap', 'node', function (event) {
            const node = event.target;
            if (node.data('isParent')) return;

            if (selectedFileId && cyInstance) {
                const prevNode = cyInstance.getElementById(selectedFileId);
                if (prevNode.length > 0) prevNode.unselect();
                cyInstance.elements().removeClass('highlight');
            }

            node.select();
            selectedFileId = node.id();

            cyInstance.elements().removeClass('highlight');
            node.addClass('highlight');
            node.connectedEdges().addClass('highlight');
            node.connectedEdges().connectedNodes().addClass('highlight');
            node.addClass('highlight');

            const fileInfoDiv = document.getElementById('file-info');
            if (fileInfoDiv) {
                fileInfoDiv.innerHTML = `
                    <p><strong>File:</strong> ${node.data('name') || 'N/A'}</p>
                    <p><strong>Path:</strong> ${node.id()}</p>
                    <p><strong>Type:</strong> ${node.data('type') || 'N/A'}</p>
                    <p><strong>Connections:</strong> ${node.degree()}</p>
                `;
            }

            noteEditorElement = document.getElementById('note-editor');
            if (noteEditorElement) {
                noteEditorElement.value = notes[selectedFileId] || '';
                noteEditorElement.disabled = false;
            }
            document.getElementById('save-note-button').disabled = false;

            const filePath = node.id();
            const fileContent = uploadedFilesContent[filePath] || `// Content for ${filePath} not found or not loaded.`;
            showEditorView(filePath, fileContent);
        });

        cyInstance.on('tap', function (event) {
             if (event.target === cyInstance) {
                if (selectedFileId && cyInstance) {
                     const prevNode = cyInstance.getElementById(selectedFileId);
                     if (prevNode.length > 0) prevNode.unselect();
                     cyInstance.elements().removeClass('highlight');
                }
                selectedFileId = null;
                const fileInfoDiv = document.getElementById('file-info');
                if (fileInfoDiv) {
                    fileInfoDiv.innerHTML = '<p>Click on a file node to see details here.</p>';
                }
                noteEditorElement = document.getElementById('note-editor');
                 if (noteEditorElement) {
                    noteEditorElement.value = '';
                    noteEditorElement.disabled = true;
                }
                 if (document.getElementById('save-note-button')) {
                     document.getElementById('save-note-button').disabled = true;
                }
                 hideMentionSuggestions();
             }
         });

        cyInstance.ready(function () {
            if (cyInstance) {
                 cyInstance.fit();
                 // showGraphView(); // Initial view is graph by default
             }
        });

        cyInstance.on('dragfree', 'node', function (event) {
            if (!cyInstance) return;
            requestAnimationFrame(() => {
                 if (cyInstance) {
                     cyInstance.layout({ // Use a simpler layout for drag updates or the main one
                        name: 'cose', animate: true, animationDuration: 250, randomize: false, fit: false, padding: 80,
                        nodeRepulsion: () => 20000, idealEdgeLength: () => 80, edgeElasticity: () => 80,
                        nestingFactor: 1.2, gravity: 60, numIter: 500, initialTemp: 100, coolingFactor: 0.95,
                        minTemp: 1.0, nodeOverlap: 20, nodeDimensionsIncludeLabels: true
                    }).run();
                }
            });
        });
        
        // Cleanup cytoscape instance listeners on unmount or if cyInstance changes
        return () => {
            if(cyInstance) {
                cyInstance.removeAllListeners();
                // The component itself will handle cyInstance.destroy() if it's unmounted.
            }
        };

    }, [cyInstance]); // Rerun if cyInstance changes


    const showGraphView = () => {
        setActiveTab('graph');
        requestAnimationFrame(() => {
            if (cyInstance) {
                cyInstance.resize();
                cyInstance.fit();
            }
        });
        if (document.getElementById('bottom-panel')) document.getElementById('bottom-panel').style.display = 'flex';
        if (document.getElementById('monaco-container')) document.getElementById('monaco-container').style.display = 'none';
        const cyElement = document.getElementById('cy-container-wrapper'); // Target the wrapper
        if (cyElement) cyElement.style.display = 'block';
    };

    const showEditorView = (filePath, fileContent = '// File content not loaded') => {
        setActiveTab('editor');
        if (document.getElementById('bottom-panel')) document.getElementById('bottom-panel').style.display = 'flex';
        const cyElement = document.getElementById('cy-container-wrapper'); // Target the wrapper
        if (cyElement) cyElement.style.display = 'none';
        if (document.getElementById('monaco-container')) document.getElementById('monaco-container').style.display = 'block';

        const editorContainer = document.getElementById('monaco-editor');
        if (!editorContainer) {
            console.error("Monaco container element not found!");
            return;
        }

        if (!editor) {
             window.require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.48.0/min/vs' } });
             window.require(['vs/editor/editor.main'], function () {
                try {
                    editor = monaco.editor.create(editorContainer, {
                        value: fileContent, language: getLanguageFromFileName(filePath), theme: 'vs-dark',
                        automaticLayout: true, readOnly: false, minimap: { enabled: true }, wordWrap: 'on'
                    });
                } catch (error) {
                    console.error("Error creating Monaco editor:", error);
                    editorContainer.textContent = `Error loading editor: ${error.message}`;
                }
            });
        } else {
             const model = editor.getModel();
             if (model) {
                 monaco.editor.setModelLanguage(model, getLanguageFromFileName(filePath));
                 editor.setValue(fileContent);
                 editor.focus();
             } else {
                  console.error("Monaco editor model not found!");
             }
        }
    };

    function getLanguageFromFileName(fileName) {
        if (!fileName || typeof fileName !== 'string') return 'plaintext';
        const extension = fileName.split('.').pop();
        switch (extension?.toLowerCase()) {
            case 'cs': return 'csharp'; case 'java': return 'java'; case 'py': return 'python';
            case 'js': return 'javascript'; case 'jsx': return 'javascript'; case 'ts': return 'typescript';
            case 'tsx': return 'typescript'; case 'html': return 'html'; case 'css': return 'css';
            case 'scss': return 'scss'; case 'less': return 'less'; case 'md': return 'markdown';
            case 'json': return 'json'; case 'yaml': return 'yaml'; case 'yml': return 'yaml';
            case 'xml': return 'xml'; case 'sh': return 'shell'; case 'sql': return 'sql';
            default: return 'plaintext';
        }
    }

    const handleSaveNote = () => {
         noteEditorElement = document.getElementById('note-editor');
         if (selectedFileId && noteEditorElement) {
            const noteContent = noteEditorElement.value;
            notes[selectedFileId] = noteContent;
            console.log(`Note saved for ${selectedFileId}:`, noteContent);
            parseMentionsAndUpdateGraph(selectedFileId, noteContent);
            alert(`Note for ${selectedFileId} saved! Mentions processed.`);
         } else {
            alert('Please select a file node first.');
         }
    };

    const showMentionSuggestions = (query) => {
        mentionSuggestionsElement = document.getElementById('mention-suggestions');
        noteEditorElement = document.getElementById('note-editor');
        if (!mentionSuggestionsElement || !noteEditorElement) return;

        currentMentionQuery = query;
        const lowerCaseQuery = query.toLowerCase();
        const filteredFiles = allFilePaths.filter(filePath =>
            filePath !== selectedFileId &&
            filePath.toLowerCase().includes(lowerCaseQuery) &&
            cyInstance && cyInstance.getElementById(filePath).length > 0
        );

        mentionSuggestionsElement.innerHTML = '';
        if (filteredFiles.length === 0 || query.trim().length === 0) {
            hideMentionSuggestions();
            return;
        }

        filteredFiles.slice(0, 10).forEach((filePath) => {
            const item = document.createElement('div');
            item.classList.add('mention-suggestion-item');
            item.textContent = filePath;
            item.dataset.filePath = filePath;
            item.addEventListener('mousedown', (e) => {
                e.preventDefault();
                selectMentionSuggestion(filePath);
            });
            mentionSuggestionsElement.appendChild(item);
        });

        mentionSuggestionsElement.classList.remove('hidden');
        activeSuggestionIndex = -1;
        const noteEditorRect = noteEditorElement.getBoundingClientRect();
        mentionSuggestionsElement.style.top = `${noteEditorRect.bottom + window.scrollY}px`;
        mentionSuggestionsElement.style.left = `${noteEditorRect.left + window.scrollX}px`;
        mentionSuggestionsElement.style.width = `${noteEditorRect.width}px`;
        mentionSuggestionsElement.style.display = 'block';
    };

    const hideMentionSuggestions = () => {
        mentionSuggestionsElement = document.getElementById('mention-suggestions');
        if (mentionSuggestionsElement) {
            mentionSuggestionsElement.classList.add('hidden');
            mentionSuggestionsElement.style.display = 'none';
            mentionSuggestionsElement.innerHTML = '';
        }
        activeSuggestionIndex = -1;
    };

    const selectMentionSuggestion = (filePath) => {
         noteEditorElement = document.getElementById('note-editor');
         if (!noteEditorElement) return;
        const currentText = noteEditorElement.value;
        const cursorPos = noteEditorElement.selectionStart;
        const textBeforeCursor = currentText.substring(0, cursorPos);
        const mentionStartIndex = textBeforeCursor.lastIndexOf('@');
         if (mentionStartIndex !== -1 && textBeforeCursor.substring(mentionStartIndex + 1, cursorPos).replace(/\[.*?\]/g, '') === currentMentionQuery) {
             const textAfterCursor = currentText.substring(cursorPos);
             const mentionText = `@[${filePath}] `;
             const newText = textBeforeCursor.substring(0, mentionStartIndex) + mentionText + textAfterCursor;
            noteEditorElement.value = newText;
            noteEditorElement.focus();
            const newCursorPos = mentionStartIndex + mentionText.length;
            noteEditorElement.setSelectionRange(newCursorPos, newCursorPos);
        }
        hideMentionSuggestions();
    };

     const updateActiveSuggestion = () => {
         mentionSuggestionsElement = document.getElementById('mention-suggestions');
         if (!mentionSuggestionsElement) return;
        const items = mentionSuggestionsElement.querySelectorAll('.mention-suggestion-item');
        items.forEach((item, index) => {
            if (index === activeSuggestionIndex) {
                item.classList.add('active');
                 item.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
            } else {
                item.classList.remove('active');
            }
        });
    };

    const handleMentionKeyDown = (event) => {
        mentionSuggestionsElement = document.getElementById('mention-suggestions');
        if (!mentionSuggestionsElement || mentionSuggestionsElement.classList.contains('hidden')) return false;
        const items = mentionSuggestionsElement.querySelectorAll('.mention-suggestion-item');
        if (items.length === 0) return false;

        let handled = false;
        switch (event.key) {
            case 'ArrowDown': activeSuggestionIndex = (activeSuggestionIndex + 1) % items.length; updateActiveSuggestion(); handled = true; break;
            case 'ArrowUp': activeSuggestionIndex = (activeSuggestionIndex - 1 + items.length) % items.length; updateActiveSuggestion(); handled = true; break;
            case 'Enter': case 'Tab':
                 if (activeSuggestionIndex > -1 && items[activeSuggestionIndex]) {
                    selectMentionSuggestion(items[activeSuggestionIndex].dataset.filePath);
                } else { hideMentionSuggestions(); }
                handled = true; break;
            case 'Escape': hideMentionSuggestions(); handled = true; break;
            default: return false;
        }
        if (handled) { event.preventDefault(); event.stopPropagation(); }
        return handled;
    };

    const parseMentionsAndUpdateGraph = (sourceFileId, noteContent) => {
        if (!cyInstance || !sourceFileId) {
             console.warn("Cytoscape instance or sourceFileId not available for parsing mentions.");
            return;
        }
        const mentionRegex = /@\[([^\]]+?)\]/g;
        let match;
        const existingEdgesData = new Map();
        const currentMentionsInNote = new Set();
        let graphChanged = false;

         cyInstance.edges(`[source = "${sourceFileId}"][connectionType = "mentions"]`).forEach(edge => {
             const targetId = edge.data('target');
             if (targetId) existingEdgesData.set(targetId, edge.id());
        });

        while ((match = mentionRegex.exec(noteContent)) !== null) {
            const mentionedFilePath = match[1];
            currentMentionsInNote.add(mentionedFilePath);
             if (sourceFileId !== mentionedFilePath && cyInstance.getElementById(mentionedFilePath).length > 0) {
                if (!existingEdgesData.has(mentionedFilePath)) {
                    const newEdgeId = `mention-${sourceFileId}-to-${mentionedFilePath}-${Date.now()}`;
                     cyInstance.add({ group: 'edges', data: { id: newEdgeId, source: sourceFileId, target: mentionedFilePath, connectionType: 'mentions' } });
                    console.log(`Added mention edge: ${sourceFileId} -> ${mentionedFilePath}`);
                    graphChanged = true;
                }
            }
        }

        existingEdgesData.forEach((edgeId, targetFileId) => {
            if (!currentMentionsInNote.has(targetFileId)) {
                 const edgeToRemove = cyInstance.getElementById(edgeId);
                 if (edgeToRemove.length > 0) {
                     cyInstance.remove(edgeToRemove);
                     console.log(`Removed old mention edge: ${sourceFileId} -> ${targetFileId}`);
                     graphChanged = true;
                 }
            }
        });

        if (graphChanged) {
            console.log("Mention edges changed, re-running layout...");
            requestAnimationFrame(() => {
                 if (cyInstance) {
                    cyInstance.layout(cytoscapeLayout).run(); // Use the main layout
                 }
            });
        }
    };

    const generateFileExplorerHTML = (fileTreeData, level = 0) => { // Renamed fileTree to fileTreeData to avoid conflict
        let html = '<ul class="explorer-list">';
        const sortedKeys = Object.keys(fileTreeData).sort((a, b) => {
            const itemA = fileTreeData[a]; const itemB = fileTreeData[b];
            const isDirA = itemA.type === 'directory'; const isDirB = itemB.type === 'directory';
            if (isDirA !== isDirB) return isDirA ? -1 : 1;
            return a.localeCompare(b);
        });

        for (const name of sortedKeys) {
            const item = fileTreeData[name];
            const isDir = item.type === 'directory';
            let iconClass = 'file';
            if (isDir) {
                 iconClass = 'folder';
            } else {
                const extension = name.split('.').pop()?.toLowerCase() || '';
                 const langToIconMap = {
                    'csharp': 'cs', 'java': 'java', 'python': 'py', 'javascript': 'js', 'typescript': 'ts',
                    'html': 'html', 'css': 'css', 'scss': 'css', 'markdown': 'md', 'json': 'json',
                    'yaml': 'yaml', 'xml': 'xml', 'shell': 'shell', 'sql': 'db', 'png': 'image',
                    'jpg': 'image', 'jpeg': 'image', 'gif': 'image', 'svg': 'svg', 'pdf': 'pdf',
                    'zip': 'zip', 'txt': 'text',
                };
                 const lang = getLanguageFromFileName(name);
                 iconClass = langToIconMap[lang] || (extension ? `file-${extension}` : 'file');
                 if (iconClass === 'file' && extension) {
                      const commonExtMap = { 'txt': 'text', 'log': 'text', 'pdf': 'pdf', 'zip': 'zip', 'rar': 'zip' };
                      iconClass = commonExtMap[extension] || `file ext-${extension}`;
                 } else if (iconClass === `file-${extension}`) {
                     iconClass = lang;
                 }
            }
            const filePathAttr = isDir ? `data-dirpath="${item.path}"` : `data-filepath="${item.path}"`;
            const indentStyle = `--indent-level: ${level};`;
            html += `<li style="${indentStyle}" ${filePathAttr} class="explorer-item ${isDir ? 'explorer-dir' : 'explorer-file'}" title="${item.path}">
                        <span class="explorer-item-icon icon-${iconClass}"></span>
                        <span class="explorer-item-name">${name}</span>
                     </li>`;
            if (isDir && item.children && Object.keys(item.children).length > 0) {
                 html += `<ul class="nested-list level-${level + 1}">`;
                html += generateFileExplorerHTML(item.children, level + 1);
                 html += `</ul>`;
            }
        }
        html += '</ul>';
        return html;
    };

    function readFileContent(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => resolve({ path: file.webkitRelativePath || file.name, content: event.target.result });
            reader.onerror = (error) => reject(error);
             const isLikelyText = file.type.startsWith('text/') ||
                                 /\.(txt|md|js|jsx|ts|tsx|json|html|css|scss|less|py|java|cs|xml|yaml|yml|sh|sql|log)$/i.test(file.name);
             if (isLikelyText) {
                reader.readAsText(file);
             } else {
                  resolve({ path: file.webkitRelativePath || file.name, content: '// Binary or non-text file content not displayed' });
             }
        });
    }

     const processUploadedFiles = async (files) => {
         console.log(`Processing ${files.length} files...`);
         const newElements = [];
         const newFileTree = {};
         const createdDirs = new Set();
         uploadedFilesContent = {};
         allFilePaths = [];
         const contentPromises = [];

        function ensureDirectoryExists(pathParts, currentLevelTree) {
            let parentId = null;
             let currentPath = '';
             for (let i = 0; i < pathParts.length; i++) {
                 const part = pathParts[i];
                 currentPath = currentPath ? `${currentPath}/${part}` : part;
                 if (!currentLevelTree[part]) {
                     currentLevelTree[part] = { type: 'directory', children: {}, path: currentPath };
                    if (!createdDirs.has(currentPath)) {
                        newElements.push({ data: { id: currentPath, name: part, isParent: true, type: 'Directory' }, classes: 'directory-node' });
                        createdDirs.add(currentPath);
                         if (parentId !== null) {
                             newElements.push({ data: { id: `contains-${parentId}-to-${currentPath}`, source: parentId, target: currentPath, connectionType: 'contains' }, classes: 'contains-edge directory-edge' });
                        }
                    }
                 }
                  if (parentId !== null && !newElements.some(el => el.data.id === `contains-${parentId}-to-${currentPath}`)) {
                       const parentNodeExists = newElements.some(el => el.data.id === parentId && el.data.isParent);
                       const childNodeExists = newElements.some(el => el.data.id === currentPath && el.data.isParent);
                       if (parentNodeExists && childNodeExists) {
                             newElements.push({ data: { id: `contains-${parentId}-to-${currentPath}`, source: parentId, target: currentPath, connectionType: 'contains' }, classes: 'contains-edge directory-edge' });
                       }
                  }
                 parentId = currentPath;
                 currentLevelTree = currentLevelTree[part].children;
             }
            return { treeRef: currentLevelTree, finalDirPath: parentId };
        }

         for (const file of files) {
             const path = file.webkitRelativePath || file.name;
             if (!path) continue;
            allFilePaths.push(path);
             contentPromises.push(readFileContent(file));
             const parts = path.split('/');
             const fileName = parts.pop();
             const dirParts = parts;
             const { treeRef: fileParentTree, finalDirPath } = ensureDirectoryExists(dirParts, newFileTree);
             fileParentTree[fileName] = { type: 'file', path: path };
             const fileType = getLanguageFromFileName(fileName);
             newElements.push({ data: { id: path, name: fileName, parent: finalDirPath, type: fileType, isParent: false }, classes: `file-node type-${fileType}` });
             if (finalDirPath) {
                 newElements.push({ data: { id: `contains-${finalDirPath}-to-${path}`, source: finalDirPath, target: path, connectionType: 'contains' }, classes: 'contains-edge file-edge' });
             }
         }

         try {
             const results = await Promise.all(contentPromises);
             results.forEach(result => { if (result) uploadedFilesContent[result.path] = result.content; });
             console.log("File contents loaded:", Object.keys(uploadedFilesContent).length);
         } catch (error) { console.error("Error reading file contents:", error); }

         console.log("Generated elements:", newElements.length);
         if (cyInstance) { // If an old instance exists, react-cytoscapejs should handle its destruction/update
             // cyInstance.destroy(); // Let the component manage its lifecycle
             // setCyInstance(null); // Or let the component re-render with new elements
             console.log("Existing Cytoscape instance will be updated by component.");
         }
         selectedFileId = null;
         const fileInfoDiv = document.getElementById('file-info');
         if (fileInfoDiv) fileInfoDiv.innerHTML = '<p>Select a file node.</p>';
         noteEditorElement = document.getElementById('note-editor');
         if (noteEditorElement) { noteEditorElement.value = ''; noteEditorElement.disabled = true; }
         if (document.getElementById('save-note-button')) document.getElementById('save-note-button').disabled = true;

         setElements(newElements); // This will trigger re-render of CytoscapeComponent
         setFileTree(newFileTree); // This will trigger re-render of FileExplorer
         console.log("File processing complete. Cytoscape component will re-render.");
     };

    const handleFolderUpload = (event) => {
        const files = event.target.files;
        if (files.length > 0) processUploadedFiles(Array.from(files));
    };

    useEffect(() => {
        const explorerContainer = document.getElementById('file-explorer-list');
         if (explorerContainer) {
             explorerContainer.innerHTML = generateFileExplorerHTML(fileTree); // Use 'fileTree' state here
             const items = explorerContainer.querySelectorAll('.explorer-item');
             items.forEach(item => item.addEventListener('click', handleExplorerItemClick));
             return () => items.forEach(item => item.removeEventListener('click', handleExplorerItemClick));
         }
     }, [fileTree]); // Dependency on 'fileTree' state

     const handleExplorerItemClick = (event) => {
         const targetItem = event.currentTarget;
         const filePath = targetItem.dataset.filepath;
         const dirPath = targetItem.dataset.dirpath;

         if (filePath && cyInstance) {
             const node = cyInstance.getElementById(filePath);
             if (node.length > 0) {
                  node.trigger('tap');
                 cyInstance.animate({ center: { eles: node }, zoom: cyInstance.zoom() < 1 ? 1 : cyInstance.zoom() }, { duration: 400 });
             }
         } else if (dirPath && cyInstance) {
             const node = cyInstance.getElementById(dirPath);
             if (node.length > 0) {
                  cyInstance.animate({ center: { eles: node }, zoom: cyInstance.zoom() }, { duration: 400 });
             }
               targetItem.classList.toggle('expanded');
               const nestedList = targetItem.nextElementSibling;
               if (nestedList && nestedList.tagName === 'UL') {
                   nestedList.style.display = nestedList.style.display === 'none' ? 'block' : 'none';
               }
         }
     };

    const sidebarRef = useRef(null);

    const startResizing = React.useCallback((mouseDownEvent) => {
        setIsResizing(true);
        // Prevent text selection during resize
        mouseDownEvent.preventDefault();
    }, []);

    const stopResizing = React.useCallback(() => {
        setIsResizing(false);
    }, []);

    const resize = React.useCallback(
        (mouseMoveEvent) => {
            if (isResizing && sidebarRef.current) {
                // Calculate new width based on mouse position relative to the sidebar's parent
                // This assumes the sidebar's parent is the main App container or a similar full-width element
                const parentRect = sidebarRef.current.parentElement.getBoundingClientRect();
                let newWidth = mouseMoveEvent.clientX - parentRect.left;

                // Apply constraints
                if (newWidth < 150) newWidth = 150; // Min width
                if (newWidth > parentRect.width * 0.5) newWidth = parentRect.width * 0.5; // Max width (e.g., 50% of parent)
                
                setSidebarWidth(newWidth);
            }
        },
        [isResizing]
    );

    useEffect(() => {
        window.addEventListener('mousemove', resize);
        window.addEventListener('mouseup', stopResizing);
        return () => {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
        };
    }, [resize, stopResizing]);

    return (
        <div className="App flex h-screen bg-gray-900 text-white overflow-hidden"> {/* Ensure flex and no scroll on App */}
            <div 
                ref={sidebarRef}
                className={`sidebar ${isSidebarCollapsed ? 'w-0' : ''} bg-gray-800 flex flex-col relative transition-width duration-300 ease-in-out`}
                style={{ width: isSidebarCollapsed ? 0 : `${sidebarWidth}px`, minWidth: isSidebarCollapsed ? 0 : '150px' }}
            >
                <button 
                    className="collapse-button absolute top-2 -right-3 z-10 bg-gray-700 hover:bg-gray-600 text-white p-1 rounded-full text-xs" 
                    onClick={() => {
                        setIsSidebarCollapsed(!isSidebarCollapsed);
                        if (!isSidebarCollapsed) { // If collapsing, reset width to a sensible default or remember last expanded
                           // setSidebarWidth(280); // Or store last width before collapse
                        }
                    }} 
                    title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
                >
                    {isSidebarCollapsed ? '>' : '<'}
                </button>
                <div className={`sidebar-content p-3 overflow-y-auto flex-grow ${isSidebarCollapsed ? 'hidden' : ''}`}>
                    <h3 className="pl-2 text-sm font-semibold text-gray-300 mb-2">Project Explorer</h3>
                     <input type="file" id="folderUpload" webkitdirectory="" directory="" multiple onChange={handleFolderUpload} style={{ display: 'none' }} />
                     <button onClick={() => document.getElementById('folderUpload').click()} className="upload-button bg-blue-500 hover:bg-blue-600 text-white py-1 px-3 rounded text-sm mb-3 w-full">Upload Folder</button>
                     {/* Conditional message outside the div managed by innerHTML */}
                     {Object.keys(fileTree).length === 0 && <p className="text-gray-400 text-xs">Upload a folder to begin.</p>}
                    <div id="file-explorer-list" className="text-xs">
                        {/* This div's content will be set by innerHTML by the useEffect */}
                    </div>
                </div>
            </div>
            {/* Resizer Handle */}
            {!isSidebarCollapsed && (
                <div 
                    className="resizer w-1.5 bg-gray-600 hover:bg-blue-500 cursor-col-resize"
                    onMouseDown={startResizing}
                ></div>
            )}
            <div 
                className="main-content flex-grow flex flex-col overflow-hidden" 
                style={{ marginLeft: isSidebarCollapsed ? '0px' : '0px' /* Let flexbox handle spacing */}}
            >
                 <div className="view-tabs bg-gray-800 p-1 flex-shrink-0">
                     <button onClick={showGraphView} className={`${activeTab === 'graph' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'} text-white py-1 px-3 rounded-sm text-xs mr-1`}>Graph View</button>
                     <button onClick={() => {
                          if (selectedFileId) {
                              const content = uploadedFilesContent[selectedFileId] || '// Select a file';
                              showEditorView(selectedFileId, content);
                          } else { showEditorView('','// No file selected'); }
                     }} className={activeTab === 'editor' ? 'active' : ''} disabled={!selectedFileId && activeTab !== 'editor'}>
                        Editor View
                     </button>
                 </div>

                 <div id="cy-container-wrapper" style={{ display: activeTab === 'graph' ? 'block' : 'none', width: '100%', height: 'calc(100% - 40px - 200px)' /* Adjust based on tab and bottom panel height */ }}>
                    {elements.length > 0 ? (
                        <CytoscapeComponent
                            elements={CytoscapeComponent.normalizeElements(elements)}
                            style={{ width: '100%', height: '100%' }}
                            stylesheet={cytoscapeStylesheet}
                            layout={cytoscapeLayout}
                            cy={core => setCyInstance(core)}
                            minZoom={0.2}
                            maxZoom={3}
                        />
                    ) : (
                        <div style={{padding: '20px', textAlign: 'center'}}>Upload a folder to see the graph.</div>
                    )}
                 </div>

                 <div id="monaco-container" style={{ display: activeTab === 'editor' ? 'block' : 'none', height: 'calc(100% - 40px - 200px)' /* Full height minus tabs and bottom panel */ }}>
                    <div id="monaco-editor" style={{width: '100%', height: '100%'}}></div>
                 </div>

                 <div id="bottom-panel" style={{ display: 'flex', height: '200px' /* Fixed height for bottom panel */ }}>
                     <div id="file-info-panel">
                        <h4>File Information</h4>
                        <div id="file-info"><p>Click on a file node to see details here.</p></div>
                    </div>
                    <div id="notes-panel">
                        <h4>Notes</h4>
                        <textarea id="note-editor" placeholder="Add notes... Use @ to mention." disabled></textarea>
                         <div id="mention-suggestions" className="mention-suggestions-list hidden"></div>
                         <button id="save-note-button" onClick={handleSaveNote} disabled>Save Note</button>
                    </div>
                 </div>
            </div>
        </div>
    );
}

export default App;
