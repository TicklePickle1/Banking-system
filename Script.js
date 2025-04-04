let currentUser = null;      // who is logged in right now
let pending2FAUser = null;   // user who passed pw but hasn't done 2FA

// Our typical route approach: show/hide based on #hash
window.addEventListener('hashchange', router);
window.addEventListener('load', router);

/**
 * The router function
 * Hide all .page, show only the one we want
 */
function router() {
    // pick up hash or default to #/login
    const h = window.location.hash || '#/login';

    // hide everything
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    hideMessage(); // all messages removed after its displayed

    switch (h) {
        case '#/login':
            document.getElementById('page-login').classList.remove('hidden');
            break;
        case '#/2fa':
            document.getElementById('page-2fa').classList.remove('hidden');
            break;
        case '#/register':
            document.getElementById('page-register').classList.remove('hidden');
            break;
        case '#/forgot':
            document.getElementById('page-forgot').classList.remove('hidden');
            break;
        case '#/home':
            if (!currentUser) {
                window.location.hash = '#/login';
            } else {
                document.getElementById('page-home').classList.remove('hidden');
                displayUserDetails();  // show name, balance, etc.
            }
            break;
        case '#/transactions':
            if (!currentUser) {
                window.location.hash = '#/login';
            } else {
                document.getElementById('page-transactions').classList.remove('hidden');
                renderTransactionHistory();
            }
            break;
        case '#/transfer':
            if (!currentUser) {
                window.location.hash = '#/login';
            } else {
                document.getElementById('page-transfer').classList.remove('hidden');
                document.getElementById('transferBalance').textContent = currentUser.balance.toFixed(2);
            }
            break;
        case '#/settings':
            if (!currentUser) {
                window.location.hash = '#/login';
            } else {
                document.getElementById('page-settings').classList.remove('hidden');
                showPersonalInfo(); // let’s fill the Name, DOB, etc.
            }
            break;
        case '#/withdraw':
            if (!currentUser) {
                window.location.hash = '#/login';
            } else {
                document.getElementById('page-withdraw').classList.remove('hidden');
                document.getElementById('withdrawBalance').textContent = currentUser.balance.toFixed(2);
            }
            break;
        case '#/deposit':
            if (!currentUser) {
                window.location.hash = '#/login';
            } else {
                document.getElementById('page-deposit').classList.remove('hidden');
            }
            break;
        default:
            // fallback to login if unknown
            window.location.hash = '#/login';
            break;
    }
}

//error and success messages
function showMessage(msg, isError = true) {
    const div = document.getElementById('message');
    div.textContent = msg;
    div.className = isError ? 'error' : 'success';
}
function hideMessage() {
    const div = document.getElementById('message');
    div.textContent = '';
    div.className = '';
}

//store in local storage
function getUsers() {
    let raw = localStorage.getItem('bankUsers');
    return raw ? JSON.parse(raw) : [];
}
function setUsers(uArr) {
    localStorage.setItem('bankUsers', JSON.stringify(uArr));
}

// randomly generating a 6 digit sort code and account number
function makeSortCode() {
    // 6-digit
    return Math.floor(100000 + Math.random() * 900000).toString();
}
function makeAccountNum() {
    // 8-digit
    return Math.floor(10000000 + Math.random() * 90000000).toString();
}

//user login
function loginUser() {
    hideMessage();
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!username || !password) {
        showMessage('Please enter username & password.', true);
        return;
    }

    const users = getUsers();
    const found = users.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (!found) {
        showMessage('Invalid username or password.', true);
        return;
    }

    // check if user locked from normal login attempts
    if (found.lockedUntil && Date.now() < found.lockedUntil) {
        let lockStr = new Date(found.lockedUntil).toLocaleTimeString();
        showMessage(`Account locked until ${lockStr}.`, true);
        return;
    } else if (found.lockedUntil) {
        // if lock expired, reset
        found.lockedUntil = null;
        found.loginAttempts = 0;
        setUsers(users);
    }

    // compare password
    const encPW = btoa(password);
    if (found.encryptedPassword !== encPW) {
        found.loginAttempts = (found.loginAttempts || 0) + 1;
        if (found.loginAttempts >= 3) {
            found.lockedUntil = Date.now() + 30 * 1000; // locked for 30 seconds
            showMessage('Too many password attempts, locked 30s.', true);
        } else {
            showMessage(`Wrong password. Attempt: ${found.loginAttempts} of 3.`, true);
        }
        setUsers(users);
        return;
    }

    // Password is correct so attempts are reset
    found.loginAttempts = 0;
    found.lockedUntil = null;
    setUsers(users);

    // clear out the form
    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';

    // store user in needing 2 factor authentication
    pending2FAUser = found;
    // show their question
    document.getElementById('2faQuestion').textContent = found.question;

    // redirected to 2 factor authentication
    window.location.hash = '#/2fa';
    showMessage('Please answer 2FA question. 3 wrong attempts => locked.', false);
}

//verifying the 2 factor authentication
function verify2FA() {
    hideMessage();
    if (!pending2FAUser) {
        showMessage('No user is pending 2FA.', true);
        return;
    }

    // get all users so we can update them
    const allUsers = getUsers();
    const pIdx = allUsers.findIndex(u => u.username === pending2FAUser.username);
    if (pIdx === -1) {
        showMessage('Error: pending user not found in storage.', true);
        return;
    }

    let pUser = allUsers[pIdx];

    // check if they are locked from 2FA attempts
    if (pUser.twoFALockedUntil && Date.now() < pUser.twoFALockedUntil) {
        let tStr = new Date(pUser.twoFALockedUntil).toLocaleTimeString();
        showMessage(`2FA locked until ${tStr}. Wait and try again.`, true);
        return;
    } else if (pUser.twoFALockedUntil) {
        // time passed => reset
        pUser.twoFALockedUntil = null;
        pUser.twoFAattempts = 0;
        setUsers(allUsers);
    }

    if (!pUser.twoFAattempts) {
        pUser.twoFAattempts = 0;
    }

    const ans = document.getElementById('2faAnswer').value.trim();
    if (!ans) {
        showMessage('Please type your 2FA answer.', true);
        return;
    }

    // ignoring case
    if (pUser.answer.toLowerCase() !== ans.toLowerCase()) {
        pUser.twoFAattempts++;
        if (pUser.twoFAattempts >= 3) {
            pUser.twoFALockedUntil = Date.now() + 30 * 1000;
            showMessage('3 wrong attempts for 2FA. Locked for 30s.', true);
        } else {
            showMessage(`Wrong 2FA. Attempt ${pUser.twoFAattempts} of 3.`, true);
        }
        setUsers(allUsers);
        return;
    }

    // if 2fa is correct then proceed
    pUser.twoFAattempts = 0;
    pUser.twoFALockedUntil = null;
    setUsers(allUsers);

    currentUser = pUser;
    pending2FAUser = null;
    document.getElementById('2faAnswer').value = '';
    showMessage('2FA passed! You are logged in.', false);

    goTo('#/home');
}

//logout
function logout() {
    currentUser = null;
    pending2FAUser = null;
    showMessage('Logged out.', false);
    goTo('#/login');
}

 
 //Creating a new account

function registerUser() {
    hideMessage();

    const username = document.getElementById('regUsername').value.trim();
    const password = document.getElementById('regPassword').value;
    const firstName = document.getElementById('regFirstName').value.trim();
    const lastName = document.getElementById('regLastName').value.trim();
    const dateOfBirth = document.getElementById('regDOB').value;
    const question = document.getElementById('regQuestion').value.trim();
    const answer = document.getElementById('regAnswer').value.trim();

    // Check that all fields are filled
    if (!username || !password || !firstName || !lastName || !dateOfBirth || !question || !answer) {
        showMessage('Please fill in all fields.', true);
        return;
    }

    // Enforce a minimum password length of 6
    if (password.length < 6) {
        showMessage('Password must be >= 6 chars.', true);
        return;
    }

    const all = getUsers();

    // Check if the username is already taken
    if (all.some(u => u.username.toLowerCase() === username.toLowerCase())) {
        showMessage('Username taken.', true);
        return;
    }

    // Generate a unique sort code + account number
    let sc, ac;
    let good = false;
    while (!good) {
        sc = makeSortCode();
        ac = makeAccountNum();
        if (!all.some(u => u.sortCode === sc && u.accountNumber === ac)) {
            good = true;
        }
    }

    // Create the new user object
    const newUser = {
        username: username,
        encryptedPassword: btoa(password),  // "passwprd" was spelled incorrectly before
        firstName: firstName,
        lastName: lastName,
        dob: dateOfBirth,
        question: question,
        answer: answer,
        sortCode: sc,
        accountNumber: ac,
        balance: 100,
        transactions: [],
        loginAttempts: 0,
        lockedUntil: null,
        twoFAattempts: 0,
        twoFALockedUntil: null
    };

    // Save the new user
    all.push(newUser);
    setUsers(all);

    // Clear the fields
    document.getElementById('regUsername').value = '';
    document.getElementById('regPassword').value = '';
    document.getElementById('regFirstName').value = '';
    document.getElementById('regLastName').value = '';
    document.getElementById('regDOB').value = '';
    document.getElementById('regQuestion').value = '';
    document.getElementById('regAnswer').value = '';

    // Show success and redirect
    showMessage(`Account created! SC: ${sc}, AC: ${ac}`, false);
    goTo('#/login');
}

//forgotten password
function processForgotPassword() {
    hideMessage();
    const fU = document.getElementById('forgotUsername').value.trim();
    const arr = getUsers();
    const found = arr.find(u => u.username.toLowerCase() === fU.toLowerCase());
    if (!found) {
        showMessage('No user found.', true);
        return;
    }

    if (found.lockedUntil && Date.now() < found.lockedUntil) {
        showMessage("You're locked out for 30 seconds. Please wait.", true);
        return;
    }

    const lab = document.getElementById('questionLabel');
    // if question not displayed => display it
    if (!lab.textContent) {
        lab.textContent = found.question;
        showMessage('Answer question + set new pass.', false);
        return;
    }

    const ansIn = document.getElementById('forgotAnswer').value.trim();
    const newP = document.getElementById('newPassword').value;

    if (!ansIn || !newP) {
        showMessage('Need 2FA answer + new pass.', true);
        return;
    }
    if (found.answer.toLowerCase() !== ansIn.toLowerCase()) {
        showMessage('2FA answer incorrect.', true);
        return;
    }
    if (newP.length < 6) {
        showMessage('New password >= 6 chars.', true);
        return;
    }

    // reset password
    found.encryptedPassword = btoa(newP);
    found.loginAttempts = 0;
    found.lockedUntil = null;
    setUsers(arr);

    // clear fields
    document.getElementById('forgotUsername').value = '';
    document.getElementById('forgotAnswer').value = '';
    document.getElementById('newPassword').value = '';
    lab.textContent = '';

    showMessage('Password reset. Now you can login.', false);
    setTimeout(() => goTo('#/login'), 1500);
}

// show user details
function displayUserDetails() {
    if (currentUser) {
        document.getElementById('displayName').textContent =
            currentUser.firstName + " " + currentUser.lastName;
        document.getElementById('displaySortCode').textContent = currentUser.sortCode;
        document.getElementById('displayAccountNumber').textContent = currentUser.accountNumber;
        document.getElementById('displayBalance').textContent = currentUser.balance.toFixed(2);
    }
}

//Transaction history
function renderTransactionHistory() {
    const div = document.getElementById('transactionList');
    div.innerHTML = '';

    if (!currentUser || !currentUser.transactions || currentUser.transactions.length === 0) {
        div.innerHTML = '<p>No transactions found.</p>';
        return;
    }

    let html = '<ul>';
    currentUser.transactions.forEach(tx => {
        html += `<li>${tx.date} - £${tx.amount} : ${tx.note}</li>`;
    });
    html += '</ul>';
    div.innerHTML = html;
}

//deposit and withdraw

function makeWithdraw() {
    hideMessage();
    const amountStr = document.getElementById('withdrawAmount').value;
    const amount = parseFloat(amountStr);

    if (isNaN(amount) || amount <= 0) {
        showMessage('Please enter a valid amount.', true);
        return;
    }
    if (currentUser.balance < amount) {
        showMessage('You do not have enough money!', true);
        return;
    }

    const users = getUsers();
    const idx = users.findIndex(u => u.username === currentUser.username);
    if (idx === -1) {
        showMessage('Error finding current user.', true);
        return;
    }

    // reduce balance
    users[idx].balance -= amount;
    // add transaction
    users[idx].transactions.push({
        date: new Date().toLocaleString(),
        amount: (-amount).toFixed(2),
        note: "Withdrawal"
    });

    setUsers(users);
    currentUser = users[idx];

    document.getElementById('withdrawAmount').value = '';
    showMessage(`£${amount.toFixed(2)} withdrawn successfully!`, false);
    displayUserDetails(); // refresh the on-screen balance
}

/** 
 * deposit money 
 */
function makeDeposit() {
    hideMessage();
    const amountStr = document.getElementById('depositAmount').value;
    const amount = parseFloat(amountStr);

    if (isNaN(amount) || amount <= 0) {
        showMessage('Please enter a valid amount.', true);
        return;
    }

    const users = getUsers();
    const idx = users.findIndex(u => u.username === currentUser.username);
    if (idx === -1) {
        showMessage('Error finding current user.', true);
        return;
    }

    users[idx].balance += amount;
    users[idx].transactions.push({
        date: new Date().toLocaleString(),
        amount: amount.toFixed(2),
        note: "Deposit"
    });

    setUsers(users);
    currentUser = users[idx];

    document.getElementById('depositAmount').value = '';
    showMessage(`£${amount.toFixed(2)} deposited successfully!`, false);
    displayUserDetails();
}

//Transfer system
function makeTransfer() {
    hideMessage();
    const amtStr = document.getElementById('transferAmount').value;
    const note = document.getElementById('transferNote').value.trim();
    const sc = document.getElementById('transferTargetSortCode').value.trim();
    const ac = document.getElementById('transferTargetAccountNumber').value.trim();

    const amt = parseFloat(amtStr);
    if (isNaN(amt) || amt <= 0) {
        showMessage('Enter a valid positive amount.', true);
        return;
    }
    if (!note) {
        showMessage('Please provide a note/desc.', true);
        return;
    }
    if (!/^\d{6}$/.test(sc)) {
        showMessage('Recipient SC must be 6 digits.', true);
        return;
    }
    if (!/^\d{8}$/.test(ac)) {
        showMessage('Recipient AC must be 8 digits.', true);
        return;
    }
    if (currentUser.balance < amt) {
        showMessage('Insufficient funds.', true);
        return;
    }

    let all = getUsers();
    const sIdx = all.findIndex(u => u.username === currentUser.username);
    if (sIdx === -1) {
        showMessage('Error: current user not found in storage.', true);
        return;
    }

    const rec = all.find(u => u.sortCode === sc && u.accountNumber === ac);
    if (!rec) {
        showMessage('No matching recipient.', true);
        return;
    }

    // reduce from sender
    all[sIdx].balance -= amt;
    all[sIdx].transactions.push({
        date: new Date().toLocaleString(),
        amount: (-amt).toFixed(2),
        note: `To ${rec.firstName} [${note}]`
    });

    // add to recipient
    const rIdx = all.findIndex(u => u.username === rec.username);
    all[rIdx].balance += amt;
    all[rIdx].transactions.push({
        date: new Date().toLocaleString(),
        amount: amt.toFixed(2),
        note: `From ${currentUser.firstName} [${note}]`
    });

    setUsers(all);
    currentUser = all[sIdx];

    document.getElementById('transferAmount').value = '';
    document.getElementById('transferNote').value = '';
    document.getElementById('transferTargetSortCode').value = '';
    document.getElementById('transferTargetAccountNumber').value = '';

    showMessage(`Transfer of £${amt.toFixed(2)} successful!`, false);
}

//Settings
function changePassword() {
    hideMessage();
    const np = document.getElementById('settingsPassword').value;
    if (!np || np.length < 6) {
        showMessage('New password must be >= 6 chars.', true);
        return;
    }

    let all = getUsers();
    const idx = all.findIndex(u => u.username === currentUser.username);
    if (idx === -1) {
        showMessage('Error: current user not found.', true);
        return;
    }

    all[idx].encryptedPassword = btoa(np);
    setUsers(all);
    currentUser = all[idx];

    document.getElementById('settingsPassword').value = '';
    showMessage('Password changed successfully!', false);
}

//display personal info in settings
function showPersonalInfo() {
    if (!currentUser) return;
    document.getElementById("infoName").textContent = currentUser.firstName + " " + currentUser.lastName;
    document.getElementById("infoDOB").textContent = currentUser.dob;
    document.getElementById("infoUsername").textContent = currentUser.username;
}


function goTo(route) {
    window.location.hash = route;
}
