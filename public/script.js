const stepPhone = document.getElementById('step-phone');
const stepCode = document.getElementById('step-code');
const stepSession = document.getElementById('step-session');
const phoneInput = document.getElementById('phoneInput');
const pairBtn = document.getElementById('pairBtn');
const pairingCode = document.getElementById('pairingCode');
const checkBtn = document.getElementById('checkBtn');
const sessionOutput = document.getElementById('sessionOutput');
const copyBtn = document.getElementById('copyBtn');
const resetBtn = document.getElementById('resetBtn');
const errorBox = document.getElementById('errorBox');

let currentSessionId = null;
let checkInterval = null;

document.getElementById('year').textContent = new Date().getFullYear();

function showStep(step) {
  [stepPhone, stepCode, stepSession].forEach(s => s.classList.remove('active'));
  step.classList.add('active');
  errorBox.classList.remove('show');
}

function showError(msg) {
  errorBox.textContent = '❌ ' + msg;
  errorBox.classList.add('show');
}

// ========== STEP 1: Request pairing code ==========
pairBtn.addEventListener('click', async () => {
  const phone = phoneInput.value.trim().replace(/[^0-9]/g, '');

  if (!phone || phone.length < 7) {
    showError('Please enter a valid phone number with country code.');
    return;
  }

  pairBtn.disabled = true;
  pairBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating…';
  errorBox.classList.remove('show');

  try {
    const res = await fetch('/pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    });

    const data = await res.json();

    if (!res.ok || data.error) {
      showError(data.error || 'Failed to generate pairing code.');
      pairBtn.disabled = false;
      pairBtn.innerHTML = '<i class="fas fa-key"></i> Get Pairing Code';
      return;
    }

    currentSessionId = data.sessionId;
    pairingCode.textContent = data.code;
    showStep(stepCode);

    pairBtn.disabled = false;
    pairBtn.innerHTML = '<i class="fas fa-key"></i> Get Pairing Code';

  } catch (err) {
    showError('Network error. Please try again.');
    pairBtn.disabled = false;
    pairBtn.innerHTML = '<i class="fas fa-key"></i> Get Pairing Code';
  }
});

// ========== STEP 2: Check if device is linked ==========
checkBtn.addEventListener('click', checkSessionStatus);

async function checkSessionStatus() {
  if (!currentSessionId) return;

  checkBtn.disabled = true;
  checkBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking…';

  try {
    const res = await fetch(`/session/${currentSessionId}`);
    const data = await res.json();

    if (data.success && data.status === 'ready') {
      sessionOutput.value = data.sessionId;
      showStep(stepSession);
      clearInterval(checkInterval);
    } else {
      showError(data.message || 'Not linked yet. Please link the device in WhatsApp.');
    }
  } catch (err) {
    showError('Network error. Please try again.');
  }

  checkBtn.disabled = false;
  checkBtn.innerHTML = '<i class="fas fa-sync"></i> I\'ve linked it — Check Status';
}

// Auto-check every 5 seconds while on step 2
const observer = new MutationObserver(() => {
  if (stepCode.classList.contains('active')) {
    if (!checkInterval) {
      checkInterval = setInterval(() => {
        if (stepCode.classList.contains('active')) {
          checkSessionStatus();
        } else {
          clearInterval(checkInterval);
          checkInterval = null;
        }
      }, 5000);
    }
  }
});
observer.observe(stepCode, { attributes: true, attributeFilter: ['class'] });

// ========== STEP 3: Copy session ==========
copyBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(sessionOutput.value);
    copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
    setTimeout(() => {
      copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy SESSION_ID';
    }, 2000);
  } catch (err) {
    sessionOutput.select();
    document.execCommand('copy');
    copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
    setTimeout(() => {
      copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy SESSION_ID';
    }, 2000);
  }
});

resetBtn.addEventListener('click', () => {
  currentSessionId = null;
  phoneInput.value = '';
  pairingCode.textContent = '----';
  sessionOutput.value = '';
  clearInterval(checkInterval);
  checkInterval = null;
  showStep(stepPhone);
});
