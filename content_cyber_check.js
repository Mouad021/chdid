// content_cyber_check.js
(function(){
  // حجب صفحتي الكابتشا/اللوجين بغض النظر عن حالة الأحرف
  const hrefL = location.href.toLowerCase();
  const blockedA = "https://www.blsspainmorocco.net/mar/newcaptcha/logincaptcha";
  const blockedB = "https://www.blsspainmorocco.net/mar/account/login";
  if (hrefL.startsWith(blockedA) || hrefL.startsWith(blockedB)) return;

  const BTN_CHECK_ID = "cyb2090-check-btn";
  const STATUS_ID    = "cyb2090-status";
  const BTN_OPEN_ID  = "cyb2090-open-btn";

  if (document.getElementById(BTN_CHECK_ID)) return;

  // نمط Cyber 2090
  const neon = (el)=>{
    el.style.border     = '1px solid #113a5a';
    el.style.background = 'linear-gradient(180deg,#091b2a 0%,#0a1e2f 100%)';
    el.style.boxShadow  = '0 10px 26px rgba(0,0,0,.35), 0 0 0 1px rgba(17,58,90,.25)';
    el.style.color      = '#d8f1ff';
  };

  // زر الفحص: أسفل-يسار
  const btn = document.createElement('button');
  btn.id = BTN_CHECK_ID;
  btn.textContent = "CHECK ManageApplicant";
  Object.assign(btn.style, {
    position: 'fixed', left: '18px', bottom: '22px',
    zIndex: '2147483647', padding: '10px 12px',
    fontSize: '13px', fontWeight: '800', borderRadius: '12px', cursor: 'pointer'
  });
  neon(btn);

  // صندوق الحالة: أسفل-يسار فوق الزر (غير شفاف)
  const status = document.createElement('div');
  status.id = STATUS_ID;
  status.textContent = "status: -";
  Object.assign(status.style, {
    position: 'fixed', left: '18px', bottom: '64px',
    zIndex: '2147483647', padding: '10px 12px',
    fontSize: '12px', fontWeight: '800', borderRadius: '12px',
    minWidth: '160px', textAlign: 'left'
  });
  neon(status);

  // زر فتح NewAppointment: وسط-يسار (عموديًا)
  const openBtn = document.createElement('button');
  openBtn.id = BTN_OPEN_ID;
  openBtn.textContent = "OPEN NewAppointment";
  Object.assign(openBtn.style, {
    position: 'fixed', left: '18px', top: '50%',
    transform: 'translateY(-50%)',
    zIndex: '2147483647', padding: '10px 12px',
    fontSize: '13px', fontWeight: '800', borderRadius: '12px', cursor: 'pointer'
  });
  neon(openBtn);

  document.documentElement.appendChild(btn);
  document.documentElement.appendChild(status);
  document.documentElement.appendChild(openBtn);

  const setStatus = (text, color)=>{ status.textContent = "status: " + text; status.style.color = color || '#d8f1ff'; };

  // الفحص: pending -> true/false (الخطأ الوحيد هو إعادة توجيه /Home/Error?errorId=*)
  async function runCheck(){
    setStatus('pending', '#f59e0b'); // pending
    try {
      const res = await fetch("/MAR/appointmentdata/ManageApplicant", {
        method: "GET",
        redirect: "follow",
        credentials: "include"
      });
      const finalUrl = (res && res.url) ? res.url.toLowerCase() : "";
      const isErrorRedirect = res.redirected && finalUrl.includes("/home/error?errorid=");
      const ok = !isErrorRedirect && res.ok;
      setStatus(ok ? 'true' : 'false', ok ? '#10b981' : '#ef4444');
    } catch {
      setStatus('false', '#ef4444');
    }
  }

  // فتح NewAppointment (GET)
  async function openNewAppointment(){
    try {
      await fetch("https://www.blsspainmorocco.net/MAR/appointment/newappointment", {
        method: "GET",
        redirect: "follow",
        credentials: "include"
      });
      // لا حالة هنا؛ فقط تنفيذ الطلب.
    } catch {}
  }

  btn.addEventListener('click', () => {
    runCheck(); // محليًا
    // بث جماعي لكل المتصفحات على نفس التوكن (لو الخلفية عندك تدعم p2p:broadcast)
    try { chrome.runtime.sendMessage({ kind:'p2p:broadcast', payload: { cmd:'do-check' } }); } catch(e){}
  });

  openBtn.addEventListener('click', () => { openNewAppointment(); });

  // استقبل أمر الفحص من الإخوة عبر WS (لو الخلفية لديك ترسل kind:'p2p:ws')
  chrome.runtime.onMessage.addListener((msg)=>{
    if (msg?.kind === 'p2p:ws' && msg.payload?.payload?.cmd === 'do-check') {
      runCheck();
    }
  });
})();
