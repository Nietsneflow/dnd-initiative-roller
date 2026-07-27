// ============================================================================
// GLOBAL STATE
// ============================================================================

// Debug Configuration
// To enable detailed logging for specific features, set the corresponding flag to true:
// - SCALING: Shows comprehensive diagnostics for the dynamic scaling algorithm
//   including viewport size, item measurements, scale factors, and CSS variables
const DEBUG_FLAGS = {
    SCALING: false, // Set to true to enable detailed scaling diagnostics
    VISION: false   // Set to true to log computed colors when switching vision modes
};

let combatants = [];
let currentRound = 1;
let initiativeHistory = [];
let currentTheme = 'dark';
let currentVisionMode = 'normal';
let isFirebaseReady = false;
let isUpdatingFromFirebase = false;
let currentCampaignId = null;
let campaigns = {};
let isAuthenticated = false;
let wakeLock = null;
let isAdjustingSize = false;
let pendingAdjustment = null;
let lastAdjustmentTime = 0;

// The password is NOT stored in this code. Login sends the entered password to
// Firebase Authentication (email/password sign-in) using this fixed account
// email; the password is set and verified server-side in the Firebase console.
// The email is not a secret and is not a real inbox - it just names the account.
const AUTH_EMAIL = 'dm@dnd-initiative-roller.firebaseapp.com';

// ============================================================================
// DOM ELEMENT REFERENCES
// ============================================================================

const rerollAllBtn = document.getElementById('rerollAll');
const nextRoundBtn = document.getElementById('nextRound');
const resetRoundBtn = document.getElementById('resetRound');
const clearAllBtn = document.getElementById('clearAll');
const viewHistoryBtn = document.getElementById('viewHistory');
const manageCampaignsBtn = document.getElementById('manageCampaignsBtn');
const campaignDropdown = document.getElementById('campaignDropdown');
const createCampaignForm = document.getElementById('createCampaignForm');
const editCampaignForm = document.getElementById('editCampaignForm');
const lightThemeBtn = document.getElementById('lightTheme');
const darkThemeBtn = document.getElementById('darkTheme');
const colorblindModeSelect = document.getElementById('colorblindMode');
const addCombatantForm = document.getElementById('addCombatantForm');
const initiativeOrderDiv = document.getElementById('initiativeOrder');
const partyListDiv = document.getElementById('partyList');
const enemyListDiv = document.getElementById('enemyList');
const friendlyListDiv = document.getElementById('friendlyList');
const roundNumberSpan = document.getElementById('roundNumber');
const passwordForm = document.getElementById('passwordForm');
const passwordInput = document.getElementById('passwordInput');
const passwordError = document.getElementById('passwordError');
const rememberMeCheckbox = document.getElementById('rememberMe');
const logoutBtn = document.getElementById('logoutBtn');
const togglePasswordBtn = document.getElementById('togglePasswordBtn');

// ============================================================================
// UTILITIES
// ============================================================================

// Escape user-provided text (combatant/campaign names) before inserting into
// innerHTML - names sync to every connected device, so unescaped HTML would be
// stored XSS across the whole table
function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Monotonic ID generator - Date.now() alone can collide when adding/duplicating
// combatants in the same millisecond
let lastGeneratedId = 0;
function newId() {
    lastGeneratedId = Math.max(Date.now(), lastGeneratedId + 1);
    return lastGeneratedId;
}

// ============================================================================
// AUTHENTICATION & SECURITY
// ============================================================================

function togglePasswordVisibility() {
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        togglePasswordBtn.textContent = 'Hide';
        togglePasswordBtn.title = 'Hide password';
    } else {
        passwordInput.type = 'password';
        togglePasswordBtn.textContent = 'Show';
        togglePasswordBtn.title = 'Show password';
    }
}

// ============================================================================
// WAKE LOCK MANAGEMENT
// ============================================================================

async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('Wake Lock activated');
            
            // Re-request wake lock when visibility changes (e.g., user switches tabs and comes back)
            wakeLock.addEventListener('release', () => {
                console.log('Wake Lock released');
            });
        } else {
            console.log('Wake Lock API not supported');
        }
    } catch (err) {
        console.error(`Wake Lock error: ${err.name}, ${err.message}`);
    }
}

async function releaseWakeLock() {
    if (wakeLock !== null) {
        try {
            await wakeLock.release();
            wakeLock = null;
            console.log('Wake Lock released manually');
        } catch (err) {
            console.error(`Wake Lock release error: ${err.name}, ${err.message}`);
        }
    }
}

// Re-request wake lock when page becomes visible again
document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && isAuthenticated) {
        await requestWakeLock();
    }
});

// Sessions are persisted by Firebase Auth itself (see the session restore in
// init()). These localStorage tokens are leftovers from the old client-side
// password gate - remove any that remain on devices that used it.
function clearLegacyAuthTokens() {
    localStorage.removeItem('dndAuthToken');
    localStorage.removeItem('dndAuthExpiry');
}

function showPasswordModal() {
    const modal = document.getElementById('passwordModal');
    modal.style.display = 'flex';
    passwordInput.focus();
}

function hidePasswordModal() {
    const modal = document.getElementById('passwordModal');
    modal.style.display = 'none';
}

function handlePasswordSubmit(e) {
    e.preventDefault();

    // The password is never compared client-side: Firebase verifies it as the
    // credential of the shared account (AUTH_EMAIL)
    authenticateWithFirebase();
}

async function authenticateWithFirebase() {
    try {
        console.log('Starting Firebase authentication...');
        
        // Show loading state
        passwordError.textContent = '🔄 Authenticating...';
        passwordError.style.background = 'rgba(124, 58, 237, 0.2)';
        passwordError.style.borderColor = '#7c3aed';
        passwordError.style.color = '#e0e0e0';
        passwordError.classList.add('show');
        
        // Wait for Firebase to be ready
        console.log('Waiting for Firebase...');
        await waitForFirebase();
        console.log('Firebase ready!');

        // "Remember Me" maps to Firebase Auth persistence: local survives
        // browser restarts, session ends when the tab closes
        const persistence = rememberMeCheckbox.checked
            ? window.firebasePersistenceLocal
            : window.firebasePersistenceSession;
        await window.firebaseSetPersistence(window.firebaseAuth, persistence);

        console.log('Signing in with email/password...');
        const userCredential = await window.firebaseSignIn(window.firebaseAuth, AUTH_EMAIL, passwordInput.value);
        console.log('Firebase authentication successful!', userCredential.user.uid);

        // Authentication successful
        isAuthenticated = true;
        clearLegacyAuthTokens();
        passwordInput.value = '';

        hidePasswordModal();
        console.log('Initializing app...');
        await initializeApp(); // Continue with app initialization
        console.log('App initialized!');
        
        // Request wake lock to prevent screen from sleeping
        await requestWakeLock();
        
    } catch (error) {
        console.error('Firebase authentication error:', error);
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);

        // Wrong password: show the same friendly message as the old client-side
        // gate, auto-hidden after a few seconds. (Which code Firebase returns
        // depends on its email-enumeration-protection setting.)
        const wrongPasswordCodes = ['auth/invalid-credential', 'auth/invalid-login-credentials', 'auth/wrong-password', 'auth/missing-password'];
        if (wrongPasswordCodes.includes(error.code)) {
            passwordError.textContent = '❌ Incorrect password. Please try again.';
            passwordError.style.background = '';
            passwordError.style.borderColor = '';
            passwordError.style.color = '';
            passwordError.classList.add('show');
            passwordInput.value = '';
            passwordInput.focus();

            setTimeout(() => {
                passwordError.classList.remove('show');
            }, 3000);
            return;
        }

        let errorMessage = '❌ Authentication failed. ';

        if (error.code === 'auth/operation-not-allowed' || error.code === 'auth/user-not-found') {
            errorMessage += 'Email/password sign-in is not set up in Firebase. Check FIREBASE_RULES.txt';
        } else if (error.code === 'auth/too-many-requests') {
            errorMessage += 'Too many failed attempts. Please wait a bit and try again.';
        } else if (error.code === 'auth/network-request-failed') {
            errorMessage += 'Network error. Check your internet connection.';
        } else {
            errorMessage += error.message;
        }

        passwordError.textContent = errorMessage;
        passwordError.style.background = 'rgba(220, 38, 38, 0.2)';
        passwordError.style.borderColor = '#dc2626';
        passwordError.style.color = '#fca5a5';
        passwordError.classList.add('show');
        passwordInput.value = '';
        passwordInput.focus();

        // Don't auto-hide error for auth failures
    }
}

function handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
        // Release wake lock
        releaseWakeLock();
        
        // Sign out from Firebase (this also discards the persisted session)
        if (window.firebaseAuth && window.firebaseAuth.currentUser) {
            window.firebaseAuth.signOut().catch(err => console.error('Sign out error:', err));
        }

        clearLegacyAuthTokens();
        isAuthenticated = false;
        location.reload(); // Reload page to show password prompt
    }
}

function waitForFirebase(timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const checkFirebase = setInterval(() => {
            if (window.firebaseDB && window.firebaseAuth && window.firebaseSignIn) {
                clearInterval(checkFirebase);
                isFirebaseReady = true;
                resolve();
            } else if (Date.now() - start > timeoutMs) {
                clearInterval(checkFirebase);
                reject(new Error('Firebase SDK failed to load. Check your internet connection and refresh.'));
            }
        }, 100);
    });
}

async function initializeApp() {
    // Load device-specific theme and vision mode BEFORE Firebase loads
    const savedTheme = localStorage.getItem('dndTheme') || 'dark';
    currentTheme = savedTheme;
    setTheme(currentTheme);
    
    const savedVisionMode = localStorage.getItem('dndVisionMode') || 'normal';
    currentVisionMode = savedVisionMode;
    setVisionMode(currentVisionMode);
    
    await waitForFirebase();
    
    // Load all campaigns
    await loadCampaignList();
    
    // Get last used campaign or create default
    const lastCampaignId = localStorage.getItem('lastCampaignId');
    if (lastCampaignId && campaigns[lastCampaignId]) {
        currentCampaignId = lastCampaignId;
    } else if (Object.keys(campaigns).length > 0) {
        // Use first available campaign
        currentCampaignId = Object.keys(campaigns)[0];
    } else {
        // Create default campaign
        await createCampaign('Default Campaign');
    }
    
    // Update dropdown and load campaign data
    updateCampaignDropdown();
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
    attachEventListeners();
}

// ============================================================================
// APPLICATION INITIALIZATION
// ============================================================================

async function init() {
    // Attach password modal event listeners immediately (before Firebase is ready)
    passwordForm.addEventListener('submit', handlePasswordSubmit);
    
    // Toggle password visibility
    if (togglePasswordBtn) {
        togglePasswordBtn.addEventListener('click', togglePasswordVisibility);
    }
    
    // Attach hamburger menu listener immediately (needed for mobile before auth)
    const menuToggle = document.getElementById('menuToggle');
    if (menuToggle) {
        menuToggle.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent immediate closing
            const mobileMenu = document.getElementById('mobileMenu');
            if (mobileMenu) mobileMenu.classList.toggle('active');
        });
    }
    
    // Close mobile menu when clicking outside
    document.addEventListener('click', (e) => {
        const mobileMenu = document.getElementById('mobileMenu');
        if (mobileMenu && !mobileMenu.contains(e.target)) {
            mobileMenu.classList.remove('active');
        }
    });
    
    // Firebase Auth persists sessions itself ("Remember Me" → local
    // persistence). Wait for it to restore any saved session before deciding
    // whether to prompt for the password.
    clearLegacyAuthTokens();
    try {
        await waitForFirebase();
        const user = await new Promise((resolve) => {
            const unsubscribe = window.firebaseOnAuthStateChanged(window.firebaseAuth, (u) => {
                unsubscribe();
                resolve(u);
            });
        });
        if (user && !user.isAnonymous) {
            console.log('✅ Restored Firebase session:', user.uid);
            isAuthenticated = true;
            await initializeApp();
        } else {
            if (user) {
                // Leftover anonymous session from the old auth scheme - it
                // doesn't prove knowledge of the password, so discard it
                console.log('Discarding legacy anonymous session');
                await window.firebaseAuth.signOut().catch(() => {});
            }
            console.log('❌ No saved session, showing password modal');
            showPasswordModal();
        }
    } catch (error) {
        console.error('❌ Session restore failed:', error);
        // Password submit re-checks Firebase readiness and surfaces its own
        // error if the SDK failed to load
        showPasswordModal();
    }
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function attachEventListeners() {
    // Note: Password form listeners are now attached in init() before Firebase loads
    
    // Logout button
    logoutBtn.addEventListener('click', () => {
        handleLogout();
        // Close mobile menu if open
        const mobileMenu = document.getElementById('mobileMenu');
        if (mobileMenu) mobileMenu.classList.remove('active');
    });
    
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
            // Removal doesn't change anyone's roll - just re-render and sync
            renderCombatantLists();
            renderInitiativeOrder();
            saveToFirebase();
        }
    });

    viewHistoryBtn.addEventListener('click', () => {
        showHistoryModal();
        // Close mobile menu if open
        const mobileMenu = document.getElementById('mobileMenu');
        if (mobileMenu) mobileMenu.classList.remove('active');
    });

    const managePartyBtn = document.getElementById('managePartyBtn');
    if (managePartyBtn) {
        managePartyBtn.addEventListener('click', () => {
            showManagePartyModal();
            // Close mobile menu if open
            const mobileMenu = document.getElementById('mobileMenu');
            if (mobileMenu) mobileMenu.classList.remove('active');
        });
    }

    manageCampaignsBtn.addEventListener('click', () => {
        showCampaignModal();
        // Close mobile menu if open
        const mobileMenu = document.getElementById('mobileMenu');
        if (mobileMenu) mobileMenu.classList.remove('active');
    });

    // Note: Hamburger menu listeners are now attached in init() before Firebase loads

    campaignDropdown.addEventListener('change', (e) => {
        const selectedCampaignId = e.target.value;
        if (selectedCampaignId && selectedCampaignId !== currentCampaignId) {
            switchCampaign(selectedCampaignId);
        }
    });

    createCampaignForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const nameInput = document.getElementById('newCampaignName');
        const campaignName = nameInput.value.trim();
        if (campaignName) {
            createCampaign(campaignName);
            nameInput.value = '';
        }
    });

    editCampaignForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const campaignId = document.getElementById('editCampaignId').value;
        const newName = document.getElementById('editCampaignName').value.trim();
        if (newName && campaignId) {
            renameCampaign(campaignId, newName);
        }
    });

    lightThemeBtn.addEventListener('click', () => {
        setTheme('light');
    });

    darkThemeBtn.addEventListener('click', () => {
        setTheme('dark');
    });

    // Colorblind mode selection
    if (colorblindModeSelect) {
        colorblindModeSelect.addEventListener('change', (e) => {
            setVisionMode(e.target.value);
        });
    }

    addCombatantForm.addEventListener('submit', (e) => {
        e.preventDefault();
        addCombatant();
    });

    const openAddPartyDialogBtn = document.getElementById('openAddPartyDialogBtn');
    if (openAddPartyDialogBtn) {
        openAddPartyDialogBtn.addEventListener('click', () => {
            showAddEditPartyModal();
        });
    }

    const addEditPartyForm = document.getElementById('addEditPartyForm');
    if (addEditPartyForm) {
        addEditPartyForm.addEventListener('submit', (e) => {
            e.preventDefault();
            savePartyMember();
        });
    }
    
    // Listen for window resize and orientation changes to recalculate initiative order sizing
    let resizeTimer;
    
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (combatants.length > 0) {
                renderInitiativeOrder();
            }
        }, 300);
    });
    
    window.addEventListener('orientationchange', () => {
        setTimeout(() => {
            if (combatants.length > 0) {
                renderInitiativeOrder();
            }
        }, 500);
    });
}

// ============================================================================
// COMBATANT MANAGEMENT
// ============================================================================

function addCombatant() {
    const nameInput = document.getElementById('combatantName');
    const dexInput = document.getElementById('combatantDex');
    const modifierInput = document.getElementById('combatantModifier');

    const name = nameInput.value.trim();
    const dex = parseInt(dexInput.value) || 0;
    const modifier = parseInt(modifierInput.value) || 0;
    const type = 'enemy'; // Always enemy from main form

    if (!name) {
        alert('Please enter a name');
        return;
    }

    const advantageSelect = document.getElementById('combatantAdvantage');
    const advantage = advantageSelect.value;

    const newCombatant = {
        id: newId(),
        name: name,
        dex: dex,
        modifier: modifier,
        type: type,
        advantage: advantage,
        lucky: null,
        luckyReroll: null,
        luckyUsed: false,
        initiative: 0,
        manualOrder: null,
        wasMoved: false,
        moveDirection: null,
        originalIndex: null
    };

    combatants.push(newCombatant);
    rollNewCombatant(newCombatant); // Only the newcomer rolls - existing initiative stands

    // Clear form
    nameInput.value = '';
    dexInput.value = '0';
    modifierInput.value = '0';
    advantageSelect.value = 'normal';

    renderCombatantLists();
    renderInitiativeOrder();
    saveToFirebase();
}

function removeCombatant(id) {
    combatants = combatants.filter(c => c.id !== id);
    // Removal doesn't change anyone's roll - just re-render and sync
    renderCombatantLists();
    renderInitiativeOrder();
    saveToFirebase();
}

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

    rollNewCombatant(combatant); // Re-roll only this combatant with the new roll type
    renderCombatantLists();
    renderInitiativeOrder();
    saveToFirebase();
}

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
        id: newId(),
        name: newName,
        dex: combatant.dex || 0,
        modifier: combatant.modifier || 0,
        type: combatant.type,
        advantage: combatant.advantage,
        lucky: null,
        luckyReroll: null,
        luckyUsed: false,
        initiative: 0,
        manualOrder: null,
        wasMoved: false,
        moveDirection: null,
        originalIndex: null
    };

    combatants.push(duplicate);
    rollNewCombatant(duplicate); // Only the copy rolls - existing initiative stands
    renderCombatantLists();
    renderInitiativeOrder();
    saveToFirebase();
}

// ============================================================================
// INITIATIVE ROLLING & HISTORY
// ============================================================================

function rollD20() {
    return Math.floor(Math.random() * 20) + 1;
}

// Roll the d20(s) for a given roll type. Returns the effective roll plus all
// dice rolled (two entries for advantage/disadvantage).
function rollInitiativeDice(advantage) {
    if (advantage === 'advantage' || advantage === 'disadvantage') {
        const roll1 = rollD20();
        const roll2 = rollD20();
        const roll = advantage === 'advantage' ? Math.max(roll1, roll2) : Math.min(roll1, roll2);
        return { roll, rolls: [roll1, roll2] };
    }
    const roll = rollD20();
    return { roll, rolls: [roll] };
}

// Lucky (Halfling racial or Lucky feat) reroll of a natural 1. Per RAW only the
// die that came up 1 is rerolled - with advantage/disadvantage the other die is
// kept and the max/min re-applied. Assumes the current effective roll is 1.
function rerollNatOneDie(advantage, rolls) {
    const newDie = rollD20();
    if (advantage === 'advantage') {
        // Effective roll was 1, so both dice were 1s - reroll one of them
        return { roll: Math.max(newDie, 1), rolls: [newDie, 1] };
    }
    if (advantage === 'disadvantage') {
        // Keep the die that wasn't the 1 (or 1 again if both were 1s)
        const otherDie = Math.max(...rolls);
        return { roll: Math.min(newDie, otherDie), rolls: [newDie, otherDie] };
    }
    return { roll: newDie, rolls: [1, newDie] }; // Show original 1 alongside the reroll
}

// Roll initiative for one combatant: dice, Halfling Lucky auto-reroll, and all
// derived fields. Does NOT touch manual ordering - callers decide that.
function rollSingleInitiative(combatant) {
    const { roll: firstRoll, rolls } = rollInitiativeDice(combatant.advantage);
    let roll = firstRoll;
    combatant.rolls = rolls;

    let luckyReroll = null;
    if (combatant.lucky === 'halfling' && roll === 1) {
        luckyReroll = 1; // Store the original 1 for the Lucky indicator
        const rerolled = rerollNatOneDie(combatant.advantage, rolls);
        roll = rerolled.roll;
        combatant.rolls = rerolled.rolls;
    }

    const dex = combatant.dex || 0;
    const modifier = combatant.modifier || 0;
    const initiativeBonus = dex + modifier;

    combatant.initiative = roll + initiativeBonus;
    combatant.baseRoll = roll;
    combatant.initiativeBonus = initiativeBonus; // Store for display
    combatant.luckyReroll = luckyReroll;
    combatant.luckyUsed = false; // Reset Lucky - F usage for the new roll
}

// Ordering by roll alone: initiative, then dex, then player types before enemies
function rolledOrderComparator(a, b) {
    if (a.initiative !== b.initiative) {
        return b.initiative - a.initiative; // Higher initiative goes first
    }

    const aDex = a.dex || 0;
    const bDex = b.dex || 0;
    if (aDex !== bDex) {
        return bDex - aDex; // Higher dex goes first
    }

    const typeOrder = { party: 0, friendly: 1, enemy: 2 };
    return (typeOrder[a.type] ?? 2) - (typeOrder[b.type] ?? 2); // Players before enemies
}

// Sort used everywhere an initiative order is displayed or compared:
// manual order first, then the rolled order
function initiativeComparator(a, b) {
    if (a.manualOrder !== null && b.manualOrder !== null) {
        return a.manualOrder - b.manualOrder;
    }
    if (a.manualOrder !== null) return -1;
    if (b.manualOrder !== null) return 1;
    return rolledOrderComparator(a, b);
}

// After a combatant's roll changes (Lucky reroll, edit, new arrival), slot it
// into the position its new initiative deserves. Without manual ordering the
// display sort already handles that; when the DM has dragged cards (everyone
// pinned by manualOrder), insert by initiative into the curated order and renumber.
function repositionCombatant(combatant) {
    const others = combatants.filter(c => c !== combatant);
    if (!others.some(c => c.manualOrder !== null)) {
        combatant.manualOrder = null;
        return;
    }

    others.sort(initiativeComparator);
    let insertAt = others.findIndex(other => rolledOrderComparator(combatant, other) < 0);
    if (insertAt === -1) insertAt = others.length;
    others.splice(insertAt, 0, combatant);
    others.forEach((c, idx) => {
        c.manualOrder = idx;
    });

    // This placement came from the dice, not a drag
    combatant.wasMoved = false;
    combatant.moveDirection = null;
}

function rollAllInitiative() {
    combatants.forEach(combatant => {
        rollSingleInitiative(combatant);
        combatant.manualOrder = null; // Reset manual ordering on a full re-roll
        combatant.wasMoved = false;
        combatant.moveDirection = null;
        combatant.originalIndex = null;
    });

    // After rolling, set original indices based on displayed order
    const sorted = [...combatants].sort(initiativeComparator);
    sorted.forEach((combatant, index) => {
        combatant.originalIndex = index;
    });

    // Save to history
    saveToHistory();

    renderInitiativeOrder();
}

// Roll initiative for a combatant that was just added (or whose stats changed)
// without disturbing everyone else's rolls or the DM's manual ordering.
function rollNewCombatant(combatant) {
    rollSingleInitiative(combatant);
    repositionCombatant(combatant);

    const sorted = [...combatants].sort(initiativeComparator);
    combatant.originalIndex = sorted.indexOf(combatant);
}

function buildHistorySnapshot() {
    return {
        round: currentRound,
        timestamp: new Date().toLocaleString(),
        combatants: combatants.map(c => ({
            name: c.name,
            type: c.type,
            dex: c.dex ?? 0,
            modifier: c.modifier ?? 0,
            initiative: c.initiative,
            baseRoll: c.baseRoll,
            advantage: c.advantage,
            rolls: c.rolls,
            lucky: c.lucky ?? null,
            luckyReroll: c.luckyReroll ?? null,
            luckyUsed: c.luckyUsed ?? false,
            manualOrder: c.manualOrder ?? null,
            wasMoved: c.wasMoved ?? false,
            moveDirection: c.moveDirection ?? null
        }))
    };
}

function saveToHistory() {
    if (combatants.length === 0) return;

    initiativeHistory.push(buildHistorySnapshot());

    // Keep only last 20 entries
    if (initiativeHistory.length > 20) {
        initiativeHistory.shift();
    }
}

// Amend the latest history entry when the current round's order changes after
// the roll (drag reorder, Lucky feat) instead of pushing a duplicate entry
function updateHistoryForCurrentRound() {
    if (combatants.length === 0) return;

    const last = initiativeHistory[initiativeHistory.length - 1];
    if (last && last.round === currentRound) {
        initiativeHistory[initiativeHistory.length - 1] = buildHistorySnapshot();
    } else {
        saveToHistory();
    }
}

// ============================================================================
// UI RENDERING
// ============================================================================

function renderInitiativeOrder() {
    if (combatants.length === 0) {
        initiativeOrderDiv.innerHTML = '<p class="empty-state">Add combatants to start rolling initiative!</p>';
        return;
    }

    // Sort by manual order first, then by initiative with tiebreakers
    const sorted = [...combatants].sort(initiativeComparator);

    initiativeOrderDiv.innerHTML = sorted.map((combatant, index) => {
        const dex = combatant.dex || 0;
        const modifier = combatant.modifier || 0;

        let rollDisplay = '';
        if (combatant.luckyReroll !== null && combatant.luckyReroll !== undefined) {
            // Lucky was used (either Halfling or Feat)
            const luckyType = combatant.lucky === 'halfling' ? 'Lucky (Halfling)' : 'Lucky (Feat)';
            rollDisplay = `<span class="lucky-halfling-indicator" title="${luckyType} activated">${luckyType}: ${combatant.luckyReroll} → ${combatant.baseRoll}</span> + ${dex} dex + ${modifier} mod`;
        } else if (combatant.advantage === 'advantage') {
            rollDisplay = `[${combatant.rolls.join(', ')}] ${combatant.baseRoll} roll + ${dex} dex + ${modifier} mod`;
        } else if (combatant.advantage === 'disadvantage') {
            rollDisplay = `[${combatant.rolls.join(', ')}] ${combatant.baseRoll} roll + ${dex} dex + ${modifier} mod`;
        } else {
            rollDisplay = `${combatant.baseRoll} roll + ${dex} dex + ${modifier} mod`;
        }
        
        const movedIndicator = combatant.wasMoved ? 
            `<span class="moved-indicator" title="Manually moved ${combatant.moveDirection}">${combatant.moveDirection === 'down' ? '↓' : '↑'}</span>` : '';
        
        // Lucky - F reroll button (only for party/friendly with Lucky - F who rolled a 1 and haven't used it)
        const showLuckyFeatButton = (combatant.type === 'party' || combatant.type === 'friendly') && 
                                     combatant.lucky === 'feat' && 
                                     combatant.baseRoll === 1 && 
                                     !combatant.luckyUsed;
        const luckyFeatButton = showLuckyFeatButton ?
            `<button class="btn-lucky-reroll" 
                     onclick="rerollLuckyFeat(${combatant.id})" 
                     title="Use Lucky feat to reroll">
                🍀 Lucky
            </button>` : '';
        
        return `
            <div class="initiative-item ${combatant.type}" draggable="true" data-id="${combatant.id}" data-index="${index}">
                <div class="drag-handle" title="Drag to reorder">⋮⋮</div>
                <div class="initiative-info">
                    <div class="initiative-roll">${combatant.initiative}${movedIndicator}</div>
                    <div class="initiative-details">
                        <span class="combatant-name">${escapeHtml(combatant.name)}</span>
                        <span class="combatant-modifier">${rollDisplay}</span>
                    </div>
                </div>
                <div class="initiative-actions">
                    ${luckyFeatButton}
                    <span class="combatant-type ${combatant.type}">${combatant.type}</span>
                </div>
            </div>
        `;
    }).join('');
    
    // Attach drag and drop event listeners
    attachDragListeners();
    
    // Apply dynamic sizing - use setTimeout to ensure DOM is completely settled
    setTimeout(() => {
        adjustInitiativeOrderSize();
    }, 0);
}

let isReAdjusting = false; // Prevent infinite re-adjustment loop

function adjustInitiativeOrderSize() {
    const container = initiativeOrderDiv;
    const itemCount = combatants.length;
    
    // Create comprehensive diagnostic object (only if debugging enabled)
    let diagnostics = null;
    if (DEBUG_FLAGS.SCALING) {
        diagnostics = {
            timestamp: new Date().toISOString(),
            trigger: 'adjustInitiativeOrderSize called',
            timeSinceLastAdjustment: Date.now() - lastAdjustmentTime,
            flags: {
                isAdjustingSize,
                hasPendingAdjustment: !!pendingAdjustment,
                isUpdatingFromFirebase
            },
            viewport: {
                windowWidth: window.innerWidth,
                windowHeight: window.innerHeight,
                isMobile: window.innerWidth <= 768
            },
            container: {
                clientHeight: container.clientHeight,
                scrollHeight: container.scrollHeight,
                offsetHeight: container.offsetHeight
            },
            combatants: {
                count: itemCount,
                types: combatants.map(c => c.type)
            }
        };
    }
    
    // Prevent multiple rapid calls (debounce 500ms)
    const now = Date.now();
    if (now - lastAdjustmentTime < 500) {
        if (DEBUG_FLAGS.SCALING) {
            diagnostics.action = 'SKIPPED - too soon after last adjustment';
            console.log('📊 DIAGNOSTICS:', JSON.stringify(diagnostics, null, 2));
        }
        return;
    }
    lastAdjustmentTime = now;
    
    // Cancel any pending adjustment and reset flag
    if (pendingAdjustment) {
        cancelAnimationFrame(pendingAdjustment);
        pendingAdjustment = null;
        isAdjustingSize = false;
        if (DEBUG_FLAGS.SCALING) diagnostics.action = 'Cancelled pending adjustment';
    }
    
    // If already adjusting, skip
    if (isAdjustingSize) {
        if (DEBUG_FLAGS.SCALING) {
            diagnostics.action = 'SKIPPED - already adjusting';
            console.log('📊 DIAGNOSTICS:', JSON.stringify(diagnostics, null, 2));
        }
        return;
    }
    
    if (itemCount === 0) {
        container.style.setProperty('--item-gap', '12px');
        container.style.setProperty('--item-padding', '20px');
        container.style.setProperty('--item-min-height', '70px');
        container.style.setProperty('--name-size', '2.2em');
        container.style.setProperty('--roll-size', '3.0em');
        container.style.setProperty('--modifier-size', '1.3em');
        container.style.setProperty('--type-size', '1.1em');
        container.style.setProperty('--drag-size', '1.5em');
        return;
    }
    
    isAdjustingSize = true;
    if (DEBUG_FLAGS.SCALING) diagnostics.action = 'PROCESSING';
    
    const windowWidth = window.innerWidth;
    const isMobile = windowWidth <= 768;
    
    // Calculate responsive base values
    let baseGap, basePadding, baseMinHeight, baseNameSize, baseRollSize, baseModifierSize, baseTypeSize, baseDragSize;
    
    if (isMobile) {
        baseGap = 8;
        basePadding = 12;
        baseMinHeight = 50;
        baseNameSize = 1.5;
        baseRollSize = 2.2;
        baseModifierSize = 1.0;
        baseTypeSize = 0.85;
        baseDragSize = 1.2;
    } else {
        baseGap = 12;
        basePadding = 20;
        baseMinHeight = 70;
        baseNameSize = 2.2;
        baseRollSize = 3.0;
        baseModifierSize = 1.3;
        baseTypeSize = 1.1;
        baseDragSize = 1.5;
    }
    
    if (DEBUG_FLAGS.SCALING) {
        diagnostics.baseValues = {
            baseGap, basePadding, baseMinHeight, 
            baseNameSize, baseRollSize, baseModifierSize, 
            baseTypeSize, baseDragSize
        };
        
        // Get current CSS variable values BEFORE setting new ones
        const computedStyle = getComputedStyle(container);
        diagnostics.cssVariablesBefore = {
            gap: computedStyle.getPropertyValue('--item-gap'),
            padding: computedStyle.getPropertyValue('--item-padding'),
            minHeight: computedStyle.getPropertyValue('--item-min-height'),
            nameSize: computedStyle.getPropertyValue('--name-size'),
            rollSize: computedStyle.getPropertyValue('--roll-size')
        };
    }
    
    // Set base values first
    container.style.setProperty('--item-gap', baseGap + 'px');
    container.style.setProperty('--item-padding', basePadding + 'px');
    container.style.setProperty('--item-min-height', baseMinHeight + 'px');
    container.style.setProperty('--name-size', baseNameSize + 'em');
    container.style.setProperty('--roll-size', baseRollSize + 'em');
    container.style.setProperty('--modifier-size', baseModifierSize + 'em');
    container.style.setProperty('--type-size', baseTypeSize + 'em');
    container.style.setProperty('--drag-size', baseDragSize + 'em');
    
    if (DEBUG_FLAGS.SCALING) {
        // Get CSS variables AFTER setting to verify they took effect
        const computedAfterSet = getComputedStyle(container);
        diagnostics.cssVariablesAfterSet = {
            gap: computedAfterSet.getPropertyValue('--item-gap'),
            padding: computedAfterSet.getPropertyValue('--item-padding'),
            minHeight: computedAfterSet.getPropertyValue('--item-min-height'),
            nameSize: computedAfterSet.getPropertyValue('--name-size'),
            rollSize: computedAfterSet.getPropertyValue('--roll-size')
        };
    }

    
    // CRITICAL: Force immediate DOM update by hiding and showing container
    // This ensures items re-render with new CSS variables
    const originalDisplay = container.style.display;
    container.style.display = 'none';
    void container.offsetHeight; // Force reflow
    container.style.display = originalDisplay;
    
    // Now use triple RAF to ensure rendering is complete AFTER forced re-render
    pendingAdjustment = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                // Force another reflow
                void container.offsetHeight;
        
                // Get all initiative items
                const items = container.querySelectorAll('.initiative-item');
        
                if (DEBUG_FLAGS.SCALING) {
                    diagnostics.measurement = {
                        itemsFound: items.length,
                        itemHeights: Array.from(items).map(item => item.offsetHeight),
                        containerHeightAtMeasurement: container.clientHeight
                    };
                }
        
                if (items.length === 0) {
                    if (DEBUG_FLAGS.SCALING) {
                        diagnostics.result = 'NO ITEMS FOUND';
                        console.log('📊 FINAL DIAGNOSTICS:', JSON.stringify(diagnostics, null, 2));
                    }
                    console.log('⚠️ No items found to scale');
                    isAdjustingSize = false;
                    pendingAdjustment = null;
                    return;
                }
        
                // Calculate actual total height needed
                // Use the MAXIMUM item height and assume all items will be that height
                // This handles the case where bottom items haven't updated with new CSS variables yet
                const maxItemHeight = Math.max(...Array.from(items).map(item => item.offsetHeight));
                const totalItemsHeight = maxItemHeight * items.length;
        
                // Add gaps between items
                const currentGap = parseInt(getComputedStyle(container).gap) || baseGap;
                const totalGapsHeight = currentGap * (items.length - 1);
                const contentHeight = totalItemsHeight + totalGapsHeight;
                const containerHeight = container.clientHeight;
        
                if (DEBUG_FLAGS.SCALING) {
                    diagnostics.calculation = {
                        maxItemHeight,
                        totalItemsHeight,
                        currentGap,
                        totalGapsHeight,
                        contentHeight,
                        containerHeight,
                        needsScaling: contentHeight > containerHeight,
                        contentFitsWithin: contentHeight <= containerHeight ? 'YES' : 'NO'
                    };
                }
        
                // If content fits, we're done
                if (contentHeight <= containerHeight) {
                    if (DEBUG_FLAGS.SCALING) {
                        diagnostics.result = 'CONTENT FITS - No scaling needed';
                        diagnostics.scaleFactor = 1.0;
                        console.log('📊 FINAL DIAGNOSTICS:', JSON.stringify(diagnostics, null, 2));
                    }
                    console.log('✅ Content fits - no scaling needed');
                    isAdjustingSize = false;
                    pendingAdjustment = null;
                    return;
                }
        
                // Calculate scale factor - need to fit within 95% of container to avoid scrollbar
                const targetHeight = containerHeight * 0.95;
                const scaleFactor = Math.max(0.3, targetHeight / contentHeight);
        
                if (DEBUG_FLAGS.SCALING) {
                    diagnostics.scaling = {
                        targetHeight,
                        targetPercentage: 0.95,
                        scaleFactor,
                        scaledGap: Math.max(1, Math.round(baseGap * scaleFactor)),
                        scaledPadding: Math.max(3, Math.round(basePadding * scaleFactor)),
                        scaledMinHeight: Math.max(25, Math.round(baseMinHeight * scaleFactor)),
                        scaledNameSize: Math.max(0.6, baseNameSize * scaleFactor),
                        scaledRollSize: Math.max(0.8, baseRollSize * scaleFactor)
                    };
                    
                    console.log('📐 Scaling:', { 
                        targetHeight, 
                        scaleFactor,
                        willScale: true,
                        baseValues: { baseGap, basePadding, baseMinHeight }
                    });
                }
                // Apply scaled values directly from BASE values (not current values)
                const gap = Math.max(1, Math.round(baseGap * scaleFactor));
                const padding = Math.max(3, Math.round(basePadding * scaleFactor));
                const minHeight = Math.max(25, Math.round(baseMinHeight * scaleFactor));
        
                container.style.setProperty('--item-gap', gap + 'px');
                container.style.setProperty('--item-padding', padding + 'px');
                container.style.setProperty('--item-min-height', minHeight + 'px');
                container.style.setProperty('--name-size', Math.max(0.6, baseNameSize * scaleFactor) + 'em');
                container.style.setProperty('--roll-size', Math.max(0.8, baseRollSize * scaleFactor) + 'em');
                container.style.setProperty('--modifier-size', Math.max(0.5, baseModifierSize * scaleFactor) + 'em');
                container.style.setProperty('--type-size', Math.max(0.4, baseTypeSize * scaleFactor) + 'em');
                container.style.setProperty('--drag-size', Math.max(0.5, baseDragSize * scaleFactor) + 'em');
        
                if (DEBUG_FLAGS.SCALING) {
                    diagnostics.result = 'SCALED';
                    console.log('📊 FINAL DIAGNOSTICS:', JSON.stringify(diagnostics, null, 2));
                    console.log('✅ Scaling applied');
                }
                
                isAdjustingSize = false;
                pendingAdjustment = null;
            });
        });
    });
}

function combatantCardHtml(combatant) {
    const isEnemy = combatant.type === 'enemy';

    let advantageText = 'Normal';
    let advantageClass = 'adv-normal';
    if (combatant.advantage === 'advantage') {
        advantageText = isEnemy ? 'ADV' : 'Advantage';
        advantageClass = 'adv-advantage';
    }
    if (combatant.advantage === 'disadvantage') {
        advantageText = isEnemy ? 'DIS' : 'Disadvantage';
        advantageClass = 'adv-disadvantage';
    }

    const dex = combatant.dex || 0;
    const modifier = combatant.modifier || 0;
    const bonus = dex + modifier;
    const bonusSign = bonus >= 0 ? '+' : '';
    const modSign = modifier >= 0 ? '+' : '';

    // Lucky indicator (party/friendly only)
    let luckyBadge = '';
    if (!isEnemy && combatant.lucky === 'halfling') {
        luckyBadge = ' <span class="lucky-badge halfling" title="Lucky (Halfling): Auto-reroll 1s">🍀 Lucky-H</span>';
    } else if (!isEnemy && combatant.lucky === 'feat') {
        luckyBadge = ' <span class="lucky-badge feat" title="Lucky (Feat): Manual reroll">🍀 Lucky-F</span>';
    }

    const advantageLine = isEnemy ? '' :
        `<div class="combatant-card-advantage ${advantageClass}">${advantageText}</div>`;

    const actions = isEnemy ? `
                        <button class="btn-copy" onclick="duplicateCombatant(${combatant.id})" title="Duplicate this enemy">Copy</button>
                        <button class="btn-advantage ${advantageClass}" onclick="toggleAdvantage(${combatant.id})" title="Toggle Advantage/Disadvantage">${advantageText}</button>
                        <button class="btn-remove" onclick="removeCombatant(${combatant.id})" title="Remove">✖</button>` : `
                        <button class="btn-edit" onclick="editPartyMember(${combatant.id})" title="Edit">✏️</button>
                        <button class="btn-remove" onclick="removeCombatant(${combatant.id})" title="Remove">✖</button>`;

    return `
        <div class="combatant-card ${combatant.type}">
            <div class="combatant-card-info">
                <div class="combatant-card-name">${escapeHtml(combatant.name)}${luckyBadge}</div>
                <div class="combatant-card-details">Initiative: <strong>${bonusSign}${bonus}</strong> (${dex} dex ${modSign}${modifier} mod)</div>
                ${advantageLine}
            </div>
            <div class="combatant-actions">${actions}
            </div>
        </div>
    `;
}

function renderCombatantLists() {
    const sections = [
        { div: partyListDiv, type: 'party', emptyText: 'No party members added' },
        { div: enemyListDiv, type: 'enemy', emptyText: 'No enemies added' },
        { div: friendlyListDiv, type: 'friendly', emptyText: 'No friendlies added' }
    ];

    sections.forEach(({ div, type, emptyText }) => {
        const list = combatants.filter(c => c.type === type);
        div.innerHTML = list.length === 0
            ? `<p class="empty-state-small">${emptyText}</p>`
            : list.map(combatantCardHtml).join('');
    });
}

// ============================================================================
// DRAG AND DROP
// ============================================================================

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

    // Ignore drags that didn't start on an initiative card (dragged text,
    // links, or files) - appendChild(null) below would throw otherwise
    if (!draggedElement) return false;

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

function handleDrop(e) {
    if (e.preventDefault) {
        e.preventDefault(); // Stop the browser navigating when a link/file is dropped
    }
    if (e.stopPropagation) {
        e.stopPropagation();
    }

    // Nothing of ours is being dragged - ignore the drop
    if (!draggedId) return false;

    // Get all initiative items in their current DOM order
    const items = [...initiativeOrderDiv.querySelectorAll('.initiative-item')];
    const newOrder = items.map(item => item.dataset.id);

    // Find if the dragged item's position changed (same comparator as the
    // rendered list, so tie-broken positions are judged correctly)
    const sorted = [...combatants].sort(initiativeComparator);

    const oldIndex = sorted.findIndex(c => c.id == draggedId);
    const newIndex = newOrder.findIndex(id => id == draggedId);

    if (oldIndex !== newIndex) {
        // Lock in the new DOM order as the manual order for everyone
        newOrder.forEach((id, idx) => {
            const combatant = combatants.find(c => c.id == id);
            if (combatant) {
                combatant.manualOrder = idx;
            }
        });

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

        // Reflect the reorder in this round's history entry
        updateHistoryForCurrentRound();
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

// ============================================================================
// FIREBASE INTEGRATION
// ============================================================================

function updateRoundDisplay() {
    roundNumberSpan.textContent = currentRound;
}

function saveToFirebase() {
    if (!isFirebaseReady || isUpdatingFromFirebase || !currentCampaignId) return;
    
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
        lastUpdated: Date.now()
    };
    
    // Save to campaign-specific path
    const dbRef = window.firebaseRef(window.firebaseDB, `campaigns/${currentCampaignId}/data`);
    window.firebaseSet(dbRef, data).catch(error => {
        console.error('Error saving to Firebase:', error);
    });
    
    // Update campaign metadata lastUpdated timestamp only (preserve name)
    const metaRef = window.firebaseRef(window.firebaseDB, `campaigns/${currentCampaignId}/meta/lastUpdated`);
    window.firebaseSet(metaRef, Date.now()).catch(error => {
        console.error('Error updating campaign metadata:', error);
    });
}

let campaignDataUnsubscribe = null; // Active onValue listener for the current campaign

function loadFromFirebase() {
    return new Promise((resolve) => {
        if (!currentCampaignId) {
            console.log('No campaign selected');
            resolve();
            return;
        }

        // Detach the previous campaign's listener so switching campaigns doesn't
        // leave a stale listener that clobbers state with the old campaign's data
        if (campaignDataUnsubscribe) {
            campaignDataUnsubscribe();
            campaignDataUnsubscribe = null;
        }

        const dbRef = window.firebaseRef(window.firebaseDB, `campaigns/${currentCampaignId}/data`);

        // Listen for real-time updates
        let firstLoad = true;
        campaignDataUnsubscribe = window.firebaseOnValue(dbRef, (snapshot) => {
            const data = snapshot.val();

            if (data) {
                isUpdatingFromFirebase = true;

                // Convert Firebase object/array to proper array and filter out null/undefined
                let loadedCombatants = data.combatants || [];
                if (typeof loadedCombatants === 'object' && !Array.isArray(loadedCombatants)) {
                    loadedCombatants = Object.values(loadedCombatants);
                }
                
                // Ensure all properties are null instead of undefined
                // Add backward compatibility for old data without 'dex' field
                combatants = loadedCombatants.filter(c => c != null).map(c => ({
                    ...c,
                    dex: c.dex ?? 0, // Default to 0 for old data
                    modifier: c.modifier ?? 0, // Default to 0 if missing
                    advantage: c.advantage ?? 'normal',
                    initiative: c.initiative ?? 0,
                    baseRoll: c.baseRoll ?? 0,
                    // Firebase drops empty arrays; old data may predate 'rolls'.
                    // Without this, rolls.join() in render and Math.max(...rolls)
                    // in the Lucky reroll path throw.
                    rolls: c.rolls ?? (c.baseRoll != null ? [c.baseRoll] : []),
                    lucky: c.lucky ?? null, // Default to null if missing
                    luckyReroll: c.luckyReroll ?? null, // Default to null if missing
                    luckyUsed: c.luckyUsed ?? false, // Default to false if missing
                    manualOrder: c.manualOrder ?? null,
                    wasMoved: c.wasMoved ?? false,
                    moveDirection: c.moveDirection ?? null,
                    originalIndex: c.originalIndex ?? null
                }));

                let loadedHistory = data.initiativeHistory || [];
                if (typeof loadedHistory === 'object' && !Array.isArray(loadedHistory)) {
                    loadedHistory = Object.values(loadedHistory);
                }
                
                // Clean history entries to ensure no undefined values
                // Add backward compatibility for history entries
                initiativeHistory = loadedHistory.filter(h => h != null).map(entry => ({
                    ...entry,
                    combatants: entry.combatants ? entry.combatants.map(c => ({
                        ...c,
                        dex: c.dex ?? 0, // Default to 0 for old data
                        modifier: c.modifier ?? 0, // Default to 0 if missing
                        advantage: c.advantage ?? 'normal',
                        initiative: c.initiative ?? 0,
                        baseRoll: c.baseRoll ?? 0,
                        rolls: c.rolls ?? (c.baseRoll != null ? [c.baseRoll] : []),
                        manualOrder: c.manualOrder ?? null,
                        wasMoved: c.wasMoved ?? false,
                        moveDirection: c.moveDirection ?? null
                    })) : []
                }));
                
                currentRound = data.currentRound || 1;
                
                // Don't change theme on Firebase updates - it's device-specific
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

// ============================================================================
// PARTY MANAGEMENT
// ============================================================================

function showManagePartyModal() {
    const modal = document.getElementById('managePartyModal');
    updateThemeButtons();
    renderCombatantLists();
    
    // Update campaign name in header
    const campaignNameSpan = document.getElementById('managePartyCampaignName');
    if (campaignNameSpan && currentCampaignId && campaigns[currentCampaignId]) {
        campaignNameSpan.textContent = `- ${campaigns[currentCampaignId].name}`;
    }
    
    modal.style.display = 'flex';
}

function closeManagePartyModal() {
    const modal = document.getElementById('managePartyModal');
    modal.style.display = 'none';
}

function showAddEditPartyModal(combatantId = null) {
    const modal = document.getElementById('addEditPartyModal');
    const title = document.getElementById('addEditPartyTitle');
    const editIdField = document.getElementById('editPartyId');
    const nameInput = document.getElementById('partyMemberName');
    const dexInput = document.getElementById('partyMemberDex');
    const modifierInput = document.getElementById('partyMemberModifier');
    const typeSelect = document.getElementById('partyMemberType');
    const advantageSelect = document.getElementById('partyMemberAdvantage');
    const luckySelect = document.getElementById('partyMemberLucky');
    const saveBtn = document.getElementById('savePartyMemberBtn');
    
    if (combatantId) {
        // Edit mode
        const combatant = combatants.find(c => c.id === combatantId);
        if (!combatant) return;
        
        title.textContent = 'Edit Party / Ally';
        editIdField.value = combatantId;
        nameInput.value = combatant.name;
        dexInput.value = combatant.dex || 0;
        modifierInput.value = combatant.modifier || 0;
        typeSelect.value = combatant.type;
        advantageSelect.value = combatant.advantage || 'normal';
        luckySelect.value = combatant.lucky || 'none';
        saveBtn.textContent = 'Update';
    } else {
        // Add mode
        title.textContent = 'Add Party / Ally';
        editIdField.value = '';
        nameInput.value = '';
        dexInput.value = '0';
        modifierInput.value = '0';
        typeSelect.value = 'party';
        advantageSelect.value = 'normal';
        luckySelect.value = 'none';
        saveBtn.textContent = 'Add';
    }
    
    modal.style.display = 'flex';
    nameInput.focus();
}

function closeAddEditPartyModal() {
    const modal = document.getElementById('addEditPartyModal');
    modal.style.display = 'none';
}

function savePartyMember() {
    const editId = document.getElementById('editPartyId').value;
    const name = document.getElementById('partyMemberName').value.trim();
    const dex = parseInt(document.getElementById('partyMemberDex').value) || 0;
    const modifier = parseInt(document.getElementById('partyMemberModifier').value) || 0;
    const type = document.getElementById('partyMemberType').value;
    const advantage = document.getElementById('partyMemberAdvantage').value;
    const lucky = document.getElementById('partyMemberLucky').value;
    
    if (!name) {
        alert('Please enter a name');
        return;
    }
    
    if (editId) {
        // Update existing combatant and re-roll only them (their roll type or
        // bonuses may have changed) - everyone else's initiative stands
        const combatant = combatants.find(c => c.id == editId);
        if (combatant) {
            combatant.name = name;
            combatant.dex = dex;
            combatant.modifier = modifier;
            combatant.type = type;
            combatant.advantage = advantage;
            combatant.lucky = lucky === 'none' ? null : lucky;
            rollNewCombatant(combatant);
        }
    } else {
        // Add new combatant
        const newCombatant = {
            id: newId(),
            name: name,
            dex: dex,
            modifier: modifier,
            type: type,
            advantage: advantage,
            lucky: lucky === 'none' ? null : lucky,
            luckyReroll: null,
            luckyUsed: false,
            initiative: 0,
            manualOrder: null,
            wasMoved: false,
            moveDirection: null,
            originalIndex: null
        };
        combatants.push(newCombatant);
        rollNewCombatant(newCombatant);
    }

    renderCombatantLists();
    renderInitiativeOrder();
    saveToFirebase();
    closeAddEditPartyModal();
}

function editPartyMember(id) {
    showAddEditPartyModal(id);
}

// ============================================================================
// LUCKY FEAT REROLL
// ============================================================================

function rerollLuckyFeat(id) {
    const combatant = combatants.find(c => c.id === id);
    if (!combatant || combatant.lucky !== 'feat' || combatant.luckyUsed || combatant.baseRoll !== 1) {
        return;
    }
    
    if (!confirm(`Use Lucky feat to reroll ${combatant.name}'s initiative?\n\nThis can only be used once per round.`)) {
        return;
    }

    // Store the original roll (which was a 1)
    const originalRoll = combatant.baseRoll;

    // Per RAW only the die that came up 1 is rerolled; with advantage or
    // disadvantage the other die is kept and max/min re-applied
    const rerolled = rerollNatOneDie(combatant.advantage, combatant.rolls);
    const roll = rerolled.roll;
    combatant.rolls = rerolled.rolls;

    // Calculate new initiative
    const dex = combatant.dex || 0;
    const modifier = combatant.modifier || 0;
    const initiativeBonus = dex + modifier;

    combatant.initiative = roll + initiativeBonus;
    combatant.baseRoll = roll;
    combatant.luckyUsed = true;
    combatant.luckyReroll = originalRoll; // Store original 1 to display like halfling lucky

    // Move the card to where its new roll belongs, even if manual ordering is active
    repositionCombatant(combatant);

    // Re-sort and update original indices
    const sorted = [...combatants].sort(initiativeComparator);
    sorted.forEach((c, index) => {
        c.originalIndex = index;
    });

    // Amend this round's history entry and sync
    updateHistoryForCurrentRound();
    saveToFirebase();
    renderInitiativeOrder();
}

// ============================================================================
// THEME MANAGEMENT
// ============================================================================

function setTheme(theme) {
    currentTheme = theme;
    document.body.setAttribute('data-theme', theme);
    updateThemeButtons();
    // Save theme to localStorage (device-specific, not synced)
    localStorage.setItem('dndTheme', theme);
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

// ============================================================================
// COLORBLIND MODE MANAGEMENT
// ============================================================================

function setVisionMode(mode) {
    currentVisionMode = mode;
    document.body.setAttribute('data-vision', mode);
    if (colorblindModeSelect) {
        colorblindModeSelect.value = mode;
    }
    // Save vision mode to localStorage (device-specific, not synced)
    localStorage.setItem('dndVisionMode', mode);

    // Diagnostic logging
    if (!DEBUG_FLAGS.VISION) return;
    console.log('=== COLORBLIND MODE DEBUG ===');
    console.log('Vision mode set to:', mode);
    console.log('Body data-vision attribute:', document.body.getAttribute('data-vision'));
    console.log('Body data-theme attribute:', document.body.getAttribute('data-theme'));
    console.log('Computed CSS variables:');
    const styles = getComputedStyle(document.body);
    console.log('  --color-party:', styles.getPropertyValue('--color-party'));
    console.log('  --color-enemy:', styles.getPropertyValue('--color-enemy'));
    console.log('  --color-friendly:', styles.getPropertyValue('--color-friendly'));
    console.log('  --color-party-bg-start:', styles.getPropertyValue('--color-party-bg-start'));
    console.log('  --color-party-bg-end:', styles.getPropertyValue('--color-party-bg-end'));
    console.log('  --color-enemy-bg-start:', styles.getPropertyValue('--color-enemy-bg-start'));
    console.log('  --color-enemy-bg-end:', styles.getPropertyValue('--color-enemy-bg-end'));
    console.log('  --color-friendly-bg-start:', styles.getPropertyValue('--color-friendly-bg-start'));
    console.log('  --color-friendly-bg-end:', styles.getPropertyValue('--color-friendly-bg-end'));
    
    // Check actual computed background on a card
    const sampleCard = document.querySelector('.initiative-item.party, .initiative-item.enemy, .initiative-item.friendly');
    if (sampleCard) {
        const cardStyles = getComputedStyle(sampleCard);
        console.log('Sample card computed background:', cardStyles.backgroundColor);
        console.log('Sample card computed border-left-color:', cardStyles.borderLeftColor);
    }
    console.log('============================');
}

// ============================================================================
// CAMPAIGN MANAGEMENT
// ============================================================================

async function loadCampaignList() {
    return new Promise((resolve) => {
        const campaignsRef = window.firebaseRef(window.firebaseDB, 'campaigns');
        window.firebaseOnValue(campaignsRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                // Build a fresh campaigns object from Firebase data
                const newCampaigns = {};
                Object.keys(data).forEach(id => {
                    // Campaign IDs are interpolated into onclick="" handlers and
                    // <option value="">, so only accept the slug charset that
                    // createCampaign() generates - a hand-crafted Firebase key
                    // must not be able to inject markup or script
                    if (!/^[a-z0-9-]+$/.test(id)) {
                        console.warn(`Ignoring campaign with invalid ID: ${id}`);
                        return;
                    }
                    if (data[id].meta && data[id].meta.name) {
                        newCampaigns[id] = {
                            name: data[id].meta.name,
                            lastUpdated: data[id].meta.lastUpdated || 0
                        };
                    }
                });
                campaigns = newCampaigns;
            } else {
                campaigns = {};
            }
            updateCampaignDropdown();
            renderCampaignList();
            resolve();
        }, { onlyOnce: false });
    });
}

function updateCampaignDropdown() {
    const dropdown = document.getElementById('campaignDropdown');
    const campaignIds = Object.keys(campaigns);
    
    if (campaignIds.length === 0) {
        dropdown.innerHTML = '<option value="">No campaigns</option>';
        return;
    }
    
    // Sort by last updated
    const sorted = campaignIds.sort((a, b) => 
        (campaigns[b].lastUpdated || 0) - (campaigns[a].lastUpdated || 0)
    );
    
    dropdown.innerHTML = sorted.map(id =>
        `<option value="${id}" ${id === currentCampaignId ? 'selected' : ''}>${escapeHtml(campaigns[id].name)}</option>`
    ).join('');
}

function switchCampaign(campaignId) {
    if (campaignId === currentCampaignId) return;
    
    currentCampaignId = campaignId;
    localStorage.setItem('lastCampaignId', campaignId);
    
    // Clear current data
    combatants = [];
    currentRound = 1;
    initiativeHistory = [];
    
    // Load new campaign data
    loadFromFirebase();
    
    updateCampaignDropdown();
    renderCampaignList(); // Update the campaign list to reflect active campaign
}

async function createCampaign(name) {
    // Generate consistent campaign ID
    const campaignId = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    // A name with no letters/numbers produces an empty slug, which would be an
    // invalid Firebase path
    if (!campaignId) {
        alert('Campaign name must contain at least one letter or number');
        return;
    }

    // Check if campaign already exists
    if (campaigns[campaignId]) {
        console.log(`Campaign ${campaignId} already exists`);
        switchCampaign(campaignId);
        return;
    }
    
    // Create campaign metadata
    const metaRef = window.firebaseRef(window.firebaseDB, `campaigns/${campaignId}/meta`);
    await window.firebaseSet(metaRef, {
        name: name,
        lastUpdated: Date.now()
    });
    
    // Create empty data
    const dataRef = window.firebaseRef(window.firebaseDB, `campaigns/${campaignId}/data`);
    await window.firebaseSet(dataRef, {
        combatants: [],
        currentRound: 1,
        initiativeHistory: [],
        lastUpdated: Date.now()
    });
    
    // Add to local campaigns object
    campaigns[campaignId] = {
        name: name,
        lastUpdated: Date.now()
    };
    
    // Switch to new campaign and update UI
    switchCampaign(campaignId);
    renderCampaignList(); // Update the campaign list to show new campaign
}

async function deleteCampaign(campaignId) {
    if (Object.keys(campaigns).length <= 1) {
        alert('Cannot delete the last campaign');
        return;
    }

    // Confirm here (not in inline onclick) so names with quotes can't break markup
    const campaignName = campaigns[campaignId] ? campaigns[campaignId].name : campaignId;
    if (!confirm(`Delete ${campaignName}?`)) {
        return;
    }

    // Remove from local campaigns object first
    delete campaigns[campaignId];
    
    // Delete from Firebase
    const campaignRef = window.firebaseRef(window.firebaseDB, `campaigns/${campaignId}`);
    await window.firebaseSet(campaignRef, null);
    
    // If we deleted the current campaign, switch to another
    if (campaignId === currentCampaignId) {
        const remaining = Object.keys(campaigns);
        if (remaining.length > 0) {
            switchCampaign(remaining[0]);
        }
    }
    
    // Update UI
    updateCampaignDropdown();
    renderCampaignList();
}

async function renameCampaign(campaignId, newName) {
    // Update metadata
    const metaRef = window.firebaseRef(window.firebaseDB, `campaigns/${campaignId}/meta`);
    await window.firebaseSet(metaRef, {
        name: newName,
        lastUpdated: Date.now()
    });
    
    // Update local campaigns object
    campaigns[campaignId].name = newName;
    
    // Refresh UI
    updateCampaignDropdown();
    renderCampaignList();
    closeEditCampaignModal();
}

function showCampaignModal() {
    const modal = document.getElementById('campaignModal');
    renderCampaignList();
    modal.style.display = 'flex';
}

function closeCampaignModal() {
    const modal = document.getElementById('campaignModal');
    modal.style.display = 'none';
}

function showEditCampaignModal(campaignId) {
    const modal = document.getElementById('editCampaignModal');
    document.getElementById('editCampaignId').value = campaignId;
    document.getElementById('editCampaignName').value = campaigns[campaignId] ? campaigns[campaignId].name : '';
    modal.style.display = 'flex';
}

function closeEditCampaignModal() {
    const modal = document.getElementById('editCampaignModal');
    modal.style.display = 'none';
}

function renderCampaignList() {
    const listDiv = document.getElementById('campaignList');
    if (!listDiv) return; // Modal not in DOM yet
    
    const campaignIds = Object.keys(campaigns);
    
    if (campaignIds.length === 0) {
        listDiv.innerHTML = '<p class="empty-state-small">No campaigns yet. Create one above!</p>';
        return;
    }
    
    // Sort by last updated
    const sorted = campaignIds.sort((a, b) => 
        (campaigns[b].lastUpdated || 0) - (campaigns[a].lastUpdated || 0)
    );
    
    listDiv.innerHTML = sorted.map(id => {
        const isActive = id === currentCampaignId;
        const lastUpdated = new Date(campaigns[id].lastUpdated || 0).toLocaleString();
        return `
            <div class="campaign-item ${isActive ? 'active' : ''}">
                <div class="campaign-info">
                    <strong>${escapeHtml(campaigns[id].name)}</strong>
                    ${isActive ? '<span class="badge">Active</span>' : ''}
                    <small>Last updated: ${lastUpdated}</small>
                </div>
                <div class="campaign-actions">
                    ${!isActive ? `<button class="btn btn-small btn-primary" onclick="switchCampaign('${id}')">Switch</button>` : ''}
                    <button class="btn btn-small btn-secondary" onclick="showEditCampaignModal('${id}')" title="Rename">Edit</button>
                    <button class="btn btn-small btn-danger" onclick="deleteCampaign('${id}')" title="Delete">✖</button>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================================================
// HISTORY MODAL
// ============================================================================

function showHistoryModal() {
    const modal = document.getElementById('historyModal');
    const historyContent = document.getElementById('historyContent');
    
    if (initiativeHistory.length === 0) {
        historyContent.innerHTML = '<p class="empty-state">No history available yet. Complete a round to see history.</p>';
    } else {
        // Show most recent entries first (reverse chronological order)
        const sorted = [...initiativeHistory].reverse();
        
        historyContent.innerHTML = sorted.map(record => {
            // Same ordering rules as the live initiative display
            const sortedCombatants = [...record.combatants].sort(initiativeComparator);
            
            return `
                <div class="history-round">
                    <div class="history-header">
                        <h3>Round ${record.round}</h3>
                        <small>${record.timestamp}</small>
                    </div>
                    <div class="history-initiatives">
                        ${sortedCombatants.map(c => {
                            const dex = c.dex || 0;
                            const modifier = c.modifier || 0;
                            const bonus = dex + modifier;
                            
                            let rollDisplay = '';
                            if (c.advantage === 'advantage') {
                                rollDisplay = `Roll: [${c.rolls.join(', ')}] → ${c.baseRoll} (ADV) + ${bonus >= 0 ? '+' : ''}${bonus} (${dex} Dex + ${modifier >= 0 ? '+' : ''}${modifier})`;
                            } else if (c.advantage === 'disadvantage') {
                                rollDisplay = `Roll: [${c.rolls.join(', ')}] → ${c.baseRoll} (DIS) + ${bonus >= 0 ? '+' : ''}${bonus} (${dex} Dex + ${modifier >= 0 ? '+' : ''}${modifier})`;
                            } else {
                                rollDisplay = `Roll: ${c.baseRoll} + ${bonus >= 0 ? '+' : ''}${bonus} (${dex} Dex + ${modifier >= 0 ? '+' : ''}${modifier})`;
                            }
                            
                            // Add move indicator if present
                            const moveIndicator = (c.wasMoved && c.moveDirection) ? 
                                `<span class="moved-indicator" title="Manually moved ${c.moveDirection}">${c.moveDirection === 'down' ? '↓' : '↑'}</span>` : '';
                            
                            return `
                                <div class="history-item ${c.type}">
                                    <div class="history-roll">${c.initiative}${moveIndicator}</div>
                                    <div class="history-details">
                                        <span class="history-name">${escapeHtml(c.name)}</span>
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

window.addEventListener('click', (e) => {
    const historyModal = document.getElementById('historyModal');
    if (e.target === historyModal) {
        closeHistoryModal();
    }
});

// ============================================================================
// PAGE LOAD
// ============================================================================

document.addEventListener('DOMContentLoaded', init);
