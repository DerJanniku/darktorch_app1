import React, { useState, useRef, useEffect } from 'react';
import './App.css';
import * as monaco from 'monaco-editor';
import CytoscapeComponent from 'react-cytoscapejs';
// import * as monaco from 'monaco-editor'; // Using require below
// import 'monaco-editor/min/vs/editor/editor.main.css'; // Usually handled by loader or CSS import
import FileExplorer from './FileExplorer'; // Assuming this component exists

let cy = null; // Cytoscape instance
let editor = null; // Monaco Editor instance
const notes = {}; // Store notes in memory for now { fileId: noteContent }
let selectedFileId = null; // Currently selected file ID (full path)
let uploadedFilesContent = {}; // Store content of uploaded files { path: content }
let allFilePaths = []; // Store all available file paths for mention suggestions

// Mention feature related DOM elements
let noteEditorElement = null;
let mentionSuggestionsElement = null;
let currentMentionQuery = '';
let activeSuggestionIndex = -1;

function App() {
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [activeTab, setActiveTab] = useState('graph');
    const [elements, setElements] = useState([]);
    const [fileTree, setFileTree] = useState({});
    const cyRef = useRef(null);
    const editorRef = useRef(null); // Ref for the Monaco container div

    // Get DOM elements after mount
    useEffect(() => {
        noteEditorElement = document.getElementById('note-editor');
        mentionSuggestionsElement = document.getElementById('mention-suggestions');

        // Add input listener to the note editor for mentions
        const handleNoteInput = (event) => {
            const text = event.target.value;
            const cursorPos = event.target.selectionStart;
            const textBeforeCursor = text.substring(0, cursorPos);
            const lastAtSymbolIndex = textBeforeCursor.lastIndexOf('@');

            // Check if we are potentially typing a mention right after '@'
            if (lastAtSymbolIndex !== -1 && (lastAtSymbolIndex === 0 || textBeforeCursor[lastAtSymbolIndex - 1].match(/\s/))) {
                const potentialQuery = textBeforeCursor.substring(lastAtSymbolIndex + 1);
                // Avoid triggering on already completed mentions like @[filepath]
                if (!potentialQuery.includes('[')) {
                     // Limit triggering to avoid performance issues on very long potential queries?
                    // if (potentialQuery.length < 50) {
                        showMentionSuggestions(potentialQuery);
                    // } else {
                    //     hideMentionSuggestions();
                    // }
                } else {
                    hideMentionSuggestions(); // Hide if it looks like a completed mention
                }
            } else {
                hideMentionSuggestions();
            }
        };

        // Add keydown listener for mention navigation/selection
        const handleNoteKeyDown = (event) => {
             if (mentionSuggestionsElement && !mentionSuggestionsElement.classList.contains('hidden')) {
                const handled = handleMentionKeyDown(event);
                // If handled (e.g., navigation, selection), prevent default textarea behavior like moving cursor
                if (handled) {
                    event.preventDefault();
                    event.stopPropagation(); // Stop event bubbling
                }
            }
        };

        // Add blur listener to hide suggestions
        const handleNoteBlur = (event) => {
            // Delay hiding slightly to allow suggestion click events to register
            setTimeout(() => {
                // Check if the focus is now on a suggestion item; if so, don't hide
                 if (!mentionSuggestionsElement || !mentionSuggestionsElement.contains(document.activeElement)) {
                    hideMentionSuggestions();
                }
            }, 150); // 150ms delay seems reasonable
        };


        if (noteEditorElement) {
            noteEditorElement.addEventListener('input', handleNoteInput);
            noteEditorElement.addEventListener('keydown', handleNoteKeyDown);
            noteEditorElement.addEventListener('blur', handleNoteBlur); // Add blur listener
        }

        // Cleanup listeners on component unmount
        return () => {
            if (noteEditorElement) {
                noteEditorElement.removeEventListener('input', handleNoteInput);
                noteEditorElement.removeEventListener('keydown', handleNoteKeyDown);
                noteEditorElement.removeEventListener('blur', handleNoteBlur);
            }
            // Cleanup Monaco Editor if it exists
            if (editor) {
                editor.dispose();
                editor = null;
            }
            // Cleanup Cytoscape if it exists
            if (cy) {
                cy.destroy();
                cy = null;
            }
        };
    }, []); // Run only once on mount

    // --- View Switching Logic ---
    const showGraphView = () => {
        setActiveTab('graph');
        requestAnimationFrame(() => { // Delay resize slightly
            if (cy) {
                cy.resize();
                cy.fit();
            }
        });
        if (document.getElementById('bottom-panel')) {
             document.getElementById('bottom-panel').style.display = 'flex';
        }
        if (document.getElementById('monaco-container')) {
            document.getElementById('monaco-container').style.display = 'none';
        }
        if (document.getElementById('cy')) {
            document.getElementById('cy').style.display = 'block';
        }
    };

    const showEditorView = (filePath, fileContent = '// File content not loaded') => {
        setActiveTab('editor');

        if (document.getElementById('bottom-panel')) {
            document.getElementById('bottom-panel').style.display = 'flex'; // Keep bottom panel
        }
         if (document.getElementById('cy')) {
            document.getElementById('cy').style.display = 'none'; // Hide graph
        }
         if (document.getElementById('monaco-container')) {
            document.getElementById('monaco-container').style.display = 'block'; // Show editor container
        }

        // Initialize or update Monaco Editor
        const editorContainer = document.getElementById('monaco-editor');
        if (!editorContainer) {
            console.error("Monaco container element not found!");
            return;
        }

        if (!editor) {
             // Ensure Monaco is loaded (using require as per original code)
             // Adjust the path if needed, especially in production builds
             window.require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.48.0/min/vs' } });
             window.require(['vs/editor/editor.main'], function () {
                try {
                    editor = monaco.editor.create(editorContainer, {
                        value: fileContent,
                        language: getLanguageFromFileName(filePath),
                        theme: 'vs-dark',
                        automaticLayout: true, // Essential for resizing
                        readOnly: false, // Make editor editable
                         minimap: { enabled: true }, // Enable minimap
                         wordWrap: 'on' // Enable word wrap
                    });
                     // Optional: Listen for content changes if needed
                    // editor.getModel().onDidChangeContent((event) => {
                    //     const currentContent = editor.getValue();
                    //     // Handle content change, e.g., mark as unsaved
                    // });
                } catch (error) {
                    console.error("Error creating Monaco editor:", error);
                    editorContainer.textContent = `Error loading editor: ${error.message}`; // Show error in UI
                }
            });
        } else {
            // Editor already exists, just update content and language
             const model = editor.getModel();
             if (model) {
                 monaco.editor.setModelLanguage(model, getLanguageFromFileName(filePath));
                 editor.setValue(fileContent);
                 // Focus the editor when switching to it
                 editor.focus();
             } else {
                  console.error("Monaco editor model not found!");
             }
        }
    };


    // Helper to get Monaco language ID from file name
    function getLanguageFromFileName(fileName) {
        if (!fileName || typeof fileName !== 'string') return 'plaintext';
        const extension = fileName.split('.').pop();
        switch (extension?.toLowerCase()) { // Add safety check
            case 'cs': return 'csharp';
            case 'java': return 'java';
            case 'py': return 'python';
            case 'js': return 'javascript';
            case 'jsx': return 'javascript'; // Handle JSX
            case 'ts': return 'typescript';
            case 'tsx': return 'typescript'; // Handle TSX
            case 'html': return 'html';
            case 'css': return 'css';
            case 'scss': return 'scss'; // Add SCSS
            case 'less': return 'less'; // Add LESS
            case 'md': return 'markdown';
            case 'json': return 'json';
            case 'yaml': return 'yaml';
            case 'yml': return 'yaml'; // Add YML alias
            case 'xml': return 'xml';
            case 'sh': return 'shell'; // Add Shell
            case 'sql': return 'sql'; // Add SQL
            // Add more languages as needed
            default: return 'plaintext';
        }
    }

    // Initialize Cytoscape (using useEffect to ensure DOM element exists)
     useEffect(() => {
        if (elements.length > 0 && !cy && document.getElementById('cy')) {
             initCytoscape(elements);
        }
        // Optional: Cleanup Cytoscape instance if elements change significantly
        // or component unmounts (handled in the initial useEffect)
    }, [elements]); // Re-run if elements array changes


    const initCytoscape = (initialElements) => {
        try {
             cy = CytoscapeComponent({ // Directly assigning Cytoscape instance
                container: document.getElementById('cy'),
                elements: initialElements,
                style: [ // Styles truncated for brevity - use the full style array from the original code
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
                    { selector: ':selected', style: { 'width': '28px', 'height': '28px', 'background-color': '#007acc', 'border-color': '#ffffff', 'border-width': 2, 'line-color': '#0099ff', 'target-arrow-color': '#0099ff', 'opacity': 1, 'color': '#ffffff', 'font-weight': 'bold', 'shadow-blur': 15, 'shadow-color': '#007acc', 'shadow-opacity': 0.7, 'shadow-offset-x': 0, 'shadow-offset-y': 0 } },
                    { selector: 'node[isParent]:selected', style: { 'background-color': '#094771', 'border-color': '#007acc', 'border-width': 2, 'padding': '27px', 'color': '#ffffff' } },
                    { selector: '.highlight', style: { 'width': '24px', 'height': '24px', 'background-color': '#007acc', 'border-color': '#cccccc', 'border-width': 1, 'line-color': '#008ae6', 'target-arrow-color': '#008ae6', 'opacity': 0.8, 'color': '#eeeeee', 'shadow-blur': 8, 'shadow-color': '#007acc', 'shadow-opacity': 0.5, 'shadow-offset-x': 0, 'shadow-offset-y': 0, 'transition-property': 'background-color, border-color, line-color, opacity, shadow-blur, width, height', 'transition-duration': '0.2s' } }
                 ],
                layout: {
                    name: 'cose', // Force-directed layout
                    animate: 'end', // Animate layout changes smoothly
                    animationDuration: 500, // Animation duration
                    animationEasing: 'ease-out',
                    randomize: false, // Keep layout somewhat consistent between runs
                    padding: 80, // Moderate padding around the graph
                    nodeRepulsion: (node) => 40000,
                    idealEdgeLength: (edge) => 100,
                    edgeElasticity: (edge) => 100,
                    nestingFactor: 1.2, // Controls tightness of compounds (directories)
                    gravity: 80, // Increased gravity to pull nodes towards center
                    numIter: 1000, // Standard number of iterations
                    initialTemp: 200, // Standard initial temperature
                    coolingFactor: 0.95, // Standard cooling factor
                    minTemp: 1.0, // Standard minimum temperature
                    nodeOverlap: 20, // Moderate overlap prevention padding
                    fit: true, // Ensure it fits viewport after layout
                    nodeDimensionsIncludeLabels: true // Consider labels for layout spacing
                }
             });

             // --- Cytoscape Event Listeners ---

            cy.on('tap', 'node', function (event) {
                const node = event.target;
                if (node.data('isParent')) return; // Ignore clicks on directory nodes

                // Deselect previous and remove highlights
                if (selectedFileId && cy) { // Check if cy exists
                    const prevNode = cy.getElementById(selectedFileId);
                    if (prevNode.length > 0) prevNode.unselect();
                    cy.elements().removeClass('highlight');
                }

                // Select current node and highlight neighbors
                node.select();
                selectedFileId = node.id();

                // Clear existing highlights before applying new ones
                cy.elements().removeClass('highlight');
                node.addClass('highlight');
                node.connectedEdges().addClass('highlight');
                // Highlight nodes connected via these edges
                node.connectedEdges().connectedNodes().addClass('highlight');
                 // Ensure the tapped node itself remains highlighted (overrides connectedNodes)
                 node.addClass('highlight');


                // Update File Info Panel
                const fileInfoDiv = document.getElementById('file-info');
                if (fileInfoDiv) {
                    fileInfoDiv.innerHTML = `
                        <p><strong>File:</strong> ${node.data('name') || 'N/A'}</p>
                        <p><strong>Path:</strong> ${node.id()}</p>
                        <p><strong>Type:</strong> ${node.data('type') || 'N/A'}</p>
                        <p><strong>Connections:</strong> ${node.degree()}</p>
                    `;
                }

                // Update Note Editor
                noteEditorElement = document.getElementById('note-editor'); // Ensure we have the latest ref
                if (noteEditorElement) {
                    noteEditorElement.value = notes[selectedFileId] || '';
                    noteEditorElement.disabled = false; // Enable editor
                } else {
                    console.warn("Note editor element not found.");
                }
                document.getElementById('save-note-button').disabled = false; // Enable save button


                // Fetch/display file content and switch to editor view
                const filePath = node.id();
                const fileContent = uploadedFilesContent[filePath] || `// Content for ${filePath} not found or not loaded.`;
                showEditorView(filePath, fileContent);
            });


             cy.on('tap', function (event) {
                // Check if the click target is the core (background)
                 if (event.target === cy) {
                    if (selectedFileId && cy) { // Check cy exists
                         const prevNode = cy.getElementById(selectedFileId);
                         if (prevNode.length > 0) prevNode.unselect();
                         cy.elements().removeClass('highlight');
                    }
                    selectedFileId = null;

                    // Clear file info and disable note editor
                    const fileInfoDiv = document.getElementById('file-info');
                    if (fileInfoDiv) {
                        fileInfoDiv.innerHTML = '<p>Click on a file node to see details here.</p>';
                    }
                    noteEditorElement = document.getElementById('note-editor'); // Re-get ref
                     if (noteEditorElement) {
                        noteEditorElement.value = '';
                        noteEditorElement.disabled = true; // Disable editor
                    }
                     if (document.getElementById('save-note-button')) {
                         document.getElementById('save-note-button').disabled = true; // Disable save button
                    }
                     hideMentionSuggestions(); // Hide mentions as well

                    // Optional: Decide whether to switch back to graph view or stay in editor
                    // showGraphView(); // Uncomment to switch back to graph on background click
                 }
             });

             cy.ready(function () {
                if (cy) { // Check cy exists
                     cy.fit();
                     showGraphView(); // Start in graph view
                 }
            });

            cy.on('dragfree', 'node', function (event) {
                if (!cy) return; // Check cy exists
                console.log('Node drag finished, running layout...');
                 // Use requestAnimationFrame to ensure layout runs after drag state is fully cleared
                requestAnimationFrame(() => {
                     if (cy) { // Check cy again inside async callback
                         cy.layout({
                            name: 'cose',
                            animate: true,
                            animationDuration: 250,
                            randomize: false,
                            fit: false,
                            padding: 80,
                            nodeRepulsion: (node) => 20000,
                            idealEdgeLength: (edge) => 80,
                            edgeElasticity: (edge) => 80,
                            nestingFactor: 1.2,
                            gravity: 60,
                            numIter: 500,
                            initialTemp: 100,
                            coolingFactor: 0.95,
                            minTemp: 1.0,
                            nodeOverlap: 20,
                            nodeDimensionsIncludeLabels: true
                        }).run();
                    }
                });
            });
        } catch (error) {
             console.error("Error initializing Cytoscape:", error);
             const cyContainer = document.getElementById('cy');
             if (cyContainer) {
                cyContainer.innerHTML = `<p style="color: red; padding: 20px;">Error initializing graph: ${error.message}</p>`;
             }
        }
    };


    // --- General Event Listeners ---

    const handleSaveNote = () => {
         noteEditorElement = document.getElementById('note-editor'); // Ensure we have element ref
         if (selectedFileId && noteEditorElement) {
            const noteContent = noteEditorElement.value;
            notes[selectedFileId] = noteContent;

            console.log(`Note saved for ${selectedFileId}:`, noteContent);
            parseMentionsAndUpdateGraph(selectedFileId, noteContent);

            alert(`Note for ${selectedFileId} saved! Mentions processed.`);
             // In a real app, send to backend: saveNoteToBackend(selectedFileId, noteContent);
         } else {
            alert('Please select a file node first.');
         }
    };

    // --- Mention Handling Functions ---

    const showMentionSuggestions = (query) => {
        mentionSuggestionsElement = document.getElementById('mention-suggestions'); // Update ref
        noteEditorElement = document.getElementById('note-editor'); // Update ref

        if (!mentionSuggestionsElement || !noteEditorElement) {
             console.warn("Mention suggestions or note editor element not found.");
            return;
        }
        currentMentionQuery = query;
        const lowerCaseQuery = query.toLowerCase();

        // Filter files, exclude self, ensure files exist in graph
        const filteredFiles = allFilePaths.filter(filePath =>
            filePath !== selectedFileId &&
            filePath.toLowerCase().includes(lowerCaseQuery) &&
             cy && cy.getElementById(filePath).length > 0 // Ensure node exists in graph
        );

        mentionSuggestionsElement.innerHTML = ''; // Clear previous
        if (filteredFiles.length === 0 || query.trim().length === 0) {
            hideMentionSuggestions();
            return;
        }

        filteredFiles.slice(0, 10).forEach((filePath, index) => {
            const item = document.createElement('div');
            item.classList.add('mention-suggestion-item');
            // Display just the filename for cleaner suggestions? Or full path? Let's stick with full path for clarity.
            item.textContent = filePath; // Use full path
            // Optional: Show only filename but store full path
            // item.textContent = filePath.split('/').pop();
            item.dataset.filePath = filePath;
            item.addEventListener('mousedown', (e) => {
                e.preventDefault(); // Important to prevent blur before click registers
                selectMentionSuggestion(filePath);
            });
            mentionSuggestionsElement.appendChild(item);
        });

        mentionSuggestionsElement.classList.remove('hidden');
        activeSuggestionIndex = -1; // Reset selection
        // Don't auto-highlight first item by default, wait for ArrowDown
        // updateActiveSuggestion();

        // Position the suggestions dropdown near the cursor or '@' symbol
        // (This is complex, for now just position below the editor)
        const noteEditorRect = noteEditorElement.getBoundingClientRect();
        mentionSuggestionsElement.style.top = `${noteEditorRect.bottom + window.scrollY}px`; // Position below editor
        mentionSuggestionsElement.style.left = `${noteEditorRect.left + window.scrollX}px`;
        mentionSuggestionsElement.style.width = `${noteEditorRect.width}px`; // Match editor width
        mentionSuggestionsElement.style.display = 'block'; // Ensure visible

    };

    const hideMentionSuggestions = () => {
        mentionSuggestionsElement = document.getElementById('mention-suggestions'); // Update ref
        if (mentionSuggestionsElement) {
            mentionSuggestionsElement.classList.add('hidden');
            mentionSuggestionsElement.style.display = 'none'; // Use display none
            mentionSuggestionsElement.innerHTML = ''; // Clear content
        }
        activeSuggestionIndex = -1;
    };

    const selectMentionSuggestion = (filePath) => {
         noteEditorElement = document.getElementById('note-editor'); // Update ref
         if (!noteEditorElement) return;

        const currentText = noteEditorElement.value;
        const cursorPos = noteEditorElement.selectionStart;
        const textBeforeCursor = currentText.substring(0, cursorPos);

        // Find the start of the current mention query (@...) more robustly
        const mentionStartIndex = textBeforeCursor.lastIndexOf('@');

         // Ensure the found '@' is the one we're completing (not part of a previous mention)
         if (mentionStartIndex !== -1 && textBeforeCursor.substring(mentionStartIndex + 1, cursorPos).replace(/\[.*?\]/g, '') === currentMentionQuery) {
             const textAfterCursor = currentText.substring(cursorPos);
             const mentionText = `@[${filePath}] `; // Add a space after mention
             const newText = textBeforeCursor.substring(0, mentionStartIndex) + mentionText + textAfterCursor;

            noteEditorElement.value = newText;
            noteEditorElement.focus(); // Keep focus on the editor

            // Set cursor position after the inserted mention
            const newCursorPos = mentionStartIndex + mentionText.length;
            noteEditorElement.setSelectionRange(newCursorPos, newCursorPos);
        }
        hideMentionSuggestions();
        // Trigger input event manually if needed by other listeners (though changing .value should suffice)
        // noteEditorElement.dispatchEvent(new Event('input', { bubbles: true }));
    };


     const updateActiveSuggestion = () => {
         mentionSuggestionsElement = document.getElementById('mention-suggestions'); // Update ref
         if (!mentionSuggestionsElement) return;
        const items = mentionSuggestionsElement.querySelectorAll('.mention-suggestion-item');
        items.forEach((item, index) => {
            if (index === activeSuggestionIndex) {
                item.classList.add('active');
                 // Scroll the container if necessary
                 item.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
            } else {
                item.classList.remove('active');
            }
        });
    };

    const handleMentionKeyDown = (event) => {
        mentionSuggestionsElement = document.getElementById('mention-suggestions'); // Update ref
        if (!mentionSuggestionsElement || mentionSuggestionsElement.classList.contains('hidden')) {
            return false; // Not handled
        }
        const items = mentionSuggestionsElement.querySelectorAll('.mention-suggestion-item');
        if (items.length === 0) return false;

        let handled = false;
        switch (event.key) {
            case 'ArrowDown':
                activeSuggestionIndex = (activeSuggestionIndex + 1) % items.length;
                updateActiveSuggestion();
                handled = true;
                break;
            case 'ArrowUp':
                activeSuggestionIndex = (activeSuggestionIndex - 1 + items.length) % items.length;
                updateActiveSuggestion();
                handled = true;
                break;
            case 'Enter':
            case 'Tab': // Treat Tab like Enter for selection
                 if (activeSuggestionIndex > -1 && items[activeSuggestionIndex]) { // Check item exists
                    selectMentionSuggestion(items[activeSuggestionIndex].dataset.filePath);
                    handled = true;
                } else {
                    // If Enter/Tab is pressed but no suggestion is highlighted,
                    // maybe just hide the suggestions? Or allow default behavior (e.g., new line)?
                    // For now, let's hide and prevent default.
                    hideMentionSuggestions();
                    handled = true; // We are handling it by hiding
                }
                break;
            case 'Escape':
                hideMentionSuggestions();
                handled = true;
                break;
            default:
                // Let other keys pass through for typing
                 return false;
        }

        if (handled) {
            event.preventDefault();
            event.stopPropagation();
        }
        return handled; // Return true if we handled the key event
    };

    const parseMentionsAndUpdateGraph = (sourceFileId, noteContent) => {
        if (!cy || !sourceFileId) {
             console.warn("Cytoscape instance or sourceFileId not available for parsing mentions.");
            return;
        }

        const mentionRegex = /@\[([^\]]+?)\]/g; // Matches @[filepath], non-greedy
        let match;
        const existingEdgesData = new Map();
        const currentMentionsInNote = new Set();
        let graphChanged = false;

        // Map existing mention edges from this source: targetId -> edgeId
         cy.edges(`[source = "${sourceFileId}"][connectionType = "mentions"]`).forEach(edge => {
             // Ensure target data exists before adding to map
             const targetId = edge.data('target');
             if (targetId) {
                 existingEdgesData.set(targetId, edge.id());
             } else {
                 console.warn("Found mention edge with missing target data:", edge.id());
             }
        });


        // Find all valid mentions in the current note
        while ((match = mentionRegex.exec(noteContent)) !== null) {
            const mentionedFilePath = match[1];
            currentMentionsInNote.add(mentionedFilePath);

             // Check if mentioned file exists as a node in the graph and is not the source
             if (sourceFileId !== mentionedFilePath && cy.getElementById(mentionedFilePath).length > 0) {
                // If this edge doesn't exist, add it
                if (!existingEdgesData.has(mentionedFilePath)) {
                     // Use a more deterministic ID if possible, but Date.now() ensures uniqueness for now
                    const newEdgeId = `mention-${sourceFileId}-to-${mentionedFilePath}-${Date.now()}`;
                     cy.add({
                        group: 'edges',
                        data: {
                            id: newEdgeId,
                            source: sourceFileId,
                            target: mentionedFilePath,
                            connectionType: 'mentions' // Ensure type is set
                        }
                    });
                    console.log(`Added mention edge: ${sourceFileId} -> ${mentionedFilePath}`);
                    graphChanged = true;
                }
            } else if (sourceFileId === mentionedFilePath) {
                 console.log(`Skipping self-mention: ${sourceFileId}`);
             } else {
                 console.log(`Skipping mention to non-existent node: ${mentionedFilePath}`);
            }
        }

        // Remove edges that existed but are no longer in the note
        existingEdgesData.forEach((edgeId, targetFileId) => {
            if (!currentMentionsInNote.has(targetFileId)) {
                 const edgeToRemove = cy.getElementById(edgeId);
                 if (edgeToRemove.length > 0) {
                     cy.remove(edgeToRemove);
                     console.log(`Removed old mention edge: ${sourceFileId} -> ${targetFileId} (ID: ${edgeId})`);
                     graphChanged = true;
                 } else {
                     console.warn(`Attempted to remove non-existent edge with ID: ${edgeId}`);
                 }
            }
        });

        // Re-run layout if edges were added or removed
        if (graphChanged) {
            console.log("Mention edges changed, re-running layout...");
            requestAnimationFrame(() => { // Run layout in next frame
                 if (cy) { // Check cy exists
                    cy.layout({
                        name: 'cose',
                        animate: true,
                        animationDuration: 500,
                        fit: false, // Usually better not to fit after minor changes
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
                        nodeDimensionsIncludeLabels: true
                    }).run();
                 }
            });
        }
    };

    // --- File Handling & Graph Generation ---

    const generateFileExplorerHTML = (fileTree, level = 0) => {
        let html = '<ul class="explorer-list">';

        const sortedKeys = Object.keys(fileTree).sort((a, b) => {
            const itemA = fileTree[a];
            const itemB = fileTree[b];
            const isDirA = itemA.type === 'directory';
            const isDirB = itemB.type === 'directory';
            if (isDirA !== isDirB) return isDirA ? -1 : 1;
            return a.localeCompare(b);
        });

        for (const name of sortedKeys) {
            const item = fileTree[name];
            const isDir = item.type === 'directory';
            let iconClass = 'file'; // Default icon class

            if (isDir) {
                 // Basic folder icon, could add state (open/closed) later
                 iconClass = 'folder'; // Use a generic folder class
            } else {
                const extension = name.split('.').pop()?.toLowerCase() || ''; // Safe access to pop() and lowerCase()
                const iconMap = { /* Mapping defined below */ }; // Defined outside loop for efficiency
                 // Simple mapping, assumes CSS defines these classes with appropriate icons
                 const langToIconMap = {
                    'csharp': 'cs', 'java': 'java', 'python': 'py', 'javascript': 'js',
                    'typescript': 'ts', 'html': 'html', 'css': 'css', 'scss': 'css', // Use css icon for scss too
                    'markdown': 'md', 'json': 'json', 'yaml': 'yaml', 'xml': 'xml',
                    'shell': 'shell', 'sql': 'db', // Use a database icon for SQL?
                    'png': 'image', 'jpg': 'image', 'jpeg': 'image', 'gif': 'image', 'svg': 'svg', // Specific SVG icon maybe
                    // Add more specific icons
                    'pdf': 'pdf', 'zip': 'zip', 'txt': 'text',
                };
                 const lang = getLanguageFromFileName(name);
                 iconClass = langToIconMap[lang] || (extension ? `file-${extension}` : 'file'); // Fallback: file-ext or just file
                 // Refine fallback for common non-code types
                 if (iconClass === 'file' && extension) {
                      const commonExtMap = { 'txt': 'text', 'log': 'text', 'pdf': 'pdf', 'zip': 'zip', 'rar': 'zip' };
                      iconClass = commonExtMap[extension] || `file ext-${extension}`; // Generic ext icon
                 } else if (iconClass === `file-${extension}`) { // If lang mapped to something simple like 'js'
                     iconClass = lang; // Use the shorter class name like 'js', 'py', etc.
                 }
            }


            const filePathAttr = isDir ? `data-dirpath="${item.path}"` : `data-filepath="${item.path}"`;
            const indentStyle = `--indent-level: ${level};`; // CSS variable for indentation

            // --- FIX: Use template literal (backticks) here ---
            html += `<li style="${indentStyle}" ${filePathAttr} class="explorer-item ${isDir ? 'explorer-dir' : 'explorer-file'}" title="${item.path}">
                        <span class="explorer-item-icon icon-${iconClass}"></span>
                        <span class="explorer-item-name">${name}</span>
                     </li>`;
            // --- End FIX ---

            if (isDir && item.children && Object.keys(item.children).length > 0) {
                 html += `<ul class="nested-list level-${level + 1}">`; // Add nested UL for structure
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
             // Heuristic to check if it's likely text; otherwise, skip reading content
             const isLikelyText = file.type.startsWith('text/') ||
                                 /\.(txt|md|js|jsx|ts|tsx|json|html|css|scss|less|py|java|cs|xml|yaml|yml|sh|sql|log)$/i.test(file.name);
             if (isLikelyText) {
                reader.readAsText(file);
             } else {
                  resolve({ path: file.webkitRelativePath || file.name, content: '// Binary or non-text file content not displayed' }); // Resolve with placeholder for non-text
             }
        });
    }


     const processUploadedFiles = async (files) => {
         console.log(`Processing ${files.length} files...`);
         const newElements = [];
         const newFileTree = {};
         const createdDirs = new Set();
         uploadedFilesContent = {}; // Reset global content store
         allFilePaths = []; // Reset global path list
         const contentPromises = [];

        function ensureDirectoryExists(pathParts, currentLevelTree, currentGraphPath) {
            let parentId = null;
             let currentPath = '';

             for (let i = 0; i < pathParts.length; i++) {
                 const part = pathParts[i];
                 // --- FIX: Add closing backtick ---
                 currentPath = currentPath ? `${currentPath}/${part}` : part;
                 // --- End FIX ---

                 if (!currentLevelTree[part]) {
                     // Create dir in file tree
                     currentLevelTree[part] = { type: 'directory', children: {}, path: currentPath };

                     // Add dir node to graph if new
                    if (!createdDirs.has(currentPath)) {
                        newElements.push({
                            data: {
                                id: currentPath,
                                name: part,
                                isParent: true, // Mark as compound node parent
                                type: 'Directory' // Specific type for styling/identification
                            },
                             classes: 'directory-node' // Add class for easier selection/styling
                        });
                        createdDirs.add(currentPath); // Track added directory node

                        // Add edge from parent directory (if exists) to this new directory
                         if (parentId !== null) {
                             newElements.push({
                                data: {
                                    id: `contains-${parentId}-to-${currentPath}`,
                                    source: parentId,
                                    target: currentPath,
                                    connectionType: 'contains' // Edge type for hierarchy
                                },
                                 classes: 'contains-edge directory-edge' // Add classes for styling
                             });
                        }
                    }
                 }
                 // Add edge from directory to containing parent if it exists
                 // (Ensure this happens even if dir already existed in createdDirs set, but was created in a different branch)
                  if (parentId !== null && !newElements.some(el => el.data.id === `contains-${parentId}-to-${currentPath}`)) {
                       const parentNodeExists = newElements.some(el => el.data.id === parentId && el.data.isParent);
                       const childNodeExists = newElements.some(el => el.data.id === currentPath && el.data.isParent);
                       if (parentNodeExists && childNodeExists) {
                             newElements.push({
                                data: {
                                    id: `contains-${parentId}-to-${currentPath}`,
                                    source: parentId,
                                    target: currentPath,
                                    connectionType: 'contains'
                                },
                                 classes: 'contains-edge directory-edge'
                            });
                       }
                  }


                 // Move to the next level
                 parentId = currentPath; // Current becomes parent for the next part
                 currentLevelTree = currentLevelTree[part].children; // Descend into tree
             }
            return { treeRef: currentLevelTree, finalDirPath: parentId }; // Return final directory parent ID and tree reference
        }


         // Iterate through files to read content and build structure
         for (const file of files) {
             const path = file.webkitRelativePath || file.name; // Use relative path for structure
             if (!path) continue; // Skip if path is somehow empty

            allFilePaths.push(path); // Add to global list for mentions
             contentPromises.push(readFileContent(file)); // Read content (async)

             const parts = path.split('/');
             const fileName = parts.pop();
             const dirParts = parts; // Parts that are directories

             // Ensure directories exist and get the final parent directory ID
             const { treeRef: fileParentTree, finalDirPath } = ensureDirectoryExists(dirParts, newFileTree, '');

             // Add file to file tree
             fileParentTree[fileName] = { type: 'file', path: path };

             // Add file node to graph elements
             const fileType = getLanguageFromFileName(fileName); // Get type for styling
             newElements.push({
                 data: {
                     id: path, // Full path as unique ID
                     name: fileName,
                     parent: finalDirPath, // Associate with parent directory node ID
                     type: fileType, // Store file type (e.g., 'javascript', 'python')
                     isParent: false // Explicitly mark as not a parent
                 },
                 classes: `file-node type-${fileType}` // Add classes for styling
             });

             // Add edge from containing directory to this file node
             if (finalDirPath) {
                 newElements.push({
                     data: {
                         id: `contains-${finalDirPath}-to-${path}`,
                         source: finalDirPath, // Parent directory ID
                         target: path, // File ID
                         connectionType: 'contains' // Edge type for hierarchy
                     },
                     classes: 'contains-edge file-edge' // Add classes for styling
                 });
             }
         }

        // Wait for all file content to be read
         try {
             const results = await Promise.all(contentPromises);
             results.forEach(result => {
                 if (result) {
                     uploadedFilesContent[result.path] = result.content;
                 }
             });
             console.log("File contents loaded:", Object.keys(uploadedFilesContent).length);
         } catch (error) {
             console.error("Error reading file contents:", error);
             // Handle error, maybe show a message to the user
         }

         console.log("Generated elements:", newElements.length);
        // console.log("Generated file tree:", JSON.stringify(newFileTree, null, 2)); // Debug: Log tree
        // console.log("Graph Elements:", JSON.stringify(newElements, null, 2)); // Debug: Log elements


        // Destroy existing Cytoscape instance before creating a new one
         if (cy) {
             cy.destroy();
             cy = null;
             console.log("Existing Cytoscape instance destroyed.");
         }
        // Clear selection and info panel
         selectedFileId = null;
         const fileInfoDiv = document.getElementById('file-info');
         if (fileInfoDiv) fileInfoDiv.innerHTML = '<p>Select a file node.</p>';
         noteEditorElement = document.getElementById('note-editor');
         if (noteEditorElement) { noteEditorElement.value = ''; noteEditorElement.disabled = true; }
         if (document.getElementById('save-note-button')) document.getElementById('save-note-button').disabled = true;


         // Update state to trigger re-render with new elements and file tree
         setElements(newElements);
         setFileTree(newFileTree);

          // Update the File Explorer display AFTER state updates
         // Use useEffect or a callback if generateFileExplorerHTML depends on state/props
          // For now, directly update after setting state (might have timing issues in React)
          const explorerContainer = document.getElementById('file-explorer-list');
          if (explorerContainer) {
              explorerContainer.innerHTML = generateFileExplorerHTML(newFileTree);
          } else {
              console.warn("File explorer container not found.");
          }

         // Initialization of Cytoscape is now handled by the useEffect watching `elements`
         console.log("File processing complete. Cytoscape will initialize/update.");
     };


    // Handle folder upload
    const handleFolderUpload = (event) => {
        const files = event.target.files;
        if (files.length > 0) {
            processUploadedFiles(Array.from(files)); // Process the FileList
        }
    };

    // Effect to update file explorer when fileTree changes
    useEffect(() => {
        const explorerContainer = document.getElementById('file-explorer-list');
         if (explorerContainer) {
             explorerContainer.innerHTML = generateFileExplorerHTML(fileTree);
             // Add click listeners to the generated items
             explorerContainer.querySelectorAll('.explorer-item').forEach(item => {
                item.addEventListener('click', handleExplorerItemClick);
            });
             // Cleanup listeners when component updates/unmounts
             return () => {
                explorerContainer.querySelectorAll('.explorer-item').forEach(item => {
                    item.removeEventListener('click', handleExplorerItemClick);
                });
            };
         }
     }, [fileTree]); // Re-run when fileTree changes


     // Handle clicks within the file explorer
     const handleExplorerItemClick = (event) => {
         const targetItem = event.currentTarget; // Get the LI element
         const filePath = targetItem.dataset.filepath;
         const dirPath = targetItem.dataset.dirpath;

         if (filePath && cy) { // Clicked on a file
             const node = cy.getElementById(filePath);
             if (node.length > 0) {
                 // Simulate a tap event on the corresponding graph node
                  node.trigger('tap');
                 // Center the view on the selected node
                 cy.animate({
                     center: { eles: node },
                     zoom: cy.zoom() < 1 ? 1 : cy.zoom(), // Zoom in if too zoomed out
                 }, {
                     duration: 400 // Animation duration
                 });
             } else {
                 console.warn(`Node not found in graph for file path: ${filePath}`);
             }
         } else if (dirPath && cy) { // Clicked on a directory
              // Optionally expand/collapse in explorer view (requires state)
              // Optionally highlight or center the directory node in the graph
             const node = cy.getElementById(dirPath);
             if (node.length > 0) {
                 // Maybe just center the view on the directory
                  cy.animate({
                     center: { eles: node },
                     zoom: cy.zoom() // Keep current zoom level
                 }, {
                     duration: 400
                 });
                 // Optionally select the directory node?
                 // node.select(); // Be careful with selecting parent nodes
             }
              console.log(`Clicked on directory: ${dirPath}`);
              // Implement expand/collapse logic here if needed
               targetItem.classList.toggle('expanded'); // Basic toggle example
               const nestedList = targetItem.nextElementSibling; // Assumes UL follows LI
               if (nestedList && nestedList.tagName === 'UL') {
                   nestedList.style.display = nestedList.style.display === 'none' ? 'block' : 'none';
               }
         }
     };

    // --- Render ---
    return (
        <div className="App">
            <div className={`sidebar ${isSidebarCollapsed ? 'collapsed' : ''}`}>
                <button
                    className="collapse-button"
                    onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                    title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
                >
                    {isSidebarCollapsed ? '>' : '<'}
                </button>
                <div className="sidebar-content">
                    <h3>Project Explorer</h3>
                     <input type="file" id="folderUpload" webkitdirectory="" directory="" multiple onChange={handleFolderUpload} style={{ display: 'none' }} />
                     <button onClick={() => document.getElementById('folderUpload').click()} className="upload-button">
                         Upload Folder
                     </button>
                    {/* File explorer content will be injected here */}
                    <div id="file-explorer-list">
                        {/* Initial state or placeholder */}
                         {Object.keys(fileTree).length === 0 && <p>Upload a folder to begin.</p>}
                    </div>
                </div>
            </div>

            <div className={`main-content ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
                 {/* Top Tabs - Kept simple for now */}
                 <div className="view-tabs">
                     <button onClick={showGraphView} className={activeTab === 'graph' ? 'active' : ''}>Graph View</button>
                     <button onClick={() => {
                          if (selectedFileId) {
                              const content = uploadedFilesContent[selectedFileId] || '// Select a file from graph or explorer';
                              showEditorView(selectedFileId, content);
                          } else {
                               // Show empty editor or placeholder?
                               showEditorView('','// No file selected');
                          }
                     }}
                         className={activeTab === 'editor' ? 'active' : ''}
                         disabled={!selectedFileId && activeTab !== 'editor'} // Disable if no file selected unless already in editor view
                     >
                        Editor View
                     </button>
                 </div>


                 {/* Cytoscape Graph Container */}
                 <div id="cy" style={{ display: activeTab === 'graph' ? 'block' : 'none' }}>
                    {/* CytoscapeComponent will mount here if used directly,
                        but we are initializing manually now */}
                 </div>

                 {/* Monaco Editor Container */}
                 <div id="monaco-container" style={{ display: activeTab === 'editor' ? 'block' : 'none' }}>
                    <div id="monaco-editor"></div>
                 </div>


                 {/* Bottom Panel: File Info & Notes */}
                 <div id="bottom-panel" style={{ display: 'flex' }}> {/* Always visible */}
                     <div id="file-info-panel">
                        <h4>File Information</h4>
                        <div id="file-info">
                            <p>Click on a file node to see details here.</p>
                        </div>
                    </div>
                    <div id="notes-panel">
                        <h4>Notes</h4>
                        <textarea
                            id="note-editor"
                             placeholder="Add notes for the selected file... Use @ to mention other files."
                             disabled // Disabled until a file is selected
                         ></textarea>
                         {/* Mention Suggestions Dropdown */}
                         <div id="mention-suggestions" className="mention-suggestions-list hidden"></div>
                         <button id="save-note-button" onClick={handleSaveNote} disabled>Save Note</button>
                    </div>
                 </div>
            </div>
        </div>
    );
}

export default App;
