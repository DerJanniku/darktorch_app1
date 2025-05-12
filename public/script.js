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


// --- View Switching Logic ---
const graphTab = document.getElementById('graph-tab');
const editorTab = document.getElementById('editor-tab');
const graphContainer = document.getElementById('graph-container');
const editorContainer = document.getElementById('editor-container');

function setActiveTab(tabElement) {
    // Remove active class from all tabs
    document.querySelectorAll('.view-tab').forEach(tab => tab.classList.remove('active-tab'));
    // Add active class to the clicked tab
    tabElement.classList.add('active-tab');
}

function showGraphView() {
    setActiveTab(graphTab);
    graphContainer.classList.remove('hidden');
    editorContainer.classList.add('hidden');
    // Ensure graph resizes correctly when shown
    if (cy) {
        cy.resize();
        cy.fit();
    }
    // Keep bottom panel visible
    document.getElementById('bottom-panel').style.display = 'flex';
}

function showEditorView(filePath, fileContent = '// File content not loaded') {
     setActiveTab(editorTab);
     graphContainer.classList.add('hidden');
     editorContainer.classList.remove('hidden');

    // Initialize or update Monaco Editor
    if (!editor) {
        require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.48.0/min/vs' } });
        require(['vs/editor/editor.main'], function () {
            editor = monaco.editor.create(document.getElementById('monaco-editor'), {
                value: fileContent,
                language: getLanguageFromFileName(filePath), // Set language based on file extension
                theme: 'vs-dark', // VS Code dark theme
                automaticLayout: true, // Automatically resize editor
            });
             // Update editor content when a file is selected
            editor.setValue(fileContent);
        });
    } else {
         // Update editor content if editor is already initialized
         monaco.editor.setModelLanguage(editor.getModel(), getLanguageFromFileName(filePath)); // Update language
         editor.setValue(fileContent);
    }
}

 // Helper to get Monaco language ID from file name
 function getLanguageFromFileName(fileName) {
     const extension = fileName.split('.').pop();
     switch (extension.toLowerCase()) {
         case 'cs': return 'csharp';
         case 'java': return 'java';
         case 'py': return 'python';
         case 'js': return 'javascript';
         case 'html': return 'html';
         case 'css': return 'css';
         case 'md': return 'markdown';
         case 'json': return 'json';
         case 'yaml': return 'yaml';
         case 'xml': return 'xml';
         // Add more languages as needed
         default: return 'plaintext';
     }
 }


// Initialize Cytoscape
function initCytoscape(elements) {
     if (cy) {
         cy.destroy(); // Destroy previous instance if exists
     }
     cy = cytoscape({
        container: document.getElementById('cy'), // container to render in

        elements: elements, // graph elements

        style: [ // the stylesheet for the graph - Point-based nodes with labels underneath
            {
                selector: 'node', // Default style for file nodes (now points)
                style: {
                    'background-color': '#888888', // Default grey point color
                    'border-width': 0, // No border for points by default
                    'label': 'data(name)', // Keep label data associated
                    'color': '#cccccc', // Label color
                    'text-valign': 'bottom', // Position label below the node
                    'text-halign': 'center',
                    'text-margin-y': 5, // Space between node and label
                    'font-size': '9px', // Smaller font size for labels under points
                    'text-wrap': 'wrap',
                    'text-max-width': '80px',
                    'shape': 'ellipse', // Use ellipse/circle for the point
                    'width': '20px', // Increased fixed size for the point
                    'height': '20px', // Increased fixed size for the point
                    // 'padding': '25px', // Padding no longer needed for points
                    'transition-property': 'background-color, border-color, width, height', // Added width/height transition
                    'transition-duration': '0.2s'
                }
            },
            {
                selector: 'node[isParent]', // Style for parent nodes (directories) - keep as rectangles
                style: {
                    'background-color': '#252526', // Match sidebar bg
                    'border-color': '#444444',
                    'border-width': 1,
                    'label': 'data(name)',
                    'color': '#aaaaaa', // Dimmer text for dirs
                    'font-size': '12px',
                    'font-weight': 'normal',
                    'shape': 'round-rectangle',
                    'padding': '25px', // Increased padding for larger directories
                    'text-valign': 'center', // Keep label centered for directories
                    'text-halign': 'center',
                    'background-opacity': 0.7, // Slightly less opaque
                    'transition-property': 'background-color, border-color',
                    'transition-duration': '0.2s'
                }
            },
            // --- File Type Specific Colors ---
            {
                selector: 'node[type="javascript"]',
                style: { 'background-color': '#f1e05a' } // Yellowish
            },
            {
                selector: 'node[type="html"]',
                style: { 'background-color': '#e34c26' } // Orange
            },
            {
                selector: 'node[type="css"]',
                style: { 'background-color': '#563d7c' } // Purple
            },
            {
                selector: 'node[type="markdown"]',
                style: { 'background-color': '#608b4e' } // Green
            },
            {
                selector: 'node[type="json"]',
                style: { 'background-color': '#f1e05a' } // Same as JS for now
            },
             {
                selector: 'node[type="csharp"]',
                style: { 'background-color': '#178600' } // Greenish C#
            },
             {
                selector: 'node[type="python"]',
                style: { 'background-color': '#3572A5' } // Python blue
            },
             {
                selector: 'node[type="java"]',
                style: { 'background-color': '#b07219' } // Java brown/orange
            },
             {
                selector: 'node[type="xml"]',
                style: { 'background-color': '#555555' } // Dark Grey XML
            },
             {
                selector: 'node[type="yaml"]',
                style: { 'background-color': '#cb171e' } // Red YAML
            },
             // Add more specific types as needed
             {
                selector: 'node[type="plaintext"]', // Default/fallback type
                style: { 'background-color': '#888888' } // Default grey
            },
            // --- Edge Styles ---
            {
                selector: 'edge[connectionType="contains"]', // Style specifically for hierarchy edges
                style: {
                    'width': 0.7, // Even thinner hierarchy lines
                    'line-color': '#505050', // Darker grey
                    'curve-style': 'bezier',
                    'opacity': 0.3, // Even more subtle
                    'target-arrow-shape': 'none',
                    'target-arrow-color': '#505050',
                    'transition-property': 'line-color, opacity',
                    'transition-duration': '0.2s'
                }
            },
            {
                selector: 'edge[connectionType="mentions"]', // Style for mention edges
                style: {
                    'width': 0.9, // Slightly thicker than hierarchy
                    'line-color': '#8a6d9e', // Muted purple
                    'line-style': 'dashed',
                    'curve-style': 'bezier',
                    'opacity': 0.6,
                    'target-arrow-shape': 'triangle', // Keep arrow for mentions
                    'target-arrow-color': '#8a6d9e',
                    'arrow-scale': 0.6 // Smaller arrow
                }
            },
            {
                selector: 'edge[connectionType="starts"]',
                style: {
                    'width': 0.9,
                    'line-color': '#b5cea8', 'target-arrow-color': '#b5cea8', 'target-arrow-shape': 'triangle', 'arrow-scale': 0.6 } // Muted yellow/green
            },
            {
                selector: 'edge[connectionType="uses"]',
                style: {
                    'width': 0.9,
                    'line-color': '#4e9a9a', 'target-arrow-color': '#4e9a9a', 'target-arrow-shape': 'triangle', 'arrow-scale': 0.6 } // Muted teal
            },
             // --- Selection and Highlight Styles ---
            {
                selector: ':selected', // Style for selected nodes/edges
                style: {
                    // For point nodes, increase size and add border/glow
                    'width': '28px', // Make point larger on select
                    'height': '28px',
                    'background-color': '#007acc', // Keep background color based on type or use accent? Let's use accent.
                    'border-color': '#ffffff', // White border for contrast
                    'border-width': 2,
                    // Highlight edges connected to selected node
                    'line-color': '#0099ff', // Brighter blue for selected edges
                    'target-arrow-color': '#0099ff',
                    'opacity': 1,
                    // Label of selected node
                    'color': '#ffffff', // White label text
                    'font-weight': 'bold',
                    // Glow effect for selected node
                    'shadow-blur': 15,
                    'shadow-color': '#007acc',
                    'shadow-opacity': 0.7,
                    'shadow-offset-x': 0,
                    'shadow-offset-y': 0
                }
            },
             {
                 // Keep directory selection style distinct
                 selector: 'node[isParent]:selected',
                 style: {
                     'background-color': '#094771', // VS Code selection blue bg
                     'border-color': '#007acc', // Brighter border
                     'border-width': 2,
                     'padding': '27px', // Slightly increase padding on selection
                     'color': '#ffffff' // White text
                     // Keep other parent styles
                 }
             },
            {
                selector: '.highlight', // Style for highlighted neighbors (nodes and edges)
                style: {
                    // Highlight neighbor points subtly
                    'width': '24px', // Slightly larger than default point
                    'height': '24px',
                    'background-color': '#007acc', // Use accent color for highlighted points too
                    'border-color': '#cccccc', // Light grey border
                    'border-width': 1,
                    // Highlight connecting edges
                    'line-color': '#008ae6', // Slightly less bright blue than direct selection
                    'target-arrow-color': '#008ae6',
                    'opacity': 0.8,
                    // Highlight neighbor labels
                    'color': '#eeeeee', // Slightly brighter label text
                    // Subtle glow for highlighted points
                    'shadow-blur': 8,
                    'shadow-color': '#007acc',
                    'shadow-opacity': 0.5,
                    'shadow-offset-x': 0,
                    'shadow-offset-y': 0,
                    'transition-property': 'background-color, border-color, line-color, opacity, shadow-blur, width, height',
                    'transition-duration': '0.2s'
                }
            }
            // Note: node.highlight and edge.highlight classes are applied in the tap event listener
        ],

        layout: {
            name: 'cose', // Force-directed layout
            animate: 'end', // Animate layout changes smoothly
            animationDuration: 500, // Animation duration
            animationEasing: 'ease-out',
            randomize: false, // Keep layout somewhat consistent between runs
            padding: 80, // Moderate padding around the graph
            // --- Adjusted Force Parameters ---
            nodeRepulsion: function(node){ return 40000; }, // Significantly reduced repulsion
            idealEdgeLength: function(edge){ return 100; }, // Reduced ideal edge length
            edgeElasticity: function(edge){ return 100; }, // Increased elasticity (more spring-like)
            nestingFactor: 1.2, // Controls tightness of compounds (directories)
            gravity: 80, // Increased gravity to pull nodes towards center
            numIter: 1000, // Standard number of iterations
            initialTemp: 200, // Standard initial temperature
            coolingFactor: 0.95, // Standard cooling factor
            minTemp: 1.0, // Standard minimum temperature
            // --- Overlap Prevention ---
            nodeOverlap: 20, // Moderate overlap prevention padding
            // --- Other Options ---
            fit: true, // Ensure it fits viewport after layout
            nodeDimensionsIncludeLabels: true // Consider labels for layout spacing
        }
    });

     // --- Cytoscape Event Listeners ---

    // Node click event
    cy.on('tap', 'node', function(event) {
        const node = event.target;

        // Prevent clicking on parent nodes from selecting
        if (node.data('isParent')) {
             return;
        }

        // Deselect previous node and remove highlight
        if (selectedFileId) {
             const prevNode = cy.getElementById(selectedFileId);
             if (prevNode.length > 0) {
                 prevNode.unselect();
             }
             cy.elements().removeClass('highlight'); // Remove all highlights
        }

        // Select the current node and highlight connected elements
        node.select();
        selectedFileId = node.id();

        node.addClass('highlight');
        node.connectedEdges().addClass('highlight');
         node.connectedEdges().sources().addClass('highlight'); // Highlight source nodes of connected edges
         node.connectedEdges().targets().addClass('highlight'); // Highlight target nodes of connected edges

        // Show file info and notes
        const fileInfoDiv = document.getElementById('file-info');
        const noteEditor = document.getElementById('note-editor');

        // Check if fileInfoDiv exists before trying to set its innerHTML
        if (fileInfoDiv) {
            fileInfoDiv.innerHTML = `
                <p><strong>File:</strong> ${node.data('name')}</p>
                <p><strong>Type:</strong> ${node.data('type')}</p>
                <p><strong>Connections:</strong> ${node.degree()}</p>
                `;
        } else {
            console.warn("Element with ID 'file-info' not found.");
        }


        noteEditor.value = notes[selectedFileId] || '';

         // In a real app, you would fetch file content and notes from the backend here
         // For now, we'll just show the editor with a placeholder
         // Fetch and show actual file content, automatically switching to editor view
         const filePath = node.id(); // Node ID is the full path
         const fileContent = uploadedFilesContent[filePath] || `// Content for ${filePath} not found.`;
         showEditorView(filePath, fileContent); // Show editor view (which now handles tab activation)
    });

     // Click outside nodes to deselect and remove highlight
    cy.on('tap', function(event){
        if(event.target === cy){
            if (selectedFileId) {
                const prevNode = cy.getElementById(selectedFileId);
                 if (prevNode.length > 0) {
                    prevNode.unselect();
                 }
                selectedFileId = null;
                 const fileInfoDiv = document.getElementById('file-info');
                 if (fileInfoDiv) {
                     fileInfoDiv.innerHTML = '<p>Click on a file node to see details here.</p>';
                 }
                 document.getElementById('note-editor').value = '';
                 cy.elements().removeClass('highlight'); // Remove all highlights
                 // Optionally switch back to graph view when clicking empty space
                 // showGraphView();
            }
        }
    });

    // Initial fit after layout is done
    cy.ready(function(){
        cy.fit();
         showGraphView(); // Show graph initially
    });

    // Re-run layout briefly on node drag release to simulate physics
    cy.on('dragfree', 'node', function(event) {
        // Only re-layout non-parent nodes if needed, or just layout all
        // if (!event.target.data('isParent')) {
            console.log('Node drag finished, running layout...');
            cy.layout({
                name: 'cose',
                animate: true,
                animationDuration: 250, // Faster duration for quick re-settle
                randomize: false,
                fit: false, // Don't re-fit viewport, just adjust positions
                padding: 80, // Consistent padding
                // Use slightly less intense parameters for drag release settling
                nodeRepulsion: function(node){ return 20000; },
                idealEdgeLength: function(edge){ return 80; },
                edgeElasticity: function(edge){ return 80; },
                nestingFactor: 1.2,
                gravity: 60,
                numIter: 500, // Fewer iterations for faster re-settle
                initialTemp: 100, // Lower temp for faster re-settle
                coolingFactor: 0.95,
                minTemp: 1.0,
                nodeOverlap: 20,
                nodeDimensionsIncludeLabels: true
            }).run();
        // }
    });
}


// --- General Event Listeners ---

// Save Note button click event
document.getElementById('save-note').addEventListener('click', () => {
    if (selectedFileId && noteEditorElement) { // Check noteEditorElement exists
        const noteContent = noteEditorElement.value;
        notes[selectedFileId] = noteContent; // Save the raw note content

        // Parse mentions and update graph
        parseMentionsAndUpdateGraph(selectedFileId, noteContent);

        alert(`Note for ${selectedFileId} saved! Mentions processed.`);
        // In a real application, you would send this noteContent to your backend.
    } else {
        alert('Please select a file and ensure the note editor is available.');
    }
});

// --- Mention Handling Functions ---
function showMentionSuggestions(query) {
    if (!mentionSuggestionsElement || !noteEditorElement) return;
    currentMentionQuery = query;
    // Filter files based on the query (case-insensitive) and exclude self-mention
    const filteredFiles = allFilePaths.filter(filePath =>
        filePath.toLowerCase().includes(query.toLowerCase()) && filePath !== selectedFileId
    );

    mentionSuggestionsElement.innerHTML = ''; // Clear previous suggestions
    if (filteredFiles.length === 0 || query.length === 0) { // Hide if no query or no results
        hideMentionSuggestions();
        return;
    }

    filteredFiles.slice(0, 10).forEach((filePath, index) => { // Limit suggestions shown
        const item = document.createElement('div');
        item.classList.add('mention-suggestion-item');
        item.textContent = filePath; // Display the full path for clarity
        item.dataset.filePath = filePath;
        // Use mousedown to fire before blur, preventing the suggestions from hiding prematurely
        item.addEventListener('mousedown', (e) => {
            e.preventDefault(); // Prevent textarea blur
            selectMentionSuggestion(filePath);
        });
        mentionSuggestionsElement.appendChild(item);
    });

    mentionSuggestionsElement.classList.remove('hidden');
    activeSuggestionIndex = -1; // Reset active suggestion index
    updateActiveSuggestion(); // Highlight the first item if any

    // Position the suggestions dropdown (ensure noteEditorElement is valid)
    if (noteEditorElement) {
        const noteEditorRect = noteEditorElement.getBoundingClientRect();
        // Position above the textarea
        mentionSuggestionsElement.style.bottom = `${window.innerHeight - noteEditorRect.top}px`;
        mentionSuggestionsElement.style.left = `${noteEditorRect.left}px`;
        mentionSuggestionsElement.style.width = `${noteEditorRect.width}px`;
    } else {
         hideMentionSuggestions(); // Hide if editor isn't ready
    }
}

function hideMentionSuggestions() {
    if (mentionSuggestionsElement) {
        mentionSuggestionsElement.classList.add('hidden');
    }
    activeSuggestionIndex = -1;
}

function selectMentionSuggestion(filePath) {
    if (!noteEditorElement) return;
    const currentText = noteEditorElement.value;
    const cursorPos = noteEditorElement.selectionStart;
    const textBeforeCursor = currentText.substring(0, cursorPos);

    // Find the start of the current mention query (@...)
    const mentionStartIndex = textBeforeCursor.lastIndexOf('@' + currentMentionQuery);

    if (mentionStartIndex !== -1) {
        const textAfterCursor = currentText.substring(cursorPos);
        // Replace the @query part with @[filepath] and add a space
        noteEditorElement.value = textBeforeCursor.substring(0, mentionStartIndex) + `@[${filePath}] ` + textAfterCursor;
        // Adjust cursor position after the inserted mention + space
        const newCursorPos = mentionStartIndex + `@[${filePath}] `.length;
        noteEditorElement.focus();
        noteEditorElement.setSelectionRange(newCursorPos, newCursorPos);
    }
    hideMentionSuggestions();
}

function updateActiveSuggestion() {
    if (!mentionSuggestionsElement) return;
    const items = mentionSuggestionsElement.querySelectorAll('.mention-suggestion-item');
    items.forEach((item, index) => {
        if (index === activeSuggestionIndex) {
            item.classList.add('active');
            item.scrollIntoView({ block: 'nearest' }); // Ensure visible
        } else {
            item.classList.remove('active');
        }
    });
}

// Handles keyboard navigation within the suggestion list
function handleMentionKeyDown(event) {
    if (!mentionSuggestionsElement || mentionSuggestionsElement.classList.contains('hidden')) {
        return false; // Indicate keydown was not handled for mentions
    }
    const items = mentionSuggestionsElement.querySelectorAll('.mention-suggestion-item');
    if (items.length === 0) return false;

    let handled = false;
    if (event.key === 'ArrowDown') {
        activeSuggestionIndex = (activeSuggestionIndex + 1) % items.length;
        updateActiveSuggestion();
        handled = true;
    } else if (event.key === 'ArrowUp') {
        activeSuggestionIndex = (activeSuggestionIndex - 1 + items.length) % items.length;
        updateActiveSuggestion();
        handled = true;
    } else if (event.key === 'Enter' || event.key === 'Tab') {
        if (activeSuggestionIndex > -1) {
            selectMentionSuggestion(items[activeSuggestionIndex].dataset.filePath);
            handled = true;
        } else {
            hideMentionSuggestions(); // Hide if no suggestion is active but Enter/Tab is pressed
        }
    } else if (event.key === 'Escape') {
        hideMentionSuggestions();
        handled = true;
    }

    if (handled) {
        event.preventDefault(); // Prevent default behavior only if we handled the key
        event.stopPropagation(); // Stop propagation to prevent other listeners
    }
    return handled; // Return whether the event was handled
}

// Parses the note content for @[filepath] mentions and updates the graph
function parseMentionsAndUpdateGraph(sourceFileId, noteContent) {
    if (!cy || !sourceFileId) return;

    const mentionRegex = /@\[([^\]]+)\]/g; // Matches @[filepath]
    let match;
    const existingEdgesData = new Map(); // Store existing mention edges: targetId -> edgeId
    const currentMentionsInNote = new Set(); // Keep track of mentions found in the current note text
    let graphChanged = false;

    // Get current mention edges originating from this source node
    cy.edges(`[source = "${sourceFileId}"][connectionType = "mentions"]`).forEach(edge => {
        existingEdgesData.set(edge.data('target'), edge.id());
    });

    // Find all mentions in the current note text
    while ((match = mentionRegex.exec(noteContent)) !== null) {
        const mentionedFilePath = match[1];
        currentMentionsInNote.add(mentionedFilePath);

        // Check if the mentioned file exists in our loaded files and is not the source file itself
        if (uploadedFilesContent.hasOwnProperty(mentionedFilePath) && sourceFileId !== mentionedFilePath) {
            // If this mention edge doesn't already exist, add it
            if (!existingEdgesData.has(mentionedFilePath)) {
                const newEdgeId = `mention-${sourceFileId}-to-${mentionedFilePath}-${Date.now()}`;
                cy.add({
                    group: 'edges',
                    data: {
                        id: newEdgeId,
                        source: sourceFileId,
                        target: mentionedFilePath,
                        connectionType: 'mentions'
                    }
                });
                console.log(`Added mention edge: ${sourceFileId} -> ${mentionedFilePath}`);
                graphChanged = true;
            }
        }
    }

    // Remove old mention edges that are no longer present in the note text
    existingEdgesData.forEach((edgeId, targetFileId) => {
        if (!currentMentionsInNote.has(targetFileId)) {
            cy.remove(`edge#${edgeId}`); // Remove specific edge by ID
            console.log(`Removed old mention edge: ${sourceFileId} -> ${targetFileId}`);
            graphChanged = true;
        }
    });

    // Optional: Re-apply layout if graph structure changed
    if (graphChanged) {
        console.log("Mention edges changed, re-running layout...");
        cy.layout({
            name: 'cose', // Or the layout you prefer
            animate: true,
            animationDuration: 500, // Duration for the animation
            fit: false, // Avoid re-fitting viewport unnecessarily
            padding: 80, // Consistent padding
            // Use parameters similar to initial layout or dragfree, adjust as needed
            nodeRepulsion: function(node){ return 40000; },
            idealEdgeLength: function(edge){ return 100; },
            edgeElasticity: function(edge){ return 100; },
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
}


// Function to generate VSCode-like file explorer HTML
function generateFileExplorerHTML(fileTree, level = 0) {
    let html = '<ul>';

    // Sort items: directories first, then files alphabetically
    const sortedKeys = Object.keys(fileTree).sort((a, b) => {
        const itemA = fileTree[a];
        const itemB = fileTree[b];
        const isDirA = itemA.type === 'directory';
        const isDirB = itemB.type === 'directory';

        if (isDirA && !isDirB) return -1; // Directories first
        if (!isDirA && isDirB) return 1;  // Files after directories
        return a.localeCompare(b); // Alphabetical sort within type
    });


    for (const name of sortedKeys) {
        const item = fileTree[name];
        const isDir = item.type === 'directory';
        // Determine icon based on type and extension (using CSS classes)
        let iconClass = 'file'; // Default
        if (isDir) {
            // Basic directory icon - could add open/closed state later
            iconClass = 'dir-closed';
        } else {
            const extension = name.split('.').pop().toLowerCase();
             // Map extensions to CSS classes defined in style.css
             const iconMap = {
                 cs: 'cs', js: 'js', html: 'html', css: 'css', md: 'md',
                 py: 'py', java: 'java', json: 'json', yaml: 'yaml', xml: 'xml',
                 png: 'img', jpg: 'img', jpeg: 'img', gif: 'img', svg: 'img'
                 // Add more mappings if new icons are added to CSS
             };
             iconClass = iconMap[extension] || 'file'; // Use mapped class or default 'file'
        }

        const filePathAttr = isDir ? `data-dirpath="${item.path}"` : `data-filepath="${item.path}"`;
        const indentStyle = `--indent-level: ${level};`; // Set CSS variable for indentation

        html += `<li style="${indentStyle}" ${filePathAttr} class="explorer-item">
                    <span class="explorer-item-icon ${iconClass}"></span>
                    <span class="explorer-item-name">${name}</span>
                 </li>`;

        // Recursive call for subdirectories
        if (isDir && Object.keys(item.children).length > 0) {
            // We might add a nested UL here later for expand/collapse
            html += generateFileExplorerHTML(item.children, level + 1);
        }
    }

    html += '</ul>';
    return html;
}

// No longer needed as icons are handled by CSS classes directly
// function getFileIconClass(fileName) { ... }


// Function to read file content asynchronously
function readFileContent(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target.result);
        reader.onerror = (error) => reject(error);
        reader.readAsText(file);
    });
}

// Function to process uploaded files and build graph elements
async function processUploadedFiles(files) {
    const elements = [];
    const fileTree = {}; // To build the hierarchical structure for the explorer
    const createdDirs = new Set(); // Keep track of created directory nodes
    uploadedFilesContent = {}; // Reset content map
    allFilePaths = []; // <<< RESET file paths list
    const contentPromises = []; // To read files concurrently

    // Helper to ensure parent directories exist in the tree and graph
    function ensureDirectoryExists(pathParts, currentLevelTree, currentGraphPath) {
        let parentId = null; // Root has no parent
        let currentPath = '';

        for (let i = 0; i < pathParts.length; i++) {
            const part = pathParts[i];
            currentPath = currentPath ? `${currentPath}/${part}` : part; // Build the full path ID

            if (!currentLevelTree[part]) {
                // Create directory in file tree
                currentLevelTree[part] = { type: 'directory', children: {}, path: currentPath };

                // Add directory node to graph elements if not already added
                if (!createdDirs.has(currentPath)) {
                    elements.push({
                        data: {
                            id: currentPath, // Use full path as ID for uniqueness
                            name: part,
                            type: 'Directory',
                            isParent: true
                        }
                    });
                    createdDirs.add(currentPath);

                    // Add edge from parent directory if it exists
                    if (parentId) {
                        elements.push({
                            data: {
                                source: currentPath, // Child dir
                                target: parentId, // Parent dir
                                connectionType: 'contains',
                                isChild: true // Indicate hierarchy
                            }
                        });
                    }
                }
            }

            // Check if it's actually a directory before descending
            if (currentLevelTree[part].type !== 'directory') {
                console.error(`Expected directory but found file at path: ${currentPath}`);
                return { tree: null, graphId: null }; // Indicate error or unexpected structure
            }


            parentId = currentPath; // Update parent ID for the next level
            currentLevelTree = currentLevelTree[part].children; // Move deeper into the tree
        }
        return { tree: currentLevelTree, graphId: parentId }; // Return the deepest level tree and the graph ID of the immediate parent dir
    }

    for (const file of files) {
        const relativePath = file.webkitRelativePath;
        const parts = relativePath.split('/');
        const fileName = parts.pop(); // Get the file name
        const dirParts = parts; // Remaining parts are directories

        // Ensure parent directories exist and get the immediate parent level
        const { tree: parentTree, graphId: parentDirId } = ensureDirectoryExists(dirParts, fileTree, '');

        if (!parentTree) continue; // Skip if there was an issue creating directories

        // Add file to the file tree
        parentTree[fileName] = { type: 'file', path: relativePath };
        allFilePaths.push(relativePath); // <<< ADD file path to the list

        // Add file node to graph elements
        const fileId = relativePath; // Use full path for file node ID
        const fileType = getLanguageFromFileName(fileName); // Get type based on extension
        elements.push({
            data: {
                id: fileId,
                name: fileName,
                type: fileType,
                size: 10 + Math.random() * 15 // Basic size randomization for visual variety
                // Content will be added later if needed, or accessed via uploadedFilesContent
            }
        });

        // Prepare to read file content
        contentPromises.push(
            readFileContent(file).then(content => {
                uploadedFilesContent[relativePath] = content;
            }).catch(err => {
                console.error(`Error reading file ${relativePath}:`, err);
                uploadedFilesContent[relativePath] = `// Error reading file: ${err.message}`;
            })
        );

        // Add edge from file to its parent directory
        if (parentDirId) {
            elements.push({
                data: {
                    source: fileId, // Child file
                    target: parentDirId, // Parent directory
                    connectionType: 'contains',
                    isChild: true // Indicate hierarchy
                }
            });
        }
    }

    // Wait for all file content to be read
    await Promise.all(contentPromises);
    console.log('Finished reading file contents.');
    console.log('All file paths for mentions:', allFilePaths); // Log for debugging

    return { elements, fileTree };
}


// File input change event - REWRITTEN
document.getElementById('folder-upload').addEventListener('change', async (event) => {
    const files = event.target.files;
    if (files.length > 0) {
        // Get folder name from the first file's path
        const folderName = files[0].webkitRelativePath.split('/')[0];
        // Update the new selected folder display
        const selectedFolderSection = document.getElementById('selected-folder-section');
        const selectedFolderNameEl = document.getElementById('selected-folder-name');
        selectedFolderNameEl.textContent = folderName;
        selectedFolderSection.classList.remove('hidden'); // Show the section

        console.log(`Selected folder: ${folderName}`);
        console.log('Processing files:', files.length);

        // Clear the current graph, editor content, and the NEW file explorer
        if (cy) cy.elements().remove();
        if (editor) editor.setValue('');
        document.getElementById('vscode-file-explorer').innerHTML = ''; // Clear NEW explorer

        // Process the files to get graph elements and file tree (now async)
        try {
            const { elements, fileTree } = await processUploadedFiles(files);

            console.log('Generated Graph Elements:', elements.length);
            console.log('Generated File Tree:', fileTree);

        // Initialize Cytoscape with the generated elements
        if (elements.length > 0) {
            initCytoscape(elements);
            showGraphView(); // Show the graph view
        } else {
            // Handle case where no processable files/structure found
             if (cy) cy.destroy(); // Clear cytoscape instance if empty
             cy = null;
             document.getElementById('cy').innerHTML = '<p class="text-center text-gray-500 mt-10">No graph data to display for the selected folder.</p>';
             showGraphView(); // Still show the (empty) graph area
            console.warn("No graph elements generated for the selected folder.");
        }

        // Populate the NEW file explorer
        const fileExplorerHTML = generateFileExplorerHTML(fileTree);
        document.getElementById('vscode-file-explorer').innerHTML = fileExplorerHTML;

        } catch (error) { // Correctly placed catch block
             console.error("Error processing uploaded files:", error);
             // Update new selected folder display on error
             document.getElementById('selected-folder-name').textContent = 'Error processing';
             document.getElementById('selected-folder-section').classList.remove('hidden');
             document.getElementById('cy').innerHTML = '<p class="text-center text-red-500 mt-10">Error processing folder contents.</p>';
             showGraphView(); // Show the graph area even on error
        }
    } else { // Correctly placed else block for files.length > 0 check
         // Hide selected folder section if no folder is selected
         document.getElementById('selected-folder-section').classList.add('hidden');
         document.getElementById('selected-folder-name').textContent = '';
        // Optionally clear graph and explorer if selection is cancelled
        if (cy) cy.elements().remove();
        document.getElementById('vscode-file-explorer').innerHTML = '<p class="text-gray-500 text-sm p-2">Select a folder to view files.</p>'; // Clear NEW explorer
         if (cy) cy.destroy();
         cy = null;
         document.getElementById('cy').innerHTML = '<p class="text-center text-gray-500 mt-10">Select a folder to visualize.</p>';
         showGraphView();
    }
});

// File explorer item click event (using event delegation on the NEW explorer)
document.getElementById('vscode-file-explorer').addEventListener('click', (event) => {
    const targetLi = event.target.closest('li.explorer-item'); // Find the parent LI

    if (targetLi && targetLi.dataset.filepath) { // Check if it's a file LI
        const filePath = targetLi.dataset.filepath;
        console.log('File clicked in explorer:', filePath);

        // --- Visual Selection in Explorer ---
        // Remove selection from previously selected item
        const currentlySelected = document.querySelector('#vscode-file-explorer li.selected');
        if (currentlySelected) {
            currentlySelected.classList.remove('selected');
        }
        // Add selection to the clicked item
        targetLi.classList.add('selected');

        // Fetch actual file content from our map
        const fileContent = uploadedFilesContent[filePath] || `// Content for ${filePath} not found.`;

        // Show editor view with actual content (this will also activate the editor tab)
        showEditorView(filePath, fileContent);

         // Find the corresponding node in the graph and select it
         if (cy) {
             // Find the corresponding node in the graph using the full file path as ID
             // Removed redundant nested if(cy) check here
             const nodeId = filePath; // The node ID is the full file path
             const node = cy.getElementById(nodeId);
             if (node.length > 0) {
                 // Deselect previous node if any
                 if (selectedFileId) {
                     const prevNode = cy.getElementById(selectedFileId);
                     if (prevNode.length > 0) {
                         prevNode.unselect();
                     }
                 }
                 cy.elements().removeClass('highlight'); // Remove all highlights

                 // Select and highlight the new node and its connections
                 node.select();
                 selectedFileId = node.id(); // Update selectedFileId (full path)
                 node.addClass('highlight');
                 // Highlight connected edges (currently only parent dir edge)
                 node.connectedEdges().addClass('highlight');
                 // Highlight connected nodes (currently only parent dir node)
                 node.connectedEdges().connectedNodes().addClass('highlight');

                 // Center the graph on the selected node
                 cy.animate({
                     center: { eles: node },
                     zoom: cy.zoom() < 1 ? 1.2 : cy.zoom() // Zoom in slightly if zoomed out
                 }, {
                     duration: 500 // Animation duration
                 });
             } else {
                 console.warn(`Node with ID '${nodeId}' not found in graph.`);
             }
         }

         // Load notes for the selected file (using full path as key)
         const noteEditor = document.getElementById('note-editor');
         noteEditor.value = notes[filePath] || '';
         // selectedFileId is already updated during node selection logic above
    }
});


// --- Basic Responsiveness ---
window.addEventListener('resize', () => {
    if (cy && document.getElementById('graph-container').style.display !== 'none') {
        cy.resize();
        cy.fit();
    }
     if (editor && document.getElementById('editor-container').style.display !== 'none') {
         editor.layout(); // Tell Monaco to re-layout
     }
});

// Initial setup
document.addEventListener('DOMContentLoaded', () => {
    // Get references to mention elements
    noteEditorElement = document.getElementById('note-editor');
    mentionSuggestionsElement = document.getElementById('mention-suggestions');

    // Initialize Cytoscape with an empty graph initially
    initCytoscape([]);
    // Display a message prompting the user to select a folder
    document.getElementById('cy').innerHTML = '<p class="text-center text-gray-500 mt-10">Select a project folder using the button above to visualize its structure.</p>';
    // Show the graph view by default on load
    showGraphView();
    // Clear the NEW file explorer initially
    document.getElementById('vscode-file-explorer').innerHTML = '<p class="text-gray-500 text-sm p-2">Select a folder to view files.</p>';

    // --- Event Listeners ---

    // Sidebar Toggle
    const toggleButton = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('vscode-sidebar');

    toggleButton.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        // Optional: Add slight delay for graph resize to allow animation to start
        setTimeout(() => {
            if (cy && document.getElementById('graph-container').style.display !== 'none') {
                cy.resize();
                cy.fit();
            }
             if (editor && document.getElementById('editor-container').style.display !== 'none') {
                 editor.layout(); // Re-layout Monaco editor
             }
        }, 250); // Adjust delay if needed (should be slightly longer than CSS transition)
    });

    // Tab Switching
    graphTab.addEventListener('click', showGraphView);
    editorTab.addEventListener('click', () => {
        // If editor hasn't been shown yet, show placeholder, otherwise keep current content
        if (!editorContainer.classList.contains('hidden')) {
             // Already visible, do nothing or maybe re-layout editor?
             if(editor) editor.layout();
        } else {
            // Show editor view, potentially with placeholder if no file selected
            const currentFile = selectedFileId ? uploadedFilesContent[selectedFileId] : '// Select a file to view its content.';
            const currentPath = selectedFileId || 'placeholder.txt';
            showEditorView(currentPath, currentFile);
        }
    });

    // Mention Feature Listeners (add these)
    if (noteEditorElement) {
        noteEditorElement.addEventListener('input', () => {
            const text = noteEditorElement.value;
            const cursorPos = noteEditorElement.selectionStart;
            // Look for "@" followed by non-whitespace characters right before the cursor
            const textBeforeCursor = text.substring(0, cursorPos);
            const atMatch = textBeforeCursor.match(/@([^\s@]*)$/); // Match @ followed by non-space, non-@ chars at the end

            if (atMatch) {
                // Check if the '@' is preceded by whitespace or is at the start of the text
                const mentionStartIndex = atMatch.index;
                if (mentionStartIndex === 0 || /\s/.test(text[mentionStartIndex - 1])) {
                    const query = atMatch[1];
                    showMentionSuggestions(query);
                } else {
                    hideMentionSuggestions(); // Not a valid mention start (e.g., email address)
                }
            } else {
                hideMentionSuggestions(); // No active @ sequence before cursor
            }
        });

        noteEditorElement.addEventListener('keydown', (event) => {
            // Let the keydown handler for suggestions run first
            const handled = handleMentionKeyDown(event);
            // If the suggestion handler didn't handle Enter/Tab, and the suggestion box is hidden,
            // allow default behavior (e.g., new line on Enter).
            if (!handled && (event.key === 'Enter' || event.key === 'Tab') && mentionSuggestionsElement.classList.contains('hidden')) {
               // Allow default behavior
            } else if (handled) {
               // Key was handled by suggestions, default is already prevented in handleMentionKeyDown
            }
            // Allow other keys (like backspace, delete, regular typing) to pass through if not handled
        });

        // Hide suggestions when the textarea loses focus, unless clicking a suggestion
        noteEditorElement.addEventListener('blur', () => {
            // Delay hiding slightly to allow suggestion click (mousedown) events to register
            setTimeout(() => {
                // Check if the focus is still within the suggestion box or its items
                if (document.activeElement !== mentionSuggestionsElement && !mentionSuggestionsElement.contains(document.activeElement)) {
                     hideMentionSuggestions();
                }
            }, 150); // Adjust delay if needed
        });
    } else {
        console.error("Note editor element not found on DOMContentLoaded.");
    }


});
