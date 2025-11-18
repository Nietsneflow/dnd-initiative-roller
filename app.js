// Data structure
let combatants = [];
let currentRound = 1;
let initiativeHistory = [];
let currentTheme = 'dark'; // default theme
let isFirebaseReady = false;
let isUpdatingFromFirebase = false; // Prevent feedback loops

// DOM elements
const rerollAllBtn = document.getElementById('rerollAll');
const nextRoundBtn = document.getElementById('nextRound');
const resetRoundBtn = document.getElementById('resetRound');
const clearAllBtn = document.getElementById('clearAll');
const viewHistoryBtn = document.getElementById('viewHistory');
const settingsBtn = document.getElementById('settingsBtn');
const lightThemeBtn = document.getElementById('lightTheme');
const darkThemeBtn = document.getElementById('darkTheme');
const addCombatantForm = document.getElementById('addCombatantForm');
const initiativeOrderDiv = document.getElementById('initiativeOrder');
const partyListDiv = document.getElementById('partyList');
const enemyListDiv = document.getElementById('enemyList');
const friendlyListDiv = document.getElementById('friendlyList');
const roundNumberSpan = document.getElementById('roundNumber');

// Wait for Firebase to be ready
function waitForFirebase() {
    return new Promise((resolve) => {
        const checkFirebase = setInterval(() => {
            if (window.firebaseDB) {
                clearInterval(checkFirebase);
                isFirebaseReady = true;
                resolve();
            }
        }, 100);
    });
}

// Initialize app
async function init() {
    await waitForFirebase();
    await loadFromFirebase(); // Wait for initial data load
    
    // One-time cleanup: clear history if it has any undefined values
    const hasUndefined = initiativeHistory.some(entry => 
        entry.combatants && entry.combatants.some(c => 
            c.moveDirection === undefined || c.wasMoved === undefined
        )
    );
    if (hasUndefined) {
        console.log('Detected undefined values in history, clearing...');
        initiativeHistory = [];
        saveToFirebase();
    }
    
    setTheme(currentTheme);
    attachEventListeners();
}

// Event listeners
function attachEventListeners() {
    rerollAllBtn.addEventListener('click', () => {
        rollAllInitiative();
        saveToFirebase();
    });

    nextRoundBtn.addEventListener('click', () => {
        currentRound++;
        updateRoundDisplay();
        rollAllInitiative();
        saveToFirebase();
    });

    resetRoundBtn.addEventListener('click', () => {
        if (confirm('Reset to Round 1?')) {
            currentRound = 1;
            updateRoundDisplay();
            rollAllInitiative();
            saveToFirebase();
        }
    });

    clearAllBtn.addEventListener('click', () => {
        if (confirm('Remove all enemies? (Party members and friendlies will be kept)')) {
            combatants = combatants.filter(c => c.type !== 'enemy');
            renderCombatantLists();
            rollAllInitiative();
            saveToFirebase();
        }
    });

    viewHistoryBtn.addEventListener('click', () => {
        showHistoryModal();
    });

    settingsBtn.addEventListener('click', () => {
        showSettingsModal();
    });

    lightThemeBtn.addEventListener('click', () => {
        setTheme('light');
    });

    darkThemeBtn.addEventListener('click', () => {
        setTheme('dark');
    });

    addCombatantForm.addEventListener('submit', (e) => {
        e.preventDefault();
        addCombatant();
    });

    const addPartyForm = document.getElementById('addPartyForm');
    addPartyForm.addEventListener('submit', (e) => {
        e.preventDefault();
        addPartyCombatant();
    });
}

// Add a new combatant (enemy)
function addCombatant() {
    const nameInput = document.getElementById('combatantName');
    const modifierInput = document.getElementById('combatantModifier');

    const name = nameInput.value.trim();
    const modifier = parseInt(modifierInput.value);
    const type = 'enemy'; // Always enemy from main form

    if (!name) {
        alert('Please enter a name');
        return;
    }

    const advantageSelect = document.getElementById('combatantAdvantage');
    const advantage = advantageSelect.value;

    const newCombatant = {
        id: Date.now(),
        name: name,
        modifier: modifier,
        type: type,
        advantage: advantage,
        initiative: 0,
        manualOrder: null,
        wasMoved: false,
        moveDirection: null,
        originalIndex: null
    };

    combatants.push(newCombatant);
    
    // Clear form
    nameInput.value = '';
    modifierInput.value = '0';
    advantageSelect.value = 'normal';

    renderCombatantLists();
    rollAllInitiative();
    saveToFirebase();
}

// Add a new party member or friendly
function addPartyCombatant() {
    const nameInput = document.getElementById('partyCombatantName');
    const modifierInput = document.getElementById('partyCombatantModifier');
    const typeSelect = document.getElementById('partyCombatantType');

    const name = nameInput.value.trim();
    const modifier = parseInt(modifierInput.value);
    const type = typeSelect.value;

    if (!name) {
        alert('Please enter a name');
        return;
    }

    const advantageSelect = document.getElementById('partyCombatantAdvantage');
    const advantage = advantageSelect.value;

    const newCombatant = {
        id: Date.now(),
        name: name,
        modifier: modifier,
        type: type,
        advantage: advantage,
        initiative: 0,
        manualOrder: null,
        wasMoved: false,
        moveDirection: null,
        originalIndex: null
    };

    combatants.push(newCombatant);
    
    // Clear form
    nameInput.value = '';
    modifierInput.value = '0';
    typeSelect.value = 'party';
    advantageSelect.value = 'normal';

    renderCombatantLists();
    rollAllInitiative();
    saveToFirebase();
}

// Remove a combatant
function removeCombatant(id) {
    combatants = combatants.filter(c => c.id !== id);
    renderCombatantLists();
    rollAllInitiative();
    saveToFirebase();
}

// Toggle advantage for a combatant
function toggleAdvantage(id) {
    const combatant = combatants.find(c => c.id === id);
    if (!combatant) return;
    
    // Cycle through: normal -> advantage -> disadvantage -> normal
    if (combatant.advantage === 'normal') {
        combatant.advantage = 'advantage';
    } else if (combatant.advantage === 'advantage') {
        combatant.advantage = 'disadvantage';
    } else {
        combatant.advantage = 'normal';
    }
    
    renderCombatantLists();
    rollAllInitiative();
    saveToFirebase();
}

// Duplicate a combatant
function duplicateCombatant(id) {
    const combatant = combatants.find(c => c.id === id);
    if (!combatant) return;
    
    // Generate a unique numbered name
    let newName = combatant.name;
    
    // Extract base name and current number if it exists
    const match = combatant.name.match(/^(.+?)\s*(\d+)$/);
    let baseName = match ? match[1].trim() : combatant.name;
    
    // Find all combatants with the same base name
    const similarNames = combatants
        .map(c => c.name)
        .filter(name => {
            // Check if name matches the base name pattern
            return name === baseName || name.match(new RegExp(`^${baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\d+$`));
        });
    
    // Extract all existing numbers
    const existingNumbers = similarNames.map(name => {
        const numMatch = name.match(/\s*(\d+)$/);
        return numMatch ? parseInt(numMatch[1]) : (name === baseName ? 1 : 0);
    });
    
    // Get the next number
    const nextNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 2;
    
    // Create the new name
    newName = `${baseName} ${nextNumber}`;
    
    const duplicate = {
        id: Date.now(),
        name: newName,
        modifier: combatant.modifier,
        type: combatant.type,
        advantage: combatant.advantage,
        initiative: 0,
        manualOrder: null,
        wasMoved: false,
        moveDirection: null,
        originalIndex: null
    };
    
    combatants.push(duplicate);
    renderCombatantLists();
    rollAllInitiative();
    saveToFirebase();
}

// Roll d20
function rollD20() {
    return Math.floor(Math.random() * 20) + 1;
}

// Roll initiative for all combatants
function rollAllInitiative() {
    combatants.forEach(combatant => {
        let roll;
        if (combatant.advantage === 'advantage') {
            const roll1 = rollD20();
            const roll2 = rollD20();
            roll = Math.max(roll1, roll2);
            combatant.rolls = [roll1, roll2];
        } else if (combatant.advantage === 'disadvantage') {
            const roll1 = rollD20();
            const roll2 = rollD20();
            roll = Math.min(roll1, roll2);
            combatant.rolls = [roll1, roll2];
        } else {
            roll = rollD20();
            combatant.rolls = [roll];
        }
        combatant.initiative = roll + combatant.modifier;
        combatant.baseRoll = roll;
        combatant.manualOrder = null; // Reset manual ordering on re-roll
        combatant.wasMoved = false; // Reset moved indicator
        combatant.moveDirection = null; // Reset move direction
        combatant.originalIndex = null; // Reset original position
    });

    // After rolling, set original indices based on initiative order
    const sorted = [...combatants].sort((a, b) => b.initiative - a.initiative);
    sorted.forEach((combatant, index) => {
        combatant.originalIndex = index;
    });

    // Save to history
    saveToHistory();

    renderInitiativeOrder();
}

// Save current initiative state to history
function saveToHistory() {
    if (combatants.length === 0) return;
    
    const snapshot = {
        round: currentRound,
        timestamp: new Date().toLocaleString(),
        combatants: combatants.map(c => ({
            name: c.name,
            type: c.type,
            modifier: c.modifier,
            initiative: c.initiative,
            baseRoll: c.baseRoll,
            advantage: c.advantage,
            rolls: c.rolls,
            manualOrder: c.manualOrder ?? null,
            wasMoved: c.wasMoved ?? false,
            moveDirection: c.moveDirection ?? null
        }))
    };
    
    // Always add new entry to history (never overwrite)
    initiativeHistory.push(snapshot);
    
    // Keep only last 20 entries
    if (initiativeHistory.length > 20) {
        initiativeHistory.shift();
    }
}

// Render the initiative order
function renderInitiativeOrder() {
    if (combatants.length === 0) {
        initiativeOrderDiv.innerHTML = '<p class="empty-state">Add combatants to start rolling initiative!</p>';
        return;
    }

    // Sort by manual order first, then by initiative (highest first)
    const sorted = [...combatants].sort((a, b) => {
        // If both have manual order, sort by that
        if (a.manualOrder !== null && b.manualOrder !== null) {
            return a.manualOrder - b.manualOrder;
        }
        // If only a has manual order, it goes first (lower manualOrder = earlier)
        if (a.manualOrder !== null) return -1;
        if (b.manualOrder !== null) return 1;
        // Otherwise sort by initiative
        return b.initiative - a.initiative;
    });

    initiativeOrderDiv.innerHTML = sorted.map((combatant, index) => {
        let rollDisplay = '';
        if (combatant.advantage === 'advantage') {
            rollDisplay = `Roll: [${combatant.rolls.join(', ')}] → ${combatant.baseRoll} (ADV) + ${combatant.modifier >= 0 ? '+' : ''}${combatant.modifier}`;
        } else if (combatant.advantage === 'disadvantage') {
            rollDisplay = `Roll: [${combatant.rolls.join(', ')}] → ${combatant.baseRoll} (DIS) + ${combatant.modifier >= 0 ? '+' : ''}${combatant.modifier}`;
        } else {
            rollDisplay = `Roll: ${combatant.baseRoll} + ${combatant.modifier >= 0 ? '+' : ''}${combatant.modifier}`;
        }
        
        const movedIndicator = combatant.wasMoved ? 
            `<span class="moved-indicator" title="Manually moved ${combatant.moveDirection}">${combatant.moveDirection === 'down' ? '↓' : '↑'}</span>` : '';
        
        return `
            <div class="initiative-item ${combatant.type}" draggable="true" data-id="${combatant.id}" data-index="${index}">
                <div class="drag-handle" title="Drag to reorder">⋮⋮</div>
                <div class="initiative-info">
                    <div class="initiative-roll">${combatant.initiative}${movedIndicator}</div>
                    <div class="initiative-details">
                        <div class="combatant-name">${combatant.name}</div>
                        <div class="combatant-modifier">
                            ${rollDisplay}
                        </div>
                    </div>
                </div>
                <span class="combatant-type ${combatant.type}">${combatant.type}</span>
            </div>
        `;
    }).join('');
    
    // Attach drag and drop event listeners
    attachDragListeners();
}

// Render combatant lists (Party, Enemies & Friendlies)
function renderCombatantLists() {
    const party = combatants.filter(c => c.type === 'party');
    const enemies = combatants.filter(c => c.type === 'enemy');
    const friendlies = combatants.filter(c => c.type === 'friendly');

    // Render party list
    if (party.length === 0) {
        partyListDiv.innerHTML = '<p class="empty-state-small">No party members added</p>';
    } else {
        partyListDiv.innerHTML = party.map(combatant => {
            let advantageText = 'Normal';
            let advantageClass = 'adv-normal';
            if (combatant.advantage === 'advantage') {
                advantageText = 'ADV';
                advantageClass = 'adv-advantage';
            }
            if (combatant.advantage === 'disadvantage') {
                advantageText = 'DIS';
                advantageClass = 'adv-disadvantage';
            }
            
            return `
                <div class="combatant-card party">
                    <div class="combatant-card-info">
                        <span>${combatant.name}</span>
                        <small>Modifier: ${combatant.modifier >= 0 ? '+' : ''}${combatant.modifier}</small>
                    </div>
                    <div class="combatant-actions">
                        <button class="btn-advantage ${advantageClass}" onclick="toggleAdvantage(${combatant.id})" title="Toggle Advantage/Disadvantage">${advantageText}</button>
                        <button class="btn-remove" onclick="removeCombatant(${combatant.id})">Remove</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Render enemy list
    if (enemies.length === 0) {
        enemyListDiv.innerHTML = '<p class="empty-state-small">No enemies added</p>';
    } else {
        enemyListDiv.innerHTML = enemies.map(combatant => {
            let advantageText = 'Normal';
            let advantageClass = 'adv-normal';
            if (combatant.advantage === 'advantage') {
                advantageText = 'ADV';
                advantageClass = 'adv-advantage';
            }
            if (combatant.advantage === 'disadvantage') {
                advantageText = 'DIS';
                advantageClass = 'adv-disadvantage';
            }
            
            return `
                <div class="combatant-card enemy">
                    <div class="combatant-card-info">
                        <span>${combatant.name}</span>
                        <small>Modifier: ${combatant.modifier >= 0 ? '+' : ''}${combatant.modifier}</small>
                    </div>
                    <div class="combatant-actions">
                        <button class="btn-copy" onclick="duplicateCombatant(${combatant.id})" title="Duplicate this enemy">Copy</button>
                        <button class="btn-advantage ${advantageClass}" onclick="toggleAdvantage(${combatant.id})" title="Toggle Advantage/Disadvantage">${advantageText}</button>
                        <button class="btn-remove" onclick="removeCombatant(${combatant.id})">Remove</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Render friendly list
    if (friendlies.length === 0) {
        friendlyListDiv.innerHTML = '<p class="empty-state-small">No friendlies added</p>';
    } else {
        friendlyListDiv.innerHTML = friendlies.map(combatant => {
            let advantageText = 'Normal';
            let advantageClass = 'adv-normal';
            if (combatant.advantage === 'advantage') {
                advantageText = 'ADV';
                advantageClass = 'adv-advantage';
            }
            if (combatant.advantage === 'disadvantage') {
                advantageText = 'DIS';
                advantageClass = 'adv-disadvantage';
            }
            
            return `
                <div class="combatant-card friendly">
                    <div class="combatant-card-info">
                        <span>${combatant.name}</span>
                        <small>Modifier: ${combatant.modifier >= 0 ? '+' : ''}${combatant.modifier}</small>
                    </div>
                    <div class="combatant-actions">
                        <button class="btn-advantage ${advantageClass}" onclick="toggleAdvantage(${combatant.id})" title="Toggle Advantage/Disadvantage">${advantageText}</button>
                        <button class="btn-remove" onclick="removeCombatant(${combatant.id})">Remove</button>
                    </div>
                </div>
            `;
        }).join('');
    }
}

// Drag and drop functionality
let draggedElement = null;
let draggedId = null;

function attachDragListeners() {
    const items = document.querySelectorAll('.initiative-item');
    
    items.forEach(item => {
        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragend', handleDragEnd);
    });
    
    // Remove old listeners to prevent duplicates
    initiativeOrderDiv.removeEventListener('dragover', handleDragOver);
    initiativeOrderDiv.removeEventListener('drop', handleDrop);
    
    // Add dragover listener to the container
    initiativeOrderDiv.addEventListener('dragover', handleDragOver);
    initiativeOrderDiv.addEventListener('drop', handleDrop);
}

function handleDragStart(e) {
    draggedElement = this;
    draggedId = this.dataset.id;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', this.innerHTML);
}

function handleDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault();
    }
    e.dataTransfer.dropEffect = 'move';
    
    // Get the element being dragged over
    const afterElement = getDragAfterElement(initiativeOrderDiv, e.clientY);
    const draggable = draggedElement;
    
    if (afterElement == null) {
        initiativeOrderDiv.appendChild(draggable);
    } else {
        initiativeOrderDiv.insertBefore(draggable, afterElement);
    }
    
    return false;
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.initiative-item:not(.dragging)')];
    
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function handleDragEnter(e) {
    if (this !== draggedElement) {
        this.classList.add('drag-over');
    }
}

function handleDragLeave(e) {
    this.classList.remove('drag-over');
}

function handleDrop(e) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }
    
    // Get all initiative items in their current DOM order
    const items = [...initiativeOrderDiv.querySelectorAll('.initiative-item')];
    const newOrder = items.map(item => item.dataset.id);
    
    // Find if the dragged item's position changed
    const sorted = [...combatants].sort((a, b) => {
        if (a.manualOrder !== null && b.manualOrder !== null) {
            return a.manualOrder - b.manualOrder;
        }
        if (a.manualOrder !== null) return -1;
        if (b.manualOrder !== null) return 1;
        return b.initiative - a.initiative;
    });
    
    const oldIndex = sorted.findIndex(c => c.id == draggedId);
    const newIndex = newOrder.findIndex(id => id == draggedId);
    
    if (oldIndex !== newIndex) {
        // Don't clear existing manual orders - preserve them
        // Only update if combatant doesn't have manual order yet
        const hasManualOrdering = combatants.some(c => c.manualOrder !== null);
        
        if (!hasManualOrdering) {
            // First time setting manual order - set for all
            newOrder.forEach((id, idx) => {
                const combatant = combatants.find(c => c.id == id);
                if (combatant) {
                    combatant.manualOrder = idx;
                }
            });
        } else {
            // Update manual orders based on new DOM positions
            const currentManualSorted = [...combatants].filter(c => c.manualOrder !== null)
                .sort((a, b) => a.manualOrder - b.manualOrder);
            
            // Rebuild the order list
            newOrder.forEach((id, idx) => {
                const combatant = combatants.find(c => c.id == id);
                if (combatant) {
                    combatant.manualOrder = idx;
                }
            });
        }
        
        // Mark the dragged combatant as moved with direction relative to ORIGINAL position
        const draggedCombatant = combatants.find(c => c.id == draggedId);
        if (draggedCombatant) {
            const currentPosition = newIndex;
            const originalPosition = draggedCombatant.originalIndex;
            
            if (originalPosition !== null && currentPosition !== originalPosition) {
                draggedCombatant.wasMoved = true;
                draggedCombatant.moveDirection = currentPosition > originalPosition ? 'down' : 'up';
            } else if (originalPosition === currentPosition) {
                // Moved back to original position - clear the moved flag
                draggedCombatant.wasMoved = false;
                draggedCombatant.moveDirection = null;
            }
        }
        
        // Save manual reorder to history
        saveToHistory();
        saveToFirebase();
    }
    
    // Re-render to clean up any visual artifacts
    renderInitiativeOrder();
    
    return false;
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    draggedElement = null;
    draggedId = null;
}

// Update round display
function updateRoundDisplay() {
    roundNumberSpan.textContent = currentRound;
}

// Firebase functions
function saveToFirebase() {
    if (!isFirebaseReady || isUpdatingFromFirebase) return;
    
    // Convert undefined to null for Firebase compatibility - DEEP cleaning
    const cleanData = (obj) => {
        if (obj === undefined) return null;
        if (obj === null) return null;
        if (Array.isArray(obj)) {
            return obj.map(item => cleanData(item)).filter(item => item !== null);
        }
        if (typeof obj === 'object') {
            const cleaned = {};
            for (const key in obj) {
                const value = cleanData(obj[key]);
                // Only include if value is not undefined
                if (value !== undefined) {
                    cleaned[key] = value;
                }
            }
            return cleaned;
        }
        return obj;
    };
    
    const data = {
        combatants: cleanData(combatants),
        currentRound: currentRound,
        initiativeHistory: cleanData(initiativeHistory),
        theme: currentTheme,
        lastUpdated: Date.now()
    };
    
    const dbRef = window.firebaseRef(window.firebaseDB, 'gameState');
    window.firebaseSet(dbRef, data).catch(error => {
        console.error('Error saving to Firebase:', error);
    });
}

function loadFromFirebase() {
    return new Promise((resolve) => {
        const dbRef = window.firebaseRef(window.firebaseDB, 'gameState');
        
        // Listen for real-time updates
        let firstLoad = true;
        window.firebaseOnValue(dbRef, (snapshot) => {
            const data = snapshot.val();
            console.log('Firebase data received:', data);
            
            if (data) {
                isUpdatingFromFirebase = true;
                
                // Convert Firebase object/array to proper array and filter out null/undefined
                let loadedCombatants = data.combatants || [];
                console.log('Raw combatants from Firebase:', loadedCombatants);
                console.log('Is array?', Array.isArray(loadedCombatants));
                console.log('Type:', typeof loadedCombatants);
                
                if (typeof loadedCombatants === 'object' && !Array.isArray(loadedCombatants)) {
                    loadedCombatants = Object.values(loadedCombatants);
                    console.log('Converted to array:', loadedCombatants);
                }
                
                // Ensure all properties are null instead of undefined
                combatants = loadedCombatants.filter(c => c != null).map(c => ({
                    ...c,
                    manualOrder: c.manualOrder ?? null,
                    wasMoved: c.wasMoved ?? false,
                    moveDirection: c.moveDirection ?? null,
                    originalIndex: c.originalIndex ?? null
                }));
                console.log('Final combatants after filter:', combatants);
                
                let loadedHistory = data.initiativeHistory || [];
                if (typeof loadedHistory === 'object' && !Array.isArray(loadedHistory)) {
                    loadedHistory = Object.values(loadedHistory);
                }
                
                // Clean history entries to ensure no undefined values
                initiativeHistory = loadedHistory.filter(h => h != null).map(entry => ({
                    ...entry,
                    combatants: entry.combatants ? entry.combatants.map(c => ({
                        ...c,
                        manualOrder: c.manualOrder ?? null,
                        wasMoved: c.wasMoved ?? false,
                        moveDirection: c.moveDirection ?? null
                    })) : []
                }));
                
                currentRound = data.currentRound || 1;
                currentTheme = data.theme || 'dark';
                
                setTheme(currentTheme);
                renderCombatantLists();
                renderInitiativeOrder();
                updateRoundDisplay();
                
                isUpdatingFromFirebase = false;
                
                if (firstLoad) {
                    firstLoad = false;
                    resolve();
                }
            } else {
                console.log('No data in Firebase');
                // No data yet, render empty state
                renderCombatantLists();
                renderInitiativeOrder();
                updateRoundDisplay();
                
                if (firstLoad) {
                    firstLoad = false;
                    resolve();
                }
            }
        });
    });
}

// Keep localStorage functions for backward compatibility / local backup
function saveToLocalStorage() {
    const data = {
        combatants: combatants,
        currentRound: currentRound,
        initiativeHistory: initiativeHistory,
        theme: currentTheme
    };
    localStorage.setItem('dndInitiative', JSON.stringify(data));
}

function loadFromLocalStorage() {
    const saved = localStorage.getItem('dndInitiative');
    if (saved) {
        try {
            const data = JSON.parse(saved);
            combatants = data.combatants || [];
            currentRound = data.currentRound || 1;
            initiativeHistory = data.initiativeHistory || [];
            currentTheme = data.theme || 'dark';
        } catch (e) {
            console.error('Error loading saved data:', e);
            combatants = [];
            currentRound = 1;
            initiativeHistory = [];
            currentTheme = 'dark';
        }
    }
}

// Show settings modal
function showSettingsModal() {
    const modal = document.getElementById('settingsModal');
    updateThemeButtons();
    modal.style.display = 'flex';
}

function closeSettingsModal() {
    const modal = document.getElementById('settingsModal');
    modal.style.display = 'none';
}

// Theme management
function setTheme(theme) {
    currentTheme = theme;
    document.body.setAttribute('data-theme', theme);
    updateThemeButtons();
    saveToFirebase();
}

function updateThemeButtons() {
    if (currentTheme === 'light') {
        lightThemeBtn.classList.add('active');
        darkThemeBtn.classList.remove('active');
    } else {
        darkThemeBtn.classList.add('active');
        lightThemeBtn.classList.remove('active');
    }
}

// Show history modal
function showHistoryModal() {
    const modal = document.getElementById('historyModal');
    const historyContent = document.getElementById('historyContent');
    
    if (initiativeHistory.length === 0) {
        historyContent.innerHTML = '<p class="empty-state">No history available yet. Complete a round to see history.</p>';
    } else {
        // Show most recent entries first (reverse chronological order)
        const sorted = [...initiativeHistory].reverse();
        
        historyContent.innerHTML = sorted.map(record => {
            // Sort by manual order if it exists, otherwise by initiative
            const sortedCombatants = [...record.combatants].sort((a, b) => {
                if (a.manualOrder !== null && b.manualOrder !== null) {
                    return a.manualOrder - b.manualOrder;
                }
                if (a.manualOrder !== null) return -1;
                if (b.manualOrder !== null) return 1;
                return b.initiative - a.initiative;
            });
            
            return `
                <div class="history-round">
                    <div class="history-header">
                        <h3>Round ${record.round}</h3>
                        <small>${record.timestamp}</small>
                    </div>
                    <div class="history-initiatives">
                        ${sortedCombatants.map(c => {
                            let rollDisplay = '';
                            if (c.advantage === 'advantage') {
                                rollDisplay = `Roll: [${c.rolls.join(', ')}] → ${c.baseRoll} (ADV) + ${c.modifier >= 0 ? '+' : ''}${c.modifier}`;
                            } else if (c.advantage === 'disadvantage') {
                                rollDisplay = `Roll: [${c.rolls.join(', ')}] → ${c.baseRoll} (DIS) + ${c.modifier >= 0 ? '+' : ''}${c.modifier}`;
                            } else {
                                rollDisplay = `Roll: ${c.baseRoll} + ${c.modifier >= 0 ? '+' : ''}${c.modifier}`;
                            }
                            
                            // Add move indicator if present
                            const moveIndicator = (c.wasMoved && c.moveDirection) ? 
                                `<span class="moved-indicator" title="Manually moved ${c.moveDirection}">${c.moveDirection === 'down' ? '↓' : '↑'}</span>` : '';
                            
                            return `
                                <div class="history-item ${c.type}">
                                    <div class="history-roll">${c.initiative}${moveIndicator}</div>
                                    <div class="history-details">
                                        <span class="history-name">${c.name}</span>
                                        <span class="history-calc">${rollDisplay}</span>
                                    </div>
                                    <span class="history-type ${c.type}">${c.type}</span>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        }).join('');
    }
    
    modal.style.display = 'flex';
}

function closeHistoryModal() {
    const modal = document.getElementById('historyModal');
    modal.style.display = 'none';
}

// Close modal when clicking outside
window.addEventListener('click', (e) => {
    const historyModal = document.getElementById('historyModal');
    const settingsModal = document.getElementById('settingsModal');
    if (e.target === historyModal) {
        closeHistoryModal();
    }
    if (e.target === settingsModal) {
        closeSettingsModal();
    }
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', init);
